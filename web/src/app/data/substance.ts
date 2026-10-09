// Types of the Catalog API (design.md, Appendix B). Money, quantities and shares are decimal
// strings: they stay strings until rendered, never JavaScript numbers.

/** A substance as returned by GET /api/substances, GET /api/substances/:id and the 201 of POST. */
export interface Substance {
  id: number;
  name: string;
  unit: string;
  refillQuantity: string | null;
  archived: boolean;
  archivedAt: string | null;
  createdAt: string;
  summary: CardSummary;
}

/** What a card needs, computed by the API (`CardSummary` in api/src/modules/reports/service.ts). */
export interface CardSummary {
  stock: string;
  stockBarMax: string;
  /** One segment per active batch, oldest first. */
  stockBarSegments: StockBarSegment[];
  peakStock: string;
  /**
   * The most recent batch, active or finished: what was bought of it and what is left (0 once
   * finished); `unitPrice` has 6 decimals.
   */
  lastBatch: {
    id: number;
    name: string | null;
    occurredAt: string;
    quantity: string;
    remaining: string;
    totalPrice: string;
    unitPrice: string;
  } | null;
  /** Average unit price of the stock (active batches); null when the stock is 0. */
  avgUnitPrice: string | null;
  lastConsumption: { occurredAt: string; quantity: string; cost: string } | null;
  avgQuantityPerConsumption: string | null;
  avgPricePerConsumption: string | null;
  spendThisMonth: string;
}

/** One segment of the stock bar: an active batch, what was bought of it, what is left and its unit price. */
export interface StockBarSegment {
  batchId: number;
  name: string | null;
  quantity: string;
  remaining: string;
  /** 6 decimals. */
  unitPrice: string;
}

/** Body of POST /api/substances. */
export interface CreateSubstanceInput {
  name: string;
  unit: string;
  refillQuantity?: string | null;
}

/** Body of PATCH /api/substances/:id: only what changes; null clears an optional field. */
export interface UpdateSubstanceInput {
  name?: string;
  unit?: string;
  refillQuantity?: string | null;
  archived?: boolean;
}
