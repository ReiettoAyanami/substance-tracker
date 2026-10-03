import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Queryable } from '../../db/pool.js';
import type { Owner } from '../../shared/owner.js';

export const SURFACES = ['statistics', 'metrics', 'substance', 'batch', 'consumption', 'substances'] as const;
export type Surface = (typeof SURFACES)[number];

export const CHARTS = ['bar', 'line', 'donut', 'treemap', 'radar'] as const;
export type Chart = (typeof CHARTS)[number];

/** Every function works on one owner's layout: another user's items are never found or changed. */

export interface ViewItemRow {
  id: number;
  surface: Surface;
  section: string | null;
  position: number;
  metric: string;
  chart: Chart | null;
  scale: string | null;
  created_at: Date;
  deleted_at: Date | null;
}

const COLUMNS = 'id, surface, section, position, metric, chart, scale, created_at, deleted_at';

function toRow(r: RowDataPacket): ViewItemRow {
  return {
    id: Number(r.id),
    surface: String(r.surface) as Surface,
    section: r.section === null ? null : String(r.section),
    position: Number(r.position),
    metric: String(r.metric),
    chart: r.chart === null ? null : (String(r.chart) as Chart),
    scale: r.scale === null ? null : String(r.scale),
    created_at: r.created_at as Date,
    deleted_at: (r.deleted_at as Date | null) ?? null,
  };
}

/** The owner's items of a surface that are not deleted, in order. `forUpdate` locks them. */
export async function listViewItems(
  db: Queryable,
  owner: Owner,
  surface: Surface,
  opts: { forUpdate?: boolean } = {},
): Promise<ViewItemRow[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ${COLUMNS} FROM view_items WHERE user_id = ? AND surface = ? AND deleted_at IS NULL ORDER BY position, id${
      opts.forUpdate ? ' FOR UPDATE' : ''
    }`,
    [owner.userId, surface],
  );
  return rows.map(toRow);
}

/** One of the owner's items, deleted or not (the service decides). */
export async function findViewItem(db: Queryable, owner: Owner, id: number): Promise<ViewItemRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(`SELECT ${COLUMNS} FROM view_items WHERE id = ? AND user_id = ?`, [
    id,
    owner.userId,
  ]);
  return rows[0] ? toRow(rows[0]) : null;
}

/** The last position the owner used in a surface, deleted items included (0 when none). */
export async function lastPosition(db: Queryable, owner: Owner, surface: Surface): Promise<number> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT COALESCE(MAX(position), 0) AS last FROM view_items WHERE user_id = ? AND surface = ?',
    [owner.userId, surface],
  );
  return Number(rows[0]?.last ?? 0);
}

export interface NewViewItem {
  surface: Surface;
  section: string | null;
  position: number;
  metric: string;
  chart: Chart | null;
  scale: string | null;
  created_at: string;
}

export async function insertViewItem(db: Queryable, owner: Owner, item: NewViewItem): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO view_items (user_id, surface, section, position, metric, chart, scale, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [owner.userId, item.surface, item.section, item.position, item.metric, item.chart, item.scale, item.created_at],
  );
  return result.insertId;
}

/** A chart's section, how it is drawn and its interval (the statistics page). */
export interface ChartChange {
  section?: string | null;
  chart?: Chart;
  scale?: string | null;
}

export async function updateChart(db: Queryable, owner: Owner, id: number, change: ChartChange): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const column of ['section', 'chart', 'scale'] as const) {
    if (change[column] !== undefined) {
      sets.push(`${column} = ?`);
      values.push(change[column]);
    }
  }
  if (sets.length === 0) return;
  await db.query(`UPDATE view_items SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, [...values, id, owner.userId]);
}

export async function setPosition(db: Queryable, owner: Owner, id: number, position: number): Promise<void> {
  await db.query('UPDATE view_items SET position = ? WHERE id = ? AND user_id = ?', [position, id, owner.userId]);
}

export async function softDeleteViewItem(db: Queryable, owner: Owner, id: number, at: string): Promise<void> {
  await db.query('UPDATE view_items SET deleted_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL', [
    at,
    id,
    owner.userId,
  ]);
}
