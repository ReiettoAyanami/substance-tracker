import { idParams, nullableDecimalInput } from '../../shared/schemas.js';

const name = { type: 'string', minLength: 1, maxLength: 100 } as const;
const unit = { type: 'string', minLength: 1, maxLength: 20 } as const;

export const listSubstancesSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      archived: { type: 'boolean', default: false },
      // A text to find in the names (the search bar of the substances page); as long as a name at most.
      q: { type: 'string', maxLength: 100 },
    },
  },
} as const;

export interface ListSubstancesQuery {
  archived?: boolean;
  q?: string;
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
