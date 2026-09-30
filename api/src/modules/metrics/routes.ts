import type { FastifyInstance } from 'fastify';
import { METRICS } from './catalog.js';

export function metricsRoutes(app: FastifyInstance): void {
  app.get('/api/metrics', async () => METRICS);
}
