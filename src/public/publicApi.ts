// src/public/publicApi.ts — what the public website reads and sends. Signed-out visitors only need the public key.
import { supabase } from "../lib/supabase";

export type PublicPrice = {
  key: string; label: string; per: "company" | "seat" | "worker"; amount_jmd: number | null;
  included_seats: number | null; features: string[]; description: string | null;
};

export type PublicSiteData = {
  website: { hero_title?: string; hero_sub?: string; faq?: { q: string; a: string }[] };
  support_contact: { whatsapp?: string; email?: string };
  signups_open: boolean;
  pricing: { charging_on: boolean; trial_days: number; prices: PublicPrice[] };
  legal: { privacy?: number; terms?: number };
};

const FALLBACK: PublicSiteData = {
  website: {}, support_contact: {}, signups_open: true, pricing: { charging_on: false, trial_days: 14, prices: [] }, legal: {},
};

export async function fetchPublicSite(): Promise<PublicSiteData> {
  const { data, error } = await supabase.rpc("get_public_site");
  if (error || !data) return FALLBACK;
  return { ...FALLBACK, ...(data as PublicSiteData) };
}

export async function fetchLegal(kind: "privacy" | "terms"): Promise<{ version: number; body: string; published_at: string } | null> {
  const { data, error } = await supabase.rpc("get_legal", { p_kind: kind });
  if (error || !data) return null;
  return data as { version: number; body: string; published_at: string };
}

export async function sendLead(f: { name: string; company: string; phone: string; email: string; message: string; trap: string }) {
  const { error } = await supabase.rpc("submit_lead", {
    p_name: f.name, p_company: f.company, p_phone: f.phone, p_email: f.email, p_message: f.message, p_trap: f.trap, p_source: "website",
  });
  if (error) throw new Error(error.message);
}

export async function sendFeedback(f: { kind: string; message: string; contact: string; page: string; trap: string }) {
  const { error } = await supabase.rpc("submit_feedback", {
    p_kind: f.kind, p_message: f.message, p_contact: f.contact, p_page: f.page, p_trap: f.trap,
  });
  if (error) throw new Error(error.message);
}

/** "+1 (876) 555-1234" -> "18765551234" for wa.me links. */
export const waDigits = (n?: string) => (n ?? "").replace(/\D/g, "");

export const jmd = (n: number | null) =>
  n == null ? "Custom" : `J$${Number(n).toLocaleString("en-JM", { maximumFractionDigits: 0 })}`;
