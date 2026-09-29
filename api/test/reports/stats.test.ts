import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectProblem, makeApi, type Api } from '../support/api.js';

let api: Api;
beforeAll(async () => {
  api = await makeApi();
});
afterAll(async () => {
  await api.app.close();
});

const zero = (period: string) => ({ period, consumed: '0.000', cost: '0.00', spend: '0.00' });

describe('GET /api/stats', () => {
  it('logical day in Europe/Rome: 2026-03-28T23:30Z (+01:00) counts on 2026-03-29', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 10, totalPrice: 20, occurredAt: '2026-03-27T12:00:00Z' });
    await api.consume(b.id, { quantity: 1, occurredAt: '2026-03-28T23:30:00Z' });
    await api.consume(b.id, { quantity: 2, occurredAt: '2026-03-28T22:59:59Z' }); // 23:59:59 local, still the 28th

    const res = await api.get('/api/stats?from=2026-03-27&to=2026-03-30&groupBy=day');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { period: '2026-03-27', consumed: '0.000', cost: '0.00', spend: '20.00' },
      { period: '2026-03-28', consumed: '2.000', cost: '4.00', spend: '0.00' },
      { period: '2026-03-29', consumed: '1.000', cost: '2.00', spend: '0.00' },
      zero('2026-03-30'),
    ]);
  });

  it('around DST: +02:00 after 2026-03-29, back to +01:00 after 2026-10-25', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 100, totalPrice: 100, occurredAt: '2026-03-01T12:00:00Z' });
    // 2026-03-29T22:30Z = 00:30 CEST on 2026-03-30
    await api.consume(b.id, { quantity: 1, occurredAt: '2026-03-29T22:30:00Z' });
    // 2026-03-29T21:30Z = 23:30 CEST on 2026-03-29 (a 23-hour day)
    await api.consume(b.id, { quantity: 2, occurredAt: '2026-03-29T21:30:00Z' });
    // 2026-10-24T22:30Z = 00:30 CEST on 2026-10-25
    await api.consume(b.id, { quantity: 4, occurredAt: '2026-10-24T22:30:00Z' });
    // 2026-10-25T22:30Z = 23:30 CET on 2026-10-25 (a 25-hour day)
    await api.consume(b.id, { quantity: 8, occurredAt: '2026-10-25T22:30:00Z' });
    // 2026-10-25T23:30Z = 00:30 CET on 2026-10-26
    await api.consume(b.id, { quantity: 16, occurredAt: '2026-10-25T23:30:00Z' });

    const march = await api.get('/api/stats?from=2026-03-29&to=2026-03-30');
    expect(march.body.map((p: any) => [p.period, p.consumed])).toEqual([
      ['2026-03-29', '2.000'],
      ['2026-03-30', '1.000'],
    ]);
    const october = await api.get('/api/stats?from=2026-10-24&to=2026-10-26');
    expect(october.body.map((p: any) => [p.period, p.consumed])).toEqual([
      ['2026-10-24', '0.000'],
      ['2026-10-25', '12.000'],
      ['2026-10-26', '16.000'],
    ]);
  });

  it('groups by ISO week and by month, zero-filled, in order', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 100, totalPrice: 50, occurredAt: '2026-09-27T10:00:00Z' });
    await api.consume(b.id, { quantity: 2, occurredAt: '2026-09-27T10:00:00Z' }); // Sunday, week 39
    await api.consume(b.id, { quantity: 4, occurredAt: '2026-09-28T10:00:00Z' }); // Monday, week 40
    await api.consume(b.id, { quantity: 6, occurredAt: '2026-10-01T10:00:00Z' }); // Thursday, week 40, October

    const weeks = await api.get('/api/stats?from=2026-09-20&to=2026-10-11&groupBy=week');
    expect(weeks.body).toEqual([
      { period: '2026-W38', consumed: '0.000', cost: '0.00', spend: '0.00' },
      { period: '2026-W39', consumed: '2.000', cost: '1.00', spend: '50.00' },
      { period: '2026-W40', consumed: '10.000', cost: '5.00', spend: '0.00' },
      zero('2026-W41'),
    ]);
    const months = await api.get('/api/stats?from=2026-08-15&to=2026-10-02&groupBy=month');
    expect(months.body).toEqual([
      zero('2026-08'),
      { period: '2026-09', consumed: '6.000', cost: '3.00', spend: '50.00' },
      { period: '2026-10', consumed: '6.000', cost: '3.00', spend: '0.00' },
    ]);
    // a partial range only counts the logical days inside it
    const partial = await api.get('/api/stats?from=2026-09-28&to=2026-09-30&groupBy=month');
    expect(partial.body).toEqual([{ period: '2026-09', consumed: '4.000', cost: '2.00', spend: '0.00' }]);
  });

  it('ISO week years: 2026-12-31 is in 2026-W53, 2027-01-04 in 2027-W01', async () => {
    const res = await api.get('/api/stats?from=2026-12-27&to=2027-01-04&groupBy=week');
    expect(res.body.map((p: any) => p.period)).toEqual(['2026-W52', '2026-W53', '2027-W01']);
  });

  it('spend is money paid in the period, cost is what was consumed in it', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 4, totalPrice: 10, occurredAt: '2026-03-15T10:00:00Z' });
    await api.consume(b.id, { quantity: 2, occurredAt: '2026-04-15T10:00:00Z' });
    await api.oneTime(s.id, { quantity: 1, totalPrice: 3, occurredAt: '2026-04-20T10:00:00Z' });
    const res = await api.get('/api/stats?from=2026-03-01&to=2026-04-30&groupBy=month');
    expect(res.body).toEqual([
      { period: '2026-03', consumed: '0.000', cost: '0.00', spend: '10.00' },
      { period: '2026-04', consumed: '3.000', cost: '8.00', spend: '3.00' },
    ]);
  });

  it('filters by substance and excludes soft-deleted movements', async () => {
    const s1 = await api.substance({ name: 's1' });
    const s2 = await api.substance({ name: 's2' });
    const b1 = await api.batch(s1.id, { quantity: 10, totalPrice: 10, occurredAt: '2026-05-01T10:00:00Z' });
    const b2 = await api.batch(s2.id, { quantity: 10, totalPrice: 30, occurredAt: '2026-05-01T10:00:00Z' });
    await api.consume(b1.id, { quantity: 1, occurredAt: '2026-05-02T10:00:00Z' });
    await api.consume(b2.id, { quantity: 1, occurredAt: '2026-05-02T10:00:00Z' });
    const c = await api.consume(b1.id, { quantity: 5, occurredAt: '2026-05-02T11:00:00Z' });
    await api.del(`/api/consumptions/${c.id}`);

    const one = await api.get(`/api/stats?from=2026-05-02&to=2026-05-02&substanceId=${s1.id}`);
    expect(one.body).toEqual([{ period: '2026-05-02', consumed: '1.000', cost: '1.00', spend: '0.00' }]);
    const all = await api.get('/api/stats?from=2026-05-01&to=2026-05-02');
    expect(all.body).toEqual([
      { period: '2026-05-01', consumed: '0.000', cost: '0.00', spend: '40.00' },
      { period: '2026-05-02', consumed: '2.000', cost: '4.00', spend: '0.00' },
    ]);
  });

  it('dayStartsAt moves the logical day', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 10, totalPrice: 10, occurredAt: '2026-06-01T10:00:00Z' });
    // 2026-06-10T00:30Z = 02:30 CEST on the 10th
    await api.consume(b.id, { quantity: 1, occurredAt: '2026-06-10T00:30:00Z' });
    const midnight = await api.get('/api/stats?from=2026-06-09&to=2026-06-10');
    expect(midnight.body.map((p: any) => p.consumed)).toEqual(['0.000', '1.000']);

    expect((await api.patch('/api/settings', { dayStartsAt: '04:00' })).status).toBe(200);
    const shifted = await api.get('/api/stats?from=2026-06-09&to=2026-06-10');
    expect(shifted.body.map((p: any) => p.consumed)).toEqual(['1.000', '0.000']);
  });

  it('validates its query', async () => {
    expectProblem(await api.get('/api/stats?to=2026-01-01'), 400);
    expectProblem(await api.get('/api/stats?from=2026-01-02&to=2026-01-01'), 400);
    expectProblem(await api.get('/api/stats?from=2026-01-01&to=2026-01-02&groupBy=year'), 400);
    expectProblem(await api.get('/api/stats?from=2026-02-30&to=2026-03-02'), 400);
    expectProblem(await api.get('/api/stats?from=1900-01-01&to=2100-01-01&groupBy=day'), 400);
    expectProblem(await api.get('/api/stats?from=2026-01-01&to=2026-01-02&substanceId=999'), 404);
  });
});
