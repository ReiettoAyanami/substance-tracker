import { idParams, paginationProperties, type PaginationQuery } from '../../shared/schemas.js';

const logicalDate = { type: 'string', format: 'date' } as const;

export const stockBarSchema = {
  params: idParams,
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: { includeDeactivated: { type: 'boolean', default: false } },
  },
} as const;

export interface StockBarQuery {
  includeDeactivated?: boolean;
}

export const byIdSchema = { params: idParams } as const;

export const pagedByIdSchema = {
  params: idParams,
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: paginationProperties,
  },
} as const;

export const MOVEMENT_TYPES = ['batch', 'consumption', 'one_time', 'adjustment'] as const;

const movementFilterProperties = {
  type: { type: 'string', enum: MOVEMENT_TYPES },
  from: logicalDate,
  to: logicalDate,
  ...paginationProperties,
} as const;

export const substanceMovementsSchema = {
  params: idParams,
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: movementFilterProperties,
  },
} as const;

export const movementsSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      substanceId: { type: 'integer', minimum: 1, maximum: 4294967295 },
      ...movementFilterProperties,
    },
  },
} as const;

export interface MovementsQuery extends PaginationQuery {
  substanceId?: number;
  type?: (typeof MOVEMENT_TYPES)[number];
  /** Logical date YYYY-MM-DD, inclusive. */
  from?: string;
  /** Logical date YYYY-MM-DD, inclusive. */
  to?: string;
}

const idQuery = { type: 'integer', minimum: 1, maximum: 4294967295 } as const;

/** A non-negative decimal in the query string ("1.5"); the service parses it with decimal.js. */
const decimalQuery = { type: 'string', pattern: '^\\d+(\\.\\d+)?$' } as const;

const consumptionScopeProperties = {
  substanceId: idQuery,
  batchId: idQuery,
  from: logicalDate,
  to: logicalDate,
} as const;

export interface ConsumptionScopeQuery {
  substanceId?: number;
  /** Leaves the one-time consumptions out. */
  batchId?: number;
  /** Logical date YYYY-MM-DD, inclusive. */
  from?: string;
  /** Logical date YYYY-MM-DD, inclusive. */
  to?: string;
}

export const consumptionsSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      ...consumptionScopeProperties,
      minUnitPrice: decimalQuery,
      maxUnitPrice: decimalQuery,
      minQuantity: decimalQuery,
      maxQuantity: decimalQuery,
      ...paginationProperties,
    },
  },
} as const;

export interface ConsumptionsQuery extends ConsumptionScopeQuery, PaginationQuery {
  /** Inclusive ranges on the unit price of the consumption and on its quantity. */
  minUnitPrice?: string;
  maxUnitPrice?: string;
  minQuantity?: string;
  maxQuantity?: string;
}

export const batchListSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: { substanceId: idQuery },
  },
} as const;

export interface BatchListQuery {
  substanceId?: number;
}

/** The ends of the price and quantity sliders: the scope only, no ranges, no page. */
export const consumptionBoundsSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: consumptionScopeProperties,
  },
} as const;

export const statsSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    required: ['from', 'to'],
    properties: {
      from: logicalDate,
      to: logicalDate,
      groupBy: { type: 'string', enum: ['day', 'week', 'month'], default: 'day' },
      substanceId: { type: 'integer', minimum: 1, maximum: 4294967295 },
    },
  },
} as const;

export interface StatsQuery {
  from: string;
  to: string;
  groupBy?: 'day' | 'week' | 'month';
  substanceId?: number;
}
