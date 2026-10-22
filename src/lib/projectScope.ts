// The project selector and the page you are on: which pages follow the selected project, which carry the project in their address, and which do not use it.
// Pure, so it is tested on its own (npm run test:projectscope). The one rule the app follows:
//   * "project-url"  /projects/<id>/...   the address names the project. Changing the selector goes to the same page for the new project; opening such an address
//                                         sets the selector to that project (see ProjectUrlSync).
//   * "project"      /boq, /takeoff ...   no project in the address; the page shows the SELECTED project and is rebuilt (fresh loading state, old answers dropped) when it changes.
//   * "company"      everything else      the page covers the whole company, so the selector does not apply there and the sidebar says so.

export type PageScope = "project-url" | "project" | "company";

// pages whose content is the selected project (no project in the address)
export const PROJECT_SCOPED_PATHS = ["/boq", "/takeoff", "/procurement", "/receiving", "/supplier-prices", "/field-ops", "/finance/transactions", "/finance/reports"];

// company-wide pages that have their OWN project filter (their list can be narrowed in the page, independent of the selector)
export const OWN_FILTER_PATHS = ["/estimates", "/expenses", "/reports"];

const PROJECT_URL = /^\/projects\/([^/]+)(\/.*)?$/;

const clean = (pathname: string): string => {
  const p = String(pathname || "/").split(/[?#]/)[0].replace(/\/+$/, "");
  return p === "" ? "/" : p;
};

const under = (path: string, base: string): boolean => path === base || path.startsWith(base + "/");

// the project named in the address, or null (the /projects list itself has none)
export function projectIdFromPath(pathname: string): string | null {
  const m = PROJECT_URL.exec(clean(pathname));
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

export function pageScope(pathname: string): PageScope {
  const p = clean(pathname);
  if (projectIdFromPath(p)) return "project-url";
  if (PROJECT_SCOPED_PATHS.some((b) => under(p, b))) return "project";
  return "company";
}

export const hasOwnProjectFilter = (pathname: string): boolean => OWN_FILTER_PATHS.some((b) => under(clean(pathname), b));

// The address to show after the selector moves to `newId`, or null to stay where we are.
//  * project in the address: the same page for the new project (the page-specific part of the address is kept, a search / hash is dropped: it belongs to the old project);
//  * a project page without it (/boq ...): stay, but leave an open document (/receiving/<id>) and any search / hash, which belong to the old project.
export function addressAfterSwitch(pathname: string, search: string, hash: string, newId: string): string | null {
  const p = clean(pathname);
  const m = PROJECT_URL.exec(p);
  if (m) {
    const next = `/projects/${encodeURIComponent(newId)}${m[2] ?? ""}`;
    return next === p && !search && !hash ? null : next;
  }
  if (pageScope(p) === "project") {
    const list = p.replace(/^(\/receiving)\/[^/]+$/, "$1");
    return list === p && !search && !hash ? null : list;
  }
  return null;
}

export function scopeNote(pathname: string): string | null {
  const scope = pageScope(pathname);
  if (scope !== "company") return null;
  return hasOwnProjectFilter(pathname) ? "This page shows all projects. Use its own project filter." : "This page covers all projects. The project selector does not apply here.";
}

// What ProjectUrlSync should do. It follows the ADDRESS, not the selector: it acts only when the project in the address changes (or on the first look), so a switch from the
// selector - which sets the selector first and the address a moment later - is never undone by an old address.
export type UrlSyncDecision = { action: "wait" } | { action: "none" } | { action: "select"; projectId: string };
export function urlSyncDecision(i: { urlProjectId: string | null; lastHandled: string | null; currentProjectId: string | null; projectIds: string[]; loading: boolean }): UrlSyncDecision {
  if (!i.urlProjectId) return { action: "none" };
  if (i.urlProjectId === i.lastHandled) return { action: "none" };
  if (i.loading) return { action: "wait" };
  if (i.urlProjectId === i.currentProjectId) return { action: "none" };
  if (!i.projectIds.includes(i.urlProjectId)) return { action: "none" };   // not one of this company's projects (or one the user cannot see): the selector is left alone
  return { action: "select", projectId: i.urlProjectId };
}
