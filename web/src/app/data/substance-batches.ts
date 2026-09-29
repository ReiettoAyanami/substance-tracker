// Types of GET /api/substances/:id/batches (design.md, Appendix B). Quantities, money and shares
// are decimal strings, as everywhere else.

/** The active batches of a substance, oldest first, and the stock they make up. */
export interface SubstanceBatches {
  substanceId: number;
  /** Σ remaining of the active batches. */
  stock: string;
  /** Σ bought quantity of the active batches. */
  stockBarMax: string;
  batches: Batch[];
}

/** One batch (a purchase) and how much of the stock it is. */
export interface Batch {
  id: number;
  name: string | null;
  occurredAt: string;
  quantity: string;
  remaining: string;
  /** 6 decimals. */
  unitPrice: string;
  totalPrice: string;
  /** remaining ÷ stock, 4 decimals ("0.2500" is 25%). */
  shareByQuantity: string;
  /** remaining × unit price ÷ value of the stock, 4 decimals. */
  shareByValue: string;
  note: string | null;
  deactivatedAt: string | null;
}
