import type { RowDataPacket } from 'mysql2/promise';
import type { Queryable } from '../../db/pool.js';

/** The hashes of the passwords a user had, oldest first (a new password must be none of them). */
export async function passwordHistory(db: Queryable, userId: number): Promise<string[]> {
  const [rows] = await db.query<RowDataPacket[]>('SELECT password_hash FROM password_history WHERE user_id = ? ORDER BY id', [userId]);
  return rows.map((row) => String(row.password_hash));
}

export async function addPasswordToHistory(db: Queryable, userId: number, passwordHash: string): Promise<void> {
  await db.query('INSERT INTO password_history (user_id, password_hash) VALUES (?, ?)', [userId, passwordHash]);
}
