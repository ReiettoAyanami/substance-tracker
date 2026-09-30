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

const list = async (surface: string) => (await api.get(`/api/view-items?surface=${surface}`)).body;
const add = (body: Record<string, unknown>) => api.post('/api/view-items', body);
const metricsOf = (items: any[]) => items.map((i) => i.metric);

describe('view items (what each page shows)', () => {
  it('adds a metric at the end of its surface, and lists the surface in order', async () => {
    const first = await add({ surface: 'substance', metric: 'substance.pace' });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body).toEqual({
      id: expect.any(Number),
      surface: 'substance',
      section: null,
      position: 1,
      metric: 'substance.pace',
      chart: null,
      scale: null,
      createdAt: '2026-09-29T10:00:00Z',
    });
    await add({ surface: 'substance', metric: 'substance.cost' });
    await add({ surface: 'batch', metric: 'batch.used' });

    expect(metricsOf(await list('substance'))).toEqual(['substance.pace', 'substance.cost']);
    expect((await list('substance')).map((i: any) => i.position)).toEqual([1, 2]);
    expect(metricsOf(await list('batch'))).toEqual(['batch.used']);
    expect(await list('consumption')).toEqual([]);
  });

  it('a panel lists metrics of its own entity; the metrics page those of every entity', async () => {
    expect((await add({ surface: 'batch', metric: 'batch.pace' })).status).toBe(201);
    expect((await add({ surface: 'consumption', metric: 'consumption.rankInDay' })).status).toBe(201);
    expect((await add({ surface: 'metrics', metric: 'substance.pace' })).status).toBe(201);
    expect((await add({ surface: 'metrics', metric: 'batch.used' })).status).toBe(201);
    expect((await add({ surface: 'metrics', metric: 'consumption.deltaCost' })).status).toBe(201);

    expectProblem(await add({ surface: 'substance', metric: 'batch.used' }), 400, 'validation');
    expectProblem(await add({ surface: 'batch', metric: 'substance.pace' }), 400, 'validation');
    expectProblem(await add({ surface: 'substance', metric: 'substance.nothing' }), 400, 'validation');
  });

  it('a panel or the metrics page has a metric once; section, chart and scale are for the statistics page', async () => {
    await add({ surface: 'substance', metric: 'substance.pace' });
    expectProblem(await add({ surface: 'substance', metric: 'substance.pace' }), 409, 'duplicate');
    await add({ surface: 'metrics', metric: 'substance.pace' }); // another surface: fine

    expectProblem(await add({ surface: 'substance', metric: 'substance.cost', chart: 'bar' }), 400, 'validation');
    expectProblem(await add({ surface: 'substance', metric: 'substance.cost', scale: 'week' }), 400, 'validation');
    expectProblem(await add({ surface: 'substance', metric: 'substance.cost', section: 'Money' }), 400, 'validation');
  });

  it('validates the body and the surface', async () => {
    expectProblem(await add({ surface: 'kitchen', metric: 'substance.pace' }), 400, 'validation');
    expectProblem(await add({ surface: 'substance' }), 400, 'validation');
    expectProblem(await add({ surface: 'substance', metric: 'substance.pace', color: 'red' }), 400, 'validation');
    expectProblem(await api.get('/api/view-items'), 400, 'validation');
    expectProblem(await api.get('/api/view-items?surface=kitchen'), 400, 'validation');
  });

  it('removing one is a soft delete: it leaves the list, stays in the table, and can be added again', async () => {
    const pace = (await add({ surface: 'substance', metric: 'substance.pace' })).body;
    await add({ surface: 'substance', metric: 'substance.cost' });

    const res = await api.del(`/api/view-items/${pace.id}`);
    expect(res.status).toBe(204);
    expect(metricsOf(await list('substance'))).toEqual(['substance.cost']);
    const [row] = await rawRows('SELECT deleted_at FROM view_items WHERE id = ?', [pace.id]);
    expect(row?.deleted_at).toBeInstanceOf(Date);

    expectProblem(await api.del(`/api/view-items/${pace.id}`), 404, 'not-found');
    expectProblem(await api.del('/api/view-items/999999'), 404, 'not-found');
    const again = await add({ surface: 'substance', metric: 'substance.pace' });
    expect(again.status).toBe(201);
    expect(again.body.position).toBe(3);
  });

  it('puts a surface in a new order: every item of it, each once', async () => {
    const ids = [];
    for (const metric of ['substance.pace', 'substance.cost', 'substance.spend']) {
      ids.push((await add({ surface: 'substance', metric })).body.id);
    }
    const other = (await add({ surface: 'batch', metric: 'batch.used' })).body.id;

    const res = await api.put('/api/view-items/order', { surface: 'substance', ids: [ids[2], ids[0], ids[1]] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(metricsOf(res.body)).toEqual(['substance.spend', 'substance.pace', 'substance.cost']);
    expect(res.body.map((i: any) => i.position)).toEqual([1, 2, 3]);
    expect(metricsOf(await list('substance'))).toEqual(['substance.spend', 'substance.pace', 'substance.cost']);

    const order = (surface: string, list: unknown[]) => api.put('/api/view-items/order', { surface, ids: list });
    expectProblem(await order('substance', [ids[0], ids[1]]), 400, 'validation'); // one missing
    expectProblem(await order('substance', [ids[0], ids[1], ids[2], other]), 400, 'validation'); // another surface's
    expectProblem(await order('substance', [ids[0], ids[0], ids[1], ids[2]]), 400, 'validation'); // twice
    expectProblem(await order('substance', [ids[0], ids[1], 999999]), 400, 'validation');
  });
});
