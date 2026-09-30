import { idParams } from '../../shared/schemas.js';
import { TIME_SCALES, type TimeScale } from '../../shared/time.js';

const logicalDate = { type: 'string', format: 'date' } as const;

/** The interval of rates and durations; the user chooses it (default: day). */
const perQuery = { type: 'string', enum: TIME_SCALES } as const;

/** The period: from..to (logical days, inclusive, either end open), or the last N days. */
const periodProperties = {
  from: logicalDate,
  to: logicalDate,
  days: { type: 'integer', minimum: 1, maximum: 36600 },
} as const;

export const substanceMetricsSchema = {
  params: idParams,
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: { per: perQuery, ...periodProperties },
  },
} as const;

export interface SubstanceMetricsQuery {
  per?: TimeScale;
  from?: string;
  to?: string;
  days?: number;
}

/** Batches and consumptions: over their whole life, so only the scale. */
export const scaleOnlyMetricsSchema = {
  params: idParams,
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: { per: perQuery },
  },
} as const;

export interface ScaleQuery {
  per?: TimeScale;
}

/** Scopes whose table is built so far. */
export const TABLE_SCOPES = ['substance'] as const;
export type TableScope = (typeof TABLE_SCOPES)[number];

export const metricsTableSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    required: ['scope'],
    properties: {
      scope: { type: 'string', enum: TABLE_SCOPES },
      /** Comma-separated keys of the catalog, of the scope; none = all of them. */
      keys: { type: 'string', maxLength: 2000, pattern: '^[A-Za-z.]+(,[A-Za-z.]+)*$' },
      per: perQuery,
      ...periodProperties,
    },
  },
} as const;

export interface MetricsTableQuery {
  scope: TableScope;
  keys?: string;
  per?: TimeScale;
  from?: string;
  to?: string;
  days?: number;
}
