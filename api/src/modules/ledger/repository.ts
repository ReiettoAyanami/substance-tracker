import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Queryable } from '../../db/pool.js';

// ---------------------------------------------------------------------------------------------
// Rows (snake_case, as stored). DECIMAL values are strings, DATETIME values are UTC Dates.
// ---------------------------------------------------------------------------------------------

export interface SubstanceStateRow {
  id: number;
  refill_quantity: string | null;
  archived_at: Date | null;
  deleted_at: Date | null;
}

export interface BatchRow {
  id: number;
  substance_id: number;
  name: string | null;
  quantity: string;
  total_price: string;
  occurred_at: Date;
  note: string | null;
  client_ref: string | null;
  deactivated_at: Date | null;
  deactivated_by_consumption_id: number | null;
  deactivated_by_adjustment_id: number | null;
  created_at: Date;
  deleted_at: Date | null;
}

export interface LockedBatchRow extends BatchRow {
  substance_archived_at: Date | null;
  substance_deleted_at: Date | null;
}

export interface ConsumptionRow {
  id: number;
  batch_id: number;
  substance_id: number;
  quantity: string;
  occurred_at: Date;
  note: string | null;
  client_ref: string | null;
  created_at: Date;
  deleted_at: Date | null;
}

export interface AdjustmentRow {
  id: number;
  batch_id: number;
  substance_id: number;
  delta: string;
  reason: string;
  occurred_at: Date;
  client_ref: string | null;
  created_at: Date;
  deleted_at: Date | null;
}

export interface OneTimeRow {
  id: number;
  substance_id: number;
  name: string | null;
  quantity: string;
  total_price: string;
  occurred_at: Date;
  note: string | null;
  client_ref: string | null;
  created_at: Date;
  deleted_at: Date | null;
}

const str = (v: unknown): string => String(v);
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const dateOrNull = (v: unknown): Date | null => (v instanceof Date ? v : null);

function toBatch(r: RowDataPacket): BatchRow {
  return {
    id: Number(r.id),
    substance_id: Number(r.substance_id),
    name: strOrNull(r.name),
    quantity: str(r.quantity),
    total_price: str(r.total_price),
    occurred_at: r.occurred_at as Date,
    note: strOrNull(r.note),
    client_ref: strOrNull(r.client_ref),
    deactivated_at: dateOrNull(r.deactivated_at),
    deactivated_by_consumption_id: numOrNull(r.deactivated_by_consumption_id),
    deactivated_by_adjustment_id: numOrNull(r.deactivated_by_adjustment_id),
    created_at: r.created_at as Date,
    deleted_at: dateOrNull(r.deleted_at),
  };
}

function toConsumption(r: RowDataPacket): ConsumptionRow {
  return {
    id: Number(r.id),
    batch_id: Number(r.batch_id),
    substance_id: Number(r.substance_id),
    quantity: str(r.quantity),
    occurred_at: r.occurred_at as Date,
    note: strOrNull(r.note),
    client_ref: strOrNull(r.client_ref),
    created_at: r.created_at as Date,
    deleted_at: dateOrNull(r.deleted_at),
  };
}

function toAdjustment(r: RowDataPacket): AdjustmentRow {
  return {
    id: Number(r.id),
    batch_id: Number(r.batch_id),
    substance_id: Number(r.substance_id),
    delta: str(r.delta),
    reason: str(r.reason),
    occurred_at: r.occurred_at as Date,
    client_ref: strOrNull(r.client_ref),
    created_at: r.created_at as Date,
    deleted_at: dateOrNull(r.deleted_at),
  };
}

function toOneTime(r: RowDataPacket): OneTimeRow {
  return {
    id: Number(r.id),
    substance_id: Number(r.substance_id),
    name: strOrNull(r.name),
    quantity: str(r.quantity),
    total_price: str(r.total_price),
    occurred_at: r.occurred_at as Date,
    note: strOrNull(r.note),
    client_ref: strOrNull(r.client_ref),
    created_at: r.created_at as Date,
    deleted_at: dateOrNull(r.deleted_at),
  };
}

/** Builds "a = ?, b = ?" from a fixed whitelist of column names (never from user input). */
function setClause<T extends object>(update: T, columns: ReadonlyArray<keyof T & string>): [string, unknown[]] {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const column of columns) {
    const value = update[column];
    if (value !== undefined) {
      sets.push(`${column} = ?`);
      values.push(value);
    }
  }
  return [sets.join(', '), values];
}

// ---------------------------------------------------------------------------------------------
// Substances (state needed by the ledger)
// ---------------------------------------------------------------------------------------------

/** Locks the substance row: serialises batch / one-time creation against delete and archive. */
export async function lockSubstance(db: Queryable, id: number): Promise<SubstanceStateRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, refill_quantity, archived_at, deleted_at
       FROM substances WHERE id = ? FOR UPDATE`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    refill_quantity: strOrNull(r.refill_quantity),
    archived_at: dateOrNull(r.archived_at),
    deleted_at: dateOrNull(r.deleted_at),
  };
}

export async function findSubstanceState(db: Queryable, id: number): Promise<SubstanceStateRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT id, refill_quantity, archived_at, deleted_at FROM substances WHERE id = ?',
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    refill_quantity: strOrNull(r.refill_quantity),
    archived_at: dateOrNull(r.archived_at),
    deleted_at: dateOrNull(r.deleted_at),
  };
}

// ---------------------------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------------------------

const BATCH_COLUMNS = `b.id, b.substance_id, b.name, b.quantity, b.total_price, b.occurred_at, b.note,
  b.client_ref, b.deactivated_at, b.deactivated_by_consumption_id, b.deactivated_by_adjustment_id,
  b.created_at, b.deleted_at`;

export async function findBatch(db: Queryable, id: number): Promise<BatchRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(`SELECT ${BATCH_COLUMNS} FROM batches b WHERE b.id = ?`, [id]);
  return rows[0] ? toBatch(rows[0]) : null;
}

export async function findBatchByClientRef(db: Queryable, clientRef: string): Promise<BatchRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(`SELECT ${BATCH_COLUMNS} FROM batches b WHERE b.client_ref = ?`, [
    clientRef,
  ]);
  return rows[0] ? toBatch(rows[0]) : null;
}

/**
 * Locks the batch row (SELECT ... FOR UPDATE) for the rest of the transaction and returns it
 * with the state of its substance. Every write that depends on remaining goes through here.
 */
export async function lockBatch(db: Queryable, id: number): Promise<LockedBatchRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ${BATCH_COLUMNS}, s.archived_at AS substance_archived_at, s.deleted_at AS substance_deleted_at
       FROM batches b JOIN substances s ON s.id = b.substance_id
      WHERE b.id = ?
      FOR UPDATE OF b`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    ...toBatch(r),
    substance_archived_at: dateOrNull(r.substance_archived_at),
    substance_deleted_at: dateOrNull(r.substance_deleted_at),
  };
}

/** Sums of the batch's non-deleted consumptions and adjustments, optionally without one row. */
export async function batchMovementSums(
  db: Queryable,
  batchId: number,
  exclude: { consumptionId?: number; adjustmentId?: number } = {},
): Promise<{ consumed: string; adjusted: string }> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
       (SELECT COALESCE(SUM(quantity), 0) FROM consumptions
         WHERE batch_id = ? AND deleted_at IS NULL AND id <> ?) AS consumed,
       (SELECT COALESCE(SUM(delta), 0) FROM adjustments
         WHERE batch_id = ? AND deleted_at IS NULL AND id <> ?) AS adjusted`,
    [batchId, exclude.consumptionId ?? 0, batchId, exclude.adjustmentId ?? 0],
  );
  return { consumed: str(rows[0]?.consumed ?? '0'), adjusted: str(rows[0]?.adjusted ?? '0') };
}

export interface BatchInsert {
  substance_id: number;
  name: string | null;
  quantity: string;
  total_price: string;
  occurred_at: string;
  note: string | null;
  client_ref: string | null;
}

export async function insertBatch(db: Queryable, v: BatchInsert): Promise<number> {
  const [res] = await db.query<ResultSetHeader>(
    `INSERT INTO batches (substance_id, name, quantity, total_price, occurred_at, note, client_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [v.substance_id, v.name, v.quantity, v.total_price, v.occurred_at, v.note, v.client_ref],
  );
  return res.insertId;
}

export interface BatchUpdate {
  name?: string | null;
  note?: string | null;
  occurred_at?: string;
  quantity?: string;
  total_price?: string;
}

export async function updateBatch(db: Queryable, id: number, update: BatchUpdate): Promise<void> {
  const [sets, values] = setClause(update, ['name', 'note', 'occurred_at', 'quantity', 'total_price']);
  if (!sets) return;
  await db.query(`UPDATE batches SET ${sets} WHERE id = ?`, [...values, id]);
}

export async function softDeleteBatch(db: Queryable, id: number, at: string): Promise<void> {
  await db.query('UPDATE batches SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', [at, id]);
}

/**
 * Soft delete of what was recorded on a batch: its consumptions and adjustments. Rows already
 * deleted keep their own `deleted_at`.
 */
export async function softDeleteMovementsOfBatch(db: Queryable, batchId: number, at: string): Promise<void> {
  for (const table of ['consumptions', 'adjustments']) {
    await db.query(`UPDATE ${table} SET deleted_at = ? WHERE batch_id = ? AND deleted_at IS NULL`, [at, batchId]);
  }
}

/** Stamps the batch as deactivated by exactly one consumption or one adjustment. */
export async function deactivateBatch(
  db: Queryable,
  id: number,
  at: string,
  by: { consumptionId: number } | { adjustmentId: number },
): Promise<void> {
  const consumptionId = 'consumptionId' in by ? by.consumptionId : null;
  const adjustmentId = 'adjustmentId' in by ? by.adjustmentId : null;
  await db.query(
    `UPDATE batches
        SET deactivated_at = ?, deactivated_by_consumption_id = ?, deactivated_by_adjustment_id = ?
      WHERE id = ?`,
    [at, consumptionId, adjustmentId, id],
  );
}

/** Reopens the batch: clears deactivated_at and both deactivated_by_* columns. */
export async function reopenBatch(db: Queryable, id: number): Promise<void> {
  await db.query(
    `UPDATE batches
        SET deactivated_at = NULL, deactivated_by_consumption_id = NULL, deactivated_by_adjustment_id = NULL
      WHERE id = ?`,
    [id],
  );
}

// ---------------------------------------------------------------------------------------------
// Consumptions
// ---------------------------------------------------------------------------------------------

const CONSUMPTION_SELECT = `SELECT c.id, c.batch_id, b.substance_id, c.quantity, c.occurred_at, c.note,
  c.client_ref, c.created_at, c.deleted_at
  FROM consumptions c JOIN batches b ON b.id = c.batch_id`;

export async function findConsumption(db: Queryable, id: number): Promise<ConsumptionRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(`${CONSUMPTION_SELECT} WHERE c.id = ?`, [id]);
  return rows[0] ? toConsumption(rows[0]) : null;
}

export async function findConsumptionByClientRef(db: Queryable, clientRef: string): Promise<ConsumptionRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(`${CONSUMPTION_SELECT} WHERE c.client_ref = ?`, [clientRef]);
  return rows[0] ? toConsumption(rows[0]) : null;
}

export interface ConsumptionInsert {
  batch_id: number;
  quantity: string;
  occurred_at: string;
  note: string | null;
  client_ref: string | null;
}

export async function insertConsumption(db: Queryable, v: ConsumptionInsert): Promise<number> {
  const [res] = await db.query<ResultSetHeader>(
    'INSERT INTO consumptions (batch_id, quantity, occurred_at, note, client_ref) VALUES (?, ?, ?, ?, ?)',
    [v.batch_id, v.quantity, v.occurred_at, v.note, v.client_ref],
  );
  return res.insertId;
}

export interface ConsumptionUpdate {
  quantity?: string;
  occurred_at?: string;
  note?: string | null;
}

export async function updateConsumption(db: Queryable, id: number, update: ConsumptionUpdate): Promise<void> {
  const [sets, values] = setClause(update, ['quantity', 'occurred_at', 'note']);
  if (!sets) return;
  await db.query(`UPDATE consumptions SET ${sets} WHERE id = ?`, [...values, id]);
}

export async function softDeleteConsumption(db: Queryable, id: number, at: string): Promise<void> {
  await db.query('UPDATE consumptions SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', [at, id]);
}

// ---------------------------------------------------------------------------------------------
// Adjustments
// ---------------------------------------------------------------------------------------------

const ADJUSTMENT_SELECT = `SELECT a.id, a.batch_id, b.substance_id, a.delta, a.reason, a.occurred_at,
  a.client_ref, a.created_at, a.deleted_at
  FROM adjustments a JOIN batches b ON b.id = a.batch_id`;

export async function findAdjustment(db: Queryable, id: number): Promise<AdjustmentRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(`${ADJUSTMENT_SELECT} WHERE a.id = ?`, [id]);
  return rows[0] ? toAdjustment(rows[0]) : null;
}

export async function findAdjustmentByClientRef(db: Queryable, clientRef: string): Promise<AdjustmentRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(`${ADJUSTMENT_SELECT} WHERE a.client_ref = ?`, [clientRef]);
  return rows[0] ? toAdjustment(rows[0]) : null;
}

export interface AdjustmentInsert {
  batch_id: number;
  delta: string;
  reason: string;
  occurred_at: string;
  client_ref: string | null;
}

export async function insertAdjustment(db: Queryable, v: AdjustmentInsert): Promise<number> {
  const [res] = await db.query<ResultSetHeader>(
    'INSERT INTO adjustments (batch_id, delta, reason, occurred_at, client_ref) VALUES (?, ?, ?, ?, ?)',
    [v.batch_id, v.delta, v.reason, v.occurred_at, v.client_ref],
  );
  return res.insertId;
}

export interface AdjustmentUpdate {
  delta?: string;
  reason?: string;
  occurred_at?: string;
}

export async function updateAdjustment(db: Queryable, id: number, update: AdjustmentUpdate): Promise<void> {
  const [sets, values] = setClause(update, ['delta', 'reason', 'occurred_at']);
  if (!sets) return;
  await db.query(`UPDATE adjustments SET ${sets} WHERE id = ?`, [...values, id]);
}

export async function softDeleteAdjustment(db: Queryable, id: number, at: string): Promise<void> {
  await db.query('UPDATE adjustments SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', [at, id]);
}

// ---------------------------------------------------------------------------------------------
// One-time consumptions
// ---------------------------------------------------------------------------------------------

const ONE_TIME_SELECT = `SELECT id, substance_id, name, quantity, total_price, occurred_at, note, client_ref,
  created_at, deleted_at FROM one_time_consumptions`;

export async function findOneTime(db: Queryable, id: number): Promise<OneTimeRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(`${ONE_TIME_SELECT} WHERE id = ?`, [id]);
  return rows[0] ? toOneTime(rows[0]) : null;
}

export async function lockOneTime(db: Queryable, id: number): Promise<OneTimeRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(`${ONE_TIME_SELECT} WHERE id = ? FOR UPDATE`, [id]);
  return rows[0] ? toOneTime(rows[0]) : null;
}

export async function findOneTimeByClientRef(db: Queryable, clientRef: string): Promise<OneTimeRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(`${ONE_TIME_SELECT} WHERE client_ref = ?`, [clientRef]);
  return rows[0] ? toOneTime(rows[0]) : null;
}

export interface OneTimeInsert {
  substance_id: number;
  name: string | null;
  quantity: string;
  total_price: string;
  occurred_at: string;
  note: string | null;
  client_ref: string | null;
}

export async function insertOneTime(db: Queryable, v: OneTimeInsert): Promise<number> {
  const [res] = await db.query<ResultSetHeader>(
    `INSERT INTO one_time_consumptions (substance_id, name, quantity, total_price, occurred_at, note, client_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [v.substance_id, v.name, v.quantity, v.total_price, v.occurred_at, v.note, v.client_ref],
  );
  return res.insertId;
}

export interface OneTimeUpdate {
  name?: string | null;
  quantity?: string;
  total_price?: string;
  occurred_at?: string;
  note?: string | null;
}

export async function updateOneTime(db: Queryable, id: number, update: OneTimeUpdate): Promise<void> {
  const [sets, values] = setClause(update, ['name', 'quantity', 'total_price', 'occurred_at', 'note']);
  if (!sets) return;
  await db.query(`UPDATE one_time_consumptions SET ${sets} WHERE id = ?`, [...values, id]);
}

export async function softDeleteOneTime(db: Queryable, id: number, at: string): Promise<void> {
  await db.query('UPDATE one_time_consumptions SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', [at, id]);
}
