// The worker's own ID card for the portal: the same card the office prints (lib/idCardRender.ts), built from what worker_portal_home returned instead of from the
// workers table (a portal session cannot read tables). Only the allow-listed details are used: name, worker number, trade, phone, hire / expiry dates, verify code.
import { ALERT_RED, type IdCardCompany, type IdCardData, type IdCardImages } from "./idCardRender";
import { normalizeTheme } from "./idCardTheme";
import { loadLogoImage } from "./logoImage";
import { loadImage } from "./idCardData";
import type { PortalHome } from "./workerPortalApi";

const GOLD = "#C9A84C";
const cap = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
const fmtFull = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function portalCardData(home: PortalHome): { data: IdCardData; company: IdCardCompany } | null {
  const w = home.worker;
  if (!w || !w.verify_code) return null;
  const co = home.company;
  // the expiry falls back to hire date + 2 years when none is set, like the printed card
  const exp = w.id_expiry_date ? new Date(w.id_expiry_date) : (() => { const d = w.hire_date ? new Date(w.hire_date) : new Date(); d.setFullYear(d.getFullYear() + 2); return d; })();
  const expired = exp.getTime() < Date.now();
  const name = `${w.first_name || ""} ${w.last_name || ""}`.trim() || "Worker";
  const companyName = (co?.name || "").trim() || "Your Company";
  const data: IdCardData = {
    kind: "worker", id: w.employee_id, name,
    title: w.job_title?.trim() || cap(w.worker_type || "worker"),
    initials: initialsOf(name),
    verifyCode: w.verify_code,
    cardTitle: "SITE IDENTIFICATION CARD",
    detail: w.employee_id ? { label: "Worker No", value: w.employee_id } : null,
    bearer: w.phone ? [["Phone", w.phone]] : [],
    issuedLabel: fmtFull(w.hire_date ? new Date(w.hire_date) : new Date()),
    expiresLabel: fmtFull(exp),
    expired, expiryColor: expired ? ALERT_RED : GOLD,
    statement: `This card certifies the bearer is an authorized worker of ${companyName}. This card remains company property and must be surrendered upon termination.`,
  };
  const contactLines = [co?.phone ? `Tel: ${co.phone}` : "", co?.email ? `Email: ${co.email}` : ""].filter(Boolean);
  const company: IdCardCompany = { name: companyName, tagline: co?.tagline || "Building With Integrity", contactLines, theme: normalizeTheme({ primary: co?.id_card_primary, accent: co?.id_card_accent }) };
  return { data, company };
}

export async function portalCardImages(home: PortalHome, photoUrl: string | null): Promise<IdCardImages> {
  const logoUrl = home.company?.logo_url;
  const lg = logoUrl ? await loadLogoImage(logoUrl).catch(() => null) : null;
  const photo = photoUrl ? await loadImage(photoUrl).catch(() => null) : null;
  return { photo, logo: lg ? lg.image : null, logoVector: !!lg?.vector, signature: null };
}
