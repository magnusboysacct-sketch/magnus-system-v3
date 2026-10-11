// What to call the company when its name is needed in text: on screen, in a printed document, in a message to a client, or in an AI prompt.
// Always the company's own name from company_settings; when that is missing or blank, a neutral stand-in - never another company's name.

// Shown on screen / in documents / in messages when the company's name isn't available.
export const COMPANY_NAME_FALLBACK = "Your Company";

// Used inside AI prompts ("... specialist for <this>") when the company's name isn't available.
export const AI_COMPANY_FALLBACK = "a Jamaica-based construction company";

export function companyDisplayName(name?: string | null): string {
  return String(name ?? "").trim() || COMPANY_NAME_FALLBACK;
}

export function aiCompanyName(name?: string | null): string {
  return String(name ?? "").trim() || AI_COMPANY_FALLBACK;
}
