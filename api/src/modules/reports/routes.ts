import type { FastifyInstance } from 'fastify';
import type { IdParams, PaginationQuery } from '../../shared/schemas.js';
import {
  batchListSchema,
  byIdSchema,
  consumptionBoundsSchema,
  consumptionsSchema,
  movementsSchema,
  pagedByIdSchema,
  statsSchema,
  stockBarSchema,
  substanceMovementsSchema,
  type BatchListQuery,
  type ConsumptionScopeQuery,
  type ConsumptionsQuery,
  type MovementsQuery,
  type StatsQuery,
  type StockBarQuery,
} from './schemas.js';
import type { ReportsService } from './service.js';

export function reportsRoutes(app: FastifyInstance, deps: { reports: ReportsService }): void {
  const { reports } = deps;

  app.get<{ Params: IdParams; Querystring: StockBarQuery }>(
    '/api/substances/:id/batches',
    { schema: stockBarSchema },
    async (req) => reports.stockBar(req.owner, req.params.id, req.query.includeDeactivated ?? false),
  );

  app.get<{ Querystring: BatchListQuery }>('/api/batches', { schema: batchListSchema }, async (req) =>
    reports.batchList(req.owner, req.query),
  );

  app.get<{ Params: IdParams }>('/api/batches/:id', { schema: byIdSchema }, async (req) =>
    reports.batchPage(req.owner, req.params.id),
  );

  app.get<{ Params: IdParams; Querystring: PaginationQuery }>(
    '/api/batches/:id/movements',
    { schema: pagedByIdSchema },
    async (req) => reports.batchMovements(req.owner, req.params.id, req.query),
  );

  app.get<{ Params: IdParams }>('/api/substances/:id/one-time', { schema: byIdSchema }, async (req) =>
    reports.oneTimeStats(req.owner, req.params.id),
  );

  app.get<{ Params: IdParams; Querystring: PaginationQuery }>(
    '/api/substances/:id/one-time/consumptions',
    { schema: pagedByIdSchema },
    async (req) => reports.oneTimeConsumptions(req.owner, req.params.id, req.query),
  );

  app.get<{ Params: IdParams; Querystring: Omit<MovementsQuery, 'substanceId'> }>(
    '/api/substances/:id/movements',
    { schema: substanceMovementsSchema },
    async (req) => reports.movements(req.owner, { ...req.query, substanceId: req.params.id }),
  );

  app.get<{ Querystring: MovementsQuery }>('/api/movements', { schema: movementsSchema }, async (req) =>
    reports.movements(req.owner, req.query),
  );

  app.get<{ Querystring: ConsumptionsQuery }>('/api/consumptions', { schema: consumptionsSchema }, async (req) =>
    reports.consumptionList(req.owner, req.query, req.query),
  );

  app.get<{ Querystring: ConsumptionScopeQuery }>(
    '/api/consumptions/bounds',
    { schema: consumptionBoundsSchema },
    async (req) => reports.consumptionBounds(req.owner, req.query),
  );

  app.get<{ Querystring: StatsQuery }>('/api/stats', { schema: statsSchema }, async (req) =>
    reports.stats(req.owner, {
      from: req.query.from,
      to: req.query.to,
      groupBy: req.query.groupBy ?? 'day',
      substanceId: req.query.substanceId,
    }),
  );
}
