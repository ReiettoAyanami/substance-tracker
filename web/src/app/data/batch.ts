// Types of the batches as the Ledger takes and returns them, and of GET /api/batches (design.md,
// Appendix B). The active batches of a substance with their stock are in substance-batches.ts.

/** One item of GET /api/batches: every batch not deleted, finished ones too (the batch filter). */
export interface BatchListItem {
  id: number;
  substanceId: number;
  substanceName: string;
  name: string | null;
  occurredAt: string;
  deactivatedAt: string | null;
}

/** A batch as the Ledger returns it after a create (201) or a change. */
export interface BatchRecord {
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

/**
 * Body of POST /api/substances/:id/batches: `quantity` or `refills` (× the substance's refill
 * quantity), `totalPrice` or `unitPrice` (× quantity); `occurredAt` defaults to now.
 */
export interface CreateBatchInput {
  name?: string | null;
  quantity?: string;
  refills?: string;
  totalPrice?: string;
  unitPrice?: string;
  occurredAt?: string;
  note?: string | null;
  /** Sending it again returns the row already written, never a second one (client-ref.ts). */
  clientRef: string;
}

/** Body of PATCH /api/batches/:id: only what changes; null clears the name or the note. */
export interface UpdateBatchInput {
  name?: string | null;
  quantity?: string;
  totalPrice?: string;
  occurredAt?: string;
  note?: string | null;
}

/** GET /api/batches/:id: one batch, finished or not, with what Reports computes about it. */
export interface BatchDetails {
  id: number;
  substanceId: number;
  name: string | null;
  quantity: string;
  totalPrice: string;
  occurredAt: string;
  note: string | null;
  clientRef: string | null;
  createdAt: string;
  remaining: string;
  /** 6 decimals. */
  unitPrice: string;
  deactivatedAt: string | null;
  deactivatedByConsumptionId: number | null;
  deactivatedByAdjustmentId: number | null;
  consumptionCount: number;
  avgQuantityPerConsumption: string | null;
  minConsumption: string | null;
  maxConsumption: string | null;
  avgPricePerConsumption: string | null;
  firstConsumedAt: string | null;
}
