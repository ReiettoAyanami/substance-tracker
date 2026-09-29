// Types of the consumptions (design.md, Appendix B): the list of the consumptions page (Reports)
// and what the Ledger takes and returns. Quantities and money are decimal strings.

/** One item of GET /api/consumptions: a batch consumption or a one-time one, newest first. */
export interface Consumption {
  type: 'consumption' | 'one_time';
  id: number;
  substanceId: number;
  substanceName: string;
  unit: string;
  /** null for a one-time consumption. */
  batchId: number | null;
  batchName: string | null;
  /** A one-time consumption's own name (e.g. the bar); null for a batch consumption. */
  name: string | null;
  occurredAt: string;
  quantity: string;
  /** Its batch's unit price, or price ÷ quantity for a one-time one; 6 decimals. */
  unitPrice: string;
  cost: string;
  note: string | null;
  /** (this − previous) ÷ previous consumption of the substance, 4 decimals ("0.0500" is +5 %); null for the first. */
  deltaQuantity: string | null;
  /** The same on the unit price; also null after a unit price of 0. */
  deltaUnitPrice: string | null;
}

/** Which consumptions: of a substance, of a batch (no one-time ones), in logical days YYYY-MM-DD (inclusive). */
export interface ConsumptionScope {
  substanceId?: number;
  batchId?: number;
  from?: string;
  to?: string;
}

/** The scope, plus inclusive ranges on the unit price and on the quantity (decimal strings). */
export interface ConsumptionFilter extends ConsumptionScope {
  minUnitPrice?: string;
  maxUnitPrice?: string;
  minQuantity?: string;
  maxQuantity?: string;
}

/** GET /api/consumptions/bounds: the ends of the two sliders; null when there is no consumption in scope. */
export interface ConsumptionBounds {
  minUnitPrice: string | null;
  maxUnitPrice: string | null;
  minQuantity: string | null;
  maxQuantity: string | null;
}

/** A consumption as the Ledger returns it after a create (201) or a change. */
export interface ConsumptionRecord {
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

/** Body of POST /api/batches/:id/consumptions; `occurredAt` defaults to now. */
export interface CreateConsumptionInput {
  quantity: string;
  occurredAt?: string;
  note?: string | null;
}

/** Body of PATCH /api/consumptions/:id: only what changes (never the batch); null clears the note. */
export interface UpdateConsumptionInput {
  quantity?: string;
  occurredAt?: string;
  note?: string | null;
}
