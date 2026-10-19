// src/lib/idCardData.ts
// Loads everything an ID card needs (the person, the company, the photo / logo / signature images) from Supabase, in the shape the renderer wants.
// The staff card's employee number and dates come only through get_staff_hr_fields (the TRN is never loaded for a card).
import { supabase } from "./supabase";
import { fetchStaffHrFields } from "./staffHr";
import { companyDisplayName } from "./companyName";
import { ALERT_RED, type IdCardCompany, type IdCardData, type IdCardImages } from "./idCardRender";
import { loadLogoImage } from "./logoImage";
import { resolveFileUrl } from "./storageRefs";
import { DEFAULT_THEME, normalizeTheme, type IdCardTheme } from "./idCardTheme";
import type { CardItem } from "./idCardExport";

const GOLD = "#C9A84C";

export interface LoadedCard extends CardItem { company: IdCardCompany }
export interface CompanyBundle { company: IdCardCompany; logo: HTMLImageElement | null; logoVector: boolean; signature: HTMLImageElement | null }

const cap = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
const fmtFull = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtMonthYear = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—");

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
const tryImage = async (url?: string | null) => { if (!url) return null; try { return await loadImage(url); } catch { return null; } };

// The company's saved card colours. A separate, tolerant query: if the colour columns are not there yet (or cannot be read) the card is simply navy & gold.
export async function loadCompanyTheme(companyId: string | null | undefined): Promise<IdCardTheme> {
  if (!companyId) return { ...DEFAULT_THEME };
  try {
    const { data, error } = await supabase.from("company_settings").select("id_card_primary, id_card_accent").eq("company_id", companyId).maybeSingle();
    if (error || !data) return { ...DEFAULT_THEME };
    return normalizeTheme({ primary: data.id_card_primary, accent: data.id_card_accent });
  } catch { return { ...DEFAULT_THEME }; }
}

export const invalidateCompanyCache = () => companyCache.clear();
const companyCache = new Map<string, Promise<CompanyBundle>>();
// The company block for the back of the card + the logo and signature, once per company per dialog.
export function loadCompanyBundle(companyId: string | null | undefined, nameOverride?: string | null): Promise<CompanyBundle> {
  const key = (companyId || "none") + "|" + (nameOverride || "");
  let p = companyCache.get(key);
  if (!p) {
    p = (async () => {
      let cs: Record<string, string | null> | null = null;
      if (companyId) {
        const { data } = await supabase.from("company_settings")
          .select("company_name, logo_url, signature_url, tagline, address_line1, address_line2, parish, country, phone, email")
          .eq("company_id", companyId).maybeSingle();
        cs = data;
      }
      const contactLines = [
        [cs?.address_line1, cs?.address_line2].filter(Boolean).join(", "),
        [cs?.parish, cs?.country].filter(Boolean).join(", "),
        cs?.phone ? `Tel: ${cs.phone}` : "",
        cs?.email ? `Email: ${cs.email}` : "",
      ].filter(Boolean) as string[];
      // the ORIGINAL logo, at full resolution (an SVG stays vector); a logo that cannot be read simply leaves the card without one
      const lg = cs?.logo_url ? await loadLogoImage(cs.logo_url).catch(() => null) : null;
      return {
        company: { name: companyDisplayName(nameOverride || cs?.company_name), tagline: cs?.tagline || "Building With Integrity", contactLines, theme: await loadCompanyTheme(companyId) },
        logo: lg ? lg.image : null,
        logoVector: !!lg?.vector,
        signature: await tryImage(cs?.signature_url),
      };
    })();
    companyCache.set(key, p);
    setTimeout(() => companyCache.delete(key), 20000);          // kept only long enough for one batch; a changed logo or colour shows up on the next card
    p.catch(() => companyCache.delete(key));
  }
  return p;
}

// ── Worker ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function loadWorkerCard(workerId: string, companyNameOverride?: string | null): Promise<LoadedCard | null> {
  const { data: w, error } = await supabase.from("workers")
    .select("id,company_id,first_name,last_name,worker_type,job_title,employee_id,address,city,phone,hire_date,id_expiry_date,passport_photo_url,verify_code")
    .eq("id", workerId).maybeSingle();
  if (error) throw error;
  if (!w) return null;
  const bundle = await loadCompanyBundle(w.company_id, companyNameOverride);
  // The expiry falls back to hire date + 2 years when no explicit date is set (as the card always did).
  const exp = w.id_expiry_date ? new Date(w.id_expiry_date) : (() => { const d = w.hire_date ? new Date(w.hire_date) : new Date(); d.setFullYear(d.getFullYear() + 2); return d; })();
  const expired = exp.getTime() < Date.now();
  const name = `${w.first_name || ""} ${w.last_name || ""}`.trim() || "Worker";
  const addr = [w.address, w.city].filter(Boolean).join(", ");
  const bearer: Array<[string, string]> = [];
  if (addr) bearer.push(["Address", addr]);
  if (w.phone) bearer.push(["Phone", w.phone]);
  const data: IdCardData = {
    kind: "worker", id: w.id, name,
    title: w.job_title?.trim() || cap(w.worker_type || "worker"),
    initials: initialsOf(name),
    verifyCode: w.verify_code,
    cardTitle: "SITE IDENTIFICATION CARD",
    detail: w.employee_id?.trim() ? { label: "Worker No", value: w.employee_id.trim() } : null,     // the worker number (MBW-001); the national ID number is no longer on the card
    bearer,
    issuedLabel: fmtFull(w.hire_date ? new Date(w.hire_date) : new Date()),
    expiresLabel: fmtFull(exp),
    expired, expiryColor: expired ? ALERT_RED : GOLD,
    statement: `This card certifies the bearer is an authorized worker of ${bundle.company.name}. This card remains company property and must be surrendered upon termination.`,
  };
  // the passport photo only (never the ID scan), signed for a moment: it is stored as a path in the private bucket
  const photo = await tryImage(await resolveFileUrl(w.passport_photo_url));
  return { data, company: bundle.company, images: { photo, logo: bundle.logo, logoVector: bundle.logoVector, signature: bundle.signature } };
}

// ── Staff ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function loadStaffCard(userId: string): Promise<LoadedCard | null> {
  const { data: p, error } = await supabase.from("user_profiles")
    .select("id, full_name, role, job_title, avatar_url, company_id, created_at, verify_code")
    .eq("id", userId).maybeSingle();
  if (error) throw error;
  if (!p) return null;
  const hr = (await fetchStaffHrFields([userId])).get(userId);
  const bundle = await loadCompanyBundle(p.company_id);
  const issued = hr?.id_issued_date || p.created_at || null;
  const base = hr?.id_issued_date || p.created_at;
  const exp = hr?.id_expiry_date ? new Date(hr.id_expiry_date) : base ? (() => { const d = new Date(base); d.setFullYear(d.getFullYear() + 2); return d; })() : null;
  const expired = !!exp && exp.getTime() < Date.now();
  const days = exp ? Math.ceil((exp.getTime() - Date.now()) / 86400000) : null;
  const expiryColor = !exp ? "rgba(255,255,255,0.5)" : expired ? ALERT_RED : days! < 60 ? "#fbbf24" : "#4ade80";
  const name = p.full_name?.trim() || "Staff member";
  const empNo = (hr?.employee_number || "").trim();
  const data: IdCardData = {
    kind: "staff", id: p.id, name,
    title: p.job_title?.trim() || cap(p.role || "Staff"),
    initials: initialsOf(name),
    verifyCode: p.verify_code,
    cardTitle: "STAFF IDENTIFICATION CARD",
    detail: empNo ? { label: "Employee No", value: empNo } : null,       // the TRN is no longer on the card
    bearer: [],
    issuedLabel: fmtMonthYear(issued), expiresLabel: fmtMonthYear(exp),
    expired, expiryColor,
    statement: `This card certifies the bearer is an authorized staff member of ${bundle.company.name}. This card remains company property and must be surrendered upon termination.`,
  };
  const photo = await tryImage(await resolveFileUrl(p.avatar_url));
  return { data, company: bundle.company, images: { photo, logo: bundle.logo, logoVector: bundle.logoVector, signature: bundle.signature } };
}

export interface CardRef { kind: "staff" | "worker"; id: string }
// Several people at once (batch download): cards come back in the order given; anyone who cannot be loaded is reported, not silently dropped.
export async function loadCards(refs: CardRef[], onProgress?: (done: number, total: number) => void): Promise<{ cards: LoadedCard[]; failed: string[] }> {
  const cards: LoadedCard[] = []; const failed: string[] = [];
  let done = 0;
  for (const r of refs) {
    try {
      const c = r.kind === "staff" ? await loadStaffCard(r.id) : await loadWorkerCard(r.id);
      if (c) cards.push(c); else failed.push(r.id);
    } catch { failed.push(r.id); }
    onProgress?.(++done, refs.length);
  }
  return { cards, failed };
}
export type { IdCardImages };
