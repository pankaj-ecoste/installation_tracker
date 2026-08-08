-- Phase D (storage half): creates the 'uploads' bucket (queried directly against
-- storage.buckets — it did not exist yet on this project, confirmed before writing this file)
-- and locks down who can write into it. Matches the RLS scope decision in
-- 0004_rls_policies.sql: today anyone holding the anon key can upload anywhere in any bucket;
-- this migration closes that for writes while leaving reads exactly as they are today.
--
-- Bucket stays PUBLIC for read (matches every existing getPublicUrl() call site in
-- src/lib/uploads.js — switching to signed URLs would be an observable behavior change, since
-- these links are stored long-term in jsonb columns like jmr_docs/project_docs). Supabase serves
-- objects in a public bucket via the public URL endpoint independent of RLS, so no SELECT policy
-- is required for the app's existing read behavior to keep working; a SELECT policy is added
-- below anyway for consistency with the table policies and to keep the dashboard's file browser
-- usable by staff.
--
-- Folder prefixes below are the complete, exact set found by grepping every uploadFiles(...)/
-- uploadFilesWithNames(...) call site in src/ (not copied from the architecture doc, which
-- listed a couple of names ["dispatch"] that don't actually appear in the code) — see
-- src/lib/uploads.js, src/lib/constants.js POSTPO_DOC_CATEGORIES, and every call site under
-- src/sections/ and src/auth/vendorAuth.js.

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

drop policy if exists uploads_select_open on storage.objects;
create policy uploads_select_open on storage.objects for select
  using (bucket_id = 'uploads');

-- Team-written folders: every one of these is only ever uploaded to by an already-logged-in
-- team member (dprTab, materialTab, addEditProject, projectCards, financeTab, requestsTab) —
-- same "write requires the team JWT that only exists post-login" reasoning as 0004's table
-- policies. app_is_active_team_member() is the same helper function defined there.
drop policy if exists uploads_insert_team on storage.objects;
create policy uploads_insert_team on storage.objects for insert
  with check (
    bucket_id = 'uploads'
    and app_is_active_team_member()
    and (storage.foldername(name))[1] in (
      'material-arrival','wcc-docs','snags','dpr-photos','dpr-reports','lr-copies',
      'jmr-reports','project-docs','ra-bill-docs','requests','requests-wopopi',
      'requests-boqcad','requests-approvals','req-sample-po','visit-reports'
    )
  );

-- vendor-kyc: uploaded during vendor registration (src/auth/vendorAuth.js), which runs under a
-- real Supabase Auth session (signUp), not the custom team JWT — gate is simply "authenticated
-- Supabase Auth user", matching vendor_profiles_insert's auth.uid() check in 0004.
drop policy if exists uploads_insert_vendor_kyc on storage.objects;
create policy uploads_insert_vendor_kyc on storage.objects for insert
  with check (
    bucket_id = 'uploads'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = 'vendor-kyc'
  );

-- No update/delete policies: the app never edits or deletes an uploaded file once written
-- (grepped every call site above — all are one-way uploadFiles()/uploadFilesWithNames() calls),
-- so default-deny under RLS is correct there, same as activity_log in 0004.
