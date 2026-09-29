-- v2-54: "CRM / Sale Order unique number" is collected on Main Order / Post-Main Order
-- requests (POSTPO_FIELDS.crmSoNumber) but was never carried onto the project created from
-- that request — the team wants it visible on Projects, Dashboard, Requests, Gantt, Material
-- and Finance, not just on the original Request. Nullable: older/imported projects won't have one.
alter table projects add column if not exists crm_so_number text;
