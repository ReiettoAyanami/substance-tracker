import { isAbsolute, resolve } from 'node:path';

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface AppConfig {
  db: DbConfig;
  /** Name of the test database (dev only), `${DB_NAME}_test` when TEST_DB_NAME is unset. */
  testDbName: string;
  host: string;
  port: number;
  logLevel: string;
  /** Folder with the Angular build. Static files + SPA fallback only when set. */
  webDist: string | undefined;
  /** Optional override of the migrations folder. */
  migrationsDir: string | undefined;
}

type Env = Record<string, string | undefined>;

function str(env: Env, name: string, fallback: string): string {
  const value = env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

function int(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new Error(`Environment variable ${name} must be a port number, got "${raw}"`);
  }
  return value;
}

function optionalPath(env: Env, name: string): string | undefined {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = raw.trim();
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

export function loadConfig(env: Env = process.env): AppConfig {
  const database = str(env, 'DB_NAME', 'substance_tracker');
  return {
    db: {
      host: str(env, 'DB_HOST', 'localhost'),
      port: int(env, 'DB_PORT', 3306),
      database,
      user: str(env, 'DB_USER', 'substance'),
      // Passwords are taken verbatim (no trim).
      password: env.DB_PASSWORD ?? '',
    },
    testDbName: str(env, 'TEST_DB_NAME', `${database}_test`),
    host: str(env, 'HOST', '0.0.0.0'),
    port: int(env, 'PORT', 3000),
    logLevel: str(env, 'LOG_LEVEL', 'info'),
    webDist: optionalPath(env, 'WEB_DIST'),
    migrationsDir: optionalPath(env, 'MIGRATIONS_DIR'),
  };
}
