-- 006_substances_charts: the charts of the substances page (design-statistics.md, "substances
-- overview"; lenzi, 2026-10-01: charts and a metrics table on /substances, without opening a card,
-- statistics of the substances in general).
--
-- A new surface, `substances`: charts only, no sections, each drawn with one line per substance
-- (the table next to them is the metrics page's substances table, surface `metrics`). lenzi
-- changes them from /statistics/edit. The charts it starts with are put in only while the page has
-- none, deleted ones included: running the file again, or after lenzi changed them, adds nothing.

ALTER TABLE view_items
  MODIFY surface ENUM('statistics', 'metrics', 'substance', 'batch', 'consumption', 'substances') NOT NULL;

INSERT INTO view_items (surface, section, position, metric, chart, scale)
SELECT d.surface, NULL, d.position, d.metric, d.chart, d.scale
  FROM (
    SELECT 'substances' AS surface, 1 AS position, 'series.consumed' AS metric, 'bar' AS chart, 'week' AS scale
    UNION ALL SELECT 'substances', 2, 'series.spend', 'bar', 'month'
    UNION ALL SELECT 'substances', 3, 'series.cost', 'donut', 'month'
  ) d
 WHERE NOT EXISTS (SELECT 1 FROM view_items WHERE surface = 'substances');
