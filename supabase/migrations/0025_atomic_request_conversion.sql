-- v2-56 — Converting a request to a project was two separate browser writes (insert project, then
-- mark the request "Converted to Project"). If the second one failed, the project existed but the
-- request stayed "Reviewed", and clicking Convert again hit the "access code already exists" wall
-- (SHALIMAR KSMB PROJECTS / PPO-0014, 2026-09-30). This makes both writes one transaction, and
-- makes a repeat call heal a half-converted request instead of erroring.
--
-- SECURITY INVOKER (the default) on purpose: the caller's own RLS on projects/requests still
-- applies, so who can convert is exactly who could before.

-- Database-level guard against two projects sharing an access code (verified: no duplicates today).
alter table projects add constraint projects_access_code_key unique (access_code);

create or replace function convert_request_to_project(p_request_id integer, p_project jsonb)
returns projects
language plpgsql
set search_path = public
as $$
declare
  v_req requests;
  v_code text;
  v_proj projects;
  v_cols text;
begin
  select * into v_req from requests where id = p_request_id for update;
  if not found then
    raise exception 'Request % not found', p_request_id;
  end if;

  v_code := upper(regexp_replace(v_req.request_number, '[^A-Za-z0-9]', '', 'g'));

  -- A project for this request already exists (earlier conversion whose second step was lost):
  -- reuse it rather than creating a duplicate.
  select * into v_proj from projects where access_code = v_code;

  if not found then
    -- Insert only the keys the caller sent that are real projects columns (id and any defaults
    -- are left to the database).
    select string_agg(quote_ident(c.column_name), ',') into v_cols
    from jsonb_object_keys(p_project) k
    join information_schema.columns c
      on c.table_schema = 'public' and c.table_name = 'projects' and c.column_name = k
    where k <> 'id';
    if v_cols is null then
      raise exception 'No project data supplied for request %', p_request_id;
    end if;
    execute format(
      'insert into projects (%s) select %s from jsonb_populate_record(null::projects, $1) returning *',
      v_cols, v_cols
    ) into v_proj using (p_project || jsonb_build_object('access_code', v_code));
  end if;

  update requests
     set status = 'Converted to Project',
         linked_project_id = v_proj.id,
         converted_at = coalesce(converted_at, now())
   where id = p_request_id;

  return v_proj;
end;
$$;
