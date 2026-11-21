-- v2-79: SVR (Site Visit Report) — "New Site" reports from the field (plan.md v2-79).
-- One row per report. Who submitted it, when, and the GPS point are owned by the DATABASE (trigger below), never
-- trusted from the browser — see the "client-computed values should be DB-owned" lesson.
-- No foreign key to team_members on purpose (same as visit_plans): it would block the Team tab's "delete member".

create table if not exists site_visit_reports (
  id bigint generated always as identity primary key,
  report_type text not null default 'new_site',
  submitted_by_id integer not null,
  submitted_by_name text not null,
  site_name text not null,
  client_name text not null,
  project_type text not null,
  city text not null,
  contact_name text not null default '',
  contact_mobile text not null default '',
  lat double precision,
  lng double precision,
  location_text text not null default '',
  docs jsonb not null default '[]'::jsonb,
  remarks text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (report_type in ('new_site')),
  check (project_type in ('Residential','Commercial','Resi-cum-Commercial'))
);

create index if not exists site_visit_reports_created_idx on site_visit_reports (created_at desc);
create index if not exists site_visit_reports_submitter_idx on site_visit_reports (submitted_by_id);

-- Access follows the Role Permissions grid (permission 'useSVR'), same shape as Visit Planner (0033):
--   full access  = admin, or any non-supervisor role whose tick is on (no saved row: Ops Manager on, others off);
--   own access   = supervisor while the Supervisor tick is on (default on).
create or replace function app_svr_full_access() returns boolean
language sql stable
as $$
  select app_is_active_team_member() and (
    app_jwt_team_role() = 'admin'
    or (app_jwt_team_role() <> 'supervisor' and coalesce(
         (select rp.allowed from role_permissions rp where rp.role = app_jwt_team_role() and rp.permission = 'useSVR'),
         app_jwt_team_role() = 'manager'))
  );
$$;

create or replace function app_svr_supervisor_access() returns boolean
language sql stable
as $$
  select app_is_active_team_member() and app_jwt_team_role() = 'supervisor' and coalesce(
    (select rp.allowed from role_permissions rp where rp.role = 'supervisor' and rp.permission = 'useSVR'), true);
$$;

create or replace function site_visit_reports_enforce() returns trigger
language plpgsql
as $$
declare
  v_name text;
  v_n int;
begin
  if tg_op = 'INSERT' then
    new.submitted_by_id := app_jwt_team_member_id();
    select m.name into v_name from team_members m where m.id = new.submitted_by_id;
    if v_name is null then raise exception 'Not logged in'; end if;
    new.submitted_by_name := v_name;
    new.created_at := now();
    -- GPS is mandatory (proof of visit)
    if new.lat is null or new.lng is null then
      raise exception 'Site location (GPS) is required';
    end if;
  else
    -- who / when / where can never be changed by an edit
    new.submitted_by_id := old.submitted_by_id;
    new.submitted_by_name := old.submitted_by_name;
    new.created_at := old.created_at;
    new.lat := old.lat;
    new.lng := old.lng;
    new.location_text := old.location_text;
    new.report_type := old.report_type;
  end if;
  new.updated_at := now();

  new.site_name := trim(coalesce(new.site_name, ''));
  new.client_name := trim(coalesce(new.client_name, ''));
  new.city := trim(coalesce(new.city, ''));
  new.contact_name := trim(coalesce(new.contact_name, ''));
  new.contact_mobile := trim(coalesce(new.contact_mobile, ''));
  new.remarks := trim(coalesce(new.remarks, ''));
  if new.site_name = '' then raise exception 'Site / Project Name is required'; end if;
  if new.client_name = '' then raise exception 'Client / Builder Name is required'; end if;
  if new.city = '' then raise exception 'City is required'; end if;
  if new.contact_mobile <> '' and new.contact_mobile !~ '^[0-9]{10}$' then
    raise exception 'Contact mobile must be 10 digits';
  end if;
  if jsonb_typeof(new.docs) is distinct from 'array' then raise exception 'Documents must be a list'; end if;
  v_n := jsonb_array_length(new.docs);
  if v_n < 1 then raise exception 'At least one photo / document is required'; end if;
  if v_n > 20 then raise exception 'At most 20 photos / documents'; end if;
  return new;
end;
$$;

drop trigger if exists site_visit_reports_enforce_trg on site_visit_reports;
create trigger site_visit_reports_enforce_trg
  before insert or update on site_visit_reports
  for each row execute function site_visit_reports_enforce();

-- Reads are NOT open (fetched after login, never in loadAllData()).
alter table site_visit_reports enable row level security;

drop policy if exists site_visit_reports_select on site_visit_reports;
create policy site_visit_reports_select on site_visit_reports for select
  using (app_svr_full_access() or (app_svr_supervisor_access() and submitted_by_id = app_jwt_team_member_id()));

-- Anyone with access may submit; the trigger always stamps the submitter as the logged-in person.
drop policy if exists site_visit_reports_insert on site_visit_reports;
create policy site_visit_reports_insert on site_visit_reports for insert
  with check (app_svr_full_access() or app_svr_supervisor_access());

-- Edit / delete: Admin only.
drop policy if exists site_visit_reports_update on site_visit_reports;
create policy site_visit_reports_update on site_visit_reports for update
  using (app_is_active_team_member() and app_jwt_team_role() = 'admin')
  with check (app_is_active_team_member() and app_jwt_team_role() = 'admin');

drop policy if exists site_visit_reports_delete on site_visit_reports;
create policy site_visit_reports_delete on site_visit_reports for delete
  using (app_is_active_team_member() and app_jwt_team_role() = 'admin');

-- Duplicate warning: a supervisor can only read their own SVRs, so "has anyone already reported this site?" needs a
-- narrow definer function. It returns only name / submitter / date of up to 5 similar sites, and only to people with
-- SVR access. Names are compared on letters+digits only, either one containing the other.
create or replace function svr_similar_sites(p_name text)
returns table (site_name text, submitted_by_name text, created_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  with q as (select lower(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9]', '', 'g')) as k)
  select s.site_name, s.submitted_by_name, s.created_at
  from site_visit_reports s, q
  where (app_svr_full_access() or app_svr_supervisor_access())
    and length(q.k) >= 4
    and (position(q.k in lower(regexp_replace(s.site_name, '[^a-zA-Z0-9]', '', 'g'))) > 0
         or position(lower(regexp_replace(s.site_name, '[^a-zA-Z0-9]', '', 'g')) in q.k) > 0)
  order by s.created_at desc
  limit 5;
$$;

revoke all on function svr_similar_sites(text) from public;
grant execute on function svr_similar_sites(text) to anon, authenticated;

-- Photos / documents go to the 'svr-photos' folder. ADDITIVE policy on purpose (never redefine uploads_insert_team,
-- that regressed a live policy before — plan.md v2-40).
drop policy if exists uploads_insert_svr on storage.objects;
create policy uploads_insert_svr on storage.objects for insert
  with check (
    bucket_id = 'uploads'
    and (app_svr_full_access() or app_svr_supervisor_access())
    and (storage.foldername(name))[1] = 'svr-photos'
  );
