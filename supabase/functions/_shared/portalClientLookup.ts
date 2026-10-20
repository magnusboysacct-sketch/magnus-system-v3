// supabase/functions/_shared/portalClientLookup.ts
//
// Finding the client (manager) of a portal by the email typed at sign-in / password reset. Shared by client-portal-login and client-password-reset.
//
// The rule (migration 20260953000000): a client whose portal_email is set is found ONLY by that portal_email. The client's own contact email counts only while the client has no
// portal_email of its own. (It used to be "email = x OR portal_email = x", so a client's contact email - which follows its primary contact - could still open or reset an account
// whose login email had been set to something else.) The pure choice is pickPortalClient(); findPortalClientByEmail() runs the two queries.
// Callers pass an address already cleaned by normalizeEmail().

export interface PortalEmailRow { portal_email?: string | null }

const hasPortalEmail = (c: PortalEmailRow) => String(c.portal_email ?? "").trim() !== "";

// byPortalEmail: portal-enabled clients whose portal_email equals the address. byPlainEmail: portal-enabled clients whose email equals it.
// Exactly one client or nothing: two matches are ambiguous and match nobody.
export function pickPortalClient<T extends PortalEmailRow>(byPortalEmail: T[], byPlainEmail: T[]): T | null {
  if (byPortalEmail.length > 0) return byPortalEmail.length === 1 ? byPortalEmail[0] : null;
  const own = byPlainEmail.filter((c) => !hasPortalEmail(c));
  return own.length === 1 ? own[0] : null;
}

// deno-lint-ignore no-explicit-any
type Admin = { from(table: string): any };

export async function findPortalClientByEmail<T extends PortalEmailRow>(admin: Admin, email: string, columns: string): Promise<T | null> {
  // portal_email is needed to apply the rule, whatever the caller selects
  const cols = /(^|[\s,])portal_email([\s,]|$)/.test(columns) ? columns : `${columns}, portal_email`;
  const first = await admin.from("clients").select(cols).eq("portal_email", email).eq("portal_enabled", true).limit(2);
  if (first.error) return null;
  const byPortal = (first.data ?? []) as T[];
  if (byPortal.length > 0) return pickPortalClient(byPortal, []);
  const second = await admin.from("clients").select(cols).eq("email", email).eq("portal_enabled", true).limit(50);
  if (second.error) return null;
  return pickPortalClient([], (second.data ?? []) as T[]);
}
