-- 005_substance_chart: the chart the substance page starts with (design-statistics.md, "charts
-- panel"; 2026-10-01).
--
-- A view item of the surface `substance` that has a chart is a chart of the substance page: a
-- series of the catalog, drawn for that substance with one line per batch (and one for its one-time
-- consumptions); the items without a chart are the metrics of its panel. It goes after them. Put in
-- only while the substance page has no chart at all, deleted ones included: running the file again,
-- or after lenzi changed it, adds nothing.

INSERT INTO view_items (surface, section, position, metric, chart, scale)
SELECT 'substance', NULL, d.last + 1, 'series.consumed', 'bar', 'week'
  FROM (SELECT COALESCE(MAX(position), 0) AS last FROM view_items WHERE surface = 'substance') d
 WHERE NOT EXISTS (SELECT 1 FROM view_items WHERE surface = 'substance' AND chart IS NOT NULL);
