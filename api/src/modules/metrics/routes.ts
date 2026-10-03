import type { FastifyInstance } from 'fastify';
import type { IdParams } from '../../shared/schemas.js';
import { CATALOG } from './catalog.js';
import {
  metricsTableSchema,
  scaleOnlyMetricsSchema,
  seriesSchema,
  substanceMetricsSchema,
  type MetricsTableQuery,
  type ScaleQuery,
  type SeriesQueryString,
  type SubstanceMetricsQuery,
} from './schemas.js';
import type { MetricsService } from './service.js';

export function metricsRoutes(app: FastifyInstance, deps: { metrics: MetricsService }): void {
  const { metrics } = deps;

  app.get('/api/metrics', async () => CATALOG);

  app.get<{ Querystring: SeriesQueryString }>('/api/series', { schema: seriesSchema }, async (req) => metrics.series(req.owner, req.query));

  app.get<{ Querystring: MetricsTableQuery }>('/api/metrics/table', { schema: metricsTableSchema }, async (req) =>
    metrics.table(req.owner, req.query),
  );

  app.get<{ Params: IdParams; Querystring: SubstanceMetricsQuery }>(
    '/api/substances/:id/metrics',
    { schema: substanceMetricsSchema },
    async (req) => metrics.substanceMetrics(req.owner, req.params.id, req.query),
  );

  app.get<{ Params: IdParams; Querystring: ScaleQuery }>(
    '/api/consumptions/:id/metrics',
    { schema: scaleOnlyMetricsSchema },
    async (req) => metrics.consumptionMetrics(req.owner, 'consumption', req.params.id, req.query.per),
  );

  app.get<{ Params: IdParams; Querystring: ScaleQuery }>(
    '/api/one-time-consumptions/:id/metrics',
    { schema: scaleOnlyMetricsSchema },
    async (req) => metrics.consumptionMetrics(req.owner, 'one_time', req.params.id, req.query.per),
  );

  app.get<{ Params: IdParams; Querystring: ScaleQuery }>(
    '/api/batches/:id/metrics',
    { schema: scaleOnlyMetricsSchema },
    async (req) => metrics.batchMetrics(req.owner, req.params.id, req.query.per),
  );
}
