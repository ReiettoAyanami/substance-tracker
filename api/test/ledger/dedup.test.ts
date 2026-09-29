import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectProblem, makeApi, type Api } from '../support/api.js';
import { rawRows } from '../support/db.js';

let api: Api;
beforeAll(async () => {
  api = await makeApi();
});
afterAll(async () => {
  await api.app.close();
});

describe('clientRef dedup', () => {
  it('batch: same clientRef -> 200 with the first row, no duplicate', async () => {
    const s = await api.substance();
    const ref = randomUUID();
    const first = await api.post(`/api/substances/${s.id}/batches`, { quantity: 6, totalPrice: 6, clientRef: ref });
    const again = await api.post(`/api/substances/${s.id}/batches`, { quantity: 6, totalPrice: 6, clientRef: ref });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(first.body.clientRef).toBe(ref);
    expect(await rawRows('SELECT id FROM batches')).toHaveLength(1);
  });

  it('consumption: a retry of the consumption that emptied the batch returns it (not 409)', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 2, totalPrice: 2 });
    const ref = randomUUID();
    const first = await api.post(`/api/batches/${b.id}/consumptions`, { quantity: 2, clientRef: ref });
    const again = await api.post(`/api/batches/${b.id}/consumptions`, { quantity: 2, clientRef: ref.toUpperCase() });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(await rawRows('SELECT id FROM consumptions')).toHaveLength(1);
  });

  it('adjustment and one-time consumption dedup too', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 10, totalPrice: 10 });
    const aRef = randomUUID();
    const a1 = await api.post(`/api/batches/${b.id}/adjustments`, { delta: -1, reason: 'lost', clientRef: aRef });
    const a2 = await api.post(`/api/batches/${b.id}/adjustments`, { delta: -1, reason: 'lost', clientRef: aRef });
    expect([a1.status, a2.status]).toEqual([201, 200]);
    expect(a2.body.id).toBe(a1.body.id);
    expect(await rawRows('SELECT id FROM adjustments')).toHaveLength(1);

    const oRef = randomUUID();
    const o1 = await api.post(`/api/substances/${s.id}/one-time-consumptions`, { quantity: 1, totalPrice: 3, clientRef: oRef });
    const o2 = await api.post(`/api/substances/${s.id}/one-time-consumptions`, { quantity: 1, totalPrice: 3, clientRef: oRef });
    expect([o1.status, o2.status]).toEqual([201, 200]);
    expect(o2.body.id).toBe(o1.body.id);
    expect(await rawRows('SELECT id FROM one_time_consumptions')).toHaveLength(1);
    expect((await api.get(`/api/batches/${b.id}`)).body.remaining).toBe('9.000');
  });

  it('concurrent duplicates still produce one row', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 10, totalPrice: 10 });
    const ref = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => api.post(`/api/batches/${b.id}/consumptions`, { quantity: 1, clientRef: ref })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await rawRows('SELECT id FROM consumptions')).toHaveLength(1);
  });

  it('the scope is per table: the same UUID on another table is a new row', async () => {
    const s = await api.substance();
    const ref = randomUUID();
    const b = await api.post(`/api/substances/${s.id}/batches`, { quantity: 5, totalPrice: 5, clientRef: ref });
    const c = await api.post(`/api/batches/${b.body.id}/consumptions`, { quantity: 1, clientRef: ref });
    expect([b.status, c.status]).toEqual([201, 201]);
  });

  it('clientRef must be a UUID', async () => {
    const s = await api.substance();
    expectProblem(await api.post(`/api/substances/${s.id}/batches`, { quantity: 1, totalPrice: 1, clientRef: 'abc' }), 400);
  });
});

describe('concurrency', () => {
  it('parallel consumptions never take a batch below 0', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 3, totalPrice: 3 });
    const results = await Promise.all(
      Array.from({ length: 6 }, () => api.post(`/api/batches/${b.id}/consumptions`, { quantity: 1 })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    const page = await api.get(`/api/batches/${b.id}`);
    expect(page.body.remaining).toBe('0.000');
    expect(page.body.deactivatedByConsumptionId).not.toBeNull();
  });
});
