import { idParams, nullableDecimalInput } from '../../shared/schemas.js';

const name = { type: 'string', minLength: 1, maxLength: 100 } as const;
const unit = { type: 'string', minLength: 1, maxLength: 20 } as const;

export const listSubstancesSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: { archived: { type: 'boolean', default: false } },
  },
} as const;

export interface ListSubstancesQuery {
  archived?: boolean;
}

export const createSubstanceSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'unit'],
    properties: {
      name,
      unit,
      refillQuantity: nullableDecimalInput,
    },
  },
} as const;

export interface CreateSubstanceBody {
  name: string;
  unit: string;
  refillQuantity?: string | number | null;
}

export const getSubstanceSchema = { params: idParams } as const;

export const patchSubstanceSchema = {
  params: idParams,
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      name,
      unit,
      refillQuantity: nullableDecimalInput,
      archived: { type: 'boolean' },
    },
  },
} as const;

export interface PatchSubstanceBody {
  name?: string;
  unit?: string;
  refillQuantity?: string | number | null;
  archived?: boolean;
}

export const deleteSubstanceSchema = { params: idParams } as const;
