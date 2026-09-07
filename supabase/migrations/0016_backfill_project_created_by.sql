-- v2-25 (2026-09-07): backfills projects.created_by that was silently overwritten by a client
-- bug in saveProject() (src/sections/projects/addEditProject.js) — every save via the "Edit
-- project" panel unconditionally stamped created_by with whoever was currently logged in, even
-- when editing someone else's project. In practice this happened almost immediately: converting
-- a request opens the Edit panel right away (confirmConvertRequestToProject() ->
-- openEditProject()), and it's usually an admin/manager who saves it first, wiping the sales
-- person's attribution. Result: Sales/Viewer staff (whose "All Projects" view is scoped to
-- created_by = their own username, visibleProjects() in src/lib/helpers.js) saw 0 projects even
-- though they had logged the originating request.
--
-- Same root-cause shape as 0014 (dpr_log ownership) and 0015 (request numbering): a value that
-- should be database-owned was left to a client-sent field instead. Unlike those two, created_by
-- has one legitimate mutation path (the "Update" panel's explicit Created By reassignment
-- dropdown, saveUpdate() in addEditProject.js) — so this is a targeted data backfill plus the
-- client-side fix, not a blanket trigger that would also block that legitimate reassignment.
--
-- Only the 14 projects traceable back to their originating request via requests.linked_project_id
-- are corrected here — every one of them had drifted to the editor's username. The remaining ~63
-- projects predate the request-conversion flow (manual Add Project / CSV import) and have no
-- request to recover the true creator from, so they're left as-is rather than guessed at.
update projects p
set created_by = r.created_by
from requests r
where r.linked_project_id = p.id
  and p.created_by is distinct from r.created_by;
