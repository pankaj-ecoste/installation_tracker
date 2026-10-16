-- v2-63 — Without-frame Main Order projects must not carry the 3 framing milestones.
-- One-time backfill for projects converted before the rule existed. Matched through the source
-- request (requests.linked_project_id); projects with no request behind them are left alone.
-- Idempotent. Verified in prod before writing: 2 affected projects (ids 100, 101), no dates on any of the 3 steps.
update projects p
set milestones = coalesce((
      select jsonb_agg(m order by ord)
      from jsonb_array_elements(p.milestones) with ordinality as t(m, ord)
      where m->>'label' not in ('Framing material mobilized','Framing work started','Framing work completed')
    ), '[]'::jsonb),
    framing_material = '',
    section_size = ''
from requests r
where r.linked_project_id = p.id
  and r.request_type = 'main-order'
  and r.request_sub_type = 'Without frame'
  and exists (
    select 1 from jsonb_array_elements(p.milestones) m
    where m->>'label' in ('Framing material mobilized','Framing work started','Framing work completed')
  );
