import { isDuplicateKeyError, withTransaction, type Pool, type PoolConnection, type Queryable } from '../../db/pool.js';
import { badRequest, conflict, notFound } from '../../shared/errors.js';
import { fmtMoney, fmtQty, fromDb, LIMITS, parseDecimal, round2, type Dec } from '../../shared/decimal.js';
import { clientRef as normalizeClientRef, optionalText, requiredText } from '../../shared/input.js';
import { parseInstant, toDbDateTime, toIso, toIsoOrNull, truncateToSecond, type Clock } from '../../shared/time.js';
import * as repo from './repository.js';
import type {
  CreateAdjustmentBody,
  CreateBatchBody,
  CreateConsumptionBody,
  CreateOneTimeBody,
  PatchAdjustmentBody,
  PatchBatchBody,
  PatchConsumptionBody,
  PatchOneTimeBody,
} from './schemas.js';

// ---------------------------------------------------------------------------------------------
// API shapes of the stored movements
// ---------------------------------------------------------------------------------------------

export interface BatchDto {
  id: number;
  substanceId: number;
  name: string | null;
  quantity: string;
  totalPrice: string;
  occurredAt: string;
  note: string | null;
  clientRef: string | null;
  deactivatedAt: string | null;
  deactivatedByConsumptionId: number | null;
  deactivatedByAdjustmentId: number | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface ConsumptionDto {
  id: number;
  batchId: number;
  substanceId: number;
  quantity: string;
  occurredAt: string;
  note: string | null;
  clientRef: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface AdjustmentDto {
  id: number;
  batchId: number;
  substanceId: number;
  delta: string;
  reason: string;
  occurredAt: string;
  clientRef: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface OneTimeDto {
  id: number;
  substanceId: number;
  name: string | null;
  quantity: string;
  totalPrice: string;
  occurredAt: string;
  note: string | null;
  clientRef: string | null;
  createdAt: string;
  deletedAt: string | null;
}

/** Result of a create: `created` is false when the clientRef was already used (nothing written). */
export interface Created<T> {
  row: T;
  created: boolean;
}

export function toBatchDto(r: repo.BatchRow): BatchDto {
  return {
    id: r.id,
    substanceId: r.substance_id,
    name: r.name,
    quantity: fmtQty(fromDb(r.quantity)),
    totalPrice: fmtMoney(fromDb(r.total_price)),
    occurredAt: toIso(r.occurred_at),
    note: r.note,
    clientRef: r.client_ref,
    deactivatedAt: toIsoOrNull(r.deactivated_at),
    deactivatedByConsumptionId: r.deactivated_by_consumption_id,
    deactivatedByAdjustmentId: r.deactivated_by_adjustment_id,
    createdAt: toIso(r.created_at),
    deletedAt: toIsoOrNull(r.deleted_at),
  };
}

export function toConsumptionDto(r: repo.ConsumptionRow): ConsumptionDto {
  return {
    id: r.id,
    batchId: r.batch_id,
    substanceId: r.substance_id,
    quantity: fmtQty(fromDb(r.quantity)),
    occurredAt: toIso(r.occurred_at),
    note: r.note,
    clientRef: r.client_ref,
    createdAt: toIso(r.created_at),
    deletedAt: toIsoOrNull(r.deleted_at),
  };
}

export function toAdjustmentDto(r: repo.AdjustmentRow): AdjustmentDto {
  return {
    id: r.id,
    batchId: r.batch_id,
    substanceId: r.substance_id,
    delta: fmtQty(fromDb(r.delta)),
    reason: r.reason,
    occurredAt: toIso(r.occurred_at),
    clientRef: r.client_ref,
    createdAt: toIso(r.created_at),
    deletedAt: toIsoOrNull(r.deleted_at),
  };
}

export function toOneTimeDto(r: repo.OneTimeRow): OneTimeDto {
  return {
    id: r.id,
    substanceId: r.substance_id,
    name: r.name,
    quantity: fmtQty(fromDb(r.quantity)),
    totalPrice: fmtMoney(fromDb(r.total_price)),
    occurredAt: toIso(r.occurred_at),
    note: r.note,
    clientRef: r.client_ref,
    createdAt: toIso(r.created_at),
    deletedAt: toIsoOrNull(r.deleted_at),
  };
}

// ---------------------------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------------------------

type DecimalValue = string | number;

function parseQuantity(raw: DecimalValue, field = 'quantity'): Dec {
  return parseDecimal(raw, { field, gt: 0, maxDecimals: 3, lte: LIMITS.quantityMax });
}

function parseDelta(raw: DecimalValue): Dec {
  return parseDecimal(raw, {
    field: 'delta',
    nonZero: true,
    maxDecimals: 3,
    gte: LIMITS.quantityMax.negated(),
    lte: LIMITS.quantityMax,
  });
}

/** A price input (totalPrice / unitPrice): >= 0, any number of decimals. */
function parsePrice(raw: DecimalValue | undefined, field: string): Dec | null {
  return raw === undefined ? null : parseDecimal(raw, { field, gte: 0 });
}

/** A total price as stored: rounded half-up to cents, within DECIMAL(10,2). */
function storedTotalPrice(price: Dec, field: string): string {
  const rounded = round2(price);
  if (rounded.gt(LIMITS.moneyMax)) throw badRequest(`${field} must be at most ${LIMITS.moneyMax.toFixed(2)}`, field);
  return rounded.toFixed(2);
}

/**
 * The price is always entered: totalPrice, else unitPrice × quantity, else 400 (the API never
 * guesses one). The result is rounded half-up to 2 decimals.
 */
function resolveTotalPrice(totalPrice: Dec | null, unitPrice: Dec | null, quantity: Dec): string {
  if (totalPrice) return storedTotalPrice(totalPrice, 'totalPrice');
  if (unitPrice) return storedTotalPrice(unitPrice.times(quantity), 'unitPrice');
  throw badRequest('No price: send totalPrice or unitPrice', 'totalPrice');
}

function qtyText(d: Dec): string {
  return fmtQty(d);
}

// ---------------------------------------------------------------------------------------------
// Rule helpers
// ---------------------------------------------------------------------------------------------

function batchDeactivated(batchId: number): Error {
  return conflict(
    'batch-deactivated',
    `Batch ${batchId} is deactivated (remaining reached 0): its movements cannot be recorded, edited or ` +
      'cancelled, except cancelling the movement that emptied it, which reopens the batch',
  );
}

function substanceArchived(substanceId: number): Error {
  return conflict('substance-archived', `Substance ${substanceId} is archived: unarchive it to record or change movements`);
}

function exceedsRemaining(quantity: Dec, remaining: Dec): Error {
  return conflict(
    'quantity-exceeds-remaining',
    `quantity ${qtyText(quantity)} is more than the batch's remaining ${qtyText(remaining)}`,
  );
}

function belowZero(result: Dec): Error {
  return conflict('remaining-below-zero', `This would take the batch's remaining to ${qtyText(result)}, below 0`);
}

function aboveQuantity(result: Dec, quantity: Dec): Error {
  return conflict(
    'remaining-above-quantity',
    `This would take the batch's remaining to ${qtyText(result)}, above its bought quantity ${qtyText(quantity)}`,
  );
}

/** Batch exists, is not deleted and belongs to a live, non-archived substance. */
function assertBatchWritable(batch: repo.LockedBatchRow | null, batchId: number): asserts batch is repo.LockedBatchRow {
  if (!batch || batch.deleted_at || batch.substance_deleted_at) throw notFound('Batch', batchId);
  if (batch.substance_archived_at) throw substanceArchived(batch.substance_id);
}

/**
 * Ledger: records, edits and cancels movements. Every operation runs in one transaction;
 * consumptions and adjustments lock their batch row before checking remaining.
 */
export class LedgerService {
  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
  ) {}

  private nowDb(): string {
    return toDbDateTime(truncateToSecond(this.clock()));
  }

  private occurredAt(raw: string | undefined): string {
    const instant = raw === undefined ? this.clock() : parseInstant(raw, 'occurredAt');
    return toDbDateTime(truncateToSecond(instant));
  }

  /** remaining = quantity − Σ consumptions + Σ adjustments (non-deleted), optionally without one row. */
  private async remaining(
    conn: Queryable,
    batch: repo.BatchRow,
    exclude: { consumptionId?: number; adjustmentId?: number } = {},
  ): Promise<Dec> {
    const sums = await repo.batchMovementSums(conn, batch.id, exclude);
    return fromDb(batch.quantity).minus(fromDb(sums.consumed)).plus(fromDb(sums.adjusted));
  }

  /**
   * Create with clientRef dedup: the same clientRef on the same table returns the existing row
   * (created = false) and writes nothing. `work` re-checks after taking its lock, and a
   * concurrent duplicate that slips through is caught by the UNIQUE key.
   */
  private async createDeduped<R>(
    ref: string | null,
    findByRef: (db: Queryable, ref: string) => Promise<R | null>,
    work: (conn: PoolConnection) => Promise<Created<R>>,
  ): Promise<Created<R>> {
    if (ref) {
      const existing = await findByRef(this.pool, ref);
      if (existing) return { row: existing, created: false };
    }
    try {
      return await withTransaction(this.pool, work);
    } catch (err) {
      if (ref && isDuplicateKeyError(err)) {
        const existing = await findByRef(this.pool, ref);
        if (existing) return { row: existing, created: false };
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------------------------------
  // Batches
  // -------------------------------------------------------------------------------------------

  async createBatch(substanceId: number, body: CreateBatchBody): Promise<Created<BatchDto>> {
    const hasQuantity = body.quantity !== undefined;
    const hasRefills = body.refills !== undefined;
    if (hasQuantity === hasRefills) {
      throw badRequest('Send exactly one of quantity or refills', 'quantity');
    }
    const quantityIn = body.quantity !== undefined ? parseQuantity(body.quantity) : null;
    const refills = body.refills !== undefined ? parseDecimal(body.refills, { field: 'refills', gt: 0 }) : null;
    const totalPriceIn = parsePrice(body.totalPrice, 'totalPrice');
    const unitPriceIn = parsePrice(body.unitPrice, 'unitPrice');
    const occurredAt = this.occurredAt(body.occurredAt);
    const name = optionalText(body.name) ?? null;
    const note = optionalText(body.note) ?? null;
    const ref = normalizeClientRef(body.clientRef);

    const result = await this.createDeduped(ref, repo.findBatchByClientRef, async (conn) => {
      const substance = await repo.lockSubstance(conn, substanceId);
      if (!substance || substance.deleted_at) throw notFound('Substance', substanceId);
      if (ref) {
        const existing = await repo.findBatchByClientRef(conn, ref);
        if (existing) return { row: existing, created: false };
      }
      if (substance.archived_at) throw substanceArchived(substanceId);

      let quantity: Dec;
      if (quantityIn) {
        quantity = quantityIn;
      } else {
        if (substance.refill_quantity === null) {
          throw badRequest('refills needs a refillQuantity on the substance; send quantity instead', 'refills');
        }
        quantity = (refills as Dec).times(fromDb(substance.refill_quantity));
        if (quantity.decimalPlaces() > 3) {
          throw badRequest('refills × refillQuantity must have at most 3 decimal places', 'refills');
        }
        if (quantity.gt(LIMITS.quantityMax)) throw badRequest('refills × refillQuantity is too large', 'refills');
      }
      const totalPrice = resolveTotalPrice(totalPriceIn, unitPriceIn, quantity);

      const id = await repo.insertBatch(conn, {
        substance_id: substanceId,
        name,
        quantity: quantity.toFixed(3),
        total_price: totalPrice,
        occurred_at: occurredAt,
        note,
        client_ref: ref,
      });
      const row = await repo.findBatch(conn, id);
      return { row: row as repo.BatchRow, created: true };
    });
    return { row: toBatchDto(result.row), created: result.created };
  }

  /** Correct an active batch: name, note, occurredAt, quantity, totalPrice. */
  async updateBatch(batchId: number, body: PatchBatchBody): Promise<BatchDto> {
    const update: repo.BatchUpdate = {};
    const name = optionalText(body.name);
    if (name !== undefined) update.name = name;
    const note = optionalText(body.note);
    if (note !== undefined) update.note = note;
    if (body.occurredAt !== undefined) update.occurred_at = this.occurredAt(body.occurredAt);
    const quantity = body.quantity !== undefined ? parseQuantity(body.quantity) : null;
    if (quantity) update.quantity = quantity.toFixed(3);
    const totalPrice = parsePrice(body.totalPrice, 'totalPrice');
    if (totalPrice) update.total_price = storedTotalPrice(totalPrice, 'totalPrice');

    await withTransaction(this.pool, async (conn) => {
      const batch = await repo.lockBatch(conn, batchId);
      assertBatchWritable(batch, batchId);
      if (batch.deactivated_at) throw batchDeactivated(batchId);
      if (quantity) {
        const sums = await repo.batchMovementSums(conn, batchId);
        const used = fromDb(sums.consumed).minus(fromDb(sums.adjusted));
        if (!quantity.gt(used)) {
          throw conflict(
            'quantity-below-used',
            `quantity ${qtyText(quantity)} must stay above what the batch already used (${qtyText(used)}), ` +
              'so that remaining stays above 0',
          );
        }
      }
      await repo.updateBatch(conn, batchId, update);
    });
    const row = await repo.findBatch(this.pool, batchId);
    return toBatchDto(row as repo.BatchRow);
  }

  /**
   * Soft delete of an active batch and, at the same instant, of its consumptions and adjustments
   * (lenzi, 2026-09-30): what is deleted counts nowhere, so the statistics are computed without
   * them. A deactivated batch is not deleted: it was used up, and it keeps counting.
   */
  async deleteBatch(batchId: number): Promise<void> {
    await withTransaction(this.pool, async (conn) => {
      const batch = await repo.lockBatch(conn, batchId);
      assertBatchWritable(batch, batchId);
      if (batch.deactivated_at) throw batchDeactivated(batchId);
      const at = this.nowDb();
      await repo.softDeleteMovementsOfBatch(conn, batchId, at);
      await repo.softDeleteBatch(conn, batchId, at);
    });
  }

  // -------------------------------------------------------------------------------------------
  // Consumptions
  // -------------------------------------------------------------------------------------------

  async createConsumption(batchId: number, body: CreateConsumptionBody): Promise<Created<ConsumptionDto>> {
    const quantity = parseQuantity(body.quantity);
    const occurredAt = this.occurredAt(body.occurredAt);
    const note = optionalText(body.note) ?? null;
    const ref = normalizeClientRef(body.clientRef);

    const result = await this.createDeduped(ref, repo.findConsumptionByClientRef, async (conn) => {
      const batch = await repo.lockBatch(conn, batchId);
      if (!batch || batch.deleted_at || batch.substance_deleted_at) throw notFound('Batch', batchId);
      if (ref) {
        const existing = await repo.findConsumptionByClientRef(conn, ref);
        if (existing) return { row: existing, created: false };
      }
      assertBatchWritable(batch, batchId);
      if (batch.deactivated_at) throw batchDeactivated(batchId);

      const remaining = await this.remaining(conn, batch);
      if (quantity.gt(remaining)) throw exceedsRemaining(quantity, remaining);

      const id = await repo.insertConsumption(conn, {
        batch_id: batchId,
        quantity: quantity.toFixed(3),
        occurred_at: occurredAt,
        note,
        client_ref: ref,
      });
      if (remaining.minus(quantity).isZero()) {
        await repo.deactivateBatch(conn, batchId, this.nowDb(), { consumptionId: id });
      }
      const row = await repo.findConsumption(conn, id);
      return { row: row as repo.ConsumptionRow, created: true };
    });
    return { row: toConsumptionDto(result.row), created: result.created };
  }

  async updateConsumption(id: number, body: PatchConsumptionBody): Promise<ConsumptionDto> {
    const quantity = body.quantity !== undefined ? parseQuantity(body.quantity) : null;
    const update: repo.ConsumptionUpdate = {};
    if (quantity) update.quantity = quantity.toFixed(3);
    if (body.occurredAt !== undefined) update.occurred_at = this.occurredAt(body.occurredAt);
    const note = optionalText(body.note);
    if (note !== undefined) update.note = note;

    await withTransaction(this.pool, async (conn) => {
      const before = await repo.findConsumption(conn, id);
      if (!before || before.deleted_at) throw notFound('Consumption', id);
      const batch = await repo.lockBatch(conn, before.batch_id);
      const current = await repo.findConsumption(conn, id);
      if (!current || current.deleted_at) throw notFound('Consumption', id);
      assertBatchWritable(batch, current.batch_id);
      if (batch.deactivated_at) throw batchDeactivated(batch.id);

      let emptiesBatch = false;
      if (quantity) {
        const remainingWithout = await this.remaining(conn, batch, { consumptionId: id });
        const after = remainingWithout.minus(quantity);
        if (after.lt(0)) throw exceedsRemaining(quantity, remainingWithout);
        if (after.gt(fromDb(batch.quantity))) throw aboveQuantity(after, fromDb(batch.quantity));
        emptiesBatch = after.isZero();
      }
      await repo.updateConsumption(conn, id, update);
      if (emptiesBatch) await repo.deactivateBatch(conn, batch.id, this.nowDb(), { consumptionId: id });
    });
    const row = await repo.findConsumption(this.pool, id);
    return toConsumptionDto(row as repo.ConsumptionRow);
  }

  /**
   * Cancel (soft delete). On a deactivated batch only the consumption that emptied it can be
   * cancelled, and cancelling it reopens the batch.
   */
  async deleteConsumption(id: number): Promise<void> {
    await withTransaction(this.pool, async (conn) => {
      const before = await repo.findConsumption(conn, id);
      if (!before || before.deleted_at) throw notFound('Consumption', id);
      const batch = await repo.lockBatch(conn, before.batch_id);
      const current = await repo.findConsumption(conn, id);
      if (!current || current.deleted_at) throw notFound('Consumption', id);
      assertBatchWritable(batch, current.batch_id);

      if (batch.deactivated_at) {
        if (batch.deactivated_by_consumption_id !== id) throw batchDeactivated(batch.id);
        await repo.softDeleteConsumption(conn, id, this.nowDb());
        await repo.reopenBatch(conn, batch.id);
        return;
      }
      const after = (await this.remaining(conn, batch)).plus(fromDb(current.quantity));
      if (after.gt(fromDb(batch.quantity))) throw aboveQuantity(after, fromDb(batch.quantity));
      await repo.softDeleteConsumption(conn, id, this.nowDb());
    });
  }

  // -------------------------------------------------------------------------------------------
  // Adjustments
  // -------------------------------------------------------------------------------------------

  async createAdjustment(batchId: number, body: CreateAdjustmentBody): Promise<Created<AdjustmentDto>> {
    const delta = parseDelta(body.delta);
    const reason = requiredText(body.reason, 'reason');
    const occurredAt = this.occurredAt(body.occurredAt);
    const ref = normalizeClientRef(body.clientRef);

    const result = await this.createDeduped(ref, repo.findAdjustmentByClientRef, async (conn) => {
      const batch = await repo.lockBatch(conn, batchId);
      if (!batch || batch.deleted_at || batch.substance_deleted_at) throw notFound('Batch', batchId);
      if (ref) {
        const existing = await repo.findAdjustmentByClientRef(conn, ref);
        if (existing) return { row: existing, created: false };
      }
      assertBatchWritable(batch, batchId);
      if (batch.deactivated_at) throw batchDeactivated(batchId);

      const after = (await this.remaining(conn, batch)).plus(delta);
      if (after.lt(0)) throw belowZero(after);
      if (after.gt(fromDb(batch.quantity))) throw aboveQuantity(after, fromDb(batch.quantity));

      const id = await repo.insertAdjustment(conn, {
        batch_id: batchId,
        delta: delta.toFixed(3),
        reason,
        occurred_at: occurredAt,
        client_ref: ref,
      });
      if (after.isZero()) await repo.deactivateBatch(conn, batchId, this.nowDb(), { adjustmentId: id });
      const row = await repo.findAdjustment(conn, id);
      return { row: row as repo.AdjustmentRow, created: true };
    });
    return { row: toAdjustmentDto(result.row), created: result.created };
  }

  async updateAdjustment(id: number, body: PatchAdjustmentBody): Promise<AdjustmentDto> {
    const delta = body.delta !== undefined ? parseDelta(body.delta) : null;
    const update: repo.AdjustmentUpdate = {};
    if (delta) update.delta = delta.toFixed(3);
    if (body.reason !== undefined) update.reason = requiredText(body.reason, 'reason');
    if (body.occurredAt !== undefined) update.occurred_at = this.occurredAt(body.occurredAt);

    await withTransaction(this.pool, async (conn) => {
      const before = await repo.findAdjustment(conn, id);
      if (!before || before.deleted_at) throw notFound('Adjustment', id);
      const batch = await repo.lockBatch(conn, before.batch_id);
      const current = await repo.findAdjustment(conn, id);
      if (!current || current.deleted_at) throw notFound('Adjustment', id);
      assertBatchWritable(batch, current.batch_id);
      if (batch.deactivated_at) throw batchDeactivated(batch.id);

      let emptiesBatch = false;
      if (delta) {
        const after = (await this.remaining(conn, batch, { adjustmentId: id })).plus(delta);
        if (after.lt(0)) throw belowZero(after);
        if (after.gt(fromDb(batch.quantity))) throw aboveQuantity(after, fromDb(batch.quantity));
        emptiesBatch = after.isZero();
      }
      await repo.updateAdjustment(conn, id, update);
      if (emptiesBatch) await repo.deactivateBatch(conn, batch.id, this.nowDb(), { adjustmentId: id });
    });
    const row = await repo.findAdjustment(this.pool, id);
    return toAdjustmentDto(row as repo.AdjustmentRow);
  }

  async deleteAdjustment(id: number): Promise<void> {
    await withTransaction(this.pool, async (conn) => {
      const before = await repo.findAdjustment(conn, id);
      if (!before || before.deleted_at) throw notFound('Adjustment', id);
      const batch = await repo.lockBatch(conn, before.batch_id);
      const current = await repo.findAdjustment(conn, id);
      if (!current || current.deleted_at) throw notFound('Adjustment', id);
      assertBatchWritable(batch, current.batch_id);

      if (batch.deactivated_at) {
        if (batch.deactivated_by_adjustment_id !== id) throw batchDeactivated(batch.id);
        await repo.softDeleteAdjustment(conn, id, this.nowDb());
        await repo.reopenBatch(conn, batch.id);
        return;
      }
      const after = (await this.remaining(conn, batch)).minus(fromDb(current.delta));
      if (after.lt(0)) throw belowZero(after);
      if (after.isZero()) {
        throw conflict(
          'remaining-would-be-zero',
          'Cancelling this adjustment would leave the batch empty; record a consumption or an adjustment instead',
        );
      }
      if (after.gt(fromDb(batch.quantity))) throw aboveQuantity(after, fromDb(batch.quantity));
      await repo.softDeleteAdjustment(conn, id, this.nowDb());
    });
  }

  // -------------------------------------------------------------------------------------------
  // One-time consumptions
  // -------------------------------------------------------------------------------------------

  async createOneTime(substanceId: number, body: CreateOneTimeBody): Promise<Created<OneTimeDto>> {
    const quantity = parseQuantity(body.quantity);
    const totalPriceIn = parsePrice(body.totalPrice, 'totalPrice');
    const unitPriceIn = parsePrice(body.unitPrice, 'unitPrice');
    const occurredAt = this.occurredAt(body.occurredAt);
    const name = optionalText(body.name) ?? null;
    const note = optionalText(body.note) ?? null;
    const ref = normalizeClientRef(body.clientRef);

    const result = await this.createDeduped(ref, repo.findOneTimeByClientRef, async (conn) => {
      const substance = await repo.lockSubstance(conn, substanceId);
      if (!substance || substance.deleted_at) throw notFound('Substance', substanceId);
      if (ref) {
        const existing = await repo.findOneTimeByClientRef(conn, ref);
        if (existing) return { row: existing, created: false };
      }
      if (substance.archived_at) throw substanceArchived(substanceId);
      const totalPrice = resolveTotalPrice(totalPriceIn, unitPriceIn, quantity);
      const id = await repo.insertOneTime(conn, {
        substance_id: substanceId,
        name,
        quantity: quantity.toFixed(3),
        total_price: totalPrice,
        occurred_at: occurredAt,
        note,
        client_ref: ref,
      });
      const row = await repo.findOneTime(conn, id);
      return { row: row as repo.OneTimeRow, created: true };
    });
    return { row: toOneTimeDto(result.row), created: result.created };
  }

  async updateOneTime(id: number, body: PatchOneTimeBody): Promise<OneTimeDto> {
    const quantity = body.quantity !== undefined ? parseQuantity(body.quantity) : null;
    const totalPriceIn = parsePrice(body.totalPrice, 'totalPrice');
    const unitPriceIn = parsePrice(body.unitPrice, 'unitPrice');
    const update: repo.OneTimeUpdate = {};
    if (quantity) update.quantity = quantity.toFixed(3);
    const name = optionalText(body.name);
    if (name !== undefined) update.name = name;
    const note = optionalText(body.note);
    if (note !== undefined) update.note = note;
    if (body.occurredAt !== undefined) update.occurred_at = this.occurredAt(body.occurredAt);

    await withTransaction(this.pool, async (conn) => {
      const current = await repo.lockOneTime(conn, id);
      if (!current || current.deleted_at) throw notFound('One-time consumption', id);
      const substance = await repo.findSubstanceState(conn, current.substance_id);
      if (!substance || substance.deleted_at) throw notFound('One-time consumption', id);
      if (substance.archived_at) throw substanceArchived(current.substance_id);
      // Price: totalPrice, else unitPrice × (new or current) quantity; otherwise unchanged.
      if (totalPriceIn) update.total_price = storedTotalPrice(totalPriceIn, 'totalPrice');
      else if (unitPriceIn) {
        update.total_price = storedTotalPrice(unitPriceIn.times(quantity ?? fromDb(current.quantity)), 'unitPrice');
      }
      await repo.updateOneTime(conn, id, update);
    });
    const row = await repo.findOneTime(this.pool, id);
    return toOneTimeDto(row as repo.OneTimeRow);
  }

  async deleteOneTime(id: number): Promise<void> {
    await withTransaction(this.pool, async (conn) => {
      const current = await repo.lockOneTime(conn, id);
      if (!current || current.deleted_at) throw notFound('One-time consumption', id);
      const substance = await repo.findSubstanceState(conn, current.substance_id);
      if (substance?.archived_at) throw substanceArchived(current.substance_id);
      await repo.softDeleteOneTime(conn, id, this.nowDb());
    });
  }
}
