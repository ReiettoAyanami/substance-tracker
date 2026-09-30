import type { FastifyInstance } from 'fastify';
import type { IdParams } from '../../shared/schemas.js';
import { METRICS } from './catalog.js';
import { substanceMetricsSchema, type SubstanceMetricsQuery } from './schemas.js';
import type { MetricsService } from './service.js';

export function metricsRoutes(app: FastifyInstance, deps: { metrics: MetricsService }): void {
  const { metrics } = deps;

  app.get('/api/metrics', async () => METRICS);

  app.get<{ Params: IdParams; Querystring: SubstanceMetricsQuery }>(
    '/api/substances/:id/metrics',
    { schema: substanceMetricsSchema },
    async (req) => metrics.substanceMetrics(req.params.id, req.query),
  );
}
