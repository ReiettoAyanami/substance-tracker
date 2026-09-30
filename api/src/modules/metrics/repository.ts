import type { RowDataPacket } from 'mysql2/promise';
import type { Queryable } from '../../db/pool.js';

/**
 * The few lookups of the metrics that Reports' loaders do not have. Soft-deleted rows are never
 * found (a consumption of a deleted batch is deleted with it).
 */

/** The substance of a batch consumption that counts; null when there is none. */
export async function findConsumptionSubstance(db: Queryable, id: number): Promise<number | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT b.substance_id FROM consumptions c JOIN batches b ON b.id = c.batch_id
      WHERE c.id = ? AND c.deleted_at IS NULL AND b.deleted_at IS NULL`,
    [id],
  );
  return rows[0] ? Number(rows[0].substance_id) : null;
}

/** The substance of a one-time consumption that counts; null when there is none. */
export async function findOneTimeSubstance(db: Queryable, id: number): Promise<number | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT substance_id FROM one_time_consumptions WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
  return rows[0] ? Number(rows[0].substance_id) : null;
}
