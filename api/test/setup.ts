import { afterAll, beforeEach } from 'vitest';
import { closeTestPool, resetDatabase } from './support/db.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
});
