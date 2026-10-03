import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_ITEMS } from '../../src/modules/accounts/defaults.js';
import { METRICS, SERIES } from '../../src/modules/metrics/catalog.js';
import { ownerOf } from '../../src/shared/owner.js';
import { makeApi, type Api } from '../support/api.js';
import { rawRows } from '../support/db.js';

let api: Api;
beforeAll(async () => {
  api = await makeApi();
});
afterAll(async () => {
  await api.app.close();
});

describe('a new user is ready to use', () => {
  it('the first administrator: credentials, the default settings, the default layout', async () => {
    const id = await api.app.accounts.createUser(
      { username: 'lenzi', email: 'lenzi@dev.invalid', password: 'Lenzi-pass-0001', role: 'admin' },
      null,
    );
    expect(await rawRows('SELECT username, role FROM users WHERE id = ?', [id])).toEqual([{ username: 'lenzi', role: 'admin' }]);
    expect(await rawRows('SELECT timezone, day_starts_at, currency FROM settings WHERE user_id = ?', [id])).toEqual([
      { timezone: 'Europe/Rome', day_starts_at: '00:00:00', currency: 'EUR' },
    ]);
    const layout = await rawRows(
      'SELECT surface, section, position, metric, chart, scale FROM view_items WHERE user_id = ? ORDER BY id',
      [id],
    );
    expect(layout).toEqual(DEFAULT_VIEW_ITEMS.map((i) => ({ ...i })));
  });

  it("another user gets the settings of the administrator who creates it, and a layout of its own", async () => {
    const adminId = await api.app.accounts.createUser(
      { username: 'boss', email: 'boss@dev.invalid', password: 'Boss-pass-000001', role: 'admin' },
      null,
    );
    await rawRows("UPDATE settings SET timezone = 'Europe/London', day_starts_at = '05:00:00', currency = 'GBP' WHERE user_id = ?", [
      adminId,
    ]);
    const id = await api.app.accounts.createUser(
      { username: 'friend', email: 'friend@dev.invalid', password: 'Friend-pass-0001', role: 'user' },
      ownerOf(adminId),
    );
    expect(await rawRows('SELECT timezone, day_starts_at, currency FROM settings WHERE user_id = ?', [id])).toEqual([
      { timezone: 'Europe/London', day_starts_at: '05:00:00', currency: 'GBP' },
    ]);
    const counts = await rawRows('SELECT user_id, COUNT(*) AS n FROM view_items GROUP BY user_id ORDER BY user_id');
    expect(counts).toEqual([
      { user_id: adminId, n: DEFAULT_VIEW_ITEMS.length },
      { user_id: id, n: DEFAULT_VIEW_ITEMS.length },
    ]);
  });

  it('when the user cannot be created, nothing of it is left', async () => {
    await api.app.accounts.createUser({ username: 'taken', email: 'taken@dev.invalid', password: 'Taken-pass-00001', role: 'user' }, null);
    await expect(
      api.app.accounts.createUser({ username: 'taken', email: 'other@dev.invalid', password: 'Taken-pass-00001', role: 'user' }, null),
    ).rejects.toMatchObject({ status: 409 });
    expect(await rawRows('SELECT COUNT(*) AS n FROM users')).toEqual([{ n: 1 }]);
    expect(await rawRows('SELECT COUNT(*) AS n FROM settings')).toEqual([{ n: 1 }]);
  });
});

// What the migrations 003-006 put in once for everybody, now code copied for each new user.
describe('the default layout', () => {
  const of = (surface: string) => DEFAULT_VIEW_ITEMS.filter((i) => i.surface === surface);
  const keys = (scope: string) => METRICS.filter((m) => m.scope === scope).map((m) => m.key);

  it('every panel: every metric of its entity, in the catalog order; the metrics page: a few columns per table', () => {
    expect(of('substance').filter((i) => i.chart === null).map((i) => i.metric)).toEqual(keys('substance'));
    expect(of('batch').map((i) => i.metric)).toEqual(keys('batch'));
    expect(of('consumption').map((i) => i.metric)).toEqual(keys('consumption'));
    expect(of('metrics').map((i) => i.metric)).toEqual([
      'substance.consumed',
      'substance.pace',
      'substance.cost',
      'substance.spend',
      'substance.sinceLast',
      'substance.stockTime',
      'batch.used',
      'batch.unitPriceVsAverage',
      'batch.pace',
      'batch.timeToFinish',
      'batch.valueConsumed',
      'consumption.deltaQuantity',
      'consumption.quantityVsSubstanceAverage',
      'consumption.unitPriceVsBatches',
      'consumption.sincePrevious',
      'consumption.rankInDay',
    ]);
    for (const surface of ['substance', 'batch', 'consumption', 'metrics', 'statistics', 'substances']) {
      expect(of(surface).map((i) => i.position)).toEqual(of(surface).map((_, index) => index + 1));
    }
  });

  it('the substance page: its chart after its metrics', () => {
    const charts = of('substance').filter((i) => i.chart !== null);
    expect(charts.map((i) => [i.position, i.metric, i.chart, i.scale, i.section])).toEqual([
      [of('substance').length, 'series.consumed', 'bar', 'week', null],
    ]);
  });

  it('the statistics and substances pages: charts in sections, each a series it can draw', () => {
    expect(of('statistics').map((i) => [i.section, i.metric, i.chart, i.scale])).toEqual([
      ['Consumption', 'series.consumed', 'line', 'week'],
      ['Consumption', 'series.consumptions', 'bar', 'week'],
      ['Money', 'series.cost', 'bar', 'month'],
      ['Money', 'series.cost', 'donut', 'month'],
      ['Money', 'series.spend', 'bar', 'month'],
      ['Prices', 'series.unitPrice', 'line', 'month'],
      ['Habits', 'series.hourOfDay', 'bar', null],
    ]);
    expect(of('substances').map((i) => [i.metric, i.chart, i.scale, i.section])).toEqual([
      ['series.consumed', 'bar', 'week', null],
      ['series.spend', 'bar', 'month', null],
      ['series.cost', 'donut', 'month', null],
    ]);
    for (const item of DEFAULT_VIEW_ITEMS.filter((i) => i.chart !== null)) {
      const series = SERIES.find((s) => s.key === item.metric);
      expect(series, item.metric).toBeDefined();
      expect(series!.charts).toContain(item.chart);
      const scales: readonly string[] = series!.scales;
      expect(item.scale === null ? scales.length === 0 : scales.includes(item.scale)).toBe(true);
    }
  });
});
