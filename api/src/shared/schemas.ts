/**
 * JSON Schema fragments shared by the modules' schemas.ts files.
 * Decimal numbers are accepted as JSON strings or numbers; the service parses them with
 * decimal.js and checks ranges (never through JS floats arithmetic).
 */

export const decimalInput = {
  type: ['string', 'number'],
  pattern: '^-?\\d+(\\.\\d+)?$',
} as const;

export const nullableDecimalInput = {
  type: ['string', 'number', 'null'],
  pattern: '^-?\\d+(\\.\\d+)?$',
} as const;

export const instantInput = { type: 'string', format: 'date-time' } as const;

export const clientRefInput = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const;

export const idParams = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'integer', minimum: 1, maximum: 4294967295 } },
} as const;

export interface IdParams {
  id: number;
}

export function optionalText(maxLength: number) {
  return { type: ['string', 'null'], maxLength } as const;
}

export function requiredText(maxLength: number) {
  return { type: 'string', minLength: 1, maxLength } as const;
}

export const paginationProperties = {
  limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
  before: instantInput,
} as const;

export interface PaginationQuery {
  limit?: number;
  before?: string;
}

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
