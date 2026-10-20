// Workers page: search, status / type / trade filters and the category (trade) options. Pure, so it is tested without the page.
// Run the tests:  npm run test:workerfilters

export interface FilterableWorker {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  employee_id?: string | null;   // the worker number, e.g. MBW-002
  job_title?: string | null;     // the trade / category, e.g. Mason
  worker_type?: string | null;
  status?: string | null;
}

export const NO_CATEGORY = "__none__";

// lower case, no leading / trailing space, runs of spaces (and tabs, non-breaking spaces) become one space
export const normText = (s: unknown): string => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

// "Mason", "mason " and "MASON" are one category; a worker with no title is NO_CATEGORY
export const categoryKey = (title: unknown): string => normText(title) || NO_CATEGORY;

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const digitsOf = (s: string) => s.replace(/\D/g, "");

// "MBW-002", "mbw002", "MBW 002", "002" and "2" all find worker number MBW-002; a letters-only token finds by prefix ("mbw")
function numberMatches(token: string, employeeId: string): boolean {
  const key = alnum(token);
  const num = alnum(employeeId);
  if (!key || !num) return false;
  if (num.includes(key)) return true;
  if (/^\d+$/.test(key)) {
    const tail = (num.match(/\d+$/) || [""])[0];
    if (tail && Number(tail) === Number(key)) return true;   // 2 == 002
  }
  return false;
}

// a phone is found by its digits only (spaces, dashes, brackets, +, dots are ignored); at least 3 digits, so "1" does not match every phone
function phoneMatches(token: string, phone: string): boolean {
  if (!/^[\d\s+()\-.]+$/.test(token)) return false;
  const q = digitsOf(token);
  return q.length >= 3 && digitsOf(phone).includes(q);
}

// Every word typed must match something on the worker (first name, last name, full name, email, trade, worker number, phone), in any order.
export function matchesSearch(w: FilterableWorker, query: string): boolean {
  const q = normText(query);
  if (!q) return true;
  const first = normText(w.first_name), last = normText(w.last_name);
  const hay = [first, last, `${first} ${last}`.trim(), normText(w.email), normText(w.job_title), normText(w.employee_id)].join(" | ");
  const whole = `${first} ${last}`.trim();
  return q.split(" ").every((t) => hay.includes(t) || numberMatches(t, w.employee_id || "") || phoneMatches(t, w.phone || "")) ||
    whole.includes(q) || numberMatches(q, w.employee_id || "");
}

export interface WorkerFilters { search: string; status: string; type: string; category: string }
export const NO_FILTERS: WorkerFilters = { search: "", status: "all", type: "", category: "" };

export const filtersActive = (f: WorkerFilters): boolean =>
  normText(f.search) !== "" || (f.status !== "all" && f.status !== "") || f.type !== "" || f.category !== "";

// `skip` leaves one filter out (used to count the options of that very filter)
export function filterWorkers<T extends FilterableWorker>(workers: T[], f: WorkerFilters, skip?: "type" | "category"): T[] {
  return workers.filter((w) =>
    matchesSearch(w, f.search) &&
    (f.status === "all" || f.status === "" || w.status === f.status) &&
    (skip === "type" || !f.type || w.worker_type === f.type) &&
    (skip === "category" || !f.category || categoryKey(w.job_title) === f.category));
}

export interface CategoryOption { key: string; label: string; count: number }

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

// The trade options: every title the worker form offers (standard + the user's own), every title found in the data (spelling variants merged),
// and "No trade set" when some workers have none. `counted` is the list the counts are taken from (the workers the other filters leave).
export function buildCategoryOptions(all: FilterableWorker[], counted: FilterableWorker[], formTitles: string[]): CategoryOption[] {
  const labels = new Map<string, string>();                    // key -> label shown
  for (const t of formTitles) { const k = categoryKey(t); if (k !== NO_CATEGORY && !labels.has(k)) labels.set(k, collapse(t)); }
  const variants = new Map<string, Map<string, number>>();     // key -> spelling -> how many workers
  for (const w of all) {
    const k = categoryKey(w.job_title);
    if (k === NO_CATEGORY || labels.has(k)) continue;           // the form's own spelling wins
    const v = collapse(String(w.job_title)); const m = variants.get(k) ?? new Map<string, number>();
    m.set(v, (m.get(v) ?? 0) + 1); variants.set(k, m);
  }
  for (const [k, m] of variants) labels.set(k, [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]);
  const counts = new Map<string, number>();
  for (const w of counted) { const k = categoryKey(w.job_title); counts.set(k, (counts.get(k) ?? 0) + 1); }
  const opts: CategoryOption[] = [...labels.entries()]
    .map(([key, label]) => ({ key, label, count: counts.get(key) ?? 0 }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  const none = counts.get(NO_CATEGORY) ?? 0;
  const anyNone = all.some((w) => categoryKey(w.job_title) === NO_CATEGORY);
  if (anyNone) opts.push({ key: NO_CATEGORY, label: "No trade set", count: none });
  return opts;
}

// Categories in the data written more than one way ("Mason" / "mason " / "MASON"): for the cleanup report
export function messyCategories(all: FilterableWorker[]): Array<{ key: string; spellings: string[] }> {
  const m = new Map<string, Set<string>>();
  for (const w of all) {
    if (w.job_title == null || String(w.job_title).trim() === "") continue;
    const k = categoryKey(w.job_title); const s = m.get(k) ?? new Set<string>(); s.add(String(w.job_title)); m.set(k, s);
  }
  return [...m.entries()].filter(([, s]) => s.size > 1).map(([key, s]) => ({ key, spellings: [...s] }));
}

export const TYPE_LABELS: Record<string, string> = { employee: "Employee", subcontractor: "Subcontractor", crew_lead: "Crew Lead" };
export interface TypeOption { value: string; label: string; count: number }
export function buildTypeOptions(counted: FilterableWorker[]): TypeOption[] {
  return Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label, count: counted.filter((w) => w.worker_type === value).length }));
}
