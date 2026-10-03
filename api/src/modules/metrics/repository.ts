import type { RowDataPacket } from 'mysql2/promise';
import type { Queryable } from '../../db/pool.js';
import type { Owner } from '../../shared/owner.js';

/**
 * The few lookups of the metrics that Reports' loaders do not have. Soft-deleted rows are never
 * found (a consumption of a deleted batch is deleted with it), nor another user's.
 */

/** The substance of one of the owner's batch consumptions that counts; null when there is none. */
export async function findConsumptionSubstance(db: Queryable, owner: Owner, id: number): Promise<number | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT b.substance_id FROM consumptions c
       JOIN batches b ON b.id = c.batch_id
       JOIN substances s ON s.id = b.substance_id
      WHERE c.id = ? AND s.user_id = ? AND c.deleted_at IS NULL AND b.deleted_at IS NULL`,
    [id, owner.userId],
  );
  return rows[0] ? Number(rows[0].substance_id) : null;
}

/** The substance of one of the owner's one-time consumptions that counts; null when there is none. */
export async function findOneTimeSubstance(db: Queryable, owner: Owner, id: number): Promise<number | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT o.substance_id FROM one_time_consumptions o
       JOIN substances s ON s.id = o.substance_id
      WHERE o.id = ? AND s.user_id = ? AND o.deleted_at IS NULL`,
    [id, owner.userId],
  );
  return rows[0] ? Number(rows[0].substance_id) : null;
}
