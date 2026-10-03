import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApi, type Api, type Res } from '../support/api.js';
import { rawRows } from '../support/db.js';
import { OTHER, TESTER, idOf } from '../support/session.js';

/**
 * Another user's things do not exist (design-accounts.md, "Non-Negotiable Constraints": "the same
 * 404 for another user's page or id as for something that does not exist"; the first risk of the
 * OWASP API Top 10 2023, broken object level authorization).
 *
 * User A records a little of everything. User B calls every route of the API, as the API itself
 * lists them, with A's ids: each answers exactly as it does for ids that do not exist, nothing of
 * A shows in B's answers, and A's data is the same afterwards. A route added without a case here
 * fails the suite.
 */

interface Ids {
  user: number;
  substance: number;
  batch: number;
  consumption: number;
  adjustment: number;
  oneTime: number;
  viewItem: number;
}

const MISSING: Ids = { user: 999993, substance: 999999, batch: 999998, consumption: 999997, adjustment: 999996, oneTime: 999995, viewItem: 999994 };
const SECRET = 'A-secret';

type Call = (as: Api, ids: Ids) => Promise<Res>;
/**
 * like-missing: A's ids answer as missing ids do. own: B's own data, nothing of A in it. hidden: an
 * administrator's route, which for B, a user, answers as a route that does not exist.
 */
type Case =
  | { kind: 'like-missing'; call: Call; echoesInput?: boolean }
  | { kind: 'own'; call: (as: Api) => Promise<Res> }
  | { kind: 'hidden'; call: Call };

/** `echoesInput`: the answer repeats what B sent (a section name B typed), which is not A's data. */
const missing = (call: Call, echoesInput = false): Case => ({ kind: 'like-missing', call, echoesInput });
const own = (call: (as: Api) => Promise<Res>): Case => ({ kind: 'own', call });
const hidden = (call: Call): Case => ({ kind: 'hidden', call });

const RANGE = 'from=2026-09-01&to=2026-09-30';

/** Every private route of the API, "METHOD /url" as registered, and what B does with it. */
const CASES: Record<string, Case[]> = {
  // Catalog
  'GET /api/substances': [own((b) => b.get('/api/substances?archived=true')), own((b) => b.get(`/api/substances?q=${SECRET}`))],
  'POST /api/substances': [own((b) => b.post('/api/substances', { name: 'b-own', unit: 'g' }))],
  'GET /api/substances/:id': [missing((b, i) => b.get(`/api/substances/${i.substance}`))],
  'PATCH /api/substances/:id': [missing((b, i) => b.patch(`/api/substances/${i.substance}`, { name: 'taken' }))],
  'DELETE /api/substances/:id': [missing((b, i) => b.del(`/api/substances/${i.substance}`))],
  // Ledger
  'POST /api/substances/:id/batches': [missing((b, i) => b.post(`/api/substances/${i.substance}/batches`, { quantity: 1, totalPrice: 1 }))],
  'PATCH /api/batches/:id': [missing((b, i) => b.patch(`/api/batches/${i.batch}`, { note: 'taken' }))],
  'DELETE /api/batches/:id': [missing((b, i) => b.del(`/api/batches/${i.batch}`))],
  'POST /api/batches/:id/consumptions': [missing((b, i) => b.post(`/api/batches/${i.batch}/consumptions`, { quantity: 1 }))],
  'PATCH /api/consumptions/:id': [missing((b, i) => b.patch(`/api/consumptions/${i.consumption}`, { note: 'taken' }))],
  'DELETE /api/consumptions/:id': [missing((b, i) => b.del(`/api/consumptions/${i.consumption}`))],
  'POST /api/batches/:id/adjustments': [missing((b, i) => b.post(`/api/batches/${i.batch}/adjustments`, { delta: 1, reason: 'taken' }))],
  'PATCH /api/adjustments/:id': [missing((b, i) => b.patch(`/api/adjustments/${i.adjustment}`, { reason: 'taken' }))],
  'DELETE /api/adjustments/:id': [missing((b, i) => b.del(`/api/adjustments/${i.adjustment}`))],
  'POST /api/substances/:id/one-time-consumptions': [
    missing((b, i) => b.post(`/api/substances/${i.substance}/one-time-consumptions`, { quantity: 1, totalPrice: 1 })),
  ],
  'PATCH /api/one-time-consumptions/:id': [missing((b, i) => b.patch(`/api/one-time-consumptions/${i.oneTime}`, { note: 'taken' }))],
  'DELETE /api/one-time-consumptions/:id': [missing((b, i) => b.del(`/api/one-time-consumptions/${i.oneTime}`))],
  // Reports
  'GET /api/substances/:id/batches': [missing((b, i) => b.get(`/api/substances/${i.substance}/batches?includeDeactivated=true`))],
  'GET /api/batches': [own((b) => b.get('/api/batches')), missing((b, i) => b.get(`/api/batches?substanceId=${i.substance}`))],
  'GET /api/batches/:id': [missing((b, i) => b.get(`/api/batches/${i.batch}`))],
  'GET /api/batches/:id/movements': [missing((b, i) => b.get(`/api/batches/${i.batch}/movements`))],
  'GET /api/substances/:id/one-time': [missing((b, i) => b.get(`/api/substances/${i.substance}/one-time`))],
  'GET /api/substances/:id/one-time/consumptions': [missing((b, i) => b.get(`/api/substances/${i.substance}/one-time/consumptions`))],
  'GET /api/substances/:id/movements': [missing((b, i) => b.get(`/api/substances/${i.substance}/movements`))],
  'GET /api/movements': [own((b) => b.get('/api/movements')), missing((b, i) => b.get(`/api/movements?substanceId=${i.substance}`))],
  'GET /api/consumptions': [
    own((b) => b.get('/api/consumptions')),
    missing((b, i) => b.get(`/api/consumptions?substanceId=${i.substance}`)),
    missing((b, i) => b.get(`/api/consumptions?batchId=${i.batch}`)),
  ],
  'GET /api/consumptions/bounds': [
    own((b) => b.get('/api/consumptions/bounds')),
    missing((b, i) => b.get(`/api/consumptions/bounds?substanceId=${i.substance}`)),
    missing((b, i) => b.get(`/api/consumptions/bounds?batchId=${i.batch}`)),
  ],
  'GET /api/stats': [own((b) => b.get(`/api/stats?${RANGE}`)), missing((b, i) => b.get(`/api/stats?${RANGE}&substanceId=${i.substance}`))],
  // Metrics
  'GET /api/metrics': [own((b) => b.get('/api/metrics'))],
  'GET /api/series': [
    own((b) => b.get('/api/series?metric=series.consumed')),
    missing((b, i) => b.get(`/api/series?metric=series.consumed&substanceIds=${i.substance}`)),
  ],
  'GET /api/metrics/table': [
    own((b) => b.get('/api/metrics/table?scope=substance')),
    own((b) => b.get('/api/metrics/table?scope=consumption')),
    missing((b, i) => b.get(`/api/metrics/table?scope=substance&substanceId=${i.substance}`)),
    missing((b, i) => b.get(`/api/metrics/table?scope=consumption&batchId=${i.batch}`)),
  ],
  'GET /api/substances/:id/metrics': [missing((b, i) => b.get(`/api/substances/${i.substance}/metrics`))],
  'GET /api/consumptions/:id/metrics': [missing((b, i) => b.get(`/api/consumptions/${i.consumption}/metrics`))],
  'GET /api/one-time-consumptions/:id/metrics': [missing((b, i) => b.get(`/api/one-time-consumptions/${i.oneTime}/metrics`))],
  'GET /api/batches/:id/metrics': [missing((b, i) => b.get(`/api/batches/${i.batch}/metrics`))],
  // Views
  'GET /api/view-items': [own((b) => b.get('/api/view-items?surface=substance')), own((b) => b.get('/api/view-items?surface=statistics'))],
  'POST /api/view-items': [own((b) => b.post('/api/view-items', { surface: 'batch', metric: 'batch.used' }))],
  'PUT /api/view-items/order': [missing((b, i) => b.put('/api/view-items/order', { surface: 'substance', ids: [i.viewItem] }))],
  'PATCH /api/view-items/sections': [
    missing((b, i) => b.patch('/api/view-items/sections', { from: i === MISSING ? 'No such section' : `${SECRET}-section`, to: 'taken' }), true),
  ],
  'PATCH /api/view-items/:id': [missing((b, i) => b.patch(`/api/view-items/${i.viewItem}`, { chart: 'line' }))],
  'DELETE /api/view-items/:id': [missing((b, i) => b.del(`/api/view-items/${i.viewItem}`))],
  // Settings
  'GET /api/settings': [own((b) => b.get('/api/settings'))],
  'PATCH /api/settings': [own((b) => b.patch('/api/settings', { currency: 'USD' }))],
  // B's own account (a wrong current password: nothing changes for the next cases)
  'POST /api/account/password': [own((b) => b.post('/api/account/password', { currentPassword: 'not-mine-0000!', newPassword: 'Taken-pass-00001' }))],
  // Admin: B is no administrator
  'GET /api/admin/users': [hidden((b) => b.get('/api/admin/users'))],
  'POST /api/admin/users': [hidden((b) => b.post('/api/admin/users', { username: 'b-made', email: 'b@dev.invalid', password: 'B-made-pass-0001', role: 'admin' }))],
  'PATCH /api/admin/users/:id': [hidden((b, i) => b.patch(`/api/admin/users/${i.user}`, { password: 'Taken-pass-00001', blocked: true }))],
  'DELETE /api/admin/users/:id': [hidden((b, i) => b.del(`/api/admin/users/${i.user}`))],
  'POST /api/admin/users/:id/impersonate': [hidden((b, i) => b.post(`/api/admin/users/${i.user}/impersonate`))],
  'GET /api/admin/generated-password': [hidden((b) => b.get('/api/admin/generated-password'))],
};

/** Routes anyone may call: no user's data behind them. */
const PUBLIC = ['GET /api/health', 'GET /api/version'];

let api: Api;
beforeAll(async () => {
  api = await makeApi();
});
afterAll(async () => {
  await api.app.close();
});

async function recordA(): Promise<Ids> {
  const substance = await api.substance({ name: `${SECRET}-beer`, unit: 'beer', refillQuantity: 6 });
  const batch = await api.batch(substance.id, {
    name: `${SECRET}-batch`,
    quantity: 10,
    totalPrice: 20,
    note: `${SECRET}-note`,
    clientRef: '00000000-0000-4000-8000-00000000000a',
    occurredAt: '2026-09-20T10:00:00Z',
  });
  const consumption = await api.consume(batch.id, {
    quantity: 1,
    note: `${SECRET}-note`,
    clientRef: '00000000-0000-4000-8000-00000000000c',
    occurredAt: '2026-09-21T10:00:00Z',
  });
  const adjustment = await api.adjust(batch.id, { delta: -1, reason: `${SECRET}-reason`, occurredAt: '2026-09-22T10:00:00Z' });
  const oneTime = await api.oneTime(substance.id, { quantity: 1, totalPrice: 3, name: `${SECRET}-bar`, occurredAt: '2026-09-23T10:00:00Z' });
  const viewItem = (await api.post('/api/view-items', { surface: 'substance', metric: 'substance.pace' })).body;
  expect(
    (await api.post('/api/view-items', { surface: 'statistics', metric: 'series.cost', chart: 'bar', scale: 'month', section: `${SECRET}-section` }))
      .status,
  ).toBe(201);
  expect((await api.patch('/api/settings', { currency: 'GBP', timezone: 'Europe/London' })).status).toBe(200);
  return {
    user: await idOf(api.app, TESTER),
    substance: substance.id,
    batch: batch.id,
    consumption: consumption.id,
    adjustment: adjustment.id,
    oneTime: oneTime.id,
    viewItem: viewItem.id,
  };
}

/** Every row of a user's tracking data, as stored. */
async function dataOf(userId: number) {
  return {
    substances: await rawRows('SELECT * FROM substances WHERE user_id = ? ORDER BY id', [userId]),
    batches: await rawRows('SELECT b.* FROM batches b JOIN substances s ON s.id = b.substance_id WHERE s.user_id = ? ORDER BY b.id', [userId]),
    consumptions: await rawRows(
      'SELECT c.* FROM consumptions c JOIN batches b ON b.id = c.batch_id JOIN substances s ON s.id = b.substance_id WHERE s.user_id = ? ORDER BY c.id',
      [userId],
    ),
    adjustments: await rawRows(
      'SELECT a.* FROM adjustments a JOIN batches b ON b.id = a.batch_id JOIN substances s ON s.id = b.substance_id WHERE s.user_id = ? ORDER BY a.id',
      [userId],
    ),
    oneTimes: await rawRows(
      'SELECT o.* FROM one_time_consumptions o JOIN substances s ON s.id = o.substance_id WHERE s.user_id = ? ORDER BY o.id',
      [userId],
    ),
    viewItems: await rawRows('SELECT * FROM view_items WHERE user_id = ? ORDER BY id', [userId]),
    settings: await rawRows('SELECT * FROM settings WHERE user_id = ?', [userId]),
  };
}

/** What two answers must share to be "the same": status, and the problem's type or the whole body. */
function shape(res: Res): unknown {
  if (res.status >= 400) return { status: res.status, type: (res.body as { type?: unknown })?.type };
  return { status: res.status, body: res.body };
}

describe('another user', () => {
  it('every private route of the API has a case here, and every case a route', () => {
    const routes = api.app.apiRoutes.map((r) => `${r.method} ${r.url}`).filter((r) => !r.startsWith('GET /api/auth/') && !r.startsWith('POST /api/auth/'));
    const privateRoutes = routes.filter((r) => !PUBLIC.includes(r));
    expect([...new Set(privateRoutes)].sort()).toEqual(Object.keys(CASES).sort());
  });

  it("finds none of A's things, by any route, and changes none of them", async () => {
    const a = await recordA();
    const aId = await idOf(api.app, TESTER);
    const before = await dataOf(aId);
    const b = api.as(OTHER);

    for (const [route, cases] of Object.entries(CASES)) {
      for (const c of cases) {
        if (c.kind === 'own') {
          const res = await c.call(b);
          expect(res.status, `${route}: ${JSON.stringify(res.body)}`).toBeLessThan(500);
          expect(JSON.stringify(res.body), route).not.toContain(SECRET);
        } else if (c.kind === 'hidden') {
          for (const ids of [a, MISSING]) {
            expect(shape(await c.call(b, ids)), route).toEqual({ status: 404, type: 'urn:substance-tracker:problem:not-found' });
          }
        } else {
          const withA = await c.call(b, a);
          const withMissing = await c.call(b, MISSING);
          expect(shape(withA), route).toEqual(shape(withMissing));
          expect(withA.status, `${route}: ${JSON.stringify(withA.body)}`).toBeGreaterThanOrEqual(400);
          if (!c.echoesInput) expect(JSON.stringify(withA.body), route).not.toContain(SECRET);
        }
      }
    }

    expect(await dataOf(aId)).toEqual(before);
    // A's account too: same role, not blocked, still signed in; and B made nobody
    expect(await rawRows('SELECT username, role, banned FROM users ORDER BY id')).toEqual([
      { username: 'tester', role: 'user', banned: 0 },
      { username: 'other-user', role: 'user', banned: 0 },
    ]);
    expect((await api.get('/api/settings')).status).toBe(200);
    // B's own settings are B's: the defaults, then B's own change
    expect((await b.get('/api/settings')).body).toEqual({ timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'USD' });
  });

  it("a clientRef A used is refused for B (409), never answered with A's row", async () => {
    await recordA();
    const b = api.as(OTHER);
    const substance = await b.substance({ name: 'b-beer', unit: 'beer' });
    const batch = await b.post(`/api/substances/${substance.id}/batches`, {
      quantity: 5,
      totalPrice: 5,
      clientRef: '00000000-0000-4000-8000-00000000000a',
    });
    expect(batch.status, JSON.stringify(batch.body)).toBe(409);
    expect(batch.body.type).toBe('urn:substance-tracker:problem:client-ref-used');
    expect(JSON.stringify(batch.body)).not.toContain(SECRET);

    const own = await b.batch(substance.id, { quantity: 5, totalPrice: 5 });
    const consumption = await b.post(`/api/batches/${own.id}/consumptions`, { quantity: 1, clientRef: '00000000-0000-4000-8000-00000000000c' });
    expect(consumption.status).toBe(409);
    expect(consumption.body.type).toBe('urn:substance-tracker:problem:client-ref-used');
  });
});
