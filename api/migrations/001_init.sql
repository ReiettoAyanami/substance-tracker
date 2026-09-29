-- 001_init: full schema from design.md, Appendix A (draft v3).
--
-- Safe to re-run: MySQL DDL commits implicitly, so every statement is idempotent
-- (CREATE TABLE IF NOT EXISTS, INSERT IGNORE). No USE statement: the migration runs
-- against the database of the connection.
--
-- batches <-> consumptions/adjustments reference each other. Foreign key checks are
-- switched off for this session so every foreign key can be declared inline,
-- including the references to tables created later in this file.
-- Only `id` identifies a row: the only UNIQUE keys are the client_ref dedup keys.

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS substances (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(100)  NOT NULL,
  unit                VARCHAR(20)   NOT NULL,        -- free label: g, ml, cigarette, beer
  refill_quantity     DECIMAL(12,3) NULL,            -- e.g. 6 for a six-pack
  default_unit_price  DECIMAL(10,4) NULL,            -- prefill only
  archived_at         DATETIME      NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at          DATETIME      NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS batches (
  id                             INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  substance_id                   INT UNSIGNED  NOT NULL,
  name                           VARCHAR(100)  NULL,      -- "Corona", "supplier X"
  quantity                       DECIMAL(12,3) NOT NULL,  -- > 0, bought quantity
  total_price                    DECIMAL(10,2) NOT NULL,  -- >= 0
  occurred_at                    DATETIME      NOT NULL,  -- UTC, purchase moment
  note                           VARCHAR(255)  NULL,
  client_ref                     CHAR(36)      NULL,      -- UUID from the client, dedup
  deactivated_at                 DATETIME      NULL,      -- remaining reached 0
  deactivated_by_consumption_id  INT UNSIGNED  NULL,      -- what emptied it (one of the two)
  deactivated_by_adjustment_id   INT UNSIGNED  NULL,
  created_at                     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at                     DATETIME      NULL,
  UNIQUE KEY uq_batches_client_ref (client_ref),
  KEY ix_batches_substance_time (substance_id, occurred_at),
  CONSTRAINT fk_batches_substance
    FOREIGN KEY (substance_id) REFERENCES substances (id),
  CONSTRAINT fk_batches_deactivated_by_consumption
    FOREIGN KEY (deactivated_by_consumption_id) REFERENCES consumptions (id),
  CONSTRAINT fk_batches_deactivated_by_adjustment
    FOREIGN KEY (deactivated_by_adjustment_id) REFERENCES adjustments (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS consumptions (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_id      INT UNSIGNED  NOT NULL,              -- chosen when entering it
  quantity      DECIMAL(12,3) NOT NULL,              -- > 0, <= batch remaining
  occurred_at   DATETIME      NOT NULL,              -- UTC
  note          VARCHAR(255)  NULL,
  client_ref    CHAR(36)      NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at    DATETIME      NULL,                  -- "cancelled" consumption
  UNIQUE KEY uq_consumptions_client_ref (client_ref),
  KEY ix_consumptions_batch_time (batch_id, occurred_at),
  CONSTRAINT fk_consumptions_batch
    FOREIGN KEY (batch_id) REFERENCES batches (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS one_time_consumptions (   -- bought and used at once; no batch, no stock
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  substance_id  INT UNSIGNED  NOT NULL,
  name          VARCHAR(100)  NULL,                  -- "bar X", free label
  quantity      DECIMAL(12,3) NOT NULL,              -- > 0
  total_price   DECIMAL(10,2) NOT NULL,              -- >= 0
  occurred_at   DATETIME      NOT NULL,              -- UTC
  note          VARCHAR(255)  NULL,
  client_ref    CHAR(36)      NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at    DATETIME      NULL,
  UNIQUE KEY uq_one_time_client_ref (client_ref),
  KEY ix_one_time_substance_time (substance_id, occurred_at),
  CONSTRAINT fk_one_time_substance
    FOREIGN KEY (substance_id) REFERENCES substances (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS adjustments (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_id      INT UNSIGNED  NOT NULL,
  delta         DECIMAL(12,3) NOT NULL,              -- signed, <> 0
  reason        VARCHAR(255)  NOT NULL,
  occurred_at   DATETIME      NOT NULL,              -- UTC
  client_ref    CHAR(36)      NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at    DATETIME      NULL,
  UNIQUE KEY uq_adjustments_client_ref (client_ref),
  KEY ix_adjustments_batch_time (batch_id, occurred_at),
  CONSTRAINT fk_adjustments_batch
    FOREIGN KEY (batch_id) REFERENCES batches (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  id             TINYINT UNSIGNED NOT NULL DEFAULT 1 PRIMARY KEY,  -- single row, never deleted
  timezone       VARCHAR(64) NOT NULL DEFAULT 'Europe/Rome',
  day_starts_at  TIME        NOT NULL DEFAULT '00:00:00',
  currency       CHAR(3)     NOT NULL DEFAULT 'EUR'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

INSERT IGNORE INTO settings (id) VALUES (1);

SET FOREIGN_KEY_CHECKS = 1;
