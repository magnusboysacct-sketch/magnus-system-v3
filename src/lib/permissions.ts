// src/lib/permissions.ts — Shared role-permission helpers.
//
// Before this file, every page re-implemented its own inline role check
// (useAdminAccess.ts, AppLayout.tsx, WorkersPage.tsx all differ slightly —
// one even checks a non-existent "owner" role). This doesn't replace those
// existing checks retroactively (out of scope for this pass — they serve
// different, already-working features), but new/updated permission checks
// should use these instead of adding a fifth inconsistent inline version.
//
// Role universe is the literal LIVE `user_profiles.role` CHECK constraint,
// confirmed via pg_get_constraintdef — NOT the 20260326225000 migration
// file, which is stale (created the vocabulary below with project_manager/
// site_supervisor/procurement/accounts/viewer, and never got a tracked
// ALTER when the live constraint was changed to this real 6, then to 7).
// Mirrored exactly by SettingsUsersPage.tsx's `Role` type/ROLE_OPTIONS
// (note: that page's own Role type intentionally excludes "secretary" —
// there's no invite/edit UI path for it yet, see canManageStaff/staff
// invitation flow, unaffected by this file).
//
// office_user / site_user real-world meaning (per Veron, confirmed):
//   - office_user: limited-admin, back-office staff. NO Finance/Settings/
//     company-config access — everything admin has minus that.
//   - site_user: supervisor-like. Field oversight, worker/field-payment
//     access — same ceiling as `supervisor` on field-facing pages.
//
// 'secretary' — added 2026-08-22, once 20260823000000_create_secretary_
// workspace.sql was confirmed applied (live CHECK constraint verified via
// pg_get_constraintdef to show exactly these 7 values, no phantoms). This
// closes out the role-vocabulary audit/fix arc — every Role literal in
// this file is now a real, live user_profiles.role value.
export type Role =
  | "director"
  | "admin"
  | "estimator"
  | "supervisor"
  | "office_user"
  | "site_user"
  | "secretary";

// Worker creation ceiling — mirrors the workers table's role-gated INSERT
// RLS policy (see 20260808000000_role_gate_worker_creation.sql). Keep the
// two in sync: this only controls what the UI shows/hides, RLS is the real
// enforcement.
//
// site_supervisor -> supervisor (direct real-role rename, same intent).
// site_user added per its supervisor-like field/worker access. project_manager
// had no real equivalent and is dropped (Veron did not ask for a substitute
// for it here — flagged in the handoff report rather than guessed).
const WORKER_MANAGER_ROLES: readonly Role[] = ["director", "admin", "supervisor", "site_user"];

// Staff invitation ceiling — mirrors company_invitations' INSERT RLS policy
// and the admin-invite-user edge function's own caller-role check (both
// already director/admin-only, independently of this UI gate). No phantom
// roles were ever in this constant — unchanged.
const STAFF_MANAGER_ROLES: readonly Role[] = ["director", "admin"];

export function canManageWorkers(role: string | null | undefined): boolean {
  return !!role && (WORKER_MANAGER_ROLES as readonly string[]).includes(role);
}

export function canManageStaff(role: string | null | undefined): boolean {
  return !!role && (STAFF_MANAGER_ROLES as readonly string[]).includes(role);
}

// Director Dashboard ceiling — deliberately director-only, not
// director+admin like STAFF_MANAGER_ROLES above. This surfaces company-
// wide financials (cash position, owner draws, P&L) that admin doesn't
// otherwise have a standing view into elsewhere in the app. No phantom
// roles were ever in this constant — unchanged.
const DIRECTOR_DASHBOARD_ROLES: readonly Role[] = ["director"];

export function canAccessDirectorDashboard(role: string | null | undefined): boolean {
  return !!role && (DIRECTOR_DASHBOARD_ROLES as readonly string[]).includes(role);
}

// Secretary Workspace ceiling — accessible to secretary (the primary
// user), plus admin/director, who need standing visibility into it for
// approvals (see canApproveSecretaryDocuments below), not just secretary-
// only the way Director Dashboard is director-only.
//
// Now typed readonly Role[] like every other constant in this file —
// "secretary" is live as of 2026-08-22 (see Role union comment above).
const SECRETARY_WORKSPACE_ROLES: readonly Role[] = ["secretary", "admin", "director"];

export function canAccessSecretaryWorkspace(role: string | null | undefined): boolean {
  return !!role && (SECRETARY_WORKSPACE_ROLES as readonly string[]).includes(role);
}

// Approval ceiling within the workspace — deliberately narrower than
// workspace access itself: a secretary can create/submit documents (see
// secretary_documents' own RLS, which enforces this same admin/director-
// only rule at the data layer independently of this UI-level check) but
// never approve their own or anyone else's. secretary itself is
// deliberately excluded here, not omitted for being phantom — it's real,
// just not on the approval side of this ceiling.
const SECRETARY_APPROVAL_ROLES: readonly Role[] = ["admin", "director"];

export function canApproveSecretaryDocuments(role: string | null | undefined): boolean {
  return !!role && (SECRETARY_APPROVAL_ROLES as readonly string[]).includes(role);
}
