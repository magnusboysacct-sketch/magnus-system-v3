// src/lib/estimateSnapshot.ts
//
// Builds the frozen, client-facing snapshot stored by share_with_client('estimate').
// Pure: no I/O, no Supabase. The math deliberately mirrors EstimatesPage.tsx so the
// client sees exactly what the printed proposal shows:
//   - pricing formulas are the same as EstimateDetailModal (subtotal -> markup ->
//     contingency -> total client price);
//   - every row and category is marked up by the SAME uniform (1 + markupOverall/100)
//     that printProposal applies (it ignores per-category markup);
//   - values are rounded to whole dollars, as printProposal's
//     toLocaleString({ maximumFractionDigits: 0 }) does.
// Only marked-up (client-facing) prices are ever emitted. Raw cost rate/amount,
// markup percentages, item types and internal notes are never included.
// Line items carry item, unit, qty, rate and amount ONLY. Descriptions are
// deliberately not part of the input type, so an internal remark typed into a
// line description can never reach the snapshot.

export type EstimateDetailLevel = "summary" | "full";

export interface EstimateSnapshotItemInput {
  category?: string | null;
  item?: string | null;
  unit?: string | null;
  qty?: number | null;
  rate?: number | null;
  amount?: number | null;
}

export interface EstimateSnapshotCompanyInput {
  company_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address_line1?: string | null;
  parish?: string | null;
  logo_url?: string | null;
  estimate_validity_days?: number | null;
}

export interface EstimateSnapshotInput {
  title: string;
  version?: number | null;
  createdAt: string; // estimate_headers.created_at (ISO timestamp)
  items: EstimateSnapshotItemInput[];
  markupOverall: number;
  contingencyPct: number;
  projectName: string | null;
  clientName: string | null;
  company: EstimateSnapshotCompanyInput | null;
}

export interface EstimateSnapshotItem {
  item: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface EstimateSnapshot {
  detail_level: EstimateDetailLevel;
  title: string;
  version: number;
  prepared_date: string;
  valid_until: string | null;
  project_name: string | null;
  client_name: string | null;
  company: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    logo_url: string | null;
  };
  categories: Array<{ name: string; total: number; items?: EstimateSnapshotItem[] }>;
  subtotal: number;
  contingency_amount: number;
  total: number;
}

// YYYY-MM-DD in Jamaica time (en-CA prints ISO-style dates).
function jamaicaDate(d: Date): string {
  try {
    const s = d.toLocaleDateString("en-CA", { timeZone: "America/Jamaica" });
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  } catch {
    // fall through
  }
  return d.toISOString().slice(0, 10);
}

export function buildEstimateSnapshot(
  level: EstimateDetailLevel,
  input: EstimateSnapshotInput
): EstimateSnapshot {
  const { items, markupOverall, contingencyPct, company } = input;

  // Same formulas as EstimateDetailModal.
  const subtotalCost = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const markupAmount = subtotalCost * (markupOverall / 100);
  const subtotalWithMarkup = subtotalCost + markupAmount;
  const contingencyAmount = subtotalWithMarkup * (contingencyPct / 100);
  const totalClientPrice = subtotalWithMarkup + contingencyAmount;

  // Group by category in first-seen order (printProposal groups the same way).
  const groups = new Map<string, EstimateSnapshotItemInput[]>();
  for (const it of items) {
    const cat = it.category || "General Works";
    const list = groups.get(cat);
    if (list) list.push(it);
    else groups.set(cat, [it]);
  }

  const up = (n: number) => Math.round(n * (1 + markupOverall / 100));
  // Unit price keeps 2 decimals so qty x rate lines up with amount; amounts,
  // category totals, subtotal, contingency and total stay whole-dollar (as printed).
  const up2 = (n: number) => Math.round(n * (1 + markupOverall / 100) * 100) / 100;

  const categories: EstimateSnapshot["categories"] = [];
  groups.forEach((list, name) => {
    const rawTotal = list.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const cat: { name: string; total: number; items?: EstimateSnapshotItem[] } = {
      name,
      total: up(rawTotal),
    };
    if (level === "full") {
      cat.items = list.map((i) => ({
        item: i.item || "",
        unit: i.unit || "",
        qty: Number(i.qty) || 0,
        rate: up2(Number(i.rate) || 0),
        amount: up(Number(i.amount) || 0),
      }));
    }
    categories.push(cat);
  });

  const created = new Date(input.createdAt);
  const days = Number(company?.estimate_validity_days);
  const validUntil =
    days > 0 ? jamaicaDate(new Date(created.getTime() + days * 24 * 60 * 60 * 1000)) : null;

  const address = [company?.address_line1, company?.parish].filter(Boolean).join(", ");

  return {
    detail_level: level,
    title: input.title,
    version: Number(input.version) || 1,
    prepared_date: jamaicaDate(created),
    valid_until: validUntil,
    project_name: input.projectName,
    client_name: input.clientName,
    company: {
      name: company?.company_name || "Magnus Boys Construction",
      phone: company?.phone || null,
      email: company?.email || null,
      address: address || null,
      logo_url: company?.logo_url || null,
    },
    categories,
    subtotal: Math.round(subtotalWithMarkup),
    contingency_amount: contingencyAmount > 0 ? Math.round(contingencyAmount) : 0,
    total: Math.round(totalClientPrice),
  };
}