export const cardCodeParamsSchema = {
  type: 'object',
  required: ['code'],
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 128 },
  },
} as const;

export const createCardBodySchema = {
  type: 'object',
  required: ['code', 'amount'],
  additionalProperties: false,
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 128 },
    amount: { type: 'number', exclusiveMinimum: 0 },
  },
} as const;

export const mutateCardBodySchema = {
  type: 'object',
  required: ['amount'],
  additionalProperties: false,
  properties: {
    amount: { type: 'number', exclusiveMinimum: 0 },
    description: { type: 'string', maxLength: 500 },
  },
} as const;
