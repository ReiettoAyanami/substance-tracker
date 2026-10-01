import type { FastifyInstance } from 'fastify';
import type { IdParams } from '../../shared/schemas.js';
import {
  createViewItemSchema,
  deleteViewItemSchema,
  listViewItemsSchema,
  orderViewItemsSchema,
  patchViewItemSchema,
  type CreateViewItemBody,
  type ListViewItemsQuery,
  type OrderViewItemsBody,
  type PatchViewItemBody,
} from './schemas.js';
import type { ViewsService } from './service.js';

export function viewsRoutes(app: FastifyInstance, deps: { views: ViewsService }): void {
  const { views } = deps;

  app.get<{ Querystring: ListViewItemsQuery }>('/api/view-items', { schema: listViewItemsSchema }, async (req) =>
    views.list(req.query.surface),
  );

  app.post<{ Body: CreateViewItemBody }>('/api/view-items', { schema: createViewItemSchema }, async (req, reply) =>
    reply.code(201).send(await views.add(req.body)),
  );

  app.put<{ Body: OrderViewItemsBody }>('/api/view-items/order', { schema: orderViewItemsSchema }, async (req) =>
    views.reorder(req.body.surface, req.body.ids),
  );

  app.patch<{ Params: IdParams; Body: PatchViewItemBody }>(
    '/api/view-items/:id',
    { schema: patchViewItemSchema },
    async (req) => views.changeChart(req.params.id, req.body),
  );

  app.delete<{ Params: IdParams }>('/api/view-items/:id', { schema: deleteViewItemSchema }, async (req, reply) => {
    await views.remove(req.params.id);
    return reply.code(204).send();
  });
}
