import type { FastifyInstance } from 'fastify';
import type { Owner } from '../../shared/owner.js';
import type { IdParams } from '../../shared/schemas.js';
import type { ReportsService } from '../reports/service.js';
import {
  createSubstanceSchema,
  deleteSubstanceSchema,
  getSubstanceSchema,
  listSubstancesSchema,
  patchSubstanceSchema,
  type CreateSubstanceBody,
  type ListSubstancesQuery,
  type PatchSubstanceBody,
} from './schemas.js';
import type { CatalogService, SubstanceDto } from './service.js';

/**
 * Substances of the session's user. Every substance is returned with its card summary (computed by
 * Reports): `{ ...substance, summary: { stock, stockBarMax, stockBarSegments, peakStock, lastBatch,
 * avgUnitPrice, lastConsumption, avgQuantityPerConsumption, avgPricePerConsumption,
 * spendThisMonth } }` (`CardSummary` in reports/service.ts).
 */
export function catalogRoutes(app: FastifyInstance, deps: { catalog: CatalogService; reports: ReportsService }): void {
  const { catalog, reports } = deps;

  const withSummary = async (owner: Owner, substance: SubstanceDto) => ({
    ...substance,
    summary: await reports.summary(owner, substance.id),
  });

  app.get<{ Querystring: ListSubstancesQuery }>('/api/substances', { schema: listSubstancesSchema }, async (req) => {
    const substances = await catalog.list(req.owner, { includeArchived: req.query.archived ?? false, search: req.query.q });
    const summaries = await reports.summaries(
      req.owner,
      substances.map((s) => s.id),
    );
    return substances.map((s) => ({ ...s, summary: summaries.get(s.id) }));
  });

  app.post<{ Body: CreateSubstanceBody }>('/api/substances', { schema: createSubstanceSchema }, async (req, reply) => {
    const substance = await catalog.create(req.owner, req.body);
    return reply.code(201).send(await withSummary(req.owner, substance));
  });

  app.get<{ Params: IdParams }>('/api/substances/:id', { schema: getSubstanceSchema }, async (req) =>
    withSummary(req.owner, await catalog.get(req.owner, req.params.id)),
  );

  app.patch<{ Params: IdParams; Body: PatchSubstanceBody }>(
    '/api/substances/:id',
    { schema: patchSubstanceSchema },
    async (req) => withSummary(req.owner, await catalog.update(req.owner, req.params.id, req.body)),
  );

  app.delete<{ Params: IdParams }>('/api/substances/:id', { schema: deleteSubstanceSchema }, async (req, reply) => {
    await catalog.remove(req.owner, req.params.id);
    return reply.code(204).send();
  });
}
