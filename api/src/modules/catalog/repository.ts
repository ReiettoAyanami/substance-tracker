import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Queryable } from '../../db/pool.js';
import type { Owner } from '../../shared/owner.js';

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

/** One of the owner's substances, deleted or not (the service decides). `forUpdate` locks the row. */
export async function findSubstance(
  db: Queryable,
  owner: Owner,
  id: number,
  opts: { forUpdate?: boolean } = {},
): Promise<SubstanceRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ${COLUMNS} FROM substances WHERE id = ? AND user_id = ?${opts.forUpdate ? ' FOR UPDATE' : ''}`,
    [id, owner.userId],
  );
  return rows[0] ? toRow(rows[0]) : null;
}

/**
 * The owner's non-deleted substances; archived ones only when asked. With `search`, only those with
 * the text in their name or in the name of one of their non-deleted batches, finished ones too:
 * compared as the names are collated (utf8mb4_0900_ai_ci: case and accents ignored), the text taken
 * as it is (`%` and `_` are not wildcards).
 */
export async function listSubstances(
  db: Queryable,
  owner: Owner,
  opts: { includeArchived: boolean; search: string | null },
): Promise<SubstanceRow[]> {
  const found = opts.search === null ? null : `%${opts.search.replace(/[|%_]/g, '|$&')}%`;
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ${COLUMNS} FROM substances s
      WHERE s.user_id = ? AND s.deleted_at IS NULL${opts.includeArchived ? '' : ' AND s.archived_at IS NULL'}${
        found === null
          ? ''
          : ` AND (s.name LIKE ? ESCAPE '|' OR EXISTS (
                SELECT 1 FROM batches b
                 WHERE b.substance_id = s.id AND b.deleted_at IS NULL AND b.name LIKE ? ESCAPE '|'))`
      }
      ORDER BY s.name, s.id`,
    found === null ? [owner.userId] : [owner.userId, found, found],
  );
  return rows.map(toRow);
}

export interface SubstanceInsert {
  name: string;
  unit: string;
  refill_quantity: string | null;
}

export async function insertSubstance(db: Queryable, owner: Owner, values: SubstanceInsert): Promise<number> {
  const [res] = await db.query<ResultSetHeader>(
    'INSERT INTO substances (user_id, name, unit, refill_quantity) VALUES (?, ?, ?, ?)',
    [owner.userId, values.name, values.unit, values.refill_quantity],
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

export async function updateSubstance(db: Queryable, owner: Owner, id: number, update: SubstanceUpdate): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const column of UPDATABLE) {
    if (update[column] !== undefined) {
      sets.push(`${column} = ?`);
      values.push(update[column]);
    }
  }
  if (sets.length === 0) return;
  await db.query(`UPDATE substances SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, [...values, id, owner.userId]);
}

/**
 * Soft delete of everything recorded for one of the owner's substances: its batches, their
 * consumptions and adjustments, its one-time consumptions. Rows already deleted keep their own
 * `deleted_at`.
 */
export async function softDeleteMovementsOf(db: Queryable, owner: Owner, substanceId: number, at: string): Promise<void> {
  for (const table of ['consumptions', 'adjustments']) {
    await db.query(
      `UPDATE ${table} m JOIN batches b ON b.id = m.batch_id JOIN substances s ON s.id = b.substance_id
          SET m.deleted_at = ?
        WHERE b.substance_id = ? AND s.user_id = ? AND m.deleted_at IS NULL`,
      [at, substanceId, owner.userId],
    );
  }
  for (const table of ['batches', 'one_time_consumptions']) {
    await db.query(
      `UPDATE ${table} t JOIN substances s ON s.id = t.substance_id
          SET t.deleted_at = ?
        WHERE t.substance_id = ? AND s.user_id = ? AND t.deleted_at IS NULL`,
      [at, substanceId, owner.userId],
    );
  }
}

/** Soft delete: the row stays, `deleted_at` is set. */
export async function softDeleteSubstance(db: Queryable, owner: Owner, id: number, at: string): Promise<void> {
  await db.query('UPDATE substances SET deleted_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL', [
    at,
    id,
    owner.userId,
  ]);
}
