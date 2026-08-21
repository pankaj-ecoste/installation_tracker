-- "No. of Towers/Blocks" becomes an editable reference number on existing projects
-- (previously it only drove how many project rows Add Project created, then was discarded).
alter table projects add column tower_count integer not null default 1;
