-- 009_owners: every piece of tracking data belongs to one user (design-accounts.md, "owner",
-- "test-user"; lenzi, 2026-10-02).
--
-- The owner is stored once, as substances.user_id: a batch belongs to its substance, a
-- consumption or an adjustment to its batch, a one-time consumption to its substance, so their
-- owner is reached by a join and never stored again. settings (one row per user) and view_items
-- (what each page shows) carry user_id themselves.
--
-- Rows found without an owner (a development database: lenzi, "andrebbero migrati i dati
-- sull'utente test-user") all go to `test-user`, created here only then: role user, no password
-- (an administrator gives it one), its settings and its layout included. A production database
-- has no tracking data at this point, so no test-user is created and the starting rows of 001
-- (the settings row) and 003-006 (the default layout) go: they are code now, copied for each new
-- user (src/modules/accounts).
--
-- Safe to re-run: every change of structure is checked against information_schema first (MySQL
-- has no ADD COLUMN IF NOT EXISTS), the data steps touch only rows still without an owner.

-- 1. test-user, only when there is tracking data without an owner
INSERT INTO users (username, email, role)
SELECT 'test-user', 'test-user@dev.invalid', 'user'
  FROM DUAL
 WHERE EXISTS (SELECT 1 FROM substances)
   AND NOT EXISTS (SELECT 1 FROM users WHERE username = 'test-user')
   AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'substances' AND COLUMN_NAME = 'user_id'
                      AND IS_NULLABLE = 'NO');

SET @test_user := (SELECT id FROM users WHERE username = 'test-user');

-- 2. substances.user_id
SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'substances' AND COLUMN_NAME = 'user_id') = 0,
  'ALTER TABLE substances ADD COLUMN user_id INT UNSIGNED NULL AFTER id',
  'DO 0');
PREPARE step FROM @ddl; EXECUTE step; DEALLOCATE PREPARE step;

UPDATE substances SET user_id = @test_user WHERE user_id IS NULL AND @test_user IS NOT NULL;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'substances' AND INDEX_NAME = 'ix_substances_user') = 0,
  'ALTER TABLE substances MODIFY user_id INT UNSIGNED NOT NULL, ADD KEY ix_substances_user (user_id, name)',
  'DO 0');
PREPARE step FROM @ddl; EXECUTE step; DEALLOCATE PREPARE step;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'substances' AND CONSTRAINT_NAME = 'fk_substances_user') = 0,
  'ALTER TABLE substances ADD CONSTRAINT fk_substances_user FOREIGN KEY (user_id) REFERENCES users (id)',
  'DO 0');
PREPARE step FROM @ddl; EXECUTE step; DEALLOCATE PREPARE step;

-- 3. settings: one row per user, the user its key (no longer the single row id = 1)
SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings' AND COLUMN_NAME = 'user_id') = 0,
  'ALTER TABLE settings ADD COLUMN user_id INT UNSIGNED NULL AFTER id',
  'DO 0');
PREPARE step FROM @ddl; EXECUTE step; DEALLOCATE PREPARE step;

UPDATE settings SET user_id = @test_user WHERE user_id IS NULL AND @test_user IS NOT NULL;
-- No owner (no test-user): the starting row of 001, now DEFAULT_SETTINGS in code.
DELETE FROM settings WHERE user_id IS NULL;

ALTER TABLE settings MODIFY id INT UNSIGNED NOT NULL AUTO_INCREMENT;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings' AND INDEX_NAME = 'uq_settings_user') = 0,
  'ALTER TABLE settings MODIFY user_id INT UNSIGNED NOT NULL, ADD UNIQUE KEY uq_settings_user (user_id)',
  'DO 0');
PREPARE step FROM @ddl; EXECUTE step; DEALLOCATE PREPARE step;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings' AND CONSTRAINT_NAME = 'fk_settings_user') = 0,
  'ALTER TABLE settings ADD CONSTRAINT fk_settings_user FOREIGN KEY (user_id) REFERENCES users (id)',
  'DO 0');
PREPARE step FROM @ddl; EXECUTE step; DEALLOCATE PREPARE step;

-- 4. view_items.user_id: each user's own layout
SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'view_items' AND COLUMN_NAME = 'user_id') = 0,
  'ALTER TABLE view_items ADD COLUMN user_id INT UNSIGNED NULL AFTER id',
  'DO 0');
PREPARE step FROM @ddl; EXECUTE step; DEALLOCATE PREPARE step;

UPDATE view_items SET user_id = @test_user WHERE user_id IS NULL AND @test_user IS NOT NULL;
-- No owner (no test-user): the starting layout of 003-006, now DEFAULT_VIEW_ITEMS in code.
DELETE FROM view_items WHERE user_id IS NULL;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'view_items' AND INDEX_NAME = 'ix_view_items_user_surface') = 0,
  'ALTER TABLE view_items MODIFY user_id INT UNSIGNED NOT NULL, ADD KEY ix_view_items_user_surface (user_id, surface, position)',
  'DO 0');
PREPARE step FROM @ddl; EXECUTE step; DEALLOCATE PREPARE step;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'view_items' AND INDEX_NAME = 'ix_view_items_surface') > 0,
  'ALTER TABLE view_items DROP KEY ix_view_items_surface',
  'DO 0');
PREPARE step FROM @ddl; EXECUTE step; DEALLOCATE PREPARE step;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'view_items' AND CONSTRAINT_NAME = 'fk_view_items_user') = 0,
  'ALTER TABLE view_items ADD CONSTRAINT fk_view_items_user FOREIGN KEY (user_id) REFERENCES users (id)',
  'DO 0');
PREPARE step FROM @ddl; EXECUTE step; DEALLOCATE PREPARE step;
