// src/lib/portalProjects.ts
//
// Pure helpers for the client portal's project picker. The server (get_portal_data) already limits
// everything to this client and returns the chosen project's own progress, photos, site updates and
// change orders; invoices, estimates, contracts and messages come back for the whole client, each
// carrying a project_id (which may be null). These functions only decide what to SHOW for the
// selected project. Nothing here reads or writes the database.
//
// A client with one project (or no "projects" list at all) is never filtered: every function
// returns its input unchanged, so that view is exactly what it was before the picker existed.

export interface PortalProject {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  progress_pct: number;
}

// The "projects" array from get_portal_data. Anything malformed is dropped rather than thrown on.
export function normalizeProjects(raw: unknown): PortalProject[] {
  if (!Array.isArray(raw)) return [];
  const out: PortalProject[] = [];
  for (const p of raw as any[]) {
    if (!p || typeof p.id !== "string" || !p.id) continue;
    out.push({
      id: p.id,
      name: typeof p.name === "string" && p.name ? p.name : "Untitled project",
      status: typeof p.status === "string" ? p.status : "",
      start_date: p.start_date ?? null,
      end_date: p.end_date ?? null,
      progress_pct: Math.max(0, Math.min(100, Math.round(Number(p.progress_pct) || 0))),
    });
  }
  return out;
}

// The picker (and every per-project filter and label) exists only for a client with 2+ projects.
export function hasMultipleProjects(projects: PortalProject[]): boolean {
  return Array.isArray(projects) && projects.length > 1;
}

// project_id of a row, with "" treated as null.
export function itemProjectId(item: any): string | null {
  const id = item?.project_id;
  return typeof id === "string" && id ? id : null;
}

// Rows of the selected project, plus rows with no project at all (never hidden). Not filtered when the
// client has a single project or nothing is selected.
export function filterByProject<T>(items: T[], selectedProjectId: string | null, multi: boolean): T[] {
  if (!Array.isArray(items)) return [];
  if (!multi || !selectedProjectId) return items;
  return items.filter((it) => {
    const pid = itemProjectId(it);
    return pid === null || pid === selectedProjectId;
  });
}

// Small muted label for an invoice / estimate / contract card: the project's name, or "General" for a row
// with no project. null (show nothing) unless the client has more than one project.
export function itemProjectLabel(item: any, projects: PortalProject[], multi: boolean): string | null {
  if (!multi) return null;
  const pid = itemProjectId(item);
  if (pid === null) return "General";
  const name = typeof item?.project_name === "string" && item.project_name ? item.project_name : projects.find((p) => p.id === pid)?.name;
  return name || null;
}

// Paid / Balance Due / Total, over whichever invoices are passed in (the filtered ones).
export function invoiceTotals(invoices: any[]): { totalInvoiced: number; totalPaid: number; balanceDue: number } {
  const list = Array.isArray(invoices) ? invoices : [];
  const totalInvoiced = list.reduce((s, i) => s + Number(i?.total_amount || 0), 0);
  const totalPaid = list.filter((i) => i?.status === "paid").reduce((s, i) => s + Number(i?.total_amount || 0), 0);
  return { totalInvoiced, totalPaid, balanceDue: totalInvoiced - totalPaid };
}

// Remember the selected project across a reload (sessionStorage, one key per client, so it never leaks between
// clients sharing a browser tab). Storage can be missing or throw (private windows, blocked site data), so
// every access is wrapped: on any failure nothing is remembered and the server's choice is used.
type StorageLike = Pick<Storage, "getItem" | "setItem">;
export const projectStorageKey = (clientId: string): string => `portal_project_${clientId}`;

export function readRememberedProject(clientId: string | null | undefined, storage?: StorageLike): string | null {
  try {
    if (!clientId) return null;
    const v = (storage ?? window.sessionStorage).getItem(projectStorageKey(clientId));
    return v ? v : null;
  } catch {
    return null;
  }
}

export function rememberProject(clientId: string | null | undefined, projectId: string | null | undefined, storage?: StorageLike): void {
  try {
    if (!clientId || !projectId) return;
    (storage ?? window.sessionStorage).setItem(projectStorageKey(clientId), projectId);
  } catch {
    // remembering is a convenience only
  }
}

// Which project to request on load instead of the server's choice: the remembered one, only when it is in the
// server's own list of this client's projects and differs from what the server already chose. Otherwise null
// (use the server's choice and ignore the stored value). This only decides what to ASK for; the server still
// checks ownership and returns its own choice for an id that is not this client's.
export function pickRememberedProject(remembered: string | null, projects: PortalProject[], serverChosenId: string | null): string | null {
  if (!remembered || remembered === serverChosenId) return null;
  return projects.some((p) => p.id === remembered) ? remembered : null;
}

// Tab badges.
export const countUnpaid = (invoices: any[]): number => (Array.isArray(invoices) ? invoices : []).filter((i) => i?.status !== "paid").length;
export const countUnsigned = (contracts: any[]): number => (Array.isArray(contracts) ? contracts : []).filter((c) => !c?.client_signed_at).length;
export const countPending = (changes: any[]): number => (Array.isArray(changes) ? changes : []).filter((c) => c?.status === "pending").length;

// Stale-response guard for project switches. Take a ticket before each request and check it when the
// response arrives; only the most recent ticket is current, so a slow earlier response can never
// overwrite a newer selection.
export function createRequestGate() {
  let latest = 0;
  return {
    next: (): number => ++latest,
    isCurrent: (ticket: number): boolean => ticket === latest,
    current: (): number => latest,
  };
}
