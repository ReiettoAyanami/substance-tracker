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
}

/** `?limit=&before=` of the paginated histories: a page never splits an instant. */
export interface HistoryPage {
  limit?: number;
  /** The occurredAt of the last item already shown. */
  before?: string;
}
