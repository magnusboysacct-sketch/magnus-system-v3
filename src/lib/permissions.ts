// src/lib/permissions.ts — Shared role-permission helpers.
//
// Before this file, every page re-implemented its own inline role check
// (useAdminAccess.ts, AppLayout.tsx, WorkersPage.tsx all differ slightly —
// one even checks a non-existent "owner" role). This doesn't replace those
// existing checks retroactively (out of scope for this pass — they serve
// different, already-working features), but new/updated permission checks
// should use these instead of adding a fifth inconsistent inline version.
//
// Role universe is the literal `user_profiles.role` CHECK constraint
// (20260326225000_create_missing_user_management_schema.sql) — mirrored
// exactly by SettingsUsersPage.tsx's `Role` type/ROLE_OPTIONS.
export type Role =
  | "director"
  | "admin"
  | "project_manager"
  | "site_supervisor"
  | "estimator"
  | "procurement"
  | "accounts"
  | "viewer";

// Worker creation ceiling — mirrors the workers table's role-gated INSERT
// RLS policy (see 20260808000000_role_gate_worker_creation.sql). Keep the
// two in sync: this only controls what the UI shows/hides, RLS is the real
// enforcement.
const WORKER_MANAGER_ROLES: readonly Role[] = ["director", "admin", "project_manager", "site_supervisor"];

// Staff invitation ceiling — mirrors company_invitations' INSERT RLS policy
// and the admin-invite-user edge function's own caller-role check (both
// already director/admin-only, independently of this UI gate).
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
// otherwise have a standing view into elsewhere in the app.
const DIRECTOR_DASHBOARD_ROLES: readonly Role[] = ["director"];

export function canAccessDirectorDashboard(role: string | null | undefined): boolean {
  return !!role && (DIRECTOR_DASHBOARD_ROLES as readonly string[]).includes(role);
}
