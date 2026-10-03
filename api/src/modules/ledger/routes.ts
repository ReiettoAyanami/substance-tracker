import type { FastifyInstance, FastifyReply } from 'fastify';
import type { IdParams } from '../../shared/schemas.js';
import {
  createAdjustmentSchema,
  createBatchSchema,
  createConsumptionSchema,
  createOneTimeSchema,
  idOnlySchema,
  patchAdjustmentSchema,
  patchBatchSchema,
  patchConsumptionSchema,
  patchOneTimeSchema,
  type CreateAdjustmentBody,
  type CreateBatchBody,
  type CreateConsumptionBody,
  type CreateOneTimeBody,
  type PatchAdjustmentBody,
  type PatchBatchBody,
  type PatchConsumptionBody,
  type PatchOneTimeBody,
} from './schemas.js';
import type { Created, LedgerService } from './service.js';

/** 201 with the new row, or 200 with the existing row when the clientRef was already used. */
function sendCreated<T>(reply: FastifyReply, result: Created<T>): FastifyReply {
  return reply.code(result.created ? 201 : 200).send(result.row);
}

export function ledgerRoutes(app: FastifyInstance, deps: { ledger: LedgerService }): void {
  const { ledger } = deps;

  // Batches
  app.post<{ Params: IdParams; Body: CreateBatchBody }>(
    '/api/substances/:id/batches',
    { schema: createBatchSchema },
    async (req, reply) => sendCreated(reply, await ledger.createBatch(req.owner, req.params.id, req.body)),
  );
  app.patch<{ Params: IdParams; Body: PatchBatchBody }>(
    '/api/batches/:id',
    { schema: patchBatchSchema },
    async (req) => ledger.updateBatch(req.owner, req.params.id, req.body),
  );
  app.delete<{ Params: IdParams }>('/api/batches/:id', { schema: idOnlySchema }, async (req, reply) => {
    await ledger.deleteBatch(req.owner, req.params.id);
    return reply.code(204).send();
  });

  // Consumptions
  app.post<{ Params: IdParams; Body: CreateConsumptionBody }>(
    '/api/batches/:id/consumptions',
    { schema: createConsumptionSchema },
    async (req, reply) => sendCreated(reply, await ledger.createConsumption(req.owner, req.params.id, req.body)),
  );
  app.patch<{ Params: IdParams; Body: PatchConsumptionBody }>(
    '/api/consumptions/:id',
    { schema: patchConsumptionSchema },
    async (req) => ledger.updateConsumption(req.owner, req.params.id, req.body),
  );
  app.delete<{ Params: IdParams }>('/api/consumptions/:id', { schema: idOnlySchema }, async (req, reply) => {
    await ledger.deleteConsumption(req.owner, req.params.id);
    return reply.code(204).send();
  });

  // Adjustments
  app.post<{ Params: IdParams; Body: CreateAdjustmentBody }>(
    '/api/batches/:id/adjustments',
    { schema: createAdjustmentSchema },
    async (req, reply) => sendCreated(reply, await ledger.createAdjustment(req.owner, req.params.id, req.body)),
  );
  app.patch<{ Params: IdParams; Body: PatchAdjustmentBody }>(
    '/api/adjustments/:id',
    { schema: patchAdjustmentSchema },
    async (req) => ledger.updateAdjustment(req.owner, req.params.id, req.body),
  );
  app.delete<{ Params: IdParams }>('/api/adjustments/:id', { schema: idOnlySchema }, async (req, reply) => {
    await ledger.deleteAdjustment(req.owner, req.params.id);
    return reply.code(204).send();
  });

  // One-time consumptions
  app.post<{ Params: IdParams; Body: CreateOneTimeBody }>(
    '/api/substances/:id/one-time-consumptions',
    { schema: createOneTimeSchema },
    async (req, reply) => sendCreated(reply, await ledger.createOneTime(req.owner, req.params.id, req.body)),
  );
  app.patch<{ Params: IdParams; Body: PatchOneTimeBody }>(
    '/api/one-time-consumptions/:id',
    { schema: patchOneTimeSchema },
    async (req) => ledger.updateOneTime(req.owner, req.params.id, req.body),
  );
  app.delete<{ Params: IdParams }>('/api/one-time-consumptions/:id', { schema: idOnlySchema }, async (req, reply) => {
    await ledger.deleteOneTime(req.owner, req.params.id);
    return reply.code(204).send();
  });
}
