// supabase/functions/admin-invite-user/inviteRole.ts — the role check of admin-invite-user (no Deno, no network), so it can be tested.
//
// The roles an invitation may carry: exactly the live user_profiles.role / company_invitations.role vocabulary. Anything else is refused with a message,
// never quietly turned into another role: an unknown or mistyped role used to become "site_user", a staff role with field and worker access.

export const INVITE_ROLES = ["director", "admin", "estimator", "supervisor", "office_user", "site_user", "secretary"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export type InviteRoleResult = { ok: true; role: InviteRole } | { ok: false; error: string };

export function parseInviteRole(raw: unknown): InviteRoleResult {
  const list = INVITE_ROLES.join(", ");
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return { ok: false, error: `A role is required. Choose one of: ${list}.` };
  }
  if (typeof raw !== "string") return { ok: false, error: `The role must be text. Choose one of: ${list}.` };
  const role = raw.trim();
  if ((INVITE_ROLES as readonly string[]).includes(role)) return { ok: true, role: role as InviteRole };
  // shown back to the caller: printable ASCII only and short, so an odd value cannot fill the message
  const shown = role.replace(/[^\x20-\x7e]/g, "").slice(0, 40);
  return { ok: false, error: `Unknown role "${shown}". Choose one of: ${list}.` };
}
