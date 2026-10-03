import type { RowDataPacket } from 'mysql2/promise';
import type { Queryable } from '../../db/pool.js';
import type { Owner } from '../../shared/owner.js';
import type { DefaultViewItem } from './defaults.js';

/** Is there at least one administrator? (None: the first one is created at startup.) */
export async function hasAdministrator(db: Queryable): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1");
  return rows.length > 0;
}

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
 * Deletes a user and everything of theirs (design-accounts.md, "delete (a user)"): the one real
 * deletion of the project, soft-deleted rows included. Run inside a transaction. First the cycle is
 * broken: a batch remembers the consumption or adjustment that emptied it, so those references go
 * before the rows they point to; then from the leaves to the root. The sessions opened by the user
 * as somebody else (impersonations) go with its own. False when there is no such user.
 */
export async function deleteUser(db: Queryable, userId: number): Promise<boolean> {
  const [found] = await db.query<RowDataPacket[]>('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
  if (found.length === 0) return false;
  await db.query(
    `UPDATE batches b JOIN substances s ON s.id = b.substance_id
        SET b.deactivated_by_consumption_id = NULL, b.deactivated_by_adjustment_id = NULL
      WHERE s.user_id = ?`,
    [userId],
  );
  const ofBatches = 'JOIN batches b ON b.id = x.batch_id JOIN substances s ON s.id = b.substance_id WHERE s.user_id = ?';
  await db.query(`DELETE x FROM consumptions x ${ofBatches}`, [userId]);
  await db.query(`DELETE x FROM adjustments x ${ofBatches}`, [userId]);
  await db.query('DELETE b FROM batches b JOIN substances s ON s.id = b.substance_id WHERE s.user_id = ?', [userId]);
  await db.query('DELETE o FROM one_time_consumptions o JOIN substances s ON s.id = o.substance_id WHERE s.user_id = ?', [userId]);
  for (const table of ['substances', 'view_items', 'settings', 'password_history', 'sign_in_failures', 'accounts']) {
    await db.query(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
  }
  await db.query('DELETE FROM sessions WHERE user_id = ? OR impersonated_by = ?', [userId, userId]);
  await db.query('DELETE FROM users WHERE id = ?', [userId]);
  return true;
}

/**
 * Takes back a user created a moment ago whose starting state could not be written: a real
 * deletion, the one kind the project has (users; lenzi, 2026-10-01).
 */
export async function deleteFreshUser(db: Queryable, userId: number): Promise<void> {
  for (const table of ['view_items', 'settings', 'sign_in_failures', 'sessions', 'accounts']) {
    await db.query(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
  }
  await db.query('DELETE FROM users WHERE id = ?', [userId]);
}
