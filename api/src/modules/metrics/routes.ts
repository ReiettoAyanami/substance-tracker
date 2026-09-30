import type { FastifyInstance } from 'fastify';
import type { IdParams } from '../../shared/schemas.js';
import { METRICS } from './catalog.js';
import {
  metricsTableSchema,
  substanceMetricsSchema,
  type MetricsTableQuery,
  type SubstanceMetricsQuery,
} from './schemas.js';
import type { MetricsService } from './service.js';

export function metricsRoutes(app: FastifyInstance, deps: { metrics: MetricsService }): void {
  const { metrics } = deps;

  app.get('/api/metrics', async () => METRICS);

  app.get<{ Querystring: MetricsTableQuery }>('/api/metrics/table', { schema: metricsTableSchema }, async (req) =>
    metrics.table(req.query),
  );

  app.get<{ Params: IdParams; Querystring: SubstanceMetricsQuery }>(
    '/api/substances/:id/metrics',
    { schema: substanceMetricsSchema },
    async (req) => metrics.substanceMetrics(req.params.id, req.query),
  );
}
