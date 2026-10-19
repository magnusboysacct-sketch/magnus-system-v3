// Proposing which registered worker a field payment's typed name belongs to (scripts/match-field-payment-workers.ts). Pure logic, nothing is changed anywhere.
//   exact       the typed name is exactly "First Last" of exactly one worker of the company
//   normalized  the same after ignoring capitals, extra spaces, punctuation and accents
//   reordered   the same words in another order ("Last, First")
//   fuzzy       a close spelling: at least 82% alike, clearly closer than any other worker
//   ambiguous   two or more workers fit equally well: nothing is proposed
//   none        nothing close enough
// supabase/scripts/backfill-field-payment-workers.sql repeats the exact and normalized rules in SQL.

export type MatchType = "exact" | "normalized" | "reordered" | "fuzzy" | "ambiguous" | "none";

export interface WorkerLite { id: string; first_name: string | null; last_name: string | null }
export interface NameMatch {
  type: MatchType;
  workerId: string | null;      // the proposal (null for ambiguous / none)
  confidence: number;           // 0 - 1
  candidates: string[];         // worker ids that fit (more than one for ambiguous)
  note: string;
}

export const FUZZY_MIN = 0.82;        // below this a spelling is not "close"
export const FUZZY_GAP = 0.05;        // the best must beat the second best by this much

export function workerFullName(w: WorkerLite): string {
  return `${w.first_name ?? ""} ${w.last_name ?? ""}`.trim();
}

// lower case, no accents, apostrophes dropped, every other punctuation mark is a space, one space between words
export function normalizeName(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const sortedWords = (n: string) => n.split(" ").filter(Boolean).sort().join(" ");

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  const m = Math.max(a.length, b.length);
  return m === 0 ? 1 : 1 - levenshtein(a, b) / m;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function matchWorkerName(paymentName: string | null | undefined, workers: WorkerLite[]): NameMatch {
  const typed = String(paymentName ?? "");
  const norm = normalizeName(typed);
  if (!norm) return { type: "none", workerId: null, confidence: 0, candidates: [], note: "no name on the payment" };

  const pick = (type: MatchType, hits: WorkerLite[], confidence: number, what: string): NameMatch => hits.length === 1
    ? { type, workerId: hits[0].id, confidence, candidates: [hits[0].id], note: "" }
    : { type: "ambiguous", workerId: null, confidence: 0, candidates: hits.map((w) => w.id), note: `${hits.length} workers fit (${what}): ${hits.map(workerFullName).join(" / ")}` };

  const exact = workers.filter((w) => workerFullName(w) === typed);
  if (exact.length) return pick("exact", exact, 1, "same name");
  const normalized = workers.filter((w) => normalizeName(workerFullName(w)) === norm);
  if (normalized.length) return pick("normalized", normalized, 0.95, "same name apart from capitals / spaces");
  const sorted = sortedWords(norm);
  const reordered = workers.filter((w) => sortedWords(normalizeName(workerFullName(w))) === sorted);
  if (reordered.length) return pick("reordered", reordered, 0.9, "same words in another order");

  const scored = workers
    .map((w) => { const n = normalizeName(workerFullName(w)); return { w, s: Math.max(similarity(norm, n), similarity(sorted, sortedWords(n))) }; })
    .sort((a, b) => b.s - a.s);
  const best = scored[0], second = scored[1];
  if (best && best.s >= FUZZY_MIN) {
    if (second && best.s - second.s < FUZZY_GAP && second.s >= FUZZY_MIN) {
      return { type: "ambiguous", workerId: null, confidence: 0, candidates: scored.filter((x) => best.s - x.s < FUZZY_GAP).map((x) => x.w.id), note: `close to ${scored.filter((x) => best.s - x.s < FUZZY_GAP).map((x) => workerFullName(x.w)).join(" / ")}` };
    }
    return { type: "fuzzy", workerId: best.w.id, confidence: Math.min(0.89, round2(best.s)), candidates: [best.w.id], note: `"${typed.trim()}" vs "${workerFullName(best.w)}"` };
  }
  // one word that is somebody's first or last name is a hint for the person reading the report, never a proposal
  if (!norm.includes(" ")) {
    const part = workers.filter((w) => normalizeName(w.first_name) === norm || normalizeName(w.last_name) === norm);
    if (part.length) return { type: "none", workerId: null, confidence: 0, candidates: part.map((w) => w.id), note: `only a first / last name; could be ${part.map(workerFullName).join(" / ")}` };
  }
  return { type: "none", workerId: null, confidence: 0, candidates: [], note: best ? `closest is "${workerFullName(best.w)}" (${Math.round(best.s * 100)}%)` : "no workers in this company" };
}
