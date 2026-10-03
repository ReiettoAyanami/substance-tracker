import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MIGRATIONS_DIR,
  listMigrationFiles,
  resolveMigrationsDir,
  runMigrations,
} from '../../src/db/migrate.js';
import { rawRows, testDbConfig } from '../support/db.js';

/** Runs one migration file again on the test database, as the runner would. */
async function rerun(file: string): Promise<void> {
  const sql = await readFile(join(DEFAULT_MIGRATIONS_DIR, file), 'utf8');
  const conn = await mysql.createConnection({ ...testDbConfig(), multipleStatements: true });
  try {
    await conn.query(sql);
  } finally {
    await conn.end();
  }
}

describe('migrations', () => {
  it('finds the numbered files in api/migrations, or in MIGRATIONS_DIR when set', async () => {
    expect(await listMigrationFiles(DEFAULT_MIGRATIONS_DIR)).toContain('001_init.sql');
    // test/db -> <api root>/migrations, the same folder src/db and dist/db resolve to
    expect(DEFAULT_MIGRATIONS_DIR).toBe(fileURLToPath(new URL('../../migrations/', import.meta.url)));
    expect(resolveMigrationsDir({})).toBe(DEFAULT_MIGRATIONS_DIR);
    expect(resolveMigrationsDir({ MIGRATIONS_DIR: '/opt/migrations' })).toBe(resolve('/opt/migrations'));
  });

  it('records applied files in schema_migrations and applies nothing twice', async () => {
    const rows = await rawRows('SELECT version, applied_at FROM schema_migrations ORDER BY version');
    expect(rows.map((r) => r.version)).toContain('001_init');
    expect(await runMigrations(testDbConfig())).toEqual([]);
  });

  it('001_init.sql is written to be safe to re-run', async () => {
    // Its tables have changed since (009), so it is checked as written, not run again on them.
    const sql = await readFile(join(DEFAULT_MIGRATIONS_DIR, '001_init.sql'), 'utf8');
    const code = sql.replace(/--[^\n]*/g, '');
    expect(code).not.toMatch(/^\s*USE\s/im);
    expect(code.match(/CREATE TABLE(?! IF NOT EXISTS)/g)).toBeNull();
    expect(code.match(/INSERT INTO/g)).toBeNull(); // only INSERT IGNORE
  });

  it("creates the tables; UNIQUE keys only on client_ref, a user's username and email, two technical keys", async () => {
    const tables = await rawRows(
      `SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`,
    );
    expect(tables.map((t) => t.name)).toEqual([
      'accounts',
      'adjustments',
      'batches',
      'consumptions',
      'one_time_consumptions',
      'password_history',
      'rate_limits',
      'schema_migrations',
      'sessions',
      'settings',
      'sign_in_failures',
      'substances',
      'users',
      'verifications',
      'view_items',
    ]);
    const unique = await rawRows(
      `SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'
        ORDER BY TABLE_NAME, COLUMN_NAME`,
    );
    // Names are never unique (only ids identify a row), with lenzi's exceptions: a user's username (the
    // address of their pages) and email (Better Auth wants it unique). client_ref, a session's token and
    // a counter's key are technical keys, not names.
    expect(unique.map((u) => `${u.t}.${u.c}`)).toEqual([
      'adjustments.client_ref',
      'batches.client_ref',
      'consumptions.client_ref',
      'one_time_consumptions.client_ref',
      'rate_limits.key',
      'sessions.token',
      'settings.user_id', // one settings row per user
      'users.email',
      'users.username',
    ]);
    const fks = await rawRows(
      `SELECT TABLE_NAME AS t, COLUMN_NAME AS c, REFERENCED_TABLE_NAME AS r FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME, COLUMN_NAME`,
    );
    expect(fks.map((f) => `${f.t}.${f.c}->${f.r}`)).toEqual([
      'accounts.user_id->users',
      'adjustments.batch_id->batches',
      'batches.deactivated_by_adjustment_id->adjustments',
      'batches.deactivated_by_consumption_id->consumptions',
      'batches.substance_id->substances',
      'consumptions.batch_id->batches',
      'one_time_consumptions.substance_id->substances',
      'password_history.user_id->users',
      'sessions.impersonated_by->users',
      'sessions.user_id->users',
      'settings.user_id->users',
      'sign_in_failures.user_id->users',
      'substances.user_id->users',
      'view_items.user_id->users',
    ]);
    const deletedAt = await rawRows(
      `SELECT TABLE_NAME AS t FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'deleted_at' ORDER BY TABLE_NAME`,
    );
    expect(deletedAt.map((d) => d.t)).toEqual([
      'adjustments',
      'batches',
      'consumptions',
      'one_time_consumptions',
      'substances',
      'view_items',
    ]);
  });

  it('002 drops the stored default unit price of substances, and is safe to re-run', async () => {
    const columns = async () =>
      (
        await rawRows(
          `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'substances' ORDER BY ORDINAL_POSITION`,
        )
      ).map((r) => r.c);
    const expected = ['id', 'user_id', 'name', 'unit', 'refill_quantity', 'archived_at', 'created_at', 'deleted_at'];
    expect(await columns()).toEqual(expected);

    const sql = await readFile(join(DEFAULT_MIGRATIONS_DIR, '002_drop_default_unit_price.sql'), 'utf8');
    const conn = await mysql.createConnection({ ...testDbConfig(), multipleStatements: true });
    try {
      await conn.query(sql);
    } finally {
      await conn.end();
    }
    expect(await columns()).toEqual(expected);
  });

  // 003-006 put the starting layout in once, for everybody; since 009 it is code, copied for each
  // new user (accounts/defaults.ts, tested in test/accounts). Their tables have changed since, so
  // the files are not run again here.

  it('009 gives every row an owner, and running it again changes nothing', async () => {
    await rawRows("INSERT INTO users (username, email) VALUES ('owner-a', 'owner-a@test.invalid')");
    const [user] = await rawRows("SELECT id FROM users WHERE username = 'owner-a'");
    const userId = Number(user?.id);
    await rawRows("INSERT INTO substances (user_id, name, unit) VALUES (?, 'beer', 'beer')", [userId]);
    await rawRows("INSERT INTO settings (user_id, timezone, day_starts_at, currency) VALUES (?, 'Europe/London', '05:00:00', 'GBP')", [userId]);
    await rawRows(
      "INSERT INTO view_items (user_id, surface, position, metric, created_at) VALUES (?, 'substance', 1, 'substance.pace', UTC_TIMESTAMP())",
      [userId],
    );
    const snapshot = async () => ({
      users: await rawRows('SELECT id, username, role FROM users ORDER BY id'),
      substances: await rawRows('SELECT id, user_id, name FROM substances ORDER BY id'),
      settings: await rawRows('SELECT user_id, timezone, day_starts_at, currency FROM settings ORDER BY id'),
      viewItems: await rawRows('SELECT user_id, surface, metric FROM view_items ORDER BY id'),
    });
    const before = await snapshot();
    await rerun('009_owners.sql');
    expect(await snapshot()).toEqual(before);
    // the owner columns are required
    const nullable = await rawRows(
      `SELECT TABLE_NAME AS t FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'user_id' AND IS_NULLABLE = 'YES'
          AND TABLE_NAME IN ('substances', 'settings', 'view_items')`,
    );
    expect(nullable).toEqual([]);
  });

  it('007 lets a chart be a treemap or a radar, and is safe to re-run', async () => {
    await rerun('007_chart_types.sql');
    const [column] = await rawRows(
      "SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'view_items' AND COLUMN_NAME = 'chart'",
    );
    expect(column?.type).toBe("enum('bar','line','donut','treemap','radar')");
  });

  it('the session and the stored instants are UTC', async () => {
    const [row] = await rawRows('SELECT @@session.time_zone AS tz');
    expect(row?.tz).toBe('+00:00');
  });
});
