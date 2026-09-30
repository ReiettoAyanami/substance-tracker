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

describe('POST /api/substances', () => {
  it('creates a substance and returns it with an empty card summary', async () => {
    const res = await api.post('/api/substances', {
      name: '  Marlboro Gold ',
      unit: 'cigarette',
      refillQuantity: 20,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Marlboro Gold',
      unit: 'cigarette',
      refillQuantity: '20.000',
      archived: false,
      archivedAt: null,
    });
    // a substance stores no price: its unit price is computed from its batches (summary)
    expect(res.body).not.toHaveProperty('defaultUnitPrice');
    expect(res.body.id).toBeTypeOf('number');
    expect(res.body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(res.body.summary).toEqual({
      stock: '0.000',
      stockBarMax: '0.000',
      stockBarSegments: [],
      peakStock: '0.000',
      lastBatch: null,
      avgUnitPrice: null,
      lastConsumption: null,
      avgQuantityPerConsumption: null,
      avgPricePerConsumption: null,
      spendThisMonth: '0.00',
    });
  });

  it('refuses invalid input with a 400 problem', async () => {
    expectProblem(await api.post('/api/substances', { unit: 'g' }), 400, 'validation');
    expectProblem(await api.post('/api/substances', { name: 'x', unit: 'g', colour: 'red' }), 400, 'validation');
    expectProblem(await api.post('/api/substances', { name: '   ', unit: 'g' }), 400, 'validation');
    expectProblem(await api.post('/api/substances', { name: 'x', unit: 'g', refillQuantity: 0 }), 400);
    expectProblem(await api.post('/api/substances', { name: 'x', unit: 'g', refillQuantity: '1.2345' }), 400);
    expectProblem(await api.post('/api/substances', { name: 'x', unit: 'g', refillQuantity: 'six' }), 400);
    expectProblem(await api.post('/api/substances', { name: 'x', unit: 'g', defaultUnitPrice: '1' }), 400, 'validation');
    expectProblem(await api.post('/api/substances', { name: 'x', unit: 'a-very-long-unit-label-over-20' }), 400);
    const res = await api.post('/api/substances', { unit: 'g' });
    expect(res.body.errors[0]).toMatchObject({ field: 'name' });
  });

  it('allows two substances with the same name (only id identifies a row)', async () => {
    const a = await api.substance({ name: 'beer' });
    const b = await api.substance({ name: 'beer' });
    expect(a.id).not.toBe(b.id);
  });
});

describe('GET /api/substances', () => {
  it('lists active substances; archived only with ?archived=true; never deleted ones', async () => {
    const active = await api.substance({ name: 'a-active' });
    const archived = await api.substance({ name: 'b-archived' });
    const deleted = await api.substance({ name: 'c-deleted' });
    expect((await api.patch(`/api/substances/${archived.id}`, { archived: true })).status).toBe(200);
    expect((await api.del(`/api/substances/${deleted.id}`)).status).toBe(204);

    const list = await api.get('/api/substances');
    expect(list.status).toBe(200);
    expect(list.body.map((s: any) => s.id)).toEqual([active.id]);
    expect(list.body[0].summary).toBeDefined();

    const all = await api.get('/api/substances?archived=true');
    expect(all.body.map((s: any) => s.id)).toEqual([active.id, archived.id]);
  });

  it('?q= finds by name only: the substance\'s, or one of its batches\', finished ones too; case and accents ignored', async () => {
    const coffee = await api.substance({ name: 'Caffè', unit: 'capsula' });
    const beer = await api.substance({ name: 'Birra', unit: 'bottiglia' });
    const weed = await api.substance({ name: 'Erba', unit: 'g' });
    await api.batch(beer.id, { name: 'Peroni 6-pack', quantity: 6, totalPrice: 6 });
    const finished = await api.batch(weed.id, { name: 'Amnesia Haze', quantity: 1, totalPrice: 10 });
    await api.consume(finished.id, { quantity: 1 }); // finishes it
    const deleted = await api.batch(coffee.id, { name: 'Lavazza', quantity: 10, totalPrice: 3 });
    expect((await api.del(`/api/batches/${deleted.id}`)).status).toBe(204);
    await api.oneTime(coffee.id, { name: 'Bar Peroni', quantity: 1, totalPrice: 1 }); // a one-time name is not searched
    const ids = async (query: string) => (await api.get(`/api/substances?${query}`)).body.map((s: any) => s.id);

    expect(await ids('q=caffe')).toEqual([coffee.id]); // no accent, other case
    expect(await ids('q=IRR')).toEqual([beer.id]); // anywhere in the name
    expect(await ids('q=peroni')).toEqual([beer.id]); // by a batch of it, not by the one-time consumption of the coffee
    expect(await ids('q=amnesia')).toEqual([weed.id]); // a finished batch still counts
    expect(await ids('q=lavazza')).toEqual([]); // a deleted batch counts nowhere
    expect(await ids('q=r')).toEqual([beer.id, weed.id]); // Birra, Erba: in the order of the list (name, then id)
    expect(await ids('q=zzz')).toEqual([]);
    expect((await api.get('/api/substances?q=peroni')).body[0].summary).toBeDefined();
  });

  it('?q= takes the text as it is: blanks around it dropped, an empty one ignored, % and _ not wildcards; archived as asked', async () => {
    const plain = await api.substance({ name: 'Te verde' });
    const odd = await api.substance({ name: '100% agave_anejo' });
    const archived = await api.substance({ name: 'Te nero' });
    expect((await api.patch(`/api/substances/${archived.id}`, { archived: true })).status).toBe(200);
    const ids = async (query: string) => (await api.get(`/api/substances?${query}`)).body.map((s: any) => s.id);

    expect(await ids('q=')).toEqual([odd.id, plain.id]);
    expect(await ids('q=%20%20')).toEqual([odd.id, plain.id]);
    expect(await ids(`q=${encodeURIComponent('  verde ')}`)).toEqual([plain.id]);
    expect(await ids(`q=${encodeURIComponent('%')}`)).toEqual([odd.id]);
    expect(await ids(`q=${encodeURIComponent('e_a')}`)).toEqual([odd.id]); // "agave_anejo", not "Te verde"
    expect(await ids('q=te')).toEqual([plain.id]);
    expect(await ids('q=te&archived=true')).toEqual([archived.id, plain.id]);
    expectProblem(await api.get(`/api/substances?q=${'x'.repeat(101)}`), 400, 'validation');
  });

  it('GET /api/substances/:id returns archived substances and 404s missing or deleted ones', async () => {
    const s = await api.substance();
    await api.patch(`/api/substances/${s.id}`, { archived: true });
    expect((await api.get(`/api/substances/${s.id}`)).body.archived).toBe(true);
    expectProblem(await api.get('/api/substances/999999'), 404, 'not-found');
    expectProblem(await api.get('/api/substances/abc'), 400, 'validation');
  });
});

describe('PATCH /api/substances/:id', () => {
  it('renames, changes the refill, archives and unarchives', async () => {
    const s = await api.substance({ refillQuantity: 6 });
    const renamed = await api.patch(`/api/substances/${s.id}`, {
      name: 'Peroni',
      unit: 'bottle',
      refillQuantity: null,
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({
      name: 'Peroni',
      unit: 'bottle',
      refillQuantity: null,
    });
    expectProblem(await api.patch(`/api/substances/${s.id}`, { defaultUnitPrice: '1.25' }), 400, 'validation');

    const archived = await api.patch(`/api/substances/${s.id}`, { archived: true });
    expect(archived.body.archived).toBe(true);
    expect(archived.body.archivedAt).toBe('2026-09-29T10:00:00Z');
    const [row] = await rawRows('SELECT archived_at FROM substances WHERE id = ?', [s.id]);
    expect(row?.archived_at).toBeInstanceOf(Date);

    const unarchived = await api.patch(`/api/substances/${s.id}`, { archived: false });
    expect(unarchived.body.archived).toBe(false);
    expect(unarchived.body.archivedAt).toBeNull();
  });

  it('refuses an empty patch and unknown substances', async () => {
    const s = await api.substance();
    expectProblem(await api.patch(`/api/substances/${s.id}`, {}), 400);
    expectProblem(await api.patch('/api/substances/424242', { name: 'x' }), 404);
  });
});

describe('DELETE /api/substances/:id', () => {
  it('soft-deletes: the row stays in the table with deleted_at', async () => {
    const s = await api.substance();
    expect((await api.del(`/api/substances/${s.id}`)).status).toBe(204);
    const rows = await rawRows('SELECT id, deleted_at FROM substances WHERE id = ?', [s.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deleted_at).toBeInstanceOf(Date);
    expectProblem(await api.get(`/api/substances/${s.id}`), 404);
    expectProblem(await api.patch(`/api/substances/${s.id}`, { name: 'x' }), 404);
    expectProblem(await api.del(`/api/substances/${s.id}`), 404);
  });

  it('also soft-deletes its batches, their consumptions and adjustments, and its one-time consumptions', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 6, totalPrice: 6 });
    const c = await api.consume(b.id, { quantity: 1 });
    const a = await api.adjust(b.id, { delta: -1, reason: 'spilled' });
    const o = await api.oneTime(s.id, { quantity: 1, totalPrice: 5 });
    const other = await api.substance();
    const kept = await api.batch(other.id, { quantity: 2, totalPrice: 2 });

    expect((await api.del(`/api/substances/${s.id}`)).status).toBe(204);

    const deletedAt = async (table: string, id: number) =>
      (await rawRows(`SELECT deleted_at FROM ${table} WHERE id = ?`, [id]))[0]?.deleted_at;
    const at = await deletedAt('substances', s.id);
    expect(at).toBeInstanceOf(Date);
    // the rows stay, all deleted at the same instant as the substance
    expect(await deletedAt('batches', b.id)).toEqual(at);
    expect(await deletedAt('consumptions', c.id)).toEqual(at);
    expect(await deletedAt('adjustments', a.id)).toEqual(at);
    expect(await deletedAt('one_time_consumptions', o.id)).toEqual(at);
    expect(await deletedAt('batches', kept.id)).toBeNull();
    expectProblem(await api.get(`/api/batches/${b.id}`), 404);
  });
});

describe('movements on archived or deleted substances', () => {
  it('archived -> 409 for every new movement; deleted -> 404', async () => {
    const s = await api.substance();
    const b = await api.batch(s.id, { quantity: 10, totalPrice: 10 });
    await api.patch(`/api/substances/${s.id}`, { archived: true });

    expectProblem(await api.post(`/api/substances/${s.id}/batches`, { quantity: 1, totalPrice: 1 }), 409, 'substance-archived');
    expectProblem(await api.post(`/api/batches/${b.id}/consumptions`, { quantity: 1 }), 409, 'substance-archived');
    expectProblem(await api.post(`/api/batches/${b.id}/adjustments`, { delta: -1, reason: 'spilled' }), 409, 'substance-archived');
    expectProblem(
      await api.post(`/api/substances/${s.id}/one-time-consumptions`, { quantity: 1, totalPrice: 2 }),
      409,
      'substance-archived',
    );

    const other = await api.substance();
    await api.del(`/api/substances/${other.id}`);
    expectProblem(await api.post(`/api/substances/${other.id}/batches`, { quantity: 1, totalPrice: 1 }), 404);
    expectProblem(await api.post(`/api/substances/${other.id}/one-time-consumptions`, { quantity: 1, totalPrice: 1 }), 404);
  });
});
