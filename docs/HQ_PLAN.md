# Magnus HQ - Step 0 scan and plan

Scanned 2026-10-28 on branch `main` (last commit 48c97b7). No code was changed.
Brand: **Magnus Boy's System** / **Magnus HQ**.

---

## 1. Stack

| Part | What the repo uses |
|---|---|
| Framework | React 19 + TypeScript 5.9 + Vite 7 (single bundle, no code splitting yet - HQ will be the first `React.lazy` route) |
| Router | react-router-dom 7, `BrowserRouter`, all routes in `src/App.tsx` |
| Data fetching | **Plain `useEffect` + `supabase-js` in each page/hook. There is no React Query / TanStack in the repo.** |
| Shared state | `ProjectContext` (projects + `userRole`), `CompanySettingsContext` in settings |
| Styling | Tailwind 3 + `src/lib/theme.ts`, light/dark toggle, `lucide-react` icons, `recharts` for charts |
| Auth | Supabase Auth email + password (and magic/invite links via `AuthHashRouter`). Guards: `RequireAuth`, `RoleGuard`, `FinanceGuard` in `App.tsx` |
| Hosting | Vercel. Production **app.magnusboys.com** (`main`), staging magnus-system-v3-staging.vercel.app (`develop`). DNS at GoDaddy |
| Serverless | `api/` (Vercel Node functions: `share-card.ts`, `share-preview.ts`, helpers in `api/_lib`) + 19 Supabase Edge Functions in `supabase/functions` |
| Cron | No `crons` in `vercel.json`. `send-payment-reminders` edge function is guarded by `CRON_SECRET` and is scheduled outside the repo (pg_cron set up by hand, not in any migration) |
| PWA | `manifest.json` + `worker-manifest.json`, icons, splash. **No service worker.** `UpdateBanner` polls `/` for new deploys |
| Email | Resend from edge functions (`RESEND_API_KEY`, `INVITE_FROM_EMAIL`) |
| AI | `magnus-ai` edge function (`ANTHROPIC_API_KEY` in Supabase secrets) + `ai_usage_log` table |
| OCR | Tesseract.js in the browser (`magnusOCR.ts`, `receiptOCR.ts`, `idOCR.ts`) |
| Lint / checks | `npm run lint` (eslint 9), `npm run build` = `tsc -b && vite build`, `tsx --test` scripts |

Env variable names in use (values not read): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_OPENWEATHER_API_KEY`, `VERCEL_OIDC_TOKEN` (local only);
Supabase secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PROJECT_URL`, `SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `INVITE_FROM_EMAIL`, `APP_URL`,
`CRON_SECRET`, `WORKER_PORTAL_IP_SALT`, `ANTHROPIC_API_KEY`. Vercel `api/` reads only `SUPABASE_URL`/`SUPABASE_ANON_KEY` (falls back to the `VITE_` ones).

---

## 2. Database

### How tenants work
- `companies` (id, name, description, created_at, updated_at) - the tenant.
- `user_profiles` (id = auth user id, `company_id`, `role`, status, finance_access_level ...) - **one company per user; this is the membership table**.
  Roles: director, admin, estimator, supervisor, office_user, site_user, secretary.
- `company_settings` (1 row per company): branding, worker prefix, **`trial_expires_at`, `subscription_status`, `subscription_expires_at`, `subscription_plan`**.
- Sign-up: `handle_new_user` trigger on `auth.users` creates a company + `company_settings` with a **14-day trial**, unless a pending invitation exists.
  New companies also get the rate library and chart of accounts copied by triggers.
- RLS pattern: `company_id IN (SELECT up.company_id FROM user_profiles up WHERE up.id = auth.uid())`, plus helper functions such as
  `_company_of_user`, `_company_of_project`, `_finance_full_company`, `_payroll_staff_company`. 31 SECURITY DEFINER functions are wrapped with company checks (migration 20260944).
- System companies that are NOT tenants: rate-library template `00000000-0000-4000-8000-00000000a110`, chart-of-accounts template `...a111`.

### Last migration
`20260954000000_invoice_mark_as_sent.sql` (222 files). Next free number: **20260955000000**.
Apply each one the README way: run the single file in the SQL Editor, then `npx supabase migration repair --status applied <version> --linked`. Never `db push`.

### RLS gaps (static scan of migration files - must be confirmed on live)
The live database was partly changed by hand and some tables (e.g. `cost_items`, `master_categories`, `client_portal_sessions`, `access_logs`) are not created in any migration,
so the migration files alone can't prove RLS. Found in files:
- **No `enable row level security` found:** `migration_conflicts`, `takeoff_folders`, `takeoff_tags`, `takeoff_measurement_tags` (the last one got a company policy in 20260944 - check RLS is on).
- **RLS on, no policies (deny-all, used only through definer functions - probably intentional):** `ai_usage_log`, `client_contact_portal_access`,
  `worker_number_counters`, `worker_portal_access`, `worker_portal_login_attempts`, `worker_portal_sessions`.
- **Had `USING (true)` policies at creation (check they were replaced):** `clients`, `projects`, `estimate_headers`, `estimate_items`,
  `item_supplier_links`, `supplier_item_price_history`, `client_comments`.

**Read-only check to run now in the SQL Editor** (paste results back; this is what Step 2's `hq_security_scan()` will automate):

```sql
select 'RLS OFF' as problem, c.relname as tbl, null as detail
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
select 'NO POLICIES', c.relname, null
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
union all
select 'TRUE POLICY', tablename, policyname || ' (' || cmd || ', ' || array_to_string(roles, ',') || ')'
from pg_policies
where schemaname = 'public' and (trim(qual) = 'true' or trim(with_check) = 'true')
union all
select 'DEFINER NO search_path', p.proname, pg_get_function_identity_arguments(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')
order by 1, 2;
```

---

## 3. Existing admin bits (re-use, don't duplicate)

| Found | State | Plan |
|---|---|---|
| `company_settings.trial_expires_at / subscription_status / subscription_expires_at / subscription_plan` | Real, set at sign-up | **Re-use** as the company's subscription state in Step 4/5 |
| `RequireAuth` expired-trial check | Hard-redirects expired companies to `/upgrade` (full lock-out) | Step 5 changes it to **read-only** instead |
| `useSubscription.ts` | Reads the columns above; **not used anywhere** | Re-use as the base of the "My plan" hook |
| `src/lib/plans.ts`, `usePlan.ts`, `BillingPage.tsx` | **Fake**: plan stored in the browser's localStorage, USD prices hard-coded | Replace with `platform_prices` (Step 5) |
| `UpgradePage.tsx` | Hard-coded JMD 15,000 / 35,000 / Custom | Rebuild as "My plan" reading `platform_prices` |
| `payroll_tax_settings` | Per-company statutory rates, director-editable, one row per company | Step 8: platform-level dated table; payroll reads by pay date |
| `ErrorBoundary.tsx`, `errorLogger.ts` | Errors kept in memory + console only | Step 6: send to `log_app_error` |
| `ai_usage_log` + `magnus-ai` | Per-company AI usage counter | Step 12: re-use `magnus-ai`, log cost there |
| `access_logs`, `client_portal_activity`, `project_activity`, `approval_history` | Company-level activity logs | Not platform audit; `platform_audit` is new |
| `send-payment-reminders` + `CRON_SECRET` | Pattern for a secret-guarded scheduled job | Copy the pattern for the daily HQ job |
| `useAdminAccess`, `usePayrollActivationAccess` (`super_admin`) | Company director/admin only; `super_admin` role doesn't exist | Not used for HQ (platform admin is separate) |
| Feature flags, notifications table, push, service worker, platform admin | **None exist** | Built new in Steps 1, 7, 8 |

---

## 4. Signed-out routes today

`/login` (sign-in + sign-up + forgot password), `/accept-invite`, `/reset-password`, `/auth/confirm`,
`/verify/:workerId` and `/v/:code` (ID card checks), `/worker` and `/worker/home` (worker portal, number + PIN),
`/portal/:token`, `/portal/contact/:contactToken`, `/client-portal/session/:sessionToken`, `/client-login`, `/client-reset-password` (client / field-officer portals),
`/shared/:token` (photo share), `/receipt/:token` (public receipt), plus `/api/share-card` and `/api/share-preview` (WhatsApp previews).
`/` today needs sign-in and sends visitors to `/login`; unknown URLs redirect to `/`. No `robots.txt` or `sitemap.xml`. OG tags exist in `index.html`.

---

## 5. What HQ counts per company

| Number | Source |
|---|---|
| Users | `user_profiles` by `company_id` (+ last sign-in from `auth.users.last_sign_in_at`) |
| Projects | `projects` |
| Clients | `clients` |
| Workers | `workers` |
| Payroll runs | `staff_payroll_runs` and `payroll_periods` (worker payroll) |
| Field payments | `field_payments` |
| Invoices | `client_invoices` |
| POs | `purchase_orders` |
| Receipts | `field_payment_receipts`, `receipt_archive`, `receipt_share_links` |
| Storage used | `storage.objects` - `private-files` paths start with the company id; other buckets (`project-files`, `project-photos`, `company-assets`, `company-logos`, `company-documents`) need their path layout mapped in Step 4 |
| Last activity | Latest of: user sign-in, and newest `updated_at/created_at` on projects, invoices, field payments, daily logs |

All counts only - no rows, names or amounts from inside a company. Template companies are excluded.

---

## 6. Migration plan (one file per step; later fixes get their own number)

| Step | File |
|---|---|
| 1 | `20260955000000_platform_admin_foundation.sql` - platform_admins, platform_audit, platform_settings, is_platform_admin(), platform_check(), admin add/remove |
| 2 | `20260956000000_hq_security_scan.sql`, then one file per fix: `20260956010000_rls_<table>.sql`, `20260956020000_...` |
| 3 | `20260957000000_hq_overview.sql` - overview + chart functions |
| 4 | `20260958000000_hq_companies.sql` - company status (active/paused/closed, closed_at, purge_after), is_system flag, per-company stats, close/reopen/purge, export |
| 5 | `20260959000000_platform_billing.sql` - platform_prices, plans, company bills, payment claims/confirmations, charging switch; `20260959010000_company_read_only_guard.sql` |
| 6 | `20260960000000_health_errors_traffic.sql` - heartbeat, app_errors (grouped), traffic counters, public health function |
| 6b | `20260961000000_platform_subscriptions.sql` - my bills + payment history + seed rows |
| 7 | `20260962000000_notifications_and_push.sql` - notifications, push_subscriptions |
| 8 | `20260963000000_platform_banner_features.sql`, `20260963010000_statutory_rates.sql` |
| 9 | `20260964000000_support_access.sql` |
| 10 | `20260965000000_public_site_leads_feedback.sql` |
| 11 | `20260966000000_website_content.sql` |
| 12 (optional) | `20260967000000_ask_hq.sql` |

---

## 7. Things in the brief that don't fit the repo - with suggestions

1. **No React Query.** The brief says re-use it, but it isn't installed. Suggest HQ follows the existing pattern (small hooks with `useEffect` + `supabase.rpc`). Adding React Query only for HQ is possible but would be a second pattern.
2. **The HQ login will get its own company.** Signing up `magnusboysacct+hq@gmail.com` fires `handle_new_user`, which makes a new company with a trial.
   Suggest: let it happen, then the "make owner-admin" SQL also marks that company `is_system = true` so it never counts as a tenant, and sends the HQ account straight to `/hq`.
3. **MFA must be checked in the database, not just the screen.** `is_platform_admin()` will require the session to be MFA-verified (`auth.jwt() ->> 'aal' = 'aal2'`), so a stolen password alone can't call HQ functions.
4. **Read-only is a big change.** Today an expired company is fully locked out (`/upgrade`). True read-only means blocking inserts/updates/deletes on ~126 tables plus the SECURITY DEFINER functions.
   Suggest: one migration that adds a **RESTRICTIVE** write policy to every company table (generated from the catalog, like 20260944 did), a check inside the write functions, and a UI banner. This gets its own careful step with a dry run.
5. **Daily job.** Vercel cron works (Hobby allows one run a day). Option B: pg_cron in the database (already used for reminders) does the DB work with no service key in Vercel at all, and only the push sending runs in an API function. Recommend B for less secret exposure; your call.
6. **Vercel Hobby plan.** Vercel's free plan is for non-commercial use. When the Charging switch goes ON and companies pay, plan to move Vercel to Pro. Supabase free also has limited backups - the System tab will show this.
7. **Front page domain.** The app lives at **app.magnusboys.com**. The brief says `/` becomes the front page - that works on app.magnusboys.com. If you also want **magnusboys.com** (the bare domain) to show it, that's a GoDaddy DNS + Vercel domain step. Need your choice.
8. **Statutory rates.** Current code/defaults say NIS 2.75% with **no income cap** and PAYE threshold **J$1,500,096**; both look out of date. Step 8 will seed from official TAJ / NIS sources and show you the links before payroll switches over. `payroll_tax_settings` stays readable as a fallback until then.
9. **Front page claims.** OCR is browser-side and partly stubbed (audit finding), so the site should say "receipt scanning (beta)", not full OCR.
10. **Services found for the Bills tab (Step 6b):** Supabase, Vercel, GitHub, GoDaddy (domain + DNS), Google/Gmail, Anthropic, Resend (email), OpenWeather (weather key), UptimeRobot (new). No SMS / WhatsApp API is used (WhatsApp is plain share links), and no paid storage or OCR service.
11. **Baseline check.** Type check, lint and build must be run on your PC before Step 1 so we know which errors (if any) already exist and aren't caused by HQ.

---

## Decisions needed before "go"

- A. Front page on app.magnusboys.com only, or also magnusboys.com? (item 7)
- B. HQ account's auto-made company: mark as system (recommended) - OK? (item 2)
- C. Daily job: pg_cron (recommended) or Vercel cron? (item 5)
- D. Data fetching: existing hook pattern (recommended) or add React Query? (item 1)

### Decisions made (2026-10-28)
- A. Front page on **app.magnusboys.com** for now (no DNS change). magnusboys.com can point to it later.
- B. HQ account's auto-made company is marked **system** and never counted.
- C. Daily job runs on **pg_cron**; only push sending runs in an API function.
- D. Keep the **existing hook pattern** (no React Query).

## Progress
- **Step 1 - Platform admin foundation:** built. Migration `20260955000000_platform_admin_foundation.sql`.
  Files: `src/lib/hq/platformAdmin.ts`, `src/hooks/usePlatformStatus.ts`, `src/hooks/useIdleSignOut.ts`,
  `src/pages/hq/HQPage.tsx`, `HQMfaGate.tsx`, `HQAdminsTab.tsx`; edits to `src/App.tsx` (lazy `/hq` route, system companies
  never expire and open HQ at "/") and `src/layout/AppLayout.tsx` (Magnus HQ shield link, admins only).
- **Step 2 - Security check:** built. Migrations `20260956000000_hq_security_scan.sql` (scan + `platform_security_notes` for
  "OK on purpose" items), `20260956010000_definer_functions_search_path.sql` (33 functions), `20260956020000_rls_migration_conflicts.sql`,
  `20260956030000_rls_project_actuals.sql` (fixes close-out + estimate suggestions, which silently failed). HQ Health tab shows the scan.
  `rate_update_batches` read stays open on purpose (see 20260944). The public health check (Step 6) will include the scan counts.
- **Step 3 - Overview tab:** built. Migration `20260957000000_hq_overview.sql` (`platform_activity_days` + `record_activity()`,
  `hq_overview()`). The app records one row per user per day (user, company, date only) from `AppLayout`
  (`src/lib/hq/activity.ts`). Attention list today: security problems/warnings, maintenance mode, companies past due;
  payments, bills, sign-ups, feedback and reminders join as their steps are built. Platform income arrives with Step 5.
  Migrations 20260955-20260957 were test-run twice in a row on a scratch Postgres (PGlite) with stand-in tables.
- **Step 4 - Companies tab:** built. Migration `20260958000000_hq_companies.sql`: `companies.account_status`
  (active / paused / closed), `is_test`, `purge_after`; RESTRICTIVE `hq_guard_*` policies on every company table
  (paused = read-only, closed = no access), re-applied with `select public.hq_apply_company_guards();` and flagged by the
  security scan if a new table lacks them; `hq_list_companies`, `hq_company_action`, `hq_company_delete_now` (test only),
  `hq_company_export` (secrets left out), `hq_purge_expired_companies` (for the Step 5 daily job); `hq_overview` updated.
  App: closed screen in `RequireAuth`, read-only banner in `AppLayout`. Known gaps, closed in Step 5: SECURITY DEFINER
  functions and storage uploads are not yet blocked for paused companies; stored files of deleted companies are cleared
  by the daily job. Per-company feature switches moved to Step 8. Test-run twice on PGlite (pause/close/reopen/delete/export).
- **Step 5 - Money:** built. Migration `20260959000000_platform_billing.sql`: `platform_prices` (seeded Starter J$15,000 /
  Pro J$35,000 / Enterprise custom, extras off), `platform_settings.billing` (Charging starts OFF), `platform_bills`,
  `platform_payments`, `notifications`, `platform_job_runs`, `companies.billing_locked` (same guard as Pause),
  `hq_daily_job()` scheduled with pg_cron at 06:10 UTC, `my_plan` / `my_claim_payment`, `hq_billing` and friends,
  `get_public_prices()` for the front page, a "free" plan that is never billed, storage upload guard, and closed companies
  refused by `_caller_may_use_company`. App: `MyPlanPage` at /billing and /upgrade (old BillingPage, UpgradePage,
  plans.ts, usePlan, useSubscription removed); the old "trial ended = locked out" redirect is gone; read-only banner +
  "My plan" link for directors/admins; HQ Money tab. Still open: paused / unpaid companies can write through the company
  server functions that check `_caller_may_use_company` (closed ones can't). Test-run twice on PGlite.
