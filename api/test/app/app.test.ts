import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createPool } from '../../src/db/pool.js';
import { Api, expectProblem, fixedClock, makeApi } from '../support/api.js';
import { testDbConfig } from '../support/db.js';
import { VERSION, VERSION_FORMAT } from '../../src/version.js';

let api: Api;
beforeAll(async () => {
  api = await makeApi();
});
afterAll(async () => {
  await api.app.close();
});

describe('GET /api/health', () => {
  it('200 when the database answers', async () => {
    const res = await api.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
  });

  it('503 problem when it does not', async () => {
    const deadPool = createPool({ ...testDbConfig(), host: '127.0.0.1', port: 1 });
    const app = await buildApp({ pool: deadPool, clock: fixedClock });
    try {
      const res = await new Api(app).get('/api/health');
      expectProblem(res, 503, 'database-unavailable');
      expect(res.body.db).toBe('error');
    } finally {
      await app.close();
      await deadPool.end();
    }
  });
});

describe('GET /api/version', () => {
  it('the product version, in the agreed format', async () => {
    const res = await api.get('/api/version');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ version: VERSION });
    expect(VERSION).toMatch(VERSION_FORMAT);
  });

  it('the format: dev may carry a short text, final versions are numbers only', () => {
    for (const ok of ['dev26.0.0', 'dev26.12.3', 'dev26.0.1-squircle', 'dev26.0.1-new-login', 'a26.0.0', 'b26.1.2', 'v27.3.10']) {
      expect(ok).toMatch(VERSION_FORMAT);
    }
    for (const bad of ['26.0.0', 'dev26.0', 'a26.0.1-test', 'v26.x.0', 'dev2026.0.0', 'dev26.0.0-', 'rc26.0.0']) {
      expect(bad).not.toMatch(VERSION_FORMAT);
    }
  });
});

describe('Problem Details', () => {
  it('unknown /api routes are a 404 problem', async () => {
    expectProblem(await api.get('/api/nope'), 404, 'not-found');
    expectProblem(await api.post('/api/substances/1/nothing', {}), 404, 'not-found');
    expectProblem(await api.get('/api'), 404, 'not-found');
  });

  it('without a web build, non-API paths are a 404 problem too', async () => {
    expectProblem(await api.get('/'), 404);
    expectProblem(await api.get('/some/deep/route'), 404);
  });

  it('validation errors list the fields', async () => {
    const res = await api.post('/api/substances', { name: 'x', unit: 'g', refillQuantity: 'lots' });
    expectProblem(res, 400, 'validation');
    expect(res.body.errors).toEqual([{ field: 'refillQuantity', message: expect.any(String) }]);
  });

  it('malformed JSON is a 400 problem', async () => {
    const res = await api.app.inject({
      method: 'POST',
      url: '/api/substances',
      headers: { 'content-type': 'application/json' },
      payload: '{"name": ',
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('an unsupported media type is a 415 problem', async () => {
    const res = await api.app.inject({
      method: 'POST',
      url: '/api/substances',
      headers: { 'content-type': 'application/xml' },
      payload: '<substance/>',
    });
    expect(res.statusCode).toBe(415);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });
});

describe('static files and SPA fallback (WEB_DIST)', () => {
  let dir: string;
  let web: Api;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'st-web-'));
    await writeFile(join(dir, 'index.html'), '<!doctype html><html><body><app-root></app-root></body></html>');
    await mkdir(join(dir, 'assets'));
    await writeFile(join(dir, 'assets', 'main.js'), 'console.log("hi");');
    web = await makeApi({ webDist: dir });
  });
  afterAll(async () => {
    await web.app.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('serves index.html at / and for deep client routes', async () => {
    for (const url of ['/', '/some/deep/route', '/substances/12?tab=history']) {
      const res = await web.get(url);
      expect(res.status, url).toBe(200);
      expect(String(res.headers['content-type'])).toContain('text/html');
      expect(res.body).toContain('<app-root>');
    }
  });

  it('serves real static files', async () => {
    const res = await web.get('/assets/main.js');
    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toContain('javascript');
    expect(res.body).toBe('console.log("hi");');
  });

  it('keeps /api/* as JSON: routes work, unknown ones are 404 problems', async () => {
    expect((await web.get('/api/health')).body).toEqual({ status: 'ok', db: 'ok' });
    expectProblem(await web.get('/api/does-not-exist'), 404, 'not-found');
  });

  it('only GET/HEAD fall back to index.html', async () => {
    expectProblem(await web.post('/some/deep/route', {}), 404);
    const head = await web.req('HEAD', '/some/deep/route');
    expect(head.status).toBe(200);
  });
});
