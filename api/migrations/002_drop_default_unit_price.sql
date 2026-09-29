-- 002_drop_default_unit_price: a substance stores no price (lenzi, 2026-09-29).
--
-- Its unit price is computed from its batches when asked (the card summary's avgUnitPrice:
-- Σ(remaining × unit price) ÷ stock over the active batches), and a batch or a one-time
-- consumption always comes with its own price. The stored default was redundant.
--
-- Safe to re-run: the column is dropped only while it exists (MySQL has no DROP COLUMN IF EXISTS).

SET @has_default_unit_price := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'substances' AND COLUMN_NAME = 'default_unit_price'
);
SET @drop_default_unit_price := IF(
  @has_default_unit_price > 0,
  'ALTER TABLE substances DROP COLUMN default_unit_price',
  'DO 0'
);
PREPARE drop_default_unit_price FROM @drop_default_unit_price;
EXECUTE drop_default_unit_price;
DEALLOCATE PREPARE drop_default_unit_price;
