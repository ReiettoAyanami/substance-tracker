import type { Pool } from '../../db/pool.js';
import { badRequest } from '../../shared/errors.js';
import { isValidTimezone, normalizeTimeOfDay, type DayConfig } from '../../shared/time.js';
import * as repo from './repository.js';

export interface Settings extends DayConfig {
  /** IANA zone used for the logical day. */
  timezone: string;
  /** 'HH:MM:SS' */
  dayStartsAt: string;
  /** ISO 4217 code, e.g. EUR. */
  currency: string;
}

export const DEFAULT_SETTINGS: Settings = {
  timezone: 'Europe/Rome',
  dayStartsAt: '00:00:00',
  currency: 'EUR',
};

export interface SettingsPatch {
  timezone?: string;
  dayStartsAt?: string;
  currency?: string;
}

export class SettingsService {
  constructor(private readonly pool: Pool) {}

  async get(): Promise<Settings> {
    const row = await repo.findSettings(this.pool);
    if (!row) return { ...DEFAULT_SETTINGS };
    return {
      timezone: row.timezone,
      dayStartsAt: normalizeTimeOfDay(row.day_starts_at) ?? DEFAULT_SETTINGS.dayStartsAt,
      currency: row.currency,
    };
  }

  async update(patch: SettingsPatch): Promise<Settings> {
    const update: repo.SettingsUpdate = {};
    if (patch.timezone !== undefined) {
      const zone = patch.timezone.trim();
      if (!isValidTimezone(zone)) throw badRequest(`timezone "${zone}" is not a valid IANA time zone`, 'timezone');
      update.timezone = zone;
    }
    if (patch.dayStartsAt !== undefined) {
      const time = normalizeTimeOfDay(patch.dayStartsAt);
      if (!time) throw badRequest('dayStartsAt must be HH:MM or HH:MM:SS', 'dayStartsAt');
      update.day_starts_at = time;
    }
    if (patch.currency !== undefined) {
      if (!/^[A-Z]{3}$/.test(patch.currency)) throw badRequest('currency must be a 3-letter ISO code', 'currency');
      update.currency = patch.currency;
    }
    await repo.updateSettings(this.pool, update);
    return this.get();
  }
}
