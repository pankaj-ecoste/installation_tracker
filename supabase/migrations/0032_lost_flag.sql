-- v2-75: "Lost" marker on requests and projects (plan.md v2-75).
-- A separate flag, NOT a new request_type / source_request_type value, so un-marking Lost restores the
-- original type (Mockup, CNC, ...) and no workflow / numbering / report logic that keys on the type is touched.
-- Additive only: existing rows get false. Existing RLS (any active team member may update) already covers it.
alter table requests add column if not exists is_lost boolean not null default false;
alter table projects add column if not exists is_lost boolean not null default false;
