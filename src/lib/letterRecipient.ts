// src/lib/letterRecipient.ts
//
// Who a job / employment / reference letter is addressed to. The recipient is plain text at the top of the letter body (so saving, printing,
// emailing and AI assist need no schema change). The body is paragraphs separated by one blank line; the top of it is always:
//
//   <date>                                  paragraph 0
//   <address block>   (optional)            attention / organisation / address lines, one paragraph, single newlines
//   Re: <subject>     (optional)
//   <salutation>                            "TO WHOM IT MAY CONCERN", "Dear Sir/Madam,", "Dear Mr. John Brown," or "Dear <worker>,"
//   <first body paragraph> ...
//
// Everything between the date and the end of the salutation is the "recipient section"; changing the recipient replaces only that section.

export type LetterKind = "job_letter" | "employment_letter" | "reference_letter";
export type RecipientMode = "whom" | "specific";
export type RecipientPreset = "embassy" | "bank" | "other";

export interface Recipient {
  mode: RecipientMode;
  attention: string;   // a person ("Mr. John Brown") or a desk ("The Consular Section")
  org: string;
  address: string;     // multi-line
  re: string;          // subject line, without the "Re:" prefix
}

export const EMPTY_RECIPIENT: Recipient = { mode: "whom", attention: "", org: "", address: "", re: "" };

export const TO_WHOM = "TO WHOM IT MAY CONCERN";
export const WORKER_PLACEHOLDER = "[Worker Name]";

export function recipientPreset(preset: RecipientPreset, workerName: string): Recipient {
  if (preset === "embassy") return { mode: "specific", attention: "The Consular Section", org: "Embassy of [Country]", address: "", re: `Employment confirmation – ${workerName}` };
  if (preset === "bank") return { mode: "specific", attention: "The Manager", org: "[Bank name]", address: "", re: `Employment verification – ${workerName}` };
  return { mode: "specific", attention: "", org: "", address: "", re: "" };
}

// Collapses a field to clean single lines: no blank lines (a blank line would start a new paragraph) and no stray spaces.
function lines(s: string): string[] {
  return (s || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}
const oneLine = (s: string) => lines(s).join(" ");

// Attention lines that name a person get a personal greeting.
export function looksLikePerson(attention: string): boolean {
  return /^(?:Mr|Mrs|Ms|Miss|Dr)\.?\s+\S/i.test(attention.trim());
}

function hasRecipient(r: Recipient): boolean {
  return r.mode === "specific";
}

export function addressBlockText(r: Recipient): string {
  if (!hasRecipient(r)) return "";
  return [oneLine(r.attention), oneLine(r.org), ...lines(r.address)].filter(Boolean).join("\n");
}

export function salutationFor(type: LetterKind, workerName: string, r: Recipient): string {
  if (type === "employment_letter") return `Dear ${workerName},`;
  if (!hasRecipient(r)) return TO_WHOM;
  const att = oneLine(r.attention);
  return att && looksLikePerson(att) ? `Dear ${att},` : "Dear Sir/Madam,";
}

// The whole recipient section: [address block] [Re: ...] salutation, as paragraphs joined by a blank line.
export function recipientSection(type: LetterKind, workerName: string, r: Recipient): string {
  const parts: string[] = [];
  const block = addressBlockText(r);
  if (block) parts.push(block);
  const re = hasRecipient(r) ? oneLine(r.re) : "";
  if (re) parts.push(`Re: ${re}`);
  parts.push(salutationFor(type, workerName, r));
  return parts.join("\n\n");
}

// [Bracket] placeholders still sitting in the recipient fields (the existing unresolved-bracket check blocks submit/print on these).
export function recipientBrackets(r: Recipient): string[] {
  if (!hasRecipient(r)) return [];
  const m = [r.attention, r.org, r.address, r.re].join("\n").match(/\[[^\]]+\]/g) || [];
  return Array.from(new Set(m));
}

// ── Finding and replacing the section inside a body the secretary may have edited ──

const SALUTATION = /^(?:TO WHOM IT MAY CONCERN|Dear\b[^\n]*,)\s*$/i;

// The salutation paragraph: the first single-line "TO WHOM IT MAY CONCERN" / "Dear …," after the date (looked for in the first few paragraphs).
export function findSalutationIndex(paras: string[]): number {
  for (let i = 1; i < Math.min(paras.length, 8); i++) {
    if (SALUTATION.test(paras[i])) return i;
  }
  return -1;
}

export type ReplaceResult =
  | { status: "replaced"; body: string }
  | { status: "needs-confirm"; reason: "edited" | "not-found" };

// Replaces only the recipient section. `safeSections` are the texts we know we wrote (or that are the untouched starter greeting); if the current
// section is anything else — the secretary edited it by hand, or no greeting can be found — nothing is changed and the caller must ask first.
export function replaceRecipientSection(body: string, newSection: string, safeSections: string[]): ReplaceResult {
  const paras = body.split("\n\n");
  const k = findSalutationIndex(paras);
  if (k < 0) return { status: "needs-confirm", reason: "not-found" };
  const current = paras.slice(1, k + 1).join("\n\n");
  if (!safeSections.includes(current)) return { status: "needs-confirm", reason: "edited" };
  return { status: "replaced", body: [paras[0], newSection, ...paras.slice(k + 1)].join("\n\n") };
}

// After the secretary has confirmed: replace the section if it can be found, otherwise insert the new section right under the date
// (nothing is removed in that case).
export function forceReplaceRecipientSection(body: string, newSection: string): string {
  const paras = body.split("\n\n");
  const k = findSalutationIndex(paras);
  if (k < 0) return [paras[0], newSection, ...paras.slice(1)].join("\n\n");
  return [paras[0], newSection, ...paras.slice(k + 1)].join("\n\n");
}
