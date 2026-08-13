-- The team decided Finance-role staff should be able to add new finance ledger rows, not just
-- edit existing ones (see plan.md v2-5). 0004_rls_policies.sql originally restricted
-- finance_ledger INSERT to admin only ("manager/finance can edit rows but not add new ones") —
-- that decision is being changed for Finance here. Widens the INSERT policy to match the
-- existing UPDATE policy's role set (admin, manager, finance) minus manager, since only Finance
-- was asked for.
drop policy if exists finance_ledger_insert on finance_ledger;
create policy finance_ledger_insert on finance_ledger for insert
  with check (app_is_active_team_member() and app_jwt_team_role() in ('admin','finance'));
