import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyServerOptions } from 'fastify';
import { loadConfig } from './config.js';
import { createPool, pingDatabase, type Pool } from './db/pool.js';
import { catalogRoutes } from './modules/catalog/routes.js';
import { CatalogService } from './modules/catalog/service.js';
import { ledgerRoutes } from './modules/ledger/routes.js';
import { metricsRoutes } from './modules/metrics/routes.js';
import { MetricsService } from './modules/metrics/service.js';
import { LedgerService } from './modules/ledger/service.js';
import { reportsRoutes } from './modules/reports/routes.js';
import { ReportsService } from './modules/reports/service.js';
import { settingsRoutes } from './modules/settings/routes.js';
import { SettingsService } from './modules/settings/service.js';
import { viewsRoutes } from './modules/views/routes.js';
import { ViewsService } from './modules/views/service.js';
import {
  PROBLEM_CONTENT_TYPE,
  ProblemError,
  problemBody,
  type ProblemBody,
  type ProblemFieldError,
} from './shared/errors.js';
import { systemClock, type Clock } from './shared/time.js';

export interface BuildAppOptions {
  /** mysql2 pool. When omitted, one is created from the environment and closed with the app. */
  pool?: Pool;
  /** Fastify logger options (false in tests). */
  logger?: FastifyServerOptions['logger'];
  /** Folder with the Angular build: serves its files and falls back to index.html. */
  webDist?: string | undefined;
  /** Source of "now" (tests pin it). */
  clock?: Clock;
}

function sendProblem(reply: FastifyReply, body: ProblemBody): FastifyReply {
  return reply.code(body.status).type(PROBLEM_CONTENT_TYPE).send(body);
}

function validationErrors(err: FastifyError): ProblemFieldError[] {
  return (err.validation ?? []).map((v) => {
    const path = (v.instancePath ?? '').replace(/^\//, '').replace(/\//g, '.');
    const missing = (v.params as { missingProperty?: unknown } | undefined)?.missingProperty;
    const additional = (v.params as { additionalProperty?: unknown } | undefined)?.additionalProperty;
    const field =
      [path, typeof missing === 'string' ? missing : '', typeof additional === 'string' ? additional : '']
        .filter(Boolean)
        .join('.') || (err.validationContext ?? '');
    return { field, message: v.message ?? 'is invalid' };
  });
}

function isApiPath(url: string): boolean {
  const path = url.split('?')[0] ?? '';
  return path === '/api' || path.startsWith('/api/');
}

/** Builds the Fastify instance with every module registered. Used by server.ts and by tests. */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const ownsPool = opts.pool === undefined;
  const pool = opts.pool ?? createPool(loadConfig().db);
  const clock = opts.clock ?? systemClock;

  const app = Fastify({
    logger: opts.logger ?? false,
    ajv: {
      customOptions: {
        // Unknown fields are a 400, not silently dropped.
        removeAdditional: false,
        // Decimal inputs are "string or number".
        allowUnionTypes: true,
      },
    },
  });
  if (ownsPool) {
    app.addHook('onClose', async () => {
      await pool.end();
    });
  }

  // Every error leaves as Problem Details.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ProblemError) return sendProblem(reply, error.toBody());
    if (error.validation) {
      return sendProblem(reply, problemBody(400, 'validation', error.message, validationErrors(error)));
    }
    const status = typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (status >= 400 && status < 500) return sendProblem(reply, problemBody(status, null, error.message));
    request.log.error({ err: error }, 'unhandled error');
    return sendProblem(reply, problemBody(500, null, 'An unexpected error occurred'));
  });

  // Unknown /api/* -> 404 problem. Anything else: index.html when a web build is served.
  app.setNotFoundHandler((request, reply) => {
    if (opts.webDist && !isApiPath(request.url) && (request.method === 'GET' || request.method === 'HEAD')) {
      return reply.sendFile('index.html');
    }
    const path = request.url.split('?')[0] ?? request.url;
    return sendProblem(reply, problemBody(404, 'not-found', `No route for ${request.method} ${path}`));
  });

  const settings = new SettingsService(pool);
  const catalog = new CatalogService(pool, clock);
  const reports = new ReportsService(pool, catalog, settings, clock);
  const ledger = new LedgerService(pool, clock);
  const metrics = new MetricsService(pool, catalog, settings, clock);
  const views = new ViewsService(pool, clock);

  app.get('/api/health', async (request, reply) => {
    try {
      await pingDatabase(pool);
      return { status: 'ok', db: 'ok' };
    } catch (err) {
      request.log.warn({ err }, 'health check: database unreachable');
      return sendProblem(reply, {
        ...problemBody(503, 'database-unavailable', 'The database does not answer'),
        db: 'error',
      });
    }
  });

  catalogRoutes(app, { catalog, reports });
  ledgerRoutes(app, { ledger });
  reportsRoutes(app, { reports });
  metricsRoutes(app, { metrics });
  viewsRoutes(app, { views });
  settingsRoutes(app, { settings });

  if (opts.webDist) {
    await app.register(fastifyStatic, { root: opts.webDist, index: ['index.html'], wildcard: true });
  }

  return app;
}
