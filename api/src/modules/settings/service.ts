import type { Pool } from '../../db/pool.js';
import { badRequest } from '../../shared/errors.js';
import type { Owner } from '../../shared/owner.js';
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

/** A user's settings until they change them (and the first administrator's). */
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

/** Settings: one row per user (design-accounts.md, "owner"); a user without one has the defaults. */
export class SettingsService {
  constructor(private readonly pool: Pool) {}

  async get(owner: Owner): Promise<Settings> {
    const row = await repo.findSettings(this.pool, owner);
    if (!row) return { ...DEFAULT_SETTINGS };
    return {
      timezone: row.timezone,
      dayStartsAt: normalizeTimeOfDay(row.day_starts_at) ?? DEFAULT_SETTINGS.dayStartsAt,
      currency: row.currency,
    };
  }

  async update(owner: Owner, patch: SettingsPatch): Promise<Settings> {
    const next = await this.get(owner);
    if (patch.timezone !== undefined) {
      const zone = patch.timezone.trim();
      if (!isValidTimezone(zone)) throw badRequest(`timezone "${zone}" is not a valid IANA time zone`, 'timezone');
      next.timezone = zone;
    }
    if (patch.dayStartsAt !== undefined) {
      const time = normalizeTimeOfDay(patch.dayStartsAt);
      if (!time) throw badRequest('dayStartsAt must be HH:MM or HH:MM:SS', 'dayStartsAt');
      next.dayStartsAt = time;
    }
    if (patch.currency !== undefined) {
      if (!/^[A-Z]{3}$/.test(patch.currency)) throw badRequest('currency must be a 3-letter ISO code', 'currency');
      next.currency = patch.currency;
    }
    await repo.saveSettings(this.pool, owner, { timezone: next.timezone, day_starts_at: next.dayStartsAt, currency: next.currency });
    return this.get(owner);
  }
}
