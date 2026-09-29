import {
  clientRefInput,
  decimalInput,
  idParams,
  instantInput,
  optionalText,
  requiredText,
} from '../../shared/schemas.js';

type DecimalValue = string | number;

// ---------------------------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------------------------

export const createBatchSchema = {
  params: idParams,
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: optionalText(100),
      quantity: decimalInput,
      refills: decimalInput,
      totalPrice: decimalInput,
      unitPrice: decimalInput,
      occurredAt: instantInput,
      note: optionalText(255),
      clientRef: clientRefInput,
    },
  },
} as const;

export interface CreateBatchBody {
  name?: string | null;
  quantity?: DecimalValue;
  refills?: DecimalValue;
  totalPrice?: DecimalValue;
  unitPrice?: DecimalValue;
  occurredAt?: string;
  note?: string | null;
  clientRef?: string;
}

export const patchBatchSchema = {
  params: idParams,
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      name: optionalText(100),
      note: optionalText(255),
      occurredAt: instantInput,
      quantity: decimalInput,
      totalPrice: decimalInput,
    },
  },
} as const;

export interface PatchBatchBody {
  name?: string | null;
  note?: string | null;
  occurredAt?: string;
  quantity?: DecimalValue;
  totalPrice?: DecimalValue;
}

// ---------------------------------------------------------------------------------------------
// Consumptions
// ---------------------------------------------------------------------------------------------

export const createConsumptionSchema = {
  params: idParams,
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['quantity'],
    properties: {
      quantity: decimalInput,
      occurredAt: instantInput,
      note: optionalText(255),
      clientRef: clientRefInput,
    },
  },
} as const;

export interface CreateConsumptionBody {
  quantity: DecimalValue;
  occurredAt?: string;
  note?: string | null;
  clientRef?: string;
}

export const patchConsumptionSchema = {
  params: idParams,
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      quantity: decimalInput,
      occurredAt: instantInput,
      note: optionalText(255),
    },
  },
} as const;

export interface PatchConsumptionBody {
  quantity?: DecimalValue;
  occurredAt?: string;
  note?: string | null;
}

// ---------------------------------------------------------------------------------------------
// Adjustments
// ---------------------------------------------------------------------------------------------

export const createAdjustmentSchema = {
  params: idParams,
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['delta', 'reason'],
    properties: {
      delta: decimalInput,
      reason: requiredText(255),
      occurredAt: instantInput,
      clientRef: clientRefInput,
    },
  },
} as const;

export interface CreateAdjustmentBody {
  delta: DecimalValue;
  reason: string;
  occurredAt?: string;
  clientRef?: string;
}

export const patchAdjustmentSchema = {
  params: idParams,
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      delta: decimalInput,
      reason: requiredText(255),
      occurredAt: instantInput,
    },
  },
} as const;

export interface PatchAdjustmentBody {
  delta?: DecimalValue;
  reason?: string;
  occurredAt?: string;
}

// ---------------------------------------------------------------------------------------------
// One-time consumptions
// ---------------------------------------------------------------------------------------------

export const createOneTimeSchema = {
  params: idParams,
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['quantity'],
    properties: {
      quantity: decimalInput,
      totalPrice: decimalInput,
      unitPrice: decimalInput,
      name: optionalText(100),
      occurredAt: instantInput,
      note: optionalText(255),
      clientRef: clientRefInput,
    },
  },
} as const;

export interface CreateOneTimeBody {
  quantity: DecimalValue;
  totalPrice?: DecimalValue;
  unitPrice?: DecimalValue;
  name?: string | null;
  occurredAt?: string;
  note?: string | null;
  clientRef?: string;
}

export const patchOneTimeSchema = {
  params: idParams,
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      quantity: decimalInput,
      totalPrice: decimalInput,
      unitPrice: decimalInput,
      name: optionalText(100),
      occurredAt: instantInput,
      note: optionalText(255),
    },
  },
} as const;

export interface PatchOneTimeBody {
  quantity?: DecimalValue;
  totalPrice?: DecimalValue;
  unitPrice?: DecimalValue;
  name?: string | null;
  occurredAt?: string;
  note?: string | null;
}

export const idOnlySchema = { params: idParams } as const;
