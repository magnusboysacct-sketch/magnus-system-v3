/*
  Fix: v_project_finance_summary ran with view-owner privileges, bypassing
  RLS on every table it's built from

  Confirmed while wiring the Director Dashboard's Project Health card:
  the view's original CREATE VIEW statement (20260315171014_add_project_
  finance_monitoring_views.sql) sets no security_invoker option, and no
  later migration touches it. Postgres views default to evaluating with
  the VIEW OWNER's privileges and RLS exemptions, not the querying user's,
  unless security_invoker = true is explicitly set (Postgres 15+). Since
  this view was created by the elevated role migrations run as, it very
  likely bypassed row-level security entirely on projects, boqs,
  project_costs, client_invoices, and every other table it joins —
  meaning any authenticated caller querying it directly (with no filter,
  or with a filter on a column the view doesn't even expose) could read
  every company's project financials, not just their own. The view also
  has no company_id column at all to filter by, which made the gap worse:
  there was no way to scope a direct query to one company even if you
  wanted to.

  Verified this wasn't actively exploited: this Supabase instance
  currently has exactly one company/tenant, so there was no second
  company's data for it to leak. But the gap itself was real, not
  theoretical, and would become a live cross-tenant leak the moment a
  second company existed on this instance — worth closing now while it's
  a one-line fix, not after there's real multi-tenant data at risk.

  ProjectHealthCard.tsx already defends against this independently — it
  fetches active project ids from `projects` first (which DOES have
  company_id and real, working RLS: see 20260510120000_add_projects_
  company_id.sql), then only ever queries this view filtered to that
  already-company-scoped id set. So the dashboard card was never actually
  exposed by this gap. This migration closes it at the source instead —
  every current and future caller of this view gets correct RLS
  enforcement automatically, rather than every caller needing to
  independently remember to filter defensively the way this one card
  does.
*/

ALTER VIEW v_project_finance_summary SET (security_invoker = true);
