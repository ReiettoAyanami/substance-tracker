import type { RowDataPacket } from 'mysql2/promise';
import type { Queryable } from '../../db/pool.js';
import type { Owner } from '../../shared/owner.js';

/**
 * Read-only queries for Reports. Soft-deleted rows are always excluded; deactivated batches
 * are included (they count in every statistic). Every query is for one owner: another user's
 * substances, batches and movements are never loaded (design-accounts.md, "The domain, per owner").
 */

/** The owner's substances, for a condition on a substance_id column. */
const OWNED_SUBSTANCE_IDS = 'SELECT os.id FROM substances os WHERE os.user_id = ?';

export interface BatchStatRow {
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
  /** Σ quantity of the non-deleted consumptions. */
  consumed: string;
  /** Σ delta of the non-deleted adjustments. */
  adjusted: string;
}

export interface ConsumptionStatRow {
  id: number;
  batch_id: number;
  substance_id: number;
  quantity: string;
  occurred_at: Date;
  note: string | null;
  client_ref: string | null;
  created_at: Date;
}

export interface AdjustmentStatRow {
  id: number;
  batch_id: number;
  substance_id: number;
  delta: string;
  reason: string;
  occurred_at: Date;
  client_ref: string | null;
  created_at: Date;
}

export interface OneTimeStatRow {
  id: number;
  substance_id: number;
  name: string | null;
  quantity: string;
  total_price: string;
  occurred_at: Date;
  note: string | null;
  client_ref: string | null;
  created_at: Date;
}

/** Which part of the ledger to load. Omitted fields do not filter. */
export interface LedgerScope {
  substanceIds?: number[];
  batchIds?: number[];
  /** Only batches that are not deactivated. */
  activeOnly?: boolean;
}

const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const dateOrNull = (v: unknown): Date | null => (v instanceof Date ? v : null);

function isEmptyScope(scope: LedgerScope): boolean {
  return (scope.substanceIds !== undefined && scope.substanceIds.length === 0) ||
    (scope.batchIds !== undefined && scope.batchIds.length === 0);
}

/** WHERE fragments on the batches alias `b`: the owner's batches in scope. */
function batchFilter(owner: Owner, scope: LedgerScope): [string, unknown[]] {
  const where: string[] = ['b.deleted_at IS NULL', `b.substance_id IN (${OWNED_SUBSTANCE_IDS})`];
  const values: unknown[] = [owner.userId];
  if (scope.substanceIds !== undefined) {
    where.push('b.substance_id IN (?)');
    values.push(scope.substanceIds);
  }
  if (scope.batchIds !== undefined) {
    where.push('b.id IN (?)');
    values.push(scope.batchIds);
  }
  if (scope.activeOnly) where.push('b.deactivated_at IS NULL');
  return [where.join(' AND '), values];
}

/** Batches with their consumed / adjusted sums (the Appendix A remaining query), oldest first. */
export async function loadBatches(db: Queryable, owner: Owner, scope: LedgerScope): Promise<BatchStatRow[]> {
  if (isEmptyScope(scope)) return [];
  const [where, values] = batchFilter(owner, scope);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT b.id, b.substance_id, b.name, b.quantity, b.total_price, b.occurred_at, b.note, b.client_ref,
            b.deactivated_at, b.deactivated_by_consumption_id, b.deactivated_by_adjustment_id, b.created_at,
            COALESCE(c.qty, 0) AS consumed, COALESCE(a.qty, 0) AS adjusted
       FROM batches b
       LEFT JOIN (SELECT batch_id, SUM(quantity) AS qty FROM consumptions
                   WHERE deleted_at IS NULL GROUP BY batch_id) c ON c.batch_id = b.id
       LEFT JOIN (SELECT batch_id, SUM(delta) AS qty FROM adjustments
                   WHERE deleted_at IS NULL GROUP BY batch_id) a ON a.batch_id = b.id
      WHERE ${where}
      ORDER BY b.occurred_at, b.id`,
    values,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    substance_id: Number(r.substance_id),
    name: strOrNull(r.name),
    quantity: String(r.quantity),
    total_price: String(r.total_price),
    occurred_at: r.occurred_at as Date,
    note: strOrNull(r.note),
    client_ref: strOrNull(r.client_ref),
    deactivated_at: dateOrNull(r.deactivated_at),
    deactivated_by_consumption_id: numOrNull(r.deactivated_by_consumption_id),
    deactivated_by_adjustment_id: numOrNull(r.deactivated_by_adjustment_id),
    created_at: r.created_at as Date,
    consumed: String(r.consumed),
    adjusted: String(r.adjusted),
  }));
}

/** Non-deleted consumptions of non-deleted batches in scope, oldest first. */
export async function loadConsumptions(db: Queryable, owner: Owner, scope: LedgerScope): Promise<ConsumptionStatRow[]> {
  if (isEmptyScope(scope)) return [];
  const [where, values] = batchFilter(owner, { ...scope, activeOnly: false });
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT c.id, c.batch_id, b.substance_id, c.quantity, c.occurred_at, c.note, c.client_ref, c.created_at
       FROM consumptions c JOIN batches b ON b.id = c.batch_id
      WHERE c.deleted_at IS NULL AND ${where}
      ORDER BY c.occurred_at, c.id`,
    values,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    batch_id: Number(r.batch_id),
    substance_id: Number(r.substance_id),
    quantity: String(r.quantity),
    occurred_at: r.occurred_at as Date,
    note: strOrNull(r.note),
    client_ref: strOrNull(r.client_ref),
    created_at: r.created_at as Date,
  }));
}

/** Non-deleted adjustments of non-deleted batches in scope, oldest first. */
export async function loadAdjustments(db: Queryable, owner: Owner, scope: LedgerScope): Promise<AdjustmentStatRow[]> {
  if (isEmptyScope(scope)) return [];
  const [where, values] = batchFilter(owner, { ...scope, activeOnly: false });
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT a.id, a.batch_id, b.substance_id, a.delta, a.reason, a.occurred_at, a.client_ref, a.created_at
       FROM adjustments a JOIN batches b ON b.id = a.batch_id
      WHERE a.deleted_at IS NULL AND ${where}
      ORDER BY a.occurred_at, a.id`,
    values,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    batch_id: Number(r.batch_id),
    substance_id: Number(r.substance_id),
    delta: String(r.delta),
    reason: String(r.reason),
    occurred_at: r.occurred_at as Date,
    client_ref: strOrNull(r.client_ref),
    created_at: r.created_at as Date,
  }));
}

function toOneTime(r: RowDataPacket): OneTimeStatRow {
  return {
    id: Number(r.id),
    substance_id: Number(r.substance_id),
    name: strOrNull(r.name),
    quantity: String(r.quantity),
    total_price: String(r.total_price),
    occurred_at: r.occurred_at as Date,
    note: strOrNull(r.note),
    client_ref: strOrNull(r.client_ref),
    created_at: r.created_at as Date,
  };
}

/** Non-deleted one-time consumptions of the substances in scope, oldest first. */
export async function loadOneTimes(db: Queryable, owner: Owner, scope: { substanceIds?: number[] }): Promise<OneTimeStatRow[]> {
  if (scope.substanceIds !== undefined && scope.substanceIds.length === 0) return [];
  const where = ['deleted_at IS NULL', `substance_id IN (${OWNED_SUBSTANCE_IDS})`];
  const values: unknown[] = [owner.userId];
  if (scope.substanceIds !== undefined) {
    where.push('substance_id IN (?)');
    values.push(scope.substanceIds);
  }
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, substance_id, name, quantity, total_price, occurred_at, note, client_ref, created_at
       FROM one_time_consumptions
      WHERE ${where.join(' AND ')}
      ORDER BY occurred_at, id`,
    values,
  );
  return rows.map(toOneTime);
}

/**
 * One page of a substance's one-time consumptions, newest first. A page never splits an
 * instant: RANK gives rows with the same occurred_at the same rank, so the ones tied with
 * the `limit`-th row come too, and `before=<last occurredAt>` loses nothing.
 */
export async function pageOneTimes(
  db: Queryable,
  owner: Owner,
  substanceId: number,
  page: { limit: number; before: string | null },
): Promise<OneTimeStatRow[]> {
  const values: unknown[] = [substanceId, owner.userId];
  let beforeClause = '';
  if (page.before !== null) {
    beforeClause = ' AND occurred_at < ?';
    values.push(page.before);
  }
  values.push(page.limit);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, substance_id, name, quantity, total_price, occurred_at, note, client_ref, created_at
       FROM (SELECT o.*, RANK() OVER (ORDER BY o.occurred_at DESC) AS rk
               FROM one_time_consumptions o
              WHERE o.substance_id = ? AND o.substance_id IN (${OWNED_SUBSTANCE_IDS})
                AND o.deleted_at IS NULL${beforeClause}) r
      WHERE rk <= ?
      ORDER BY occurred_at DESC, id DESC`,
    values,
  );
  return rows.map(toOneTime);
}

export interface BatchListRow {
  id: number;
  substance_id: number;
  substance_name: string;
  name: string | null;
  occurred_at: Date;
  deactivated_at: Date | null;
}

/**
 * Every non-deleted batch, finished ones too, of one substance or of all: by substance (name,
 * then id, like the substance list), newest first inside each.
 */
export async function listBatches(db: Queryable, owner: Owner, filter: { substanceId?: number | undefined }): Promise<BatchListRow[]> {
  const values: unknown[] = [owner.userId];
  let substanceClause = '';
  if (filter.substanceId !== undefined) {
    substanceClause = ' AND b.substance_id = ?';
    values.push(filter.substanceId);
  }
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT b.id, b.substance_id, s.name AS substance_name, b.name, b.occurred_at, b.deactivated_at
       FROM batches b JOIN substances s ON s.id = b.substance_id
      WHERE s.user_id = ? AND b.deleted_at IS NULL${substanceClause}
      ORDER BY s.name, s.id, b.occurred_at DESC, b.id DESC`,
    values,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    substance_id: Number(r.substance_id),
    substance_name: String(r.substance_name),
    name: strOrNull(r.name),
    occurred_at: r.occurred_at as Date,
    deactivated_at: dateOrNull(r.deactivated_at),
  }));
}

/** The owner's batch (non-deleted) exists? Used for 404s on batch reports. */
export async function batchExists(db: Queryable, owner: Owner, batchId: number): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id FROM batches WHERE id = ? AND deleted_at IS NULL AND substance_id IN (${OWNED_SUBSTANCE_IDS})`,
    [batchId, owner.userId],
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------------------------
// Movements (history): union of the four kinds, newest first
// ---------------------------------------------------------------------------------------------

export type MovementType = 'batch' | 'consumption' | 'one_time' | 'adjustment';

export interface MovementFilter {
  substanceId?: number | undefined;
  types: MovementType[];
  /** 'YYYY-MM-DD HH:MM:SS' UTC, inclusive. */
  fromInstant?: string | undefined;
  /** 'YYYY-MM-DD HH:MM:SS' UTC, exclusive. */
  toInstant?: string | undefined;
  /** 'YYYY-MM-DD HH:MM:SS' UTC, exclusive (pagination cursor). */
  before?: string | undefined;
  limit: number;
}

export interface MovementRow {
  type: MovementType;
  id: number;
  substance_id: number;
  substance_name: string;
  unit: string;
  batch_id: number | null;
  batch_name: string | null;
  name: string | null;
  quantity: string | null;
  delta: string | null;
  total_price: string | null;
  reason: string | null;
  note: string | null;
  occurred_at: Date;
  created_at: Date;
  deactivated_at: Date | null;
  client_ref: string | null;
}

function timeConditions(owner: Owner, column: string, filter: MovementFilter): [string, unknown[]] {
  const where: string[] = ['s.user_id = ?'];
  const values: unknown[] = [owner.userId];
  if (filter.substanceId !== undefined) {
    where.push('s.id = ?');
    values.push(filter.substanceId);
  }
  if (filter.fromInstant !== undefined) {
    where.push(`${column} >= ?`);
    values.push(filter.fromInstant);
  }
  if (filter.toInstant !== undefined) {
    where.push(`${column} < ?`);
    values.push(filter.toInstant);
  }
  if (filter.before !== undefined) {
    where.push(`${column} < ?`);
    values.push(filter.before);
  }
  return [where.length ? ` AND ${where.join(' AND ')}` : '', values];
}

/**
 * NULL placeholders of the UNION branches. Numeric and date columns get typed NULLs; text
 * columns stay plain NULL so they take the column's collation (a CAST would use the
 * connection collation and make the UNION mix collations).
 */
const NULL_OF = {
  batch_id: 'CAST(NULL AS UNSIGNED)',
  batch_name: 'NULL',
  name: 'NULL',
  quantity: 'CAST(NULL AS DECIMAL(12,3))',
  delta: 'CAST(NULL AS DECIMAL(12,3))',
  total_price: 'CAST(NULL AS DECIMAL(10,2))',
  reason: 'NULL',
  note: 'NULL',
  deactivated_at: 'CAST(NULL AS DATETIME)',
} as const;

type BranchColumns = Record<
  | 'batch_id'
  | 'batch_name'
  | 'name'
  | 'quantity'
  | 'delta'
  | 'total_price'
  | 'reason'
  | 'note'
  | 'occurred_at'
  | 'created_at'
  | 'deactivated_at'
  | 'client_ref',
  string
>;

/** One UNION branch with every column aliased (column expressions are fixed strings in this file). */
function branch(type: MovementType, alias: string, from: string, cols: BranchColumns, where: string): string {
  return `SELECT CAST('${type}' AS CHAR(16)) AS type, ${alias}.id AS id, s.id AS substance_id,
            s.name AS substance_name, s.unit AS unit,
            ${cols.batch_id} AS batch_id, ${cols.batch_name} AS batch_name, ${cols.name} AS name,
            ${cols.quantity} AS quantity, ${cols.delta} AS delta, ${cols.total_price} AS total_price,
            ${cols.reason} AS reason, ${cols.note} AS note, ${cols.occurred_at} AS occurred_at,
            ${cols.created_at} AS created_at, ${cols.deactivated_at} AS deactivated_at,
            ${cols.client_ref} AS client_ref
       FROM ${from}
      WHERE ${where}`;
}

export async function listMovements(db: Queryable, owner: Owner, filter: MovementFilter): Promise<MovementRow[]> {
  const branches: string[] = [];
  const values: unknown[] = [];

  if (filter.types.includes('batch')) {
    const [cond, v] = timeConditions(owner, 'b.occurred_at', filter);
    branches.push(
      branch(
        'batch',
        'b',
        'batches b JOIN substances s ON s.id = b.substance_id',
        {
          batch_id: NULL_OF.batch_id,
          batch_name: NULL_OF.batch_name,
          name: 'b.name',
          quantity: 'b.quantity',
          delta: NULL_OF.delta,
          total_price: 'b.total_price',
          reason: NULL_OF.reason,
          note: 'b.note',
          occurred_at: 'b.occurred_at',
          created_at: 'b.created_at',
          deactivated_at: 'b.deactivated_at',
          client_ref: 'b.client_ref',
        },
        `b.deleted_at IS NULL${cond}`,
      ),
    );
    values.push(...v);
  }
  if (filter.types.includes('consumption')) {
    const [cond, v] = timeConditions(owner, 'c.occurred_at', filter);
    branches.push(
      branch(
        'consumption',
        'c',
        'consumptions c JOIN batches b ON b.id = c.batch_id JOIN substances s ON s.id = b.substance_id',
        {
          batch_id: 'c.batch_id',
          batch_name: 'b.name',
          name: NULL_OF.name,
          quantity: 'c.quantity',
          delta: NULL_OF.delta,
          total_price: NULL_OF.total_price,
          reason: NULL_OF.reason,
          note: 'c.note',
          occurred_at: 'c.occurred_at',
          created_at: 'c.created_at',
          deactivated_at: NULL_OF.deactivated_at,
          client_ref: 'c.client_ref',
        },
        `c.deleted_at IS NULL AND b.deleted_at IS NULL${cond}`,
      ),
    );
    values.push(...v);
  }
  if (filter.types.includes('one_time')) {
    const [cond, v] = timeConditions(owner, 'o.occurred_at', filter);
    branches.push(
      branch(
        'one_time',
        'o',
        'one_time_consumptions o JOIN substances s ON s.id = o.substance_id',
        {
          batch_id: NULL_OF.batch_id,
          batch_name: NULL_OF.batch_name,
          name: 'o.name',
          quantity: 'o.quantity',
          delta: NULL_OF.delta,
          total_price: 'o.total_price',
          reason: NULL_OF.reason,
          note: 'o.note',
          occurred_at: 'o.occurred_at',
          created_at: 'o.created_at',
          deactivated_at: NULL_OF.deactivated_at,
          client_ref: 'o.client_ref',
        },
        `o.deleted_at IS NULL${cond}`,
      ),
    );
    values.push(...v);
  }
  if (filter.types.includes('adjustment')) {
    const [cond, v] = timeConditions(owner, 'a.occurred_at', filter);
    branches.push(
      branch(
        'adjustment',
        'a',
        'adjustments a JOIN batches b ON b.id = a.batch_id JOIN substances s ON s.id = b.substance_id',
        {
          batch_id: 'a.batch_id',
          batch_name: 'b.name',
          name: NULL_OF.name,
          quantity: NULL_OF.quantity,
          delta: 'a.delta',
          total_price: NULL_OF.total_price,
          reason: 'a.reason',
          note: NULL_OF.note,
          occurred_at: 'a.occurred_at',
          created_at: 'a.created_at',
          deactivated_at: NULL_OF.deactivated_at,
          client_ref: 'a.client_ref',
        },
        `a.deleted_at IS NULL AND b.deleted_at IS NULL${cond}`,
      ),
    );
    values.push(...v);
  }
  if (branches.length === 0) return [];

  values.push(filter.limit);
  const [rows] = await db.query<RowDataPacket[]>(
    // Like pageOneTimes: RANK keeps every movement tied with the `limit`-th one on the page.
    `SELECT * FROM (
       SELECT m.*, RANK() OVER (ORDER BY m.occurred_at DESC) AS rk
         FROM (\n${branches.join('\nUNION ALL\n')}\n) m
     ) r
      WHERE r.rk <= ?
      ORDER BY r.occurred_at DESC, r.created_at DESC, r.id DESC`,
    values,
  );
  return rows.map((r) => ({
    type: String(r.type) as MovementType,
    id: Number(r.id),
    substance_id: Number(r.substance_id),
    substance_name: String(r.substance_name),
    unit: String(r.unit),
    batch_id: numOrNull(r.batch_id),
    batch_name: strOrNull(r.batch_name),
    name: strOrNull(r.name),
    quantity: strOrNull(r.quantity),
    delta: strOrNull(r.delta),
    total_price: strOrNull(r.total_price),
    reason: strOrNull(r.reason),
    note: strOrNull(r.note),
    occurred_at: r.occurred_at as Date,
    created_at: r.created_at as Date,
    deactivated_at: dateOrNull(r.deactivated_at),
    client_ref: strOrNull(r.client_ref),
  }));
}
