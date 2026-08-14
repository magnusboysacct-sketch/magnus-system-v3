// src/lib/import/matching.ts
//
// Shared normalization for duplicate detection. There's no UNIQUE
// constraint on clients.name/email or projects.name at the DB level (confirmed
// during the planning investigation), so dedup has to happen entirely at the
// application layer — this is the one normalization rule every entity config
// uses so matching is consistent across the wizard.
export function normalizeKey(s: string | null | undefined): string {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeEmail(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase();
}

// Comparison-only normalization for header/alias matching — strips ALL
// non-alphanumeric characters (spaces, underscores, hyphens, punctuation),
// not just collapsing whitespace like normalizeKey above. Real-world export
// headers are wildly inconsistent about spacing/punctuation for the same
// concept — "Email ID", "EmailID", "email_id", "E-mail" should all match the
// same alias without having to hand-enumerate every spelling variant per
// field. (Kept separate from normalizeKey, which dedup matching relies on
// preserving word boundaries for — "john smith" is a real value, not noise
// to strip.)
export function normalizeForMatch(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Fuzzy-ish alias matching for the column-mapping auto-suggest step — exact
// normalized match, or the uploaded header contains/is contained by an alias.
// Deliberately simple (no fuzzy-distance library) since it only pre-fills a
// suggestion the user can always override; false positives are cheap to fix in
// the mapping UI, so this doesn't need to be perfect.
export function headerMatchesAlias(header: string, alias: string): boolean {
  const h = normalizeForMatch(header);
  const a = normalizeForMatch(alias);
  return h === a || h.includes(a) || a.includes(h);
}

// Resolves a raw, free-typed lookup value (e.g. a client name column on a
// Projects import row) against a LookupMaps entry — the same normalizeKey
// used for name-based dedup elsewhere, so "Acme Construction" in the
// uploaded file matches "Acme Construction" (or "acme construction") in
// the DB regardless of case/whitespace differences. Returns null if the
// map is missing (lookup not loaded yet) or nothing matches — callers
// treat that as "couldn't resolve," not an error.
export function resolveLookup(
  rawValue: string | null | undefined,
  map: Map<string, { id: string; label: string }> | undefined
): { id: string; label: string } | null {
  if (!rawValue || !map) return null;
  return map.get(normalizeKey(rawValue)) || null;
}
