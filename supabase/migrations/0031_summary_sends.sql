-- v2-70: Summary module — one row each time admin clicks Email or WhatsApp for a project's daily summary.
-- "Sent" here means "admin clicked the button": Gmail drafts and wa.me links cannot report real delivery.
-- Resend simply adds another row; the Summary tab shows the latest per project + date + channel.
-- Who sent it, and when, are derived HERE from the JWT / the clock — never trusted from the browser
-- (see the "client-computed values should be DB-owned" lesson in plan.md). Admin only, read and write.

create table if not exists summary_sends (
  id bigint generated always as identity primary key,
  project_id integer not null references projects(id) on delete cascade,
  summary_date date not null,
  channel text not null check (channel in ('email','whatsapp')),
  note text not null default '',
  sent_by_id integer,
  sent_by_name text,
  sent_at timestamptz not null default now()
);

create index if not exists idx_summary_sends_date on summary_sends(summary_date);

create or replace function summary_sends_set_owner() returns trigger
language plpgsql
as $$
begin
  new.sent_by_id := app_jwt_team_member_id();
  new.sent_by_name := app_active_team_member_name();
  new.sent_at := now();
  return new;
end;
$$;

drop trigger if exists trg_summary_sends_set_owner on summary_sends;
create trigger trg_summary_sends_set_owner before insert on summary_sends
  for each row execute function summary_sends_set_owner();

alter table summary_sends enable row level security;

drop policy if exists summary_sends_select on summary_sends;
create policy summary_sends_select on summary_sends for select
  using (app_is_active_team_member() and app_jwt_team_role() = 'admin');

drop policy if exists summary_sends_insert on summary_sends;
create policy summary_sends_insert on summary_sends for insert
  with check (app_is_active_team_member() and app_jwt_team_role() = 'admin');
