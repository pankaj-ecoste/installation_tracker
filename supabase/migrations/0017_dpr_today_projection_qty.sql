-- v2-33: mandatory "Today Projection Qty (sq ft)" field on the Add DPR form — the site
-- supervisor's own estimate for today's installation, distinct from the auto-computed per-product
-- "Daily targeted qty" column. Nullable with no default: existing DPR rows predate this field and
-- have nothing to backfill it from; the frontend enforces "mandatory" only for new saves.
alter table dpr_log add column today_projection_qty numeric;
