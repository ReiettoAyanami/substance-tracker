import { withTransaction, type Pool } from '../../db/pool.js';
import { notFound } from '../../shared/errors.js';
import { fromDb, fmt, LIMITS, parseDecimal } from '../../shared/decimal.js';
import { requiredText } from '../../shared/input.js';
import { toDbDateTime, toIso, toIsoOrNull, truncateToSecond, type Clock } from '../../shared/time.js';
import * as repo from './repository.js';

/** A substance as the API shows it. */
export interface SubstanceDto {
  id: number;
  name: string;
  unit: string;
  refillQuantity: string | null;
  archived: boolean;
  archivedAt: string | null;
  createdAt: string;
}

export interface CreateSubstanceInput {
  name: string;
  unit: string;
  refillQuantity?: string | number | null | undefined;
}

export interface UpdateSubstanceInput {
  name?: string | undefined;
  unit?: string | undefined;
  refillQuantity?: string | number | null | undefined;
  archived?: boolean | undefined;
}

export function toSubstanceDto(row: repo.SubstanceRow): SubstanceDto {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    refillQuantity: row.refill_quantity === null ? null : fmt(fromDb(row.refill_quantity), 3),
    archived: row.archived_at !== null,
    archivedAt: toIsoOrNull(row.archived_at),
    createdAt: toIso(row.created_at),
  };
}

function parseRefillQuantity(raw: string | number | null): string | null {
  if (raw === null) return null;
  return parseDecimal(raw, { field: 'refillQuantity', gt: 0, maxDecimals: 3, lte: LIMITS.quantityMax }).toFixed(3);
}

/**
 * Catalog: owns substances (name, unit, refill quantity, archive). A substance stores no price:
 * its unit price is computed from its batches (Reports, card summary).
 *
 * Knows nothing about stock, money or history, except that deleting a substance also
 * soft-deletes everything recorded for it.
 */
export class CatalogService {
  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
  ) {}

  private now(): string {
    return toDbDateTime(truncateToSecond(this.clock()));
  }

  async create(input: CreateSubstanceInput): Promise<SubstanceDto> {
    const id = await repo.insertSubstance(this.pool, {
      name: requiredText(input.name, 'name'),
      unit: requiredText(input.unit, 'unit'),
      refill_quantity: parseRefillQuantity(input.refillQuantity ?? null),
    });
    return this.get(id);
  }

  /** 404 when the substance does not exist or is soft-deleted. Archived ones are returned. */
  async get(id: number): Promise<SubstanceDto> {
    const row = await repo.findSubstance(this.pool, id);
    if (!row || row.deleted_at) throw notFound('Substance', id);
    return toSubstanceDto(row);
  }

  async list(opts: { includeArchived: boolean }): Promise<SubstanceDto[]> {
    const rows = await repo.listSubstances(this.pool, opts);
    return rows.map(toSubstanceDto);
  }

  async update(id: number, input: UpdateSubstanceInput): Promise<SubstanceDto> {
    const update: repo.SubstanceUpdate = {};
    if (input.name !== undefined) update.name = requiredText(input.name, 'name');
    if (input.unit !== undefined) update.unit = requiredText(input.unit, 'unit');
    if (input.refillQuantity !== undefined) update.refill_quantity = parseRefillQuantity(input.refillQuantity);

    await withTransaction(this.pool, async (conn) => {
      const row = await repo.findSubstance(conn, id, { forUpdate: true });
      if (!row || row.deleted_at) throw notFound('Substance', id);
      if (input.archived === true && row.archived_at === null) update.archived_at = this.now();
      if (input.archived === false) update.archived_at = null;
      await repo.updateSubstance(conn, id, update);
    });
    return this.get(id);
  }

  /**
   * Soft delete of the substance and, at the same instant, of its batches, their consumptions and
   * adjustments, and its one-time consumptions (lenzi, 2026-09-29: delete always, never 409).
   */
  async remove(id: number): Promise<void> {
    await withTransaction(this.pool, async (conn) => {
      const row = await repo.findSubstance(conn, id, { forUpdate: true });
      if (!row || row.deleted_at) throw notFound('Substance', id);
      const at = this.now();
      await repo.softDeleteMovementsOf(conn, id, at);
      await repo.softDeleteSubstance(conn, id, at);
    });
  }
}
