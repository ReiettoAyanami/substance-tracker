-- 004_statistics_widgets: the charts the statistics page starts with (design-statistics.md,
-- "statistics page"; 2026-10-01).
--
-- Each is a view item of the surface `statistics`: a series of the catalog (GET /api/metrics, scope
-- series), how it is drawn, its interval (none for the hours of the day) and its section. lenzi
-- changes them from /statistics/edit. Put in only while the statistics page has no chart at all,
-- deleted ones included: running the file again, or after lenzi changed them, adds nothing.

INSERT INTO view_items (surface, section, position, metric, chart, scale)
SELECT d.surface, d.section, d.position, d.metric, d.chart, d.scale
  FROM (
    SELECT 'statistics' AS surface, 'Consumption' AS section, 1 AS position, 'series.consumed' AS metric, 'line' AS chart, 'week' AS scale
    UNION ALL SELECT 'statistics', 'Consumption', 2, 'series.consumptions', 'bar', 'week'
    UNION ALL SELECT 'statistics', 'Money', 3, 'series.cost', 'bar', 'month'
    UNION ALL SELECT 'statistics', 'Money', 4, 'series.cost', 'donut', 'month'
    UNION ALL SELECT 'statistics', 'Money', 5, 'series.spend', 'bar', 'month'
    UNION ALL SELECT 'statistics', 'Prices', 6, 'series.unitPrice', 'line', 'month'
    UNION ALL SELECT 'statistics', 'Habits', 7, 'series.hourOfDay', 'bar', NULL
  ) d
 WHERE NOT EXISTS (SELECT 1 FROM view_items WHERE surface = 'statistics');
