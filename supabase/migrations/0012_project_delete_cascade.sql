-- v2-17: fix "Could not delete from database" on Delete Project. projects.id is referenced by
-- dpr_log.proj_id, material_lots.proj_id, finance_ledger.proj_id, and requests.linked_project_id,
-- none declared with an ON DELETE clause (defaults to NO ACTION) — so deleting a project failed
-- with a foreign-key violation the instant it had any DPR log, material lot, finance ledger row,
-- or a request converted into it. See plan.md v2-17.
--
-- dpr_log / material_lots / finance_ledger are purely project-scoped operational data with no
-- meaning once the project is gone -> CASCADE. requests is kept as historical record of who
-- asked for the project and when -> SET NULL instead of deleting the request row.
--
-- Constraint names confirmed against the live production schema (pg_constraint) before writing
-- this file — all four are the Postgres-default `<table>_<column>_fkey` names.

alter table dpr_log drop constraint if exists dpr_log_proj_id_fkey;
alter table dpr_log add constraint dpr_log_proj_id_fkey
  foreign key (proj_id) references projects(id) on delete cascade;

alter table material_lots drop constraint if exists material_lots_proj_id_fkey;
alter table material_lots add constraint material_lots_proj_id_fkey
  foreign key (proj_id) references projects(id) on delete cascade;

alter table finance_ledger drop constraint if exists finance_ledger_proj_id_fkey;
alter table finance_ledger add constraint finance_ledger_proj_id_fkey
  foreign key (proj_id) references projects(id) on delete cascade;

alter table requests drop constraint if exists requests_linked_project_id_fkey;
alter table requests add constraint requests_linked_project_id_fkey
  foreign key (linked_project_id) references projects(id) on delete set null;
