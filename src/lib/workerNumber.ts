// Worker numbers ("MBW-001"): the prefix every company chooses in Settings -> Company, and how the number is written.
// The database assigns the numbers (trigger on workers); this file is only for the Settings preview, validation and the default prefix a new company gets.
// worker_number_prefix_from_name() in migration 20260951000000 does the same thing as defaultWorkerPrefix() here; scripts/tests/workerNumber.test.ts checks they agree.
// Pure logic, no browser or Supabase.

export const WORKER_PREFIX_RE = /^[A-Z]{2,5}$/;

// What a person types is made into a prefix as they type: capitals only, letters only, at most five.
export function normalizeWorkerPrefix(input: string): string {
  return String(input ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
}

// null when the prefix is fine, otherwise the message for the screen.
export function validateWorkerPrefix(prefix: string): string | null {
  if (!prefix) return "Enter a prefix of 2 to 5 letters, for example MBW.";
  if (!WORKER_PREFIX_RE.test(prefix)) return "The prefix must be 2 to 5 capital letters (A-Z), for example MBW.";
  return null;
}

// "MBW" + 1 -> "MBW-001"; numbers past 999 simply grow ("MBW-1000").
export function formatWorkerNumber(prefix: string, n: number): string {
  const digits = n < 1000 ? String(Math.max(0, Math.trunc(n))).padStart(3, "0") : String(Math.trunc(n));
  return `${prefix}-${digits}`;
}

export function previewWorkerNumber(prefix: string): string {
  return formatWorkerNumber(WORKER_PREFIX_RE.test(prefix) ? prefix : "ABC", 1);
}

const STOP_WORDS = new Set(["LTD", "LIMITED", "INC", "INCORPORATED", "CO", "COMPANY", "CORP", "CORPORATION", "LLC", "PVT", "THE", "AND", "OF"]);

// The prefix a new company starts with: the initials of the words in its name (company-form words like Ltd / Limited and "and" / "of" left out, at most four) + "W".
// "Yaad and aboard" -> YAW, "House Busniess" -> HBW, "VERON'S" -> VW. A name with no usable letters gives WK.
export function defaultWorkerPrefix(companyName: string | null | undefined): string {
  const words = String(companyName ?? "").toUpperCase().replace(/['’]/g, "").split(/[^A-Z]+/).filter((w) => w && !STOP_WORDS.has(w));
  const initials = words.map((w) => w[0]).slice(0, 4).join("");
  return initials ? `${initials}W` : "WK";
}
