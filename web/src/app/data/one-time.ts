// Types of the one-time consumptions of a substance (design.md, Appendix B): bought and used at
// once, no batch, never in stock. Quantities and money are decimal strings.

/** GET /api/substances/:id/one-time: the totals and averages of its one-time consumptions. */
export interface OneTimeStats {
  substanceId: number;
  count: number;
  totalQuantity: string;
  totalSpent: string;
  /** totalSpent ÷ totalQuantity, 6 decimals; null with none. */
  avgUnitPrice: string | null;
  avgQuantityPerConsumption: string | null;
  minConsumption: string | null;
  maxConsumption: string | null;
  avgPricePerConsumption: string | null;
  firstAt: string | null;
  lastAt: string | null;
}

/** One item of GET /api/substances/:id/one-time/consumptions (newest first, paginated). */
export interface OneTimeConsumption {
  type: 'one_time';
  id: number;
  substanceId: number;
  /** A free label, e.g. the bar. */
  name: string | null;
  occurredAt: string;
  quantity: string;
  totalPrice: string;
  cost: string;
  note: string | null;
  clientRef: string | null;
  createdAt: string;
  /**
   * (this − previous) ÷ previous, 4 decimals; null for the first. Previous = the consumption before
   * it of the same substance, from a batch or one-time: a one-time consumption has no batch.
   */
  deltaQuantity: string | null;
  /** The same on the unit price; also null after a unit price of 0. */
  deltaUnitPrice: string | null;
  /** The same on the cost, what was paid (what the delta pill shows as price); also null after a cost of 0. */
  deltaCost: string | null;
}

/** A one-time consumption as the Ledger returns it after a create (201) or a change. */
export interface OneTimeRecord {
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

/** Body of POST /api/substances/:id/one-time-consumptions: `totalPrice` or `unitPrice` (× quantity). */
export interface CreateOneTimeInput {
  quantity: string;
  totalPrice?: string;
  unitPrice?: string;
  name?: string | null;
  occurredAt?: string;
  note?: string | null;
}

/** Body of PATCH /api/one-time-consumptions/:id: only what changes; null clears the name or the note. */
export interface UpdateOneTimeInput {
  quantity?: string;
  totalPrice?: string;
  unitPrice?: string;
  name?: string | null;
  occurredAt?: string;
  note?: string | null;
}

/** `?limit=&before=` of the paginated histories: a page never splits an instant. */
export interface HistoryPage {
  limit?: number;
  /** The occurredAt of the last item already shown. */
  before?: string;
}
