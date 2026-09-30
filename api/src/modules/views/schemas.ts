import { idParams } from '../../shared/schemas.js';
import { TIME_SCALES } from '../../shared/time.js';
import { CHARTS, SURFACES, type Chart, type Surface } from './repository.js';

const surface = { type: 'string', enum: SURFACES } as const;

export const listViewItemsSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    required: ['surface'],
    properties: { surface },
  },
} as const;

export interface ListViewItemsQuery {
  surface: Surface;
}

export const createViewItemSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['surface', 'metric'],
    properties: {
      surface,
      metric: { type: 'string', minLength: 1, maxLength: 64 },
      section: { type: ['string', 'null'], minLength: 1, maxLength: 100 },
      chart: { type: ['string', 'null'], enum: [...CHARTS, null] },
      scale: { type: ['string', 'null'], enum: [...TIME_SCALES, null] },
    },
  },
} as const;

export interface CreateViewItemBody {
  surface: Surface;
  metric: string;
  section?: string | null;
  chart?: Chart | null;
  scale?: string | null;
}

export const deleteViewItemSchema = { params: idParams } as const;

export const orderViewItemsSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['surface', 'ids'],
    properties: {
      surface,
      ids: { type: 'array', maxItems: 500, items: { type: 'integer', minimum: 1, maximum: 4294967295 } },
    },
  },
} as const;

export interface OrderViewItemsBody {
  surface: Surface;
  ids: number[];
}
