import type { FastifyInstance } from 'fastify';
import { expect } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { Clock } from '../../src/shared/time.js';
import { testPool } from './db.js';

/** Fixed "now" for the tests: 2026-09-29 12:00 in Rome. */
export const NOW = new Date('2026-09-29T10:00:00Z');
export const fixedClock: Clock = () => new Date(NOW.getTime());

export interface Res<T = any> {
  status: number;
  body: T;
  headers: Record<string, unknown>;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'HEAD';

/** Thin HTTP client over app.inject(), plus helpers to build a ledger quickly. */
export class Api {
  constructor(readonly app: FastifyInstance) {}

  async req<T = any>(method: Method, url: string, payload?: unknown): Promise<Res<T>> {
    const res = await this.app.inject({
      method,
      url,
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    const type = String(res.headers['content-type'] ?? '');
    const body = res.body && type.includes('json') ? res.json() : res.body;
    return { status: res.statusCode, body: body as T, headers: res.headers };
  }

  get<T = any>(url: string) {
    return this.req<T>('GET', url);
  }
  post<T = any>(url: string, payload: unknown = {}) {
    return this.req<T>('POST', url, payload);
  }
  patch<T = any>(url: string, payload: unknown) {
    return this.req<T>('PATCH', url, payload);
  }
  del<T = any>(url: string) {
    return this.req<T>('DELETE', url);
  }

  /** POST that must succeed with 201; returns the body. */
  async created(url: string, payload: unknown): Promise<any> {
    const res = await this.post(url, payload);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body;
  }

  substance(input: Record<string, unknown> = {}) {
    return this.created('/api/substances', { name: 'beer', unit: 'beer', ...input });
  }
  batch(substanceId: number, input: Record<string, unknown>) {
    return this.created(`/api/substances/${substanceId}/batches`, input);
  }
  consume(batchId: number, input: Record<string, unknown>) {
    return this.created(`/api/batches/${batchId}/consumptions`, input);
  }
  adjust(batchId: number, input: Record<string, unknown>) {
    return this.created(`/api/batches/${batchId}/adjustments`, input);
  }
  oneTime(substanceId: number, input: Record<string, unknown>) {
    return this.created(`/api/substances/${substanceId}/one-time-consumptions`, input);
  }
}

export async function makeApi(opts: { clock?: Clock; webDist?: string } = {}): Promise<Api> {
  const app = await buildApp({ pool: testPool(), clock: opts.clock ?? fixedClock, webDist: opts.webDist });
  await app.ready();
  return new Api(app);
}

/** Asserts a Problem Details response. */
export function expectProblem(res: Res, status: number, code?: string): void {
  expect(res.status, JSON.stringify(res.body)).toBe(status);
  expect(String(res.headers['content-type'])).toContain('application/problem+json');
  expect(res.body.status).toBe(status);
  expect(typeof res.body.title).toBe('string');
  expect(typeof res.body.detail).toBe('string');
  expect(Array.isArray(res.body.errors)).toBe(true);
  if (code) expect(res.body.type).toBe(`urn:substance-tracker:problem:${code}`);
}
