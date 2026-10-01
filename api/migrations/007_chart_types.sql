-- 007_chart_types: two more ways to draw a chart (lenzi, 2026-10-02, after the reference photo of
-- the chart style, diary 2026-10-03: treemap and radar "Ok"). A treemap draws the lines' totals,
-- like a donut, as rounded tiles; a radar draws what a line draws, its periods around a circle.
-- Which series each can draw is the catalog's (src/modules/metrics/catalog.ts). Re-running it
-- changes nothing.

ALTER TABLE view_items
  MODIFY chart ENUM('bar', 'line', 'donut', 'treemap', 'radar') NULL;
