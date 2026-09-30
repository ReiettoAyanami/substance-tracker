import type { Api } from '../support/api.js';

/**
 * The shared ledger of the metrics tests (the clock is 2026-09-29T10:00Z, 12:00 in Rome, CEST):
 *
 *   beer (unit beer)
 *   - batch A: 6 beer for 6.00 (1.00 each), bought 09-01 10:00Z
 *       c1  2 beer  09-02 18:00Z (20:00 in Rome)   cost 2.00
 *       c2  2 beer  09-05 18:00Z (20:00)           cost 2.00
 *       c3  2 beer  09-10 18:00Z (20:00)           cost 2.00, finishes A
 *   - one-time o1: 1 beer for 5.00 at the bar, 09-12 20:00Z (22:00)
 *   - batch B: 6 beer for 9.00 (1.50 each), bought 09-15 10:00Z
 *       c4  1 beer  09-20 18:00Z (20:00)           cost 1.50
 *       c5  1 beer  09-25 20:00Z (22:00)           cost 1.50
 *   Stock now: 4 beer of B.
 *
 * And what never counts: a cancelled consumption of B, a deleted batch with a consumption, and a
 * consumption of another substance.
 */
export async function beerLedger(api: Api) {
  const beer = await api.substance({ name: 'beer', unit: 'beer' });
  const a = await api.batch(beer.id, { name: 'A', quantity: 6, totalPrice: '6.00', occurredAt: '2026-09-01T10:00:00Z' });
  const c1 = await api.consume(a.id, { quantity: 2, occurredAt: '2026-09-02T18:00:00Z' });
  const c2 = await api.consume(a.id, { quantity: 2, occurredAt: '2026-09-05T18:00:00Z' });
  const c3 = await api.consume(a.id, { quantity: 2, occurredAt: '2026-09-10T18:00:00Z' });
  const o1 = await api.oneTime(beer.id, { quantity: 1, totalPrice: '5.00', name: 'bar', occurredAt: '2026-09-12T20:00:00Z' });
  const b = await api.batch(beer.id, { name: 'B', quantity: 6, totalPrice: '9.00', occurredAt: '2026-09-15T10:00:00Z' });
  const c4 = await api.consume(b.id, { quantity: 1, occurredAt: '2026-09-20T18:00:00Z' });
  const c5 = await api.consume(b.id, { quantity: 1, occurredAt: '2026-09-25T20:00:00Z' });

  const cancelled = await api.consume(b.id, { quantity: 1, occurredAt: '2026-09-26T08:00:00Z' });
  await api.del(`/api/consumptions/${cancelled.id}`);
  const deleted = await api.batch(beer.id, { quantity: 10, totalPrice: '100.00', occurredAt: '2026-09-16T10:00:00Z' });
  await api.consume(deleted.id, { quantity: 5, occurredAt: '2026-09-17T10:00:00Z' });
  await api.del(`/api/batches/${deleted.id}`);
  const coffee = await api.substance({ name: 'coffee', unit: 'cup' });
  const coffeeBatch = await api.batch(coffee.id, { quantity: 10, totalPrice: '3.00', occurredAt: '2026-09-03T08:00:00Z' });
  await api.consume(coffeeBatch.id, { quantity: 1, occurredAt: '2026-09-27T08:00:00Z' });

  return { beer, a, b, c1, c2, c3, c4, c5, o1, coffee, coffeeBatch };
}
