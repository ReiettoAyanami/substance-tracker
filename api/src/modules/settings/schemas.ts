export const settingsPatchSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      timezone: { type: 'string', minLength: 1, maxLength: 64 },
      dayStartsAt: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$' },
      currency: { type: 'string', pattern: '^[A-Z]{3}$' },
    },
  },
} as const;

export interface SettingsPatchBody {
  timezone?: string;
  dayStartsAt?: string;
  currency?: string;
}
