import type { Queryable } from '../../db/pool.js';
import type { Owner } from '../../shared/owner.js';
import type { DefaultViewItem } from './defaults.js';

export interface StartingSettings {
  timezone: string;
  day_starts_at: string;
  currency: string;
}

/** A new user's starting state: their settings row and their layout. */
export async function insertStartingState(
  db: Queryable,
  owner: Owner,
  settings: StartingSettings,
  items: readonly DefaultViewItem[],
  createdAt: string,
): Promise<void> {
  await db.query('INSERT INTO settings (user_id, timezone, day_starts_at, currency) VALUES (?, ?, ?, ?)', [
    owner.userId,
    settings.timezone,
    settings.day_starts_at,
    settings.currency,
  ]);
  if (items.length === 0) return;
  await db.query(
    'INSERT INTO view_items (user_id, surface, section, position, metric, chart, scale, created_at) VALUES ?',
    [items.map((i) => [owner.userId, i.surface, i.section, i.position, i.metric, i.chart, i.scale, createdAt])],
  );
}

/**
 * Takes back a user created a moment ago whose starting state could not be written: a real
 * deletion, the one kind the project has (users; lenzi, 2026-10-01).
 */
export async function deleteFreshUser(db: Queryable, userId: number): Promise<void> {
  for (const table of ['view_items', 'settings', 'sessions', 'accounts']) {
    await db.query(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
  }
  await db.query('DELETE FROM users WHERE id = ?', [userId]);
}
