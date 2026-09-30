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
import { METRICS } from '../../src/modules/metrics/catalog.js';
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

  it('001_init.sql is safe to re-run', async () => {
    const sql = await readFile(join(DEFAULT_MIGRATIONS_DIR, '001_init.sql'), 'utf8');
    expect(sql).not.toMatch(/^\s*USE\s/im);
    const conn = await mysql.createConnection({ ...testDbConfig(), multipleStatements: true });
    try {
      await conn.query(sql);
    } finally {
      await conn.end();
    }
    expect(await rawRows('SELECT id FROM settings')).toHaveLength(1);
  });

  it('creates the Appendix A tables, with UNIQUE keys only on client_ref', async () => {
    const tables = await rawRows(
      `SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`,
    );
    expect(tables.map((t) => t.name)).toEqual([
      'adjustments',
      'batches',
      'consumptions',
      'one_time_consumptions',
      'schema_migrations',
      'settings',
      'substances',
      'view_items',
    ]);
    const unique = await rawRows(
      `SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'
        ORDER BY TABLE_NAME`,
    );
    expect(unique.map((u) => `${u.t}.${u.c}`)).toEqual([
      'adjustments.client_ref',
      'batches.client_ref',
      'consumptions.client_ref',
      'one_time_consumptions.client_ref',
    ]);
    const fks = await rawRows(
      `SELECT TABLE_NAME AS t, COLUMN_NAME AS c, REFERENCED_TABLE_NAME AS r FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME, COLUMN_NAME`,
    );
    expect(fks.map((f) => `${f.t}.${f.c}->${f.r}`)).toEqual([
      'adjustments.batch_id->batches',
      'batches.deactivated_by_adjustment_id->adjustments',
      'batches.deactivated_by_consumption_id->consumptions',
      'batches.substance_id->substances',
      'consumptions.batch_id->batches',
      'one_time_consumptions.substance_id->substances',
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
    const expected = ['id', 'name', 'unit', 'refill_quantity', 'archived_at', 'created_at', 'deleted_at'];
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

  it('003 puts on every page what it shows by default, only into an empty table, with metrics of the catalog', async () => {
    // The tests empty every table before each test: here the table is as a new database has it.
    await rerun('003_view_items.sql');
    const rows = await rawRows('SELECT surface, position, metric, section, chart, scale FROM view_items ORDER BY surface, position');
    const of = (surface: string) => rows.filter((r) => r.surface === surface);
    const keys = (scope: string) => METRICS.filter((m) => m.scope === scope).map((m) => m.key);

    // every panel: every metric of its entity, in the catalog's order
    expect(of('substance').map((r) => r.metric)).toEqual(keys('substance'));
    expect(of('batch').map((r) => r.metric)).toEqual(keys('batch'));
    expect(of('consumption').map((r) => r.metric)).toEqual(keys('consumption'));
    // the metrics page: a few columns per table
    expect(of('metrics').map((r) => r.metric)).toEqual([
      'substance.consumed',
      'substance.pace',
      'substance.cost',
      'substance.spend',
      'substance.sinceLast',
      'substance.stockTime',
      'batch.used',
      'batch.unitPriceVsAverage',
      'batch.pace',
      'batch.timeToFinish',
      'batch.valueConsumed',
      'consumption.deltaQuantity',
      'consumption.quantityVsSubstanceAverage',
      'consumption.unitPriceVsBatches',
      'consumption.sincePrevious',
      'consumption.rankInDay',
    ]);
    for (const surface of ['substance', 'batch', 'consumption', 'metrics']) {
      expect(of(surface).map((r) => r.position)).toEqual(of(surface).map((_, i) => i + 1));
    }
    expect(rows.every((r) => r.section === null && r.chart === null && r.scale === null)).toBe(true);

    // run again (or after lenzi's own choices): nothing is added
    await rawRows('UPDATE view_items SET deleted_at = UTC_TIMESTAMP() WHERE surface = ?', ['substance']);
    await rerun('003_view_items.sql');
    expect(await rawRows('SELECT id FROM view_items')).toHaveLength(rows.length);
  });

  it('the session and the stored instants are UTC', async () => {
    const [row] = await rawRows('SELECT @@session.time_zone AS tz');
    expect(row?.tz).toBe('+00:00');
  });
});
