import type { IncomingHttpHeaders } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { ProblemError } from '../../shared/errors.js';
import { ownerOf, type Owner } from '../../shared/owner.js';
import type { Identity, RequestUser } from './identity.js';

/**
 * The request's user (design-accounts.md, "The request's user"): every /api request, except the
 * sign-in endpoints, the health check and the version, needs a session; none, 401. The user and its
 * owner go on the request, and the domain works for that owner only. While an administrator
 * impersonates a user, every write is logged (lenzi, 2026-10-02: "si ma salva nei log"); its start
 * and end are logged where they happen (the admin routes).
 */

declare module 'fastify' {
  interface FastifyRequest {
    /** Who is asking; null only on the public routes. */
    user: RequestUser | null;
    /** Whose tracking data the request works on: always the session's user. */
    owner: Owner;
  }
}

const PUBLIC = new Set(['/api/health', '/api/version']);
const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function toHeaders(incoming: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  return headers;
}

function pathOf(url: string): string {
  return url.split('?')[0] ?? url;
}

function isPrivateApi(path: string): boolean {
  if (path !== '/api' && !path.startsWith('/api/')) return false;
  return !PUBLIC.has(path) && !path.startsWith('/api/auth/');
}

export function requestUserHook(app: FastifyInstance, identity: Identity): void {
  app.decorateRequest('user', null);
  app.decorateRequest('owner', null as unknown as Owner);

  app.addHook('onRequest', async (request) => {
    if (!isPrivateApi(pathOf(request.url))) return;
    const user = await identity.userOf(toHeaders(request.headers));
    if (!user) throw new ProblemError(401, 'unauthenticated', 'Sign in to use the app');
    request.user = user;
    request.owner = ownerOf(user.userId);
  });

  app.addHook('onResponse', async (request, reply) => {
    const user = request.user;
    if (!user?.impersonatedBy || !WRITES.has(request.method)) return;
    request.log.info(
      {
        impersonation: {
          by: user.impersonatedBy,
          as: user.userId,
          username: user.username,
          method: request.method,
          path: pathOf(request.url),
          status: reply.statusCode,
        },
      },
      'write while impersonating',
    );
  });
}
