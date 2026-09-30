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
