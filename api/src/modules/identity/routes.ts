import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PROBLEM_CONTENT_TYPE, ProblemError, problemBody, statusTitle } from '../../shared/errors.js';
import { CLIENT_IP_HEADER } from './auth.js';
import type { Identity } from './identity.js';

/**
 * The auth endpoints the app uses, answered by Better Auth (design-accounts.md, "Identity as built
 * (1.1)"). Only these: its other endpoints, `/admin/*` above all, would let a client skip the API's
 * rules, and the API's own routes call it from the server instead. Every request that changes
 * something must be JSON and come from the instance's own address: Better Auth checks the origin
 * only when a cookie is present, so a sign-in from another site would pass (login CSRF).
 */

const FORWARDED: ReadonlyArray<{ method: 'GET' | 'POST'; path: string }> = [
  { method: 'POST', path: '/sign-in/username' },
  { method: 'POST', path: '/sign-out' },
  { method: 'GET', path: '/get-session' },
  { method: 'POST', path: '/revoke-other-sessions' },
  { method: 'POST', path: '/admin/stop-impersonating' },
];

/** Hop-by-hop and recomputed headers, and ours, which only this file sets. */
const NOT_FORWARDED = new Set(['host', 'connection', 'keep-alive', 'content-length', 'transfer-encoding', 'upgrade', 'expect', CLIENT_IP_HEADER]);

export interface IdentityRoutesDeps {
  identity: Identity;
  /** The only trusted origin (APP_URL). */
  appUrl: string;
  /** The header the instance's proxy sets to the client's IP; unset, the connection's address. */
  clientIpHeader: string | undefined;
}

/**
 * The client's IP: the last value of the proxy's header (a proxy appends the address it saw, so
 * whatever a client wrote in front of it is never used), else the connection's address.
 */
export function clientIp(request: FastifyRequest, header: string | undefined): string {
  if (header) {
    const raw = request.headers[header];
    const value = Array.isArray(raw) ? raw[raw.length - 1] : raw;
    const last = value
      ?.split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .at(-1);
    if (last) return last;
  }
  return request.ip;
}

function isJson(contentType: string | undefined): boolean {
  return /^application\/json\s*(;|$)/i.test(contentType ?? '');
}

function toFetchRequest(request: FastifyRequest, deps: IdentityRoutesDeps): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || NOT_FORWARDED.has(name)) continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  headers.set(CLIENT_IP_HEADER, clientIp(request, deps.clientIpHeader));
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  return new Request(`${deps.appUrl}${request.url}`, {
    method: request.method,
    headers,
    ...(hasBody ? { body: JSON.stringify(request.body ?? {}) } : {}),
  });
}

async function send(reply: FastifyReply, response: Response): Promise<FastifyReply> {
  reply.code(response.status);
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) reply.header('set-cookie', cookies);
  const retryAfter = response.headers.get('x-retry-after');
  if (retryAfter) reply.header('retry-after', retryAfter);
  const text = await response.text();
  if (response.status >= 400) {
    let parsed: { code?: unknown; message?: unknown } = {};
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      // not JSON: the status says enough
    }
    const code =
      typeof parsed.code === 'string'
        ? parsed.code.toLowerCase().replace(/_/g, '-')
        : response.status === 429
          ? 'too-many-requests'
          : null;
    const detail = typeof parsed.message === 'string' ? parsed.message : statusTitle(response.status);
    return reply.type(PROBLEM_CONTENT_TYPE).send(problemBody(response.status, code, detail));
  }
  reply.type(response.headers.get('content-type') ?? 'application/json; charset=utf-8');
  return reply.send(text);
}

export function identityRoutes(app: FastifyInstance, deps: IdentityRoutesDeps): void {
  for (const { method, path } of FORWARDED) {
    app.route({
      method,
      url: `/api/auth${path}`,
      handler: async (request, reply) => {
        if (method !== 'GET') {
          if (request.headers.origin !== deps.appUrl) {
            throw new ProblemError(403, 'origin', 'This request must come from the app itself');
          }
          if (!isJson(request.headers['content-type'])) {
            throw new ProblemError(415, 'media-type', 'The body must be JSON');
          }
        }
        return send(reply, await deps.identity.handle(toFetchRequest(request, deps)));
      },
    });
  }
}
