-- v2-44: admin can add / replace a vendor's KYC document from the New Vendors tab.
--
-- Why this is needed: 0005's uploads_insert_vendor_kyc requires auth.uid() to be set, but the
-- team JWT carries no `sub`, so auth.uid() is null for an admin; and 'vendor-kyc' is not in the
-- uploads_insert_team folder allowlist. Without this, every admin KYC upload 400s with
-- "new row violates row-level security policy".
--
-- ADDITIVE on purpose: a NEW policy, not a redefinition of uploads_insert_team. Re-defining an
-- existing policy in a migration is what regressed a live policy before (plan.md v2-40).
-- Policies are OR-ed, so this only widens access for one role to one folder; the vendor's own
-- registration upload path (uploads_insert_vendor_kyc) is untouched.
drop policy if exists uploads_insert_admin_vendor_kyc on storage.objects;
create policy uploads_insert_admin_vendor_kyc on storage.objects for insert
  with check (
    bucket_id = 'uploads'
    and app_is_active_team_member()
    and app_jwt_team_role() = 'admin'
    and (storage.foldername(name))[1] = 'vendor-kyc'
  );
