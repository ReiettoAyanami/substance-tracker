import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Queryable } from '../../db/pool.js';

export const SURFACES = ['statistics', 'metrics', 'substance', 'batch', 'consumption'] as const;
export type Surface = (typeof SURFACES)[number];

export const CHARTS = ['bar', 'line', 'donut'] as const;
export type Chart = (typeof CHARTS)[number];

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

/** The items of a surface that are not deleted, in order. `forUpdate` locks them. */
export async function listViewItems(db: Queryable, surface: Surface, opts: { forUpdate?: boolean } = {}): Promise<ViewItemRow[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ${COLUMNS} FROM view_items WHERE surface = ? AND deleted_at IS NULL ORDER BY position, id${
      opts.forUpdate ? ' FOR UPDATE' : ''
    }`,
    [surface],
  );
  return rows.map(toRow);
}

/** One item, deleted or not (the service decides). */
export async function findViewItem(db: Queryable, id: number): Promise<ViewItemRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(`SELECT ${COLUMNS} FROM view_items WHERE id = ?`, [id]);
  return rows[0] ? toRow(rows[0]) : null;
}

/** The last position used in a surface, deleted items included (0 when none). */
export async function lastPosition(db: Queryable, surface: Surface): Promise<number> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT COALESCE(MAX(position), 0) AS last FROM view_items WHERE surface = ?',
    [surface],
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

export async function insertViewItem(db: Queryable, item: NewViewItem): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO view_items (surface, section, position, metric, chart, scale, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [item.surface, item.section, item.position, item.metric, item.chart, item.scale, item.created_at],
  );
  return result.insertId;
}

/** A chart's section, how it is drawn and its interval (the statistics page). */
export interface ChartChange {
  section?: string | null;
  chart?: Chart;
  scale?: string | null;
}

export async function updateChart(db: Queryable, id: number, change: ChartChange): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const column of ['section', 'chart', 'scale'] as const) {
    if (change[column] !== undefined) {
      sets.push(`${column} = ?`);
      values.push(change[column]);
    }
  }
  if (sets.length === 0) return;
  await db.query(`UPDATE view_items SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);
}

export async function setPosition(db: Queryable, id: number, position: number): Promise<void> {
  await db.query('UPDATE view_items SET position = ? WHERE id = ?', [position, id]);
}

export async function softDeleteViewItem(db: Queryable, id: number, at: string): Promise<void> {
  await db.query('UPDATE view_items SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', [at, id]);
}
