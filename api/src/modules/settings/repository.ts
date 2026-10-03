import type { RowDataPacket } from 'mysql2/promise';
import type { Queryable } from '../../db/pool.js';
import type { Owner } from '../../shared/owner.js';

export interface SettingsRow {
  timezone: string;
  day_starts_at: string;
  currency: string;
}

/** The owner's settings row (one per user), or null when the user has none yet. */
export async function findSettings(db: Queryable, owner: Owner): Promise<SettingsRow | null> {
  const [rows] = await db.query<RowDataPacket[]>('SELECT timezone, day_starts_at, currency FROM settings WHERE user_id = ?', [
    owner.userId,
  ]);
  const row = rows[0];
  if (!row) return null;
  return {
    timezone: String(row.timezone),
    day_starts_at: String(row.day_starts_at),
    currency: String(row.currency),
  };
}

/**
 * Writes the owner's whole settings row: inserted the first time, replaced after (a user created
 * before the accounts' starting state, or whose row is missing, gets one here).
 */
export async function saveSettings(db: Queryable, owner: Owner, row: SettingsRow): Promise<void> {
  await db.query(
    `INSERT INTO settings (user_id, timezone, day_starts_at, currency) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE timezone = VALUES(timezone), day_starts_at = VALUES(day_starts_at), currency = VALUES(currency)`,
    [owner.userId, row.timezone, row.day_starts_at, row.currency],
  );
}
