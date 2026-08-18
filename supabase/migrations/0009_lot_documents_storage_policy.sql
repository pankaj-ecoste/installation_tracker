-- v2-7: the 5 new lot-document upload fields (eway-bills, delivery-chalans,
-- lr-copies-receiving, packing-lists, other-documents) write into these new folder
-- prefixes under the 'uploads' bucket. They need to be added to the existing
-- team-write allowlist from 0005_storage_policies.sql, or every upload 400s with
-- "new row violates row-level security policy" (caught live while testing v2-7).
drop policy if exists uploads_insert_team on storage.objects;
create policy uploads_insert_team on storage.objects for insert
  with check (
    bucket_id = 'uploads'
    and app_is_active_team_member()
    and (storage.foldername(name))[1] in (
      'material-arrival','wcc-docs','snags','dpr-photos','dpr-reports','lr-copies',
      'jmr-reports','project-docs','ra-bill-docs','requests','requests-wopopi',
      'requests-boqcad','requests-approvals','req-sample-po','visit-reports',
      'eway-bills','delivery-chalans','lr-copies-receiving','packing-lists','other-documents'
    )
  );
