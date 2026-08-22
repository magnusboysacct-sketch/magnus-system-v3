/*
  Fix company_invitations_role_check — real live constraint (confirmed via
  pg_get_constraintdef) still used the pre-fix phantom vocabulary
  (director, admin, project_manager, site_supervisor, estimator,
  procurement, accounts, viewer). Not in any tracked migration — added
  live, outside migration history, sometime after the original role-
  vocabulary audit. Same untracked-drift pattern found repeatedly this
  session.

  ── Why NOT VALID ────────────────────────────────────────────────────────
  A plain ADD CONSTRAINT failed: 7 historical rows (all status='accepted'
  or 'revoked', dated back to 2026-06-28 — old, completed/dead invite
  records, not active data) use the old vocabulary: 5 rows with
  role='site_supervisor', 2 rows with role='accounts'. site_supervisor has
  a clean real equivalent (supervisor), but accounts does not — same
  "no obvious real substitute" problem hit earlier this session fixing
  permissions.ts. Rather than guess a remapping for accounts that could
  misrepresent what actually happened historically, NOT VALID is used
  instead: it skips the one-time validation scan against pre-existing
  rows, so those 7 rows are left exactly as they are, permanently
  grandfathered in as long as they're never updated again.

  NOT VALID does NOT weaken enforcement going forward — a NOT VALID CHECK
  constraint is fully enforced on every subsequent INSERT and UPDATE from
  the moment it's added, identically to a normally-added constraint. Only
  the pre-existing rows at ADD time are exempted from the initial scan.
  (One caveat: if any of the 7 old rows were ever UPDATEd later, even on
  an unrelated column, the CHECK would be re-evaluated on that row at
  that point and could reject it — NOT VALID only grandfathers the
  initial add, not all future writes to those specific rows. Given their
  age and dead status this is a low-probability edge case, not something
  this migration resolves.)

  A later `ALTER TABLE company_invitations VALIDATE CONSTRAINT
  company_invitations_role_check;` remains available if the 7 historical
  rows are ever addressed and full validation is wanted — not run here.

  Scope: company_invitations.role only. Does NOT touch
  user_profiles_role_check or any other part of the role system.
*/

ALTER TABLE company_invitations
  DROP CONSTRAINT IF EXISTS company_invitations_role_check;

ALTER TABLE company_invitations
  ADD CONSTRAINT company_invitations_role_check
  CHECK (role = ANY (ARRAY['director', 'admin', 'estimator', 'supervisor', 'office_user', 'site_user', 'secretary']))
  NOT VALID;
