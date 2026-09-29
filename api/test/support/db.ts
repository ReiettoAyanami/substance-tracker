import type { RowDataPacket } from 'mysql2/promise';
import { loadConfig, type DbConfig } from '../../src/config.js';
import { createPool, type Pool } from '../../src/db/pool.js';

/**
 * The test database: TEST_DB_NAME, or `${DB_NAME}_test`. Refuses any name that does not
 * end with `_test`, so a misconfigured environment can never truncate the real database.
 */
export function testDbConfig(): DbConfig {
  const config = loadConfig();
  const database = config.testDbName;
  if (!database.endsWith('_test')) {
    throw new Error(`Refusing to run the tests against "${database}": the test database name must end with _test`);
  }
  return { ...config.db, database };
}

let pool: Pool | null = null;

export function testPool(): Pool {
  pool ??= createPool(testDbConfig(), { connectionLimit: 5 });
  return pool;
}

export async function closeTestPool(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}

/**
 * Empties every table except schema_migrations and puts the settings row back to its
 * defaults. Truncating the test database is fine; the app itself never deletes a row.
 */
export async function resetDatabase(): Promise<void> {
  const conn = await testPool().getConnection();
  try {
    const [tables] = await conn.query<RowDataPacket[]>(
      `SELECT TABLE_NAME AS name FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME <> 'schema_migrations'`,
    );
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
      for (const t of tables) await conn.query(`TRUNCATE TABLE \`${String(t.name)}\``);
    } finally {
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    }
    await conn.query(
      `INSERT INTO settings (id, timezone, day_starts_at, currency) VALUES (1, 'Europe/Rome', '00:00:00', 'EUR')
       ON DUPLICATE KEY UPDATE timezone = 'Europe/Rome', day_starts_at = '00:00:00', currency = 'EUR'`,
    );
  } finally {
    conn.release();
  }
}

/** Raw row access for assertions (e.g. a soft-deleted row is still in the table). */
export async function rawRows(sql: string, values: unknown[] = []): Promise<RowDataPacket[]> {
  const [rows] = await testPool().query<RowDataPacket[]>(sql, values);
  return rows;
}
