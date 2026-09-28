-- v2-52: "Next Week Projection Qty" — a free-text/manual figure the site staff enters on any
-- day's DPR, distinct from the auto-computed "Weekly Committed Qty" / "Weekly Actual Qty" (both
-- of which are pure sums of existing today_projection_qty / product todayInstalled figures and
-- need no new column). Nullable, optional: not every entry will have it filled in.
alter table dpr_log add column if not exists next_week_projection_qty numeric;
