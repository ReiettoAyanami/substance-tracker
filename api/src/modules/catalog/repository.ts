import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Queryable } from '../../db/pool.js';

export interface SubstanceRow {
  id: number;
  name: string;
  unit: string;
  refill_quantity: string | null;
  archived_at: Date | null;
  created_at: Date;
  deleted_at: Date | null;
}

const COLUMNS = 'id, name, unit, refill_quantity, archived_at, created_at, deleted_at';

function toRow(r: RowDataPacket): SubstanceRow {
  return {
    id: Number(r.id),
    name: String(r.name),
    unit: String(r.unit),
    refill_quantity: r.refill_quantity === null ? null : String(r.refill_quantity),
    archived_at: (r.archived_at as Date | null) ?? null,
    created_at: r.created_at as Date,
    deleted_at: (r.deleted_at as Date | null) ?? null,
  };
}

/** One substance, deleted or not (the service decides). `forUpdate` locks the row. */
export async function findSubstance(
  db: Queryable,
  id: number,
  opts: { forUpdate?: boolean } = {},
): Promise<SubstanceRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ${COLUMNS} FROM substances WHERE id = ?${opts.forUpdate ? ' FOR UPDATE' : ''}`,
    [id],
  );
  return rows[0] ? toRow(rows[0]) : null;
}

/** Non-deleted substances; archived ones only when asked. */
export async function listSubstances(db: Queryable, opts: { includeArchived: boolean }): Promise<SubstanceRow[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ${COLUMNS} FROM substances
      WHERE deleted_at IS NULL${opts.includeArchived ? '' : ' AND archived_at IS NULL'}
      ORDER BY name, id`,
  );
  return rows.map(toRow);
}

export interface SubstanceInsert {
  name: string;
  unit: string;
  refill_quantity: string | null;
}

export async function insertSubstance(db: Queryable, values: SubstanceInsert): Promise<number> {
  const [res] = await db.query<ResultSetHeader>(
    'INSERT INTO substances (name, unit, refill_quantity) VALUES (?, ?, ?)',
    [values.name, values.unit, values.refill_quantity],
  );
  return res.insertId;
}

export interface SubstanceUpdate {
  name?: string;
  unit?: string;
  refill_quantity?: string | null;
  /** 'YYYY-MM-DD HH:MM:SS' (UTC) or null. */
  archived_at?: string | null;
}

const UPDATABLE: ReadonlyArray<keyof SubstanceUpdate> = [
  'name',
  'unit',
  'refill_quantity',
  'archived_at',
];

export async function updateSubstance(db: Queryable, id: number, update: SubstanceUpdate): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const column of UPDATABLE) {
    if (update[column] !== undefined) {
      sets.push(`${column} = ?`);
      values.push(update[column]);
    }
  }
  if (sets.length === 0) return;
  await db.query(`UPDATE substances SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);
}

/** Non-deleted batches and one-time consumptions of the substance. */
/**
 * Soft delete of everything recorded for a substance: its batches, their consumptions and
 * adjustments, its one-time consumptions. Rows already deleted keep their own `deleted_at`.
 */
export async function softDeleteMovementsOf(db: Queryable, substanceId: number, at: string): Promise<void> {
  for (const table of ['consumptions', 'adjustments']) {
    await db.query(
      `UPDATE ${table} m JOIN batches b ON b.id = m.batch_id
       SET m.deleted_at = ? WHERE b.substance_id = ? AND m.deleted_at IS NULL`,
      [at, substanceId],
    );
  }
  for (const table of ['batches', 'one_time_consumptions']) {
    await db.query(`UPDATE ${table} SET deleted_at = ? WHERE substance_id = ? AND deleted_at IS NULL`, [at, substanceId]);
  }
}

/** Soft delete: the row stays, `deleted_at` is set. */
export async function softDeleteSubstance(db: Queryable, id: number, at: string): Promise<void> {
  await db.query('UPDATE substances SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', [at, id]);
}
