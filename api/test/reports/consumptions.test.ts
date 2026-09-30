import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectProblem, makeApi, type Api } from '../support/api.js';

let api: Api;
beforeAll(async () => {
  api = await makeApi();
});
afterAll(async () => {
  await api.app.close();
});

const C = (c: { id: number }) => ['consumption', c.id];
const O = (o: { id: number }) => ['one_time', o.id];

/** Beer (Corona at 1.00, Peroni at 1.50, a one-time pint at 5.00) and coffee (Moka at 0.25). */
async function seedBeerAndCoffee() {
  const beer = await api.substance({ name: 'beer', unit: 'beer' });
  const coffee = await api.substance({ name: 'coffee', unit: 'cup' });
  const corona = await api.batch(beer.id, { name: 'Corona', quantity: 24, totalPrice: 24, occurredAt: '2026-09-01T10:00:00Z' });
  const peroni = await api.batch(beer.id, { name: 'Peroni', quantity: 6, totalPrice: 9, occurredAt: '2026-09-05T10:00:00Z' });
  const moka = await api.batch(coffee.id, { quantity: 20, totalPrice: 5, occurredAt: '2026-09-01T08:00:00Z' });
  const c1 = await api.consume(corona.id, { quantity: 1, occurredAt: '2026-09-02T20:00:00Z' });
  const c2 = await api.consume(corona.id, { quantity: 3, occurredAt: '2026-09-06T20:00:00Z' });
  const p1 = await api.consume(peroni.id, { quantity: 2, occurredAt: '2026-09-07T20:00:00Z' });
  const pub = await api.oneTime(beer.id, { quantity: 1, totalPrice: 5, occurredAt: '2026-09-08T21:00:00Z' });
  // 22:30 UTC on the 8th is 00:30 on the 9th in Rome.
  const m1 = await api.consume(moka.id, { quantity: 2, occurredAt: '2026-09-08T22:30:00Z' });
  return { beer, coffee, corona, peroni, moka, c1, c2, p1, pub, m1 };
}

describe('GET /api/consumptions', () => {
  it('lists batch and one-time consumptions of every substance, newest first, deleted ones excluded', async () => {
    const beer = await api.substance({ name: 'beer', unit: 'beer' });
    const coffee = await api.substance({ name: 'coffee', unit: 'cup' });
    const corona = await api.batch(beer.id, { name: 'Corona', quantity: 6, totalPrice: 6, occurredAt: '2026-09-01T10:00:00Z' });
    const c1 = await api.consume(corona.id, { quantity: 2, occurredAt: '2026-09-02T10:00:00Z', note: 'with friends' });
    const pub = await api.oneTime(beer.id, { name: 'pub', quantity: 1, totalPrice: 5, occurredAt: '2026-09-03T10:00:00Z' });
    const cancelled = await api.consume(corona.id, { quantity: 1, occurredAt: '2026-09-04T10:00:00Z' });
    await api.del(`/api/consumptions/${cancelled.id}`);
    const cancelledOneTime = await api.oneTime(beer.id, { quantity: 1, totalPrice: 5, occurredAt: '2026-09-04T11:00:00Z' });
    await api.del(`/api/one-time-consumptions/${cancelledOneTime.id}`);
    const moka = await api.batch(coffee.id, { quantity: 10, totalPrice: 5, occurredAt: '2026-09-01T08:00:00Z' });
    const m1 = await api.consume(moka.id, { quantity: 1, occurredAt: '2026-09-05T07:00:00Z' });

    const res = await api.get('/api/consumptions');
    expect(res.status).toBe(200);
    expect(res.body.map((c: any) => [c.type, c.id])).toEqual([
      ['consumption', m1.id],
      ['one_time', pub.id],
      ['consumption', c1.id],
    ]);
    expect(res.body[0]).toMatchObject({
      substanceId: coffee.id,
      substanceName: 'coffee',
      unit: 'cup',
      batchId: moka.id,
      batchName: null,
      name: null,
      occurredAt: '2026-09-05T07:00:00Z',
      quantity: '1.000',
      unitPrice: '0.500000',
      cost: '0.50',
      note: null,
    });
    expect(res.body[1]).toMatchObject({
      substanceId: beer.id,
      substanceName: 'beer',
      unit: 'beer',
      batchId: null,
      batchName: null,
      name: 'pub',
      occurredAt: '2026-09-03T10:00:00Z',
      quantity: '1.000',
      unitPrice: '5.000000',
      cost: '5.00',
      note: null,
    });
    expect(res.body[2]).toMatchObject({
      batchId: corona.id,
      batchName: 'Corona',
      name: null,
      quantity: '2.000',
      unitPrice: '1.000000',
      cost: '2.00',
      note: 'with friends',
    });
  });

  it('gives every consumption of a batch its unit price, even the one that finishes it; a one-time one price ÷ quantity', async () => {
    const s = await api.substance({ name: 'cigarettes', unit: 'cigarette' });
    const pack = await api.batch(s.id, { quantity: 20, totalPrice: '6.50', occurredAt: '2026-09-20T10:00:00Z' });
    await api.consume(pack.id, { quantity: 7, occurredAt: '2026-09-21T20:00:00Z' });
    await api.consume(pack.id, { quantity: 13, occurredAt: '2026-09-23T20:00:00Z' }); // finishes the pack
    await api.oneTime(s.id, { quantity: 3, totalPrice: '1.00', occurredAt: '2026-09-24T20:00:00Z' });

    const res = await api.get('/api/consumptions');
    // Not cost ÷ quantity: 4.22 / 13 = 0.324615 and 2.28 / 7 = 0.325714 would differ.
    expect(res.body.map((c: any) => [c.quantity, c.cost, c.unitPrice])).toEqual([
      ['3.000', '1.00', '0.333333'],
      ['13.000', '4.22', '0.325000'],
      ['7.000', '2.28', '0.325000'],
    ]);
  });
});

describe('filters of GET /api/consumptions', () => {
  const list = async (query: string) => {
    const res = await api.get(`/api/consumptions?${query}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.map((c: any) => [c.type, c.id]);
  };
  const seed = seedBeerAndCoffee;

  it('by substance', async () => {
    const { beer, coffee, c1, c2, p1, pub, m1 } = await seed();
    expect(await list(`substanceId=${beer.id}`)).toEqual([O(pub), C(p1), C(c2), C(c1)]);
    expect(await list(`substanceId=${coffee.id}`)).toEqual([C(m1)]);
  });

  it('by batch, which leaves the one-time consumptions out', async () => {
    const { corona, peroni, c1, c2, p1 } = await seed();
    expect(await list(`batchId=${corona.id}`)).toEqual([C(c2), C(c1)]);
    expect(await list(`batchId=${peroni.id}`)).toEqual([C(p1)]);
  });

  it('by logical days from..to, both included, in Europe/Rome', async () => {
    const { c1, c2, p1, pub, m1 } = await seed();
    expect(await list('from=2026-09-06&to=2026-09-08')).toEqual([O(pub), C(p1), C(c2)]);
    expect(await list('from=2026-09-09')).toEqual([C(m1)]);
    expect(await list('to=2026-09-02')).toEqual([C(c1)]);
  });

  it('by what the consumption cost and by its quantity, ranges with both ends included', async () => {
    const { c1, c2, p1, pub, m1 } = await seed();
    // costs: c1 1.00, c2 3.00 (3 × 1.00), p1 3.00 (2 × 1.50), the pint 5.00, m1 0.50 (2 × 0.25)
    expect(await list('minCost=3')).toEqual([O(pub), C(p1), C(c2)]);
    expect(await list('maxCost=1')).toEqual([C(m1), C(c1)]);
    expect(await list('minCost=3&maxCost=3.00')).toEqual([C(p1), C(c2)]);
    expect(await list('minQuantity=2')).toEqual([C(m1), C(p1), C(c2)]);
    expect(await list('maxQuantity=1')).toEqual([O(pub), C(c1)]);
    expect(await list('minQuantity=2&maxQuantity=2')).toEqual([C(m1), C(p1)]);
  });

  it('the price range is on the whole consumption, not on its unit price (lenzi: 2 beers at 2.00 are found between 3 and 4)', async () => {
    const beer = await api.substance({ name: 'beer', unit: 'bottle' });
    const pack = await api.batch(beer.id, { quantity: 6, totalPrice: 12, occurredAt: '2026-09-01T10:00:00Z' });
    const two = await api.consume(pack.id, { quantity: 2, occurredAt: '2026-09-02T20:00:00Z' });

    expect((await api.get('/api/consumptions')).body[0]).toMatchObject({ id: two.id, unitPrice: '2.000000', cost: '4.00' });
    expect(await list('minCost=3&maxCost=4')).toEqual([C(two)]);
    expect(await list('minCost=1&maxCost=2.5')).toEqual([]); // its unit price is in there, its cost is not
    expectProblem(await api.get('/api/consumptions?minUnitPrice=1'), 400); // the unit price is no longer a filter
  });

  it('keep the delta computed on the whole history, whatever the days or the ranges hide', async () => {
    const { pub } = await seed();
    const byDay = (await api.get('/api/consumptions?from=2026-09-08&to=2026-09-08')).body;
    // vs the Peroni of the day before: 1 vs 2, 5.00 a unit vs 1.50, 5.00 vs 3.00
    expect(byDay).toMatchObject([{ id: pub.id, deltaQuantity: '-0.5000', deltaUnitPrice: '2.3333', deltaCost: '0.6667' }]);
    const byCost = (await api.get('/api/consumptions?minCost=5')).body;
    expect(byCost).toMatchObject([{ id: pub.id, deltaQuantity: '-0.5000', deltaCost: '0.6667' }]);
  });

  it('combine; a batch of another substance gives an empty list', async () => {
    const { beer, coffee, corona, c2, p1 } = await seed();
    expect(await list(`substanceId=${beer.id}&minCost=3&maxCost=3&minQuantity=2`)).toEqual([C(p1), C(c2)]);
    expect(await list(`substanceId=${beer.id}&minQuantity=2&from=2026-09-07`)).toEqual([C(p1)]);
    expect(await list(`substanceId=${coffee.id}&batchId=${corona.id}`)).toEqual([]);
  });
});

describe('pages of GET /api/consumptions', () => {
  const page = async (query: string) => (await api.get(`/api/consumptions?${query}`)).body.map((c: any) => [c.type, c.id]);

  it('follow limit and before, and never split an instant, whatever its kinds', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 100, totalPrice: 100, occurredAt: '2026-09-01T08:00:00Z' });
    const T = '2026-09-05T20:00:00Z';
    const early = await api.consume(b.id, { quantity: 1, occurredAt: '2026-09-04T20:00:00Z' });
    const a = await api.consume(b.id, { quantity: 1, occurredAt: T });
    const c = await api.consume(b.id, { quantity: 1, occurredAt: T });
    const o = await api.oneTime(s.id, { quantity: 1, totalPrice: 1, occurredAt: T });
    const late = await api.oneTime(s.id, { quantity: 1, totalPrice: 1, occurredAt: '2026-09-06T20:00:00Z' });

    // limit 2, but the three consumptions at T come together
    expect(await page('limit=2')).toEqual([O(late), O(o), C(c), C(a)]);
    expect(await page(`limit=2&before=${encodeURIComponent(T)}`)).toEqual([C(early)]);
    expect(await page('limit=2&before=2026-09-04T20:00:00Z')).toEqual([]);
  });

  it('keep exactly limit rows when nothing ties; limit defaults to 50', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 100, totalPrice: 100, occurredAt: '2026-01-01T00:00:00Z' });
    for (let i = 0; i < 55; i++) {
      await api.consume(b.id, { quantity: 1, occurredAt: `2026-02-01T00:${String(i).padStart(2, '0')}:00Z` });
    }
    expect((await api.get('/api/consumptions')).body).toHaveLength(50);
    expect((await api.get('/api/consumptions?limit=20')).body).toHaveLength(20);
  });
});

describe('GET /api/consumptions refuses', () => {
  it('a bad query with a 400', async () => {
    const bad = [
      'minCost=abc',
      'minQuantity=-1',
      'maxCost=1e3',
      'minCost=2&maxCost=1',
      'minQuantity=3&maxQuantity=2.5',
      'from=2026-09-05&to=2026-09-01',
      'from=2026-02-30',
      'to=yesterday',
      'type=consumption',
      'limit=0',
      'limit=201',
      'before=yesterday',
      'substanceId=0',
      'batchId=x',
    ];
    for (const query of bad) expectProblem(await api.get(`/api/consumptions?${query}`), 400);
  });

  it('a range the wrong way round, under its min field', async () => {
    const res = await api.get('/api/consumptions?minCost=2&maxCost=1');
    expect(res.body.errors).toEqual([{ field: 'minCost', message: 'minCost must not be greater than maxCost' }]);
  });

  it('an unknown or deleted substance or batch with a 404', async () => {
    expectProblem(await api.get('/api/consumptions?substanceId=8080'), 404);
    expectProblem(await api.get('/api/consumptions?batchId=8080'), 404);
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 1, totalPrice: 1 });
    await api.del(`/api/batches/${b.id}`);
    expectProblem(await api.get(`/api/consumptions?batchId=${b.id}`), 404);
  });
});

describe('GET /api/consumptions/bounds', () => {
  const none = { minCost: null, maxCost: null, minQuantity: null, maxQuantity: null };
  const bounds = async (query: string) => {
    const res = await api.get(`/api/consumptions/bounds?${query}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body;
  };

  it('gives the lowest and highest cost and quantity of a consumption in scope, nulls when there is none', async () => {
    expect(await bounds('')).toEqual(none);
    const { beer, corona } = await seedBeerAndCoffee();
    expect(await bounds('')).toEqual({ minCost: '0.50', maxCost: '5.00', minQuantity: '1.000', maxQuantity: '3.000' });
    expect(await bounds(`substanceId=${beer.id}`)).toEqual({ minCost: '1.00', maxCost: '5.00', minQuantity: '1.000', maxQuantity: '3.000' });
    expect(await bounds(`batchId=${corona.id}`)).toEqual({ minCost: '1.00', maxCost: '3.00', minQuantity: '1.000', maxQuantity: '3.000' });
    expect(await bounds('from=2026-09-07&to=2026-09-07')).toEqual({ minCost: '3.00', maxCost: '3.00', minQuantity: '2.000', maxQuantity: '2.000' });
    expect(await bounds('from=2026-10-01')).toEqual(none);
  });

  it('takes no price, quantity or page filters, and refuses bad dates and unknown ids', async () => {
    expectProblem(await api.get('/api/consumptions/bounds?minCost=1'), 400);
    expectProblem(await api.get('/api/consumptions/bounds?maxQuantity=1'), 400);
    expectProblem(await api.get('/api/consumptions/bounds?limit=5'), 400);
    expectProblem(await api.get('/api/consumptions/bounds?from=2026-09-05&to=2026-09-01'), 400);
    expectProblem(await api.get('/api/consumptions/bounds?substanceId=8080'), 404);
    expectProblem(await api.get('/api/consumptions/bounds?batchId=8080'), 404);
  });
});

describe('GET /api/batches', () => {
  it('lists every batch that is not deleted, finished ones too, by substance name, newest first', async () => {
    const coffee = await api.substance({ name: 'coffee', unit: 'cup' });
    const beer = await api.substance({ name: 'Beer', unit: 'beer' }); // after coffee by id, before it by name
    const moka = await api.batch(coffee.id, { quantity: 10, totalPrice: 5, occurredAt: '2026-09-01T08:00:00Z' });
    const corona = await api.batch(beer.id, { name: 'Corona', quantity: 6, totalPrice: 6, occurredAt: '2026-09-01T10:00:00Z' });
    const peroni = await api.batch(beer.id, { name: 'Peroni', quantity: 2, totalPrice: 3, occurredAt: '2026-09-05T10:00:00Z' });
    await api.consume(peroni.id, { quantity: 2, occurredAt: '2026-09-06T10:00:00Z' }); // finishes it
    const deleted = await api.batch(beer.id, { quantity: 1, totalPrice: 1, occurredAt: '2026-09-07T10:00:00Z' });
    await api.del(`/api/batches/${deleted.id}`);

    const res = await api.get('/api/batches');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: peroni.id, substanceId: beer.id, substanceName: 'Beer', name: 'Peroni', occurredAt: '2026-09-05T10:00:00Z', deactivatedAt: expect.any(String) },
      { id: corona.id, substanceId: beer.id, substanceName: 'Beer', name: 'Corona', occurredAt: '2026-09-01T10:00:00Z', deactivatedAt: null },
      { id: moka.id, substanceId: coffee.id, substanceName: 'coffee', name: null, occurredAt: '2026-09-01T08:00:00Z', deactivatedAt: null },
    ]);
    expect((await api.get(`/api/batches?substanceId=${coffee.id}`)).body.map((b: any) => b.id)).toEqual([moka.id]);
  });

  it('keeps substances and batches with the same name apart: only the id identifies them', async () => {
    const first = await api.substance({ name: 'twin beer', unit: 'beer' });
    const second = await api.substance({ name: 'twin beer', unit: 'beer' });
    const bought = '2026-09-01T10:00:00Z';
    const a = await api.batch(first.id, { name: 'Peroni', quantity: 6, totalPrice: 6, occurredAt: bought });
    // Newer than the other two, but of the second substance: it must not come between them.
    const b = await api.batch(second.id, { name: 'Peroni', quantity: 6, totalPrice: 6, occurredAt: '2026-09-03T10:00:00Z' });
    const c = await api.batch(first.id, { name: 'Peroni', quantity: 6, totalPrice: 6, occurredAt: bought });
    const fromA = await api.consume(a.id, { quantity: 1, occurredAt: '2026-09-04T20:00:00Z' });
    await api.consume(c.id, { quantity: 2, occurredAt: '2026-09-04T21:00:00Z' });

    const twins = (await api.get('/api/batches')).body.filter((x: any) => x.substanceName === 'twin beer');
    expect(twins.map((x: any) => [x.substanceId, x.id])).toEqual([
      [first.id, c.id],
      [first.id, a.id],
      [second.id, b.id],
    ]);
    expect((await api.get(`/api/consumptions?batchId=${a.id}`)).body.map(C)).toEqual([C(fromA)]);
  });

  it('refuses an unknown substance and unknown query fields', async () => {
    expectProblem(await api.get('/api/batches?substanceId=8080'), 404);
    expectProblem(await api.get('/api/batches?includeDeactivated=true'), 400);
  });
});

describe('delta from the previous consumption of the same substance', () => {
  const deltas = (body: any[]) => body.map((c: any) => [c.type, c.id, c.deltaQuantity, c.deltaUnitPrice]);

  it('is null for the first one, then (this − previous) ÷ previous on quantity and unit price, across both kinds', async () => {
    const beer = await api.substance({ name: 'beer', unit: 'beer' });
    const coffee = await api.substance({ name: 'coffee', unit: 'cup' });
    const corona = await api.batch(beer.id, { quantity: 10, totalPrice: 10, occurredAt: '2026-09-01T10:00:00Z' });
    const moka = await api.batch(coffee.id, { quantity: 10, totalPrice: 30, occurredAt: '2026-09-01T10:00:00Z' });
    const first = await api.consume(corona.id, { quantity: 2, occurredAt: '2026-09-02T10:00:00Z' });
    const otherSubstance = await api.consume(moka.id, { quantity: 5, occurredAt: '2026-09-02T12:00:00Z' });
    const cancelled = await api.consume(corona.id, { quantity: 4, occurredAt: '2026-09-02T15:00:00Z' });
    await api.del(`/api/consumptions/${cancelled.id}`);
    const pint = await api.oneTime(beer.id, { quantity: 1, totalPrice: 5, occurredAt: '2026-09-03T10:00:00Z' });
    const again = await api.consume(corona.id, { quantity: 3, occurredAt: '2026-09-04T10:00:00Z' });

    const res = await api.get('/api/consumptions');
    expect(deltas(res.body)).toEqual([
      ['consumption', again.id, '2.0000', '-0.8000'], // 3 vs 1, 1.00 vs 5.00 (the one-time pint)
      ['one_time', pint.id, '-0.5000', '4.0000'], // 1 vs 2, 5.00 vs 1.00 (not the cancelled 4)
      ['consumption', otherSubstance.id, null, null], // first coffee: beer never counts
      ['consumption', first.id, null, null],
    ]);
  });

  it('rounds ratios to 4 decimals and, at the same instant, compares with the one recorded first', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 100, totalPrice: 30, occurredAt: '2026-09-01T10:00:00Z' });
    const T = '2026-09-02T10:00:00Z';
    const a = await api.consume(b.id, { quantity: 3, occurredAt: T });
    const c = await api.consume(b.id, { quantity: 7, occurredAt: T });
    const o = await api.oneTime(s.id, { quantity: 6, totalPrice: 2, occurredAt: T });

    const res = await api.get('/api/consumptions');
    expect(deltas(res.body)).toEqual([
      ['one_time', o.id, '-0.1429', '0.1111'], // 6 vs 7; 0.333333… vs 0.30
      ['consumption', c.id, '1.3333', '0.0000'], // 7 vs 3, same batch
      ['consumption', a.id, null, null],
    ]);
  });

  it('has no unit-price ratio after a unit price of 0', async () => {
    const s = await api.substance({ name: 'cigarettes', unit: 'cigarette' });
    const pack = await api.batch(s.id, { quantity: 20, totalPrice: 6, occurredAt: '2026-09-01T10:00:00Z' });
    const gift = await api.oneTime(s.id, { name: 'from a friend', quantity: 1, totalPrice: 0, occurredAt: '2026-09-02T10:00:00Z' });
    const next = await api.consume(pack.id, { quantity: 2, occurredAt: '2026-09-03T10:00:00Z' });
    const gift2 = await api.oneTime(s.id, { quantity: 1, totalPrice: 0, occurredAt: '2026-09-04T10:00:00Z' });

    const res = await api.get('/api/consumptions');
    expect(deltas(res.body)).toEqual([
      ['one_time', gift2.id, '-0.5000', '-1.0000'], // 0.00 vs 0.30: −100 %
      ['consumption', next.id, '1.0000', null], // after 0.00: no percentage of zero
      ['one_time', gift.id, null, null],
    ]);
  });

  it('compares the cost too: (this − previous) ÷ previous of what each one cost; none after a cost of 0', async () => {
    const s = await api.substance({ name: 'cigarettes', unit: 'cigarette' });
    const pack = await api.batch(s.id, { quantity: 20, totalPrice: 6.2, occurredAt: '2026-08-01T10:00:00Z' });
    const seven = await api.consume(pack.id, { quantity: 7, occurredAt: '2026-08-02T20:00:00Z' }); // 2.17
    const five = await api.consume(pack.id, { quantity: 5, occurredAt: '2026-08-03T20:00:00Z' }); // 1.55
    const gift = await api.oneTime(s.id, { quantity: 1, totalPrice: 0, occurredAt: '2026-08-05T23:00:00Z' });
    const four = await api.consume(pack.id, { quantity: 4, occurredAt: '2026-08-06T20:00:00Z' }); // 1.24

    const res = await api.get('/api/consumptions');
    expect(res.body.map((c: any) => [c.id, c.cost, c.deltaQuantity, c.deltaCost])).toEqual([
      [four.id, '1.24', '3.0000', null], // after the gift: 4 vs 1, and no percentage of a cost of 0
      [gift.id, '0.00', '-0.8000', '-1.0000'], // 1 vs 5, 0.00 vs 1.55
      [five.id, '1.55', '-0.2857', '-0.2857'], // 5 vs 7, 1.55 vs 2.17
      [seven.id, '2.17', null, null],
    ]);
  });
});

describe('delta in the list of one batch (lenzi, 2026-09-30)', () => {
  it('compares with the previous consumption of that batch: what another batch or a one-time put in between does not count', async () => {
    const s = await api.substance({ name: 'cigarettes', unit: 'cigarette' });
    const pack = await api.batch(s.id, { quantity: 20, totalPrice: 6.2, occurredAt: '2026-08-01T10:00:00Z' });
    const other = await api.batch(s.id, { quantity: 20, totalPrice: 6.5, occurredAt: '2026-08-01T11:00:00Z' });
    const seven = await api.consume(pack.id, { quantity: 7, occurredAt: '2026-08-02T20:00:00Z' });
    const five = await api.consume(pack.id, { quantity: 5, occurredAt: '2026-08-03T20:00:00Z' });
    await api.consume(other.id, { quantity: 10, occurredAt: '2026-08-04T20:00:00Z' });
    const gift = await api.oneTime(s.id, { quantity: 1, totalPrice: 0, occurredAt: '2026-08-05T23:00:00Z' }); // the 6th, 01:00 in Rome
    const four = await api.consume(pack.id, { quantity: 4, occurredAt: '2026-08-06T20:00:00Z' });
    const deltas = (body: any[]) => body.map((c: any) => [c.id, c.deltaQuantity, c.deltaCost, c.deltaUnitPrice]);

    expect(deltas((await api.get(`/api/consumptions?batchId=${pack.id}`)).body)).toEqual([
      [four.id, '-0.2000', '-0.2000', '0.0000'], // 4 vs the 5 before it in the batch, 1.24 vs 1.55: not +300 % on the gift
      [five.id, '-0.2857', '-0.2857', '0.0000'],
      [seven.id, null, null, null], // the first of the batch
    ]);
    // the days narrow the list, not what each one is compared with
    expect(deltas((await api.get(`/api/consumptions?batchId=${pack.id}&from=2026-08-06`)).body)).toEqual([
      [four.id, '-0.2000', '-0.2000', '0.0000'],
    ]);
    // without the batch: the previous consumption of the substance, whatever it came from
    expect(deltas((await api.get(`/api/consumptions?substanceId=${s.id}&from=2026-08-06`)).body)).toEqual([
      [four.id, '3.0000', null, null], // 4 vs the gift of 1; nothing on a price of 0
      [gift.id, '-0.9000', '-1.0000', '-1.0000'], // 1 vs the 10 of the other batch
    ]);
  });
});
