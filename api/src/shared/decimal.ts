import { Decimal as BaseDecimal } from 'decimal.js';
import { badRequest } from './errors.js';

/**
 * Exact decimal arithmetic for money and quantities. Never JS floats.
 * 40 significant digits for intermediate results (unit prices keep "all their decimals"),
 * ROUND_HALF_UP whenever a value is rounded for storage or output.
 */
export const Dec = BaseDecimal.clone({ precision: 40, rounding: BaseDecimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof Dec>;

export const ZERO = new Dec(0);

/** Input numbers: JSON strings or numbers matching this pattern. */
export const DECIMAL_INPUT = /^-?\d+(\.\d+)?$/;

/** Output scales. */
export const SCALE = {
  quantity: 3,
  money: 2,
  unitPrice: 6,
  share: 4,
  /** Relative change, e.g. the delta from the previous consumption ("0.0500" = +5 %). */
  ratio: 4,
} as const;

export function dec(value: string | number | Dec): Dec {
  return value instanceof Dec ? value : new Dec(value);
}

/** Decimal from a DB value (DECIMAL comes back as a string; SUM() of nothing is null). */
export function fromDb(value: unknown): Dec {
  if (value === null || value === undefined) return ZERO;
  if (typeof value === 'string' || typeof value === 'number') return new Dec(value);
  throw new Error(`Unexpected DECIMAL value from the database: ${String(value)}`);
}

/** Fixed-scale string, half-up, never "-0.00". */
export function fmt(value: Dec, scale: number): string {
  const rounded = value.toDecimalPlaces(scale, Dec.ROUND_HALF_UP);
  return (rounded.isZero() ? rounded.abs() : rounded).toFixed(scale);
}

export function fmtOrNull(value: Dec | null | undefined, scale: number): string | null {
  return value === null || value === undefined ? null : fmt(value, scale);
}

export const fmtQty = (v: Dec): string => fmt(v, SCALE.quantity);
export const fmtMoney = (v: Dec): string => fmt(v, SCALE.money);
export const fmtUnitPrice = (v: Dec): string => fmt(v, SCALE.unitPrice);
export const fmtShare = (v: Dec): string => fmt(v, SCALE.share);

export function round2(value: Dec): Dec {
  return value.toDecimalPlaces(SCALE.money, Dec.ROUND_HALF_UP);
}

/** a / b, or 0 when b is 0. */
export function safeDiv(a: Dec, b: Dec): Dec {
  return b.isZero() ? ZERO : a.div(b);
}

export function sum(values: Iterable<Dec>): Dec {
  let total = ZERO;
  for (const v of values) total = total.plus(v);
  return total;
}

export interface DecimalRule {
  /** Field name for the error message. */
  field: string;
  /** Maximum number of decimal places accepted (the column scale). Omit for "any". */
  maxDecimals?: number;
  /** Strict lower bound. */
  gt?: Dec | number;
  /** Inclusive lower bound. */
  gte?: Dec | number;
  /** Inclusive upper bound (column range). */
  lte?: Dec | number;
  /** Refuse 0 (adjustment delta). */
  nonZero?: boolean;
}

/**
 * Parses a decimal input (JSON string or number) and checks its range.
 * Anything else is a 400.
 */
export function parseDecimal(raw: unknown, rule: DecimalRule): Dec {
  let text: string;
  if (typeof raw === 'string') text = raw.trim();
  else if (typeof raw === 'number' && Number.isFinite(raw)) text = String(raw);
  else throw badRequest(`${rule.field} must be a decimal number`, rule.field);

  if (!DECIMAL_INPUT.test(text)) {
    throw badRequest(`${rule.field} must be a decimal number like "12.5" (got "${text}")`, rule.field);
  }
  const value = new Dec(text);
  if (rule.maxDecimals !== undefined && value.decimalPlaces() > rule.maxDecimals) {
    throw badRequest(`${rule.field} accepts at most ${rule.maxDecimals} decimal places`, rule.field);
  }
  if (rule.gt !== undefined && !value.gt(rule.gt)) {
    throw badRequest(`${rule.field} must be greater than ${String(rule.gt)}`, rule.field);
  }
  if (rule.gte !== undefined && !value.gte(rule.gte)) {
    throw badRequest(`${rule.field} must be at least ${String(rule.gte)}`, rule.field);
  }
  if (rule.lte !== undefined && !value.lte(rule.lte)) {
    throw badRequest(`${rule.field} must be at most ${String(rule.lte)}`, rule.field);
  }
  if (rule.nonZero && value.isZero()) {
    throw badRequest(`${rule.field} must not be zero`, rule.field);
  }
  return value;
}

/** Column limits (Appendix A). */
export const LIMITS = {
  /** DECIMAL(12,3) */
  quantityMax: new Dec('999999999.999'),
  /** DECIMAL(10,2) */
  moneyMax: new Dec('99999999.99'),
  /** DECIMAL(10,4) */
  unitPriceMax: new Dec('999999.9999'),
} as const;
