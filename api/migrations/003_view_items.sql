-- 003_view_items: what each page shows (design-statistics.md, "view_items"; lenzi, 2026-09-30).
--
-- One row per thing shown: a line of an entity's metrics panel (surface substance, batch,
-- consumption), a column of the metrics page (surface metrics: the metric's scope says which of
-- its tables), a chart of the statistics page (surface statistics: with its section, chart and
-- scale). `metric` is a key of the API's catalog (GET /api/metrics); the labels and descriptions
-- live there, never here. These are lenzi's choices, edited from /statistics/edit: stored, and
-- never deleted (deleted_at).
--
-- The default choices are put in only while the table has no row at all, deleted ones included:
-- running the file again, or after lenzi changed them, adds nothing.

CREATE TABLE IF NOT EXISTS view_items (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  surface     ENUM('statistics', 'metrics', 'substance', 'batch', 'consumption') NOT NULL,
  section     VARCHAR(100) NULL,                                        -- statistics: its section
  position    INT UNSIGNED NOT NULL,                                    -- order in the surface, from 1
  metric      VARCHAR(64)  NOT NULL,                                    -- a key of the catalog
  chart       ENUM('bar', 'line', 'donut') NULL,                        -- statistics: how it is drawn
  scale       ENUM('hour', 'day', 'week', 'month', 'year') NULL,        -- statistics: its interval
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at  DATETIME     NULL,
  KEY ix_view_items_surface (surface, position)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

INSERT INTO view_items (surface, position, metric)
SELECT d.surface, d.position, d.metric
  FROM (
    -- The substance page: every substance metric.
    SELECT 'substance' AS surface, 1 AS position, 'substance.consumed' AS metric
    UNION ALL SELECT 'substance', 2, 'substance.pace'
    UNION ALL SELECT 'substance', 3, 'substance.frequency'
    UNION ALL SELECT 'substance', 4, 'substance.avgGap'
    UNION ALL SELECT 'substance', 5, 'substance.sinceLast'
    UNION ALL SELECT 'substance', 6, 'substance.longestPause'
    UNION ALL SELECT 'substance', 7, 'substance.cost'
    UNION ALL SELECT 'substance', 8, 'substance.spend'
    UNION ALL SELECT 'substance', 9, 'substance.unitPriceTrend'
    UNION ALL SELECT 'substance', 10, 'substance.stockTime'
    -- The batch page: every batch metric.
    UNION ALL SELECT 'batch', 1, 'batch.used'
    UNION ALL SELECT 'batch', 2, 'batch.unitPriceVsAverage'
    UNION ALL SELECT 'batch', 3, 'batch.unitPriceVsPrevious'
    UNION ALL SELECT 'batch', 4, 'batch.valueConsumed'
    UNION ALL SELECT 'batch', 5, 'batch.consumptions'
    UNION ALL SELECT 'batch', 6, 'batch.avgQuantity'
    UNION ALL SELECT 'batch', 7, 'batch.minQuantity'
    UNION ALL SELECT 'batch', 8, 'batch.maxQuantity'
    UNION ALL SELECT 'batch', 9, 'batch.pace'
    UNION ALL SELECT 'batch', 10, 'batch.waitBeforeFirst'
    UNION ALL SELECT 'batch', 11, 'batch.timeToFinish'
    UNION ALL SELECT 'batch', 12, 'batch.costPerTime'
    -- A consumption's details: every consumption metric.
    UNION ALL SELECT 'consumption', 1, 'consumption.deltaQuantity'
    UNION ALL SELECT 'consumption', 2, 'consumption.quantityVsSubstanceAverage'
    UNION ALL SELECT 'consumption', 3, 'consumption.quantityVsBatchAverage'
    UNION ALL SELECT 'consumption', 4, 'consumption.deltaCost'
    UNION ALL SELECT 'consumption', 5, 'consumption.unitPriceVsStock'
    UNION ALL SELECT 'consumption', 6, 'consumption.unitPriceVsBatches'
    UNION ALL SELECT 'consumption', 7, 'consumption.rankInSubstance'
    UNION ALL SELECT 'consumption', 8, 'consumption.rankInBatch'
    UNION ALL SELECT 'consumption', 9, 'consumption.rankInDay'
    UNION ALL SELECT 'consumption', 10, 'consumption.sincePrevious'
    UNION ALL SELECT 'consumption', 11, 'consumption.hourVsUsual'
    UNION ALL SELECT 'consumption', 12, 'consumption.shareOfBatch'
    -- The metrics page: a few columns per table (a phone scrolls a table sideways).
    UNION ALL SELECT 'metrics', 1, 'substance.consumed'
    UNION ALL SELECT 'metrics', 2, 'substance.pace'
    UNION ALL SELECT 'metrics', 3, 'substance.cost'
    UNION ALL SELECT 'metrics', 4, 'substance.spend'
    UNION ALL SELECT 'metrics', 5, 'substance.sinceLast'
    UNION ALL SELECT 'metrics', 6, 'substance.stockTime'
    UNION ALL SELECT 'metrics', 7, 'batch.used'
    UNION ALL SELECT 'metrics', 8, 'batch.unitPriceVsAverage'
    UNION ALL SELECT 'metrics', 9, 'batch.pace'
    UNION ALL SELECT 'metrics', 10, 'batch.timeToFinish'
    UNION ALL SELECT 'metrics', 11, 'batch.valueConsumed'
    UNION ALL SELECT 'metrics', 12, 'consumption.deltaQuantity'
    UNION ALL SELECT 'metrics', 13, 'consumption.quantityVsSubstanceAverage'
    UNION ALL SELECT 'metrics', 14, 'consumption.unitPriceVsBatches'
    UNION ALL SELECT 'metrics', 15, 'consumption.sincePrevious'
    UNION ALL SELECT 'metrics', 16, 'consumption.rankInDay'
  ) d
 WHERE NOT EXISTS (SELECT 1 FROM view_items);
