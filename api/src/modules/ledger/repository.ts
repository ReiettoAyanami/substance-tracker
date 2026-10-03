import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Queryable } from '../../db/pool.js';
import type { Owner } from '../../shared/owner.js';

// ---------------------------------------------------------------------------------------------
// Rows (snake_case, as stored). DECIMAL values are strings, DATETIME values are UTC Dates.
// Every function works for one owner: a row of another user's substance is never found, written
// or counted (a batch, a consumption, an adjustment, a one-time consumption through its substance).
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

/** Builds "t.a = ?, t.b = ?" from a fixed whitelist of column names (never from user input). */
function setClause<T extends object>(update: T, columns: ReadonlyArray<keyof T & string>, alias: string): [string, unknown[]] {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const column of columns) {
    const value = update[column];
    if (value !== undefined) {
      sets.push(`${alias}.${column} = ?`);
      values.push(value);
    }
  }
  return [sets.join(', '), values];
}

/** An insert into a child table that matched no owned parent: the service checks first, so a bug. */
function insertedId(res: ResultSetHeader, what: string): number {
  if (res.affectedRows !== 1) throw new Error(`${what} was not inserted: its parent is not the owner's`);
  return res.insertId;
}

// ---------------------------------------------------------------------------------------------
// Substances (state needed by the ledger)
// ---------------------------------------------------------------------------------------------

function toSubstanceState(r: RowDataPacket): SubstanceStateRow {
  return {
    id: Number(r.id),
    refill_quantity: strOrNull(r.refill_quantity),
    archived_at: dateOrNull(r.archived_at),
    deleted_at: dateOrNull(r.deleted_at),
  };
}

/** Locks the owner's substance row: serialises batch / one-time creation against delete and archive. */
export async function lockSubstance(db: Queryable, owner: Owner, id: number): Promise<SubstanceStateRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, refill_quantity, archived_at, deleted_at
       FROM substances WHERE id = ? AND user_id = ? FOR UPDATE`,
    [id, owner.userId],
  );
  return rows[0] ? toSubstanceState(rows[0]) : null;
}

export async function findSubstanceState(db: Queryable, owner: Owner, id: number): Promise<SubstanceStateRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT id, refill_quantity, archived_at, deleted_at FROM substances WHERE id = ? AND user_id = ?',
    [id, owner.userId],
  );
  return rows[0] ? toSubstanceState(rows[0]) : null;
}

// ---------------------------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------------------------

const BATCH_COLUMNS = `b.id, b.substance_id, b.name, b.quantity, b.total_price, b.occurred_at, b.note,
  b.client_ref, b.deactivated_at, b.deactivated_by_consumption_id, b.deactivated_by_adjustment_id,
  b.created_at, b.deleted_at`;

const OWNED_BATCHES = 'batches b JOIN substances s ON s.id = b.substance_id';

export async function findBatch(db: Queryable, owner: Owner, id: number): Promise<BatchRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ${BATCH_COLUMNS} FROM ${OWNED_BATCHES} WHERE b.id = ? AND s.user_id = ?`,
    [id, owner.userId],
  );
  return rows[0] ? toBatch(rows[0]) : null;
}

/** The owner's batch with this clientRef; another user's is not found (the API refuses the ref). */
export async function findBatchByClientRef(db: Queryable, owner: Owner, clientRef: string): Promise<BatchRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ${BATCH_COLUMNS} FROM ${OWNED_BATCHES} WHERE b.client_ref = ? AND s.user_id = ?`,
    [clientRef, owner.userId],
  );
  return rows[0] ? toBatch(rows[0]) : null;
}

/**
 * Locks the owner's batch row (SELECT ... FOR UPDATE) for the rest of the transaction and returns
 * it with the state of its substance. Every write that depends on remaining goes through here.
 */
export async function lockBatch(db: Queryable, owner: Owner, id: number): Promise<LockedBatchRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ${BATCH_COLUMNS}, s.archived_at AS substance_archived_at, s.deleted_at AS substance_deleted_at
       FROM ${OWNED_BATCHES}
      WHERE b.id = ? AND s.user_id = ?
      FOR UPDATE OF b`,
    [id, owner.userId],
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
  owner: Owner,
  batchId: number,
  exclude: { consumptionId?: number; adjustmentId?: number } = {},
): Promise<{ consumed: string; adjusted: string }> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
       (SELECT COALESCE(SUM(c.quantity), 0) FROM consumptions c
         WHERE c.batch_id = b.id AND c.deleted_at IS NULL AND c.id <> ?) AS consumed,
       (SELECT COALESCE(SUM(a.delta), 0) FROM adjustments a
         WHERE a.batch_id = b.id AND a.deleted_at IS NULL AND a.id <> ?) AS adjusted
       FROM ${OWNED_BATCHES}
      WHERE b.id = ? AND s.user_id = ?`,
    [exclude.consumptionId ?? 0, exclude.adjustmentId ?? 0, batchId, owner.userId],
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

/** A batch of one of the owner's substances (none is inserted for another user's). */
export async function insertBatch(db: Queryable, owner: Owner, v: BatchInsert): Promise<number> {
  const [res] = await db.query<ResultSetHeader>(
    `INSERT INTO batches (substance_id, name, quantity, total_price, occurred_at, note, client_ref)
     SELECT s.id, ?, ?, ?, ?, ?, ? FROM substances s WHERE s.id = ? AND s.user_id = ?`,
    [v.name, v.quantity, v.total_price, v.occurred_at, v.note, v.client_ref, v.substance_id, owner.userId],
  );
  return insertedId(res, 'The batch');
}

export interface BatchUpdate {
  name?: string | null;
  note?: string | null;
  occurred_at?: string;
  quantity?: string;
  total_price?: string;
}

export async function updateBatch(db: Queryable, owner: Owner, id: number, update: BatchUpdate): Promise<void> {
  const [sets, values] = setClause(update, ['name', 'note', 'occurred_at', 'quantity', 'total_price'], 'b');
  if (!sets) return;
  await db.query(`UPDATE ${OWNED_BATCHES} SET ${sets} WHERE b.id = ? AND s.user_id = ?`, [...values, id, owner.userId]);
}

export async function softDeleteBatch(db: Queryable, owner: Owner, id: number, at: string): Promise<void> {
  await db.query(`UPDATE ${OWNED_BATCHES} SET b.deleted_at = ? WHERE b.id = ? AND s.user_id = ? AND b.deleted_at IS NULL`, [
    at,
    id,
    owner.userId,
  ]);
}

/**
 * Soft delete of what was recorded on one of the owner's batches: its consumptions and adjustments.
 * Rows already deleted keep their own `deleted_at`.
 */
export async function softDeleteMovementsOfBatch(db: Queryable, owner: Owner, batchId: number, at: string): Promise<void> {
  for (const table of ['consumptions', 'adjustments']) {
    await db.query(
      `UPDATE ${table} m JOIN batches b ON b.id = m.batch_id JOIN substances s ON s.id = b.substance_id
          SET m.deleted_at = ?
        WHERE m.batch_id = ? AND s.user_id = ? AND m.deleted_at IS NULL`,
      [at, batchId, owner.userId],
    );
  }
}

/** Stamps the batch as deactivated by exactly one consumption or one adjustment. */
export async function deactivateBatch(
  db: Queryable,
  owner: Owner,
  id: number,
  at: string,
  by: { consumptionId: number } | { adjustmentId: number },
): Promise<void> {
  const consumptionId = 'consumptionId' in by ? by.consumptionId : null;
  const adjustmentId = 'adjustmentId' in by ? by.adjustmentId : null;
  await db.query(
    `UPDATE ${OWNED_BATCHES}
        SET b.deactivated_at = ?, b.deactivated_by_consumption_id = ?, b.deactivated_by_adjustment_id = ?
      WHERE b.id = ? AND s.user_id = ?`,
    [at, consumptionId, adjustmentId, id, owner.userId],
  );
}

/** Reopens the batch: clears deactivated_at and both deactivated_by_* columns. */
export async function reopenBatch(db: Queryable, owner: Owner, id: number): Promise<void> {
  await db.query(
    `UPDATE ${OWNED_BATCHES}
        SET b.deactivated_at = NULL, b.deactivated_by_consumption_id = NULL, b.deactivated_by_adjustment_id = NULL
      WHERE b.id = ? AND s.user_id = ?`,
    [id, owner.userId],
  );
}

// ---------------------------------------------------------------------------------------------
// Consumptions
// ---------------------------------------------------------------------------------------------

const CONSUMPTION_SELECT = `SELECT c.id, c.batch_id, b.substance_id, c.quantity, c.occurred_at, c.note,
  c.client_ref, c.created_at, c.deleted_at
  FROM consumptions c JOIN batches b ON b.id = c.batch_id JOIN substances s ON s.id = b.substance_id`;

export async function findConsumption(db: Queryable, owner: Owner, id: number): Promise<ConsumptionRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(`${CONSUMPTION_SELECT} WHERE c.id = ? AND s.user_id = ?`, [id, owner.userId]);
  return rows[0] ? toConsumption(rows[0]) : null;
}

export async function findConsumptionByClientRef(db: Queryable, owner: Owner, clientRef: string): Promise<ConsumptionRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(`${CONSUMPTION_SELECT} WHERE c.client_ref = ? AND s.user_id = ?`, [
    clientRef,
    owner.userId,
  ]);
  return rows[0] ? toConsumption(rows[0]) : null;
}

export interface ConsumptionInsert {
  batch_id: number;
  quantity: string;
  occurred_at: string;
  note: string | null;
  client_ref: string | null;
}

export async function insertConsumption(db: Queryable, owner: Owner, v: ConsumptionInsert): Promise<number> {
  const [res] = await db.query<ResultSetHeader>(
    `INSERT INTO consumptions (batch_id, quantity, occurred_at, note, client_ref)
     SELECT b.id, ?, ?, ?, ? FROM ${OWNED_BATCHES} WHERE b.id = ? AND s.user_id = ?`,
    [v.quantity, v.occurred_at, v.note, v.client_ref, v.batch_id, owner.userId],
  );
  return insertedId(res, 'The consumption');
}

export interface ConsumptionUpdate {
  quantity?: string;
  occurred_at?: string;
  note?: string | null;
}

export async function updateConsumption(db: Queryable, owner: Owner, id: number, update: ConsumptionUpdate): Promise<void> {
  const [sets, values] = setClause(update, ['quantity', 'occurred_at', 'note'], 'c');
  if (!sets) return;
  await db.query(
    `UPDATE consumptions c JOIN batches b ON b.id = c.batch_id JOIN substances s ON s.id = b.substance_id SET ${sets} WHERE c.id = ? AND s.user_id = ?`,
    [...values, id, owner.userId],
  );
}

export async function softDeleteConsumption(db: Queryable, owner: Owner, id: number, at: string): Promise<void> {
  await db.query(
    `UPDATE consumptions c JOIN batches b ON b.id = c.batch_id JOIN substances s ON s.id = b.substance_id
        SET c.deleted_at = ?
      WHERE c.id = ? AND s.user_id = ? AND c.deleted_at IS NULL`,
    [at, id, owner.userId],
  );
}

// ---------------------------------------------------------------------------------------------
// Adjustments
// ---------------------------------------------------------------------------------------------

const ADJUSTMENT_SELECT = `SELECT a.id, a.batch_id, b.substance_id, a.delta, a.reason, a.occurred_at,
  a.client_ref, a.created_at, a.deleted_at
  FROM adjustments a JOIN batches b ON b.id = a.batch_id JOIN substances s ON s.id = b.substance_id`;

export async function findAdjustment(db: Queryable, owner: Owner, id: number): Promise<AdjustmentRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(`${ADJUSTMENT_SELECT} WHERE a.id = ? AND s.user_id = ?`, [id, owner.userId]);
  return rows[0] ? toAdjustment(rows[0]) : null;
}

export async function findAdjustmentByClientRef(db: Queryable, owner: Owner, clientRef: string): Promise<AdjustmentRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(`${ADJUSTMENT_SELECT} WHERE a.client_ref = ? AND s.user_id = ?`, [
    clientRef,
    owner.userId,
  ]);
  return rows[0] ? toAdjustment(rows[0]) : null;
}

export interface AdjustmentInsert {
  batch_id: number;
  delta: string;
  reason: string;
  occurred_at: string;
  client_ref: string | null;
}

export async function insertAdjustment(db: Queryable, owner: Owner, v: AdjustmentInsert): Promise<number> {
  const [res] = await db.query<ResultSetHeader>(
    `INSERT INTO adjustments (batch_id, delta, reason, occurred_at, client_ref)
     SELECT b.id, ?, ?, ?, ? FROM ${OWNED_BATCHES} WHERE b.id = ? AND s.user_id = ?`,
    [v.delta, v.reason, v.occurred_at, v.client_ref, v.batch_id, owner.userId],
  );
  return insertedId(res, 'The adjustment');
}

export interface AdjustmentUpdate {
  delta?: string;
  reason?: string;
  occurred_at?: string;
}

export async function updateAdjustment(db: Queryable, owner: Owner, id: number, update: AdjustmentUpdate): Promise<void> {
  const [sets, values] = setClause(update, ['delta', 'reason', 'occurred_at'], 'a');
  if (!sets) return;
  await db.query(
    `UPDATE adjustments a JOIN batches b ON b.id = a.batch_id JOIN substances s ON s.id = b.substance_id SET ${sets} WHERE a.id = ? AND s.user_id = ?`,
    [...values, id, owner.userId],
  );
}

export async function softDeleteAdjustment(db: Queryable, owner: Owner, id: number, at: string): Promise<void> {
  await db.query(
    `UPDATE adjustments a JOIN batches b ON b.id = a.batch_id JOIN substances s ON s.id = b.substance_id
        SET a.deleted_at = ?
      WHERE a.id = ? AND s.user_id = ? AND a.deleted_at IS NULL`,
    [at, id, owner.userId],
  );
}

// ---------------------------------------------------------------------------------------------
// One-time consumptions
// ---------------------------------------------------------------------------------------------

const ONE_TIME_SELECT = `SELECT o.id, o.substance_id, o.name, o.quantity, o.total_price, o.occurred_at, o.note,
  o.client_ref, o.created_at, o.deleted_at
  FROM one_time_consumptions o JOIN substances s ON s.id = o.substance_id`;

export async function findOneTime(db: Queryable, owner: Owner, id: number): Promise<OneTimeRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(`${ONE_TIME_SELECT} WHERE o.id = ? AND s.user_id = ?`, [id, owner.userId]);
  return rows[0] ? toOneTime(rows[0]) : null;
}

export async function lockOneTime(db: Queryable, owner: Owner, id: number): Promise<OneTimeRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(`${ONE_TIME_SELECT} WHERE o.id = ? AND s.user_id = ? FOR UPDATE OF o`, [
    id,
    owner.userId,
  ]);
  return rows[0] ? toOneTime(rows[0]) : null;
}

export async function findOneTimeByClientRef(db: Queryable, owner: Owner, clientRef: string): Promise<OneTimeRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(`${ONE_TIME_SELECT} WHERE o.client_ref = ? AND s.user_id = ?`, [
    clientRef,
    owner.userId,
  ]);
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

export async function insertOneTime(db: Queryable, owner: Owner, v: OneTimeInsert): Promise<number> {
  const [res] = await db.query<ResultSetHeader>(
    `INSERT INTO one_time_consumptions (substance_id, name, quantity, total_price, occurred_at, note, client_ref)
     SELECT s.id, ?, ?, ?, ?, ?, ? FROM substances s WHERE s.id = ? AND s.user_id = ?`,
    [v.name, v.quantity, v.total_price, v.occurred_at, v.note, v.client_ref, v.substance_id, owner.userId],
  );
  return insertedId(res, 'The one-time consumption');
}

export interface OneTimeUpdate {
  name?: string | null;
  quantity?: string;
  total_price?: string;
  occurred_at?: string;
  note?: string | null;
}

export async function updateOneTime(db: Queryable, owner: Owner, id: number, update: OneTimeUpdate): Promise<void> {
  const [sets, values] = setClause(update, ['name', 'quantity', 'total_price', 'occurred_at', 'note'], 'o');
  if (!sets) return;
  await db.query(
    `UPDATE one_time_consumptions o JOIN substances s ON s.id = o.substance_id SET ${sets} WHERE o.id = ? AND s.user_id = ?`,
    [...values, id, owner.userId],
  );
}

export async function softDeleteOneTime(db: Queryable, owner: Owner, id: number, at: string): Promise<void> {
  await db.query(
    `UPDATE one_time_consumptions o JOIN substances s ON s.id = o.substance_id
        SET o.deleted_at = ?
      WHERE o.id = ? AND s.user_id = ? AND o.deleted_at IS NULL`,
    [at, id, owner.userId],
  );
}
