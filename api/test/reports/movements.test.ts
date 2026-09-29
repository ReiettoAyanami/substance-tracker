import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectProblem, makeApi, type Api } from '../support/api.js';

let api: Api;
beforeAll(async () => {
  api = await makeApi();
});
afterAll(async () => {
  await api.app.close();
});

async function seed() {
  const s = await api.substance({ name: 'beer', unit: 'beer' });
  const other = await api.substance({ name: 'coffee', unit: 'cup' });
  const b = await api.batch(s.id, { name: 'Corona', quantity: 6, totalPrice: 6, occurredAt: '2026-09-01T10:00:00Z' });
  const c1 = await api.consume(b.id, { quantity: 1, occurredAt: '2026-09-02T10:00:00Z', note: 'one' });
  const a = await api.adjust(b.id, { delta: -1, reason: 'broken bottle', occurredAt: '2026-09-03T10:00:00Z' });
  const o = await api.oneTime(s.id, { quantity: 1, totalPrice: 4, name: 'bar', occurredAt: '2026-09-04T10:00:00Z' });
  const cancelled = await api.consume(b.id, { quantity: 1, occurredAt: '2026-09-05T10:00:00Z' });
  await api.del(`/api/consumptions/${cancelled.id}`);
  const ob = await api.batch(other.id, { quantity: 10, totalPrice: 5, occurredAt: '2026-09-06T10:00:00Z' });
  return { s, other, b, c1, a, o, ob };
}

describe('movement history', () => {
  it('GET /api/substances/:id/movements: every kind, newest first, deleted excluded', async () => {
    const { s, b, c1, a, o } = await seed();
    const res = await api.get(`/api/substances/${s.id}/movements`);
    expect(res.status).toBe(200);
    expect(res.body.map((m: any) => [m.type, m.id])).toEqual([
      ['one_time', o.id],
      ['adjustment', a.id],
      ['consumption', c1.id],
      ['batch', b.id],
    ]);
    const [oneTime, adjustment, consumption, batch] = res.body;
    expect(oneTime).toMatchObject({ substanceId: s.id, substanceName: 'beer', unit: 'beer', name: 'bar', quantity: '1.000', totalPrice: '4.00', cost: '4.00' });
    expect(adjustment).toMatchObject({ batchId: b.id, batchName: 'Corona', delta: '-1.000', reason: 'broken bottle' });
    expect(consumption).toMatchObject({ batchId: b.id, batchName: 'Corona', quantity: '1.000', cost: '1.00', note: 'one', occurredAt: '2026-09-02T10:00:00Z' });
    expect(batch).toMatchObject({ name: 'Corona', quantity: '6.000', totalPrice: '6.00', deactivatedAt: null });
  });

  it('GET /api/movements: global, with substanceId, type, from/to (logical dates), limit and before', async () => {
    const { s, other, c1, o, ob } = await seed();
    const all = await api.get('/api/movements');
    expect(all.body).toHaveLength(5);
    expect(all.body[0]).toMatchObject({ type: 'batch', id: ob.id, substanceId: other.id });

    const onlyS = await api.get(`/api/movements?substanceId=${s.id}`);
    expect(onlyS.body).toHaveLength(4);

    const consumptions = await api.get('/api/movements?type=consumption');
    expect(consumptions.body.map((m: any) => m.id)).toEqual([c1.id]);

    const oneTimes = await api.get('/api/movements?type=one_time');
    expect(oneTimes.body.map((m: any) => m.id)).toEqual([o.id]);

    const window = await api.get('/api/movements?from=2026-09-02&to=2026-09-04');
    expect(window.body.map((m: any) => m.type)).toEqual(['one_time', 'adjustment', 'consumption']);

    const page1 = await api.get('/api/movements?limit=2');
    expect(page1.body).toHaveLength(2);
    const cursor = page1.body[1].occurredAt;
    const page2 = await api.get(`/api/movements?limit=2&before=${encodeURIComponent(cursor)}`);
    expect(page2.body.map((m: any) => m.type)).toEqual(['adjustment', 'consumption']);
    const page3 = await api.get(`/api/movements?limit=2&before=${encodeURIComponent(page2.body[1].occurredAt)}`);
    expect(page3.body.map((m: any) => m.type)).toEqual(['batch']);
  });

  it('logical-date window respects Europe/Rome', async () => {
    const s = await api.substance();
    // 2026-09-09T22:30Z is 00:30 on the 10th in Rome
    const b = await api.batch(s.id, { quantity: 1, totalPrice: 1, occurredAt: '2026-09-09T22:30:00Z' });
    expect((await api.get('/api/movements?from=2026-09-10&to=2026-09-10')).body.map((m: any) => m.id)).toEqual([b.id]);
    expect((await api.get('/api/movements?from=2026-09-09&to=2026-09-09')).body).toEqual([]);
  });

  it('validates the query and 404s unknown substances', async () => {
    expectProblem(await api.get('/api/movements?type=purchase'), 400);
    expectProblem(await api.get('/api/movements?limit=0'), 400);
    expectProblem(await api.get('/api/movements?limit=201'), 400);
    expectProblem(await api.get('/api/movements?before=yesterday'), 400);
    expectProblem(await api.get('/api/movements?from=2026-09-05&to=2026-09-01'), 400);
    expectProblem(await api.get('/api/substances/8080/movements'), 404);
    expectProblem(await api.get('/api/movements?substanceId=8080'), 404);
  });

  it('limit defaults to 50', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 100, totalPrice: 100, occurredAt: '2026-01-01T00:00:00Z' });
    for (let i = 0; i < 55; i++) await api.consume(b.id, { quantity: 1, occurredAt: `2026-02-01T00:${String(i).padStart(2, '0')}:00Z` });
    expect((await api.get('/api/movements')).body).toHaveLength(50);
    expect((await api.get('/api/movements?limit=200')).body).toHaveLength(56);
  });
});

describe('batch and one-time histories', () => {
  it('GET /api/batches/:id/movements: consumptions and adjustments with cost, newest first, paginated', async () => {
    const { b, c1, a } = await seed();
    const res = await api.get(`/api/batches/${b.id}/movements`);
    expect(res.body).toEqual([
      {
        type: 'adjustment',
        id: a.id,
        batchId: b.id,
        occurredAt: '2026-09-03T10:00:00Z',
        delta: '-1.000',
        reason: 'broken bottle',
        cost: null,
        clientRef: null,
        createdAt: expect.any(String),
      },
      {
        type: 'consumption',
        id: c1.id,
        batchId: b.id,
        occurredAt: '2026-09-02T10:00:00Z',
        quantity: '1.000',
        cost: '1.00',
        note: 'one',
        clientRef: null,
        createdAt: expect.any(String),
      },
    ]);
    const page = await api.get(`/api/batches/${b.id}/movements?limit=1&before=2026-09-03T10:00:00Z`);
    expect(page.body.map((m: any) => m.id)).toEqual([c1.id]);
    expectProblem(await api.get('/api/batches/9999/movements'), 404);
  });

  it('GET /api/substances/:id/one-time/consumptions: newest first, paginated', async () => {
    const s = await api.substance();
    const first = await api.oneTime(s.id, { quantity: 1, totalPrice: 2, occurredAt: '2026-09-01T10:00:00Z' });
    const second = await api.oneTime(s.id, { quantity: 1, totalPrice: 3, occurredAt: '2026-09-02T10:00:00Z' });
    const third = await api.oneTime(s.id, { quantity: 1, totalPrice: 4, occurredAt: '2026-09-03T10:00:00Z' });
    const all = await api.get(`/api/substances/${s.id}/one-time/consumptions`);
    expect(all.body.map((o: any) => o.id)).toEqual([third.id, second.id, first.id]);
    expect(all.body[0]).toMatchObject({ type: 'one_time', totalPrice: '4.00', cost: '4.00' });
    const page = await api.get(`/api/substances/${s.id}/one-time/consumptions?limit=1&before=2026-09-03T10:00:00Z`);
    expect(page.body.map((o: any) => o.id)).toEqual([second.id]);
  });
});

describe('pagination never splits movements that share an instant', () => {
  const T = '2026-09-05T20:00:00Z';

  /** Walks every page with `limit`, following the `before` cursor. */
  async function walk(url: string, limit: number): Promise<any[][]> {
    const pages: any[][] = [];
    let before = '';
    for (let i = 0; i < 20; i++) {
      const sep = url.includes('?') ? '&' : '?';
      const res = await api.get(`${url}${sep}limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      if (res.body.length === 0) break;
      pages.push(res.body);
      before = res.body[res.body.length - 1].occurredAt;
    }
    return pages;
  }
  const keys = (pages: any[][]) => pages.flat().map((m) => `${m.type}${m.id}`);

  it('/api/substances/:id/movements and /api/movements return the whole instant, even past limit', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 10, totalPrice: 10, occurredAt: '2026-09-05T08:00:00Z' });
    await api.consume(b.id, { quantity: 1, occurredAt: T });
    await api.consume(b.id, { quantity: 1, occurredAt: T });
    await api.adjust(b.id, { delta: -1, reason: 'broken', occurredAt: T });
    await api.oneTime(s.id, { quantity: 1, totalPrice: 1, occurredAt: T });

    const all = (await api.get(`/api/substances/${s.id}/movements`)).body;
    expect(all).toHaveLength(5);

    const pages = await walk(`/api/substances/${s.id}/movements`, 2);
    expect(pages[0]).toHaveLength(4); // limit 2, but four movements at T
    expect(pages[0]!.every((m) => m.occurredAt === T)).toBe(true);
    expect(pages[1]!.map((m) => m.type)).toEqual(['batch']);
    expect(keys(pages)).toEqual(all.map((m: any) => `${m.type}${m.id}`));

    const global = await walk(`/api/movements?substanceId=${s.id}`, 3);
    expect(keys(global)).toEqual(all.map((m: any) => `${m.type}${m.id}`));
  });

  it('/api/batches/:id/movements returns the whole instant', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 10, totalPrice: 10, occurredAt: '2026-09-05T08:00:00Z' });
    await api.consume(b.id, { quantity: 1, occurredAt: '2026-09-05T09:00:00Z' });
    for (let i = 0; i < 3; i++) await api.consume(b.id, { quantity: 1, occurredAt: T });

    const pages = await walk(`/api/batches/${b.id}/movements`, 2);
    expect(pages.map((p) => p.length)).toEqual([3, 1]);
    expect(pages.flat()).toHaveLength(4);
  });

  it('/api/substances/:id/one-time/consumptions returns the whole instant', async () => {
    const s = await api.substance();
    await api.oneTime(s.id, { quantity: 1, totalPrice: 1, occurredAt: '2026-09-04T20:00:00Z' });
    for (let i = 0; i < 3; i++) await api.oneTime(s.id, { quantity: 1, totalPrice: 1, occurredAt: T });

    const pages = await walk(`/api/substances/${s.id}/one-time/consumptions`, 2);
    expect(pages.map((p) => p.length)).toEqual([3, 1]);
  });

  it('pages keep exactly limit rows when nothing ties', async () => {
    const s = await api.substance();
    for (let i = 1; i <= 3; i++) await api.oneTime(s.id, { quantity: 1, totalPrice: 1, occurredAt: `2026-09-0${i}T10:00:00Z` });
    const pages = await walk(`/api/substances/${s.id}/one-time/consumptions`, 2);
    expect(pages.map((p) => p.length)).toEqual([2, 1]);
  });
});
