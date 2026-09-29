import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectProblem, makeApi, type Api } from '../support/api.js';

let api: Api;
beforeAll(async () => {
  api = await makeApi();
});
afterAll(async () => {
  await api.app.close();
});

describe('/api/settings', () => {
  it('returns the defaults', async () => {
    const res = await api.get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' });
  });

  it('updates timezone, dayStartsAt (HH:MM or HH:MM:SS) and currency', async () => {
    const res = await api.patch('/api/settings', { timezone: 'America/New_York', dayStartsAt: '04:30', currency: 'USD' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ timezone: 'America/New_York', dayStartsAt: '04:30:00', currency: 'USD' });
    expect((await api.patch('/api/settings', { dayStartsAt: '05:15:30' })).body.dayStartsAt).toBe('05:15:30');
    expect((await api.get('/api/settings')).body).toEqual({
      timezone: 'America/New_York',
      dayStartsAt: '05:15:30',
      currency: 'USD',
    });
  });

  it('validates', async () => {
    expectProblem(await api.patch('/api/settings', { timezone: 'Mars/Olympus' }), 400);
    expectProblem(await api.patch('/api/settings', { dayStartsAt: '24:00' }), 400);
    expectProblem(await api.patch('/api/settings', { dayStartsAt: '4:00' }), 400);
    expectProblem(await api.patch('/api/settings', { currency: 'eur' }), 400);
    expectProblem(await api.patch('/api/settings', { currency: 'EURO' }), 400);
    expectProblem(await api.patch('/api/settings', {}), 400);
    expectProblem(await api.patch('/api/settings', { locale: 'it' }), 400);
  });
});
