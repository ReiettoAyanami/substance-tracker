import type { RowDataPacket } from 'mysql2/promise';
import type { Queryable } from '../../db/pool.js';

export interface SettingsRow {
  timezone: string;
  day_starts_at: string;
  currency: string;
}

export async function findSettings(db: Queryable): Promise<SettingsRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT timezone, day_starts_at, currency FROM settings WHERE id = 1',
  );
  const row = rows[0];
  if (!row) return null;
  return {
    timezone: String(row.timezone),
    day_starts_at: String(row.day_starts_at),
    currency: String(row.currency),
  };
}

export interface SettingsUpdate {
  timezone?: string;
  day_starts_at?: string;
  currency?: string;
}

export async function updateSettings(db: Queryable, update: SettingsUpdate): Promise<void> {
  // The single row normally exists (seeded by 001_init); make sure before updating it.
  await db.query('INSERT IGNORE INTO settings (id) VALUES (1)');
  const sets: string[] = [];
  const values: unknown[] = [];
  if (update.timezone !== undefined) {
    sets.push('timezone = ?');
    values.push(update.timezone);
  }
  if (update.day_starts_at !== undefined) {
    sets.push('day_starts_at = ?');
    values.push(update.day_starts_at);
  }
  if (update.currency !== undefined) {
    sets.push('currency = ?');
    values.push(update.currency);
  }
  if (sets.length === 0) return;
  await db.query(`UPDATE settings SET ${sets.join(', ')} WHERE id = 1`, values);
}
