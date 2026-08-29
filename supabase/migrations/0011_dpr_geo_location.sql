-- DPR save now captures the supervisor's on-site location automatically (v2-16) — stored as
-- "lat, lng — reverse-geocoded address" text, same format already used for material-arrival
-- geo_location on material_lots.
alter table dpr_log add column geo_location text default '';
