// src/pages/EstimatesPage.tsx — v2 Rebuild
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import { magnusAI } from "../lib/magnusAI";
import EstimateAdvisorPanel from "../components/EstimateAdvisorPanel";
import {
  PageHeader, Card, Badge, Btn, Input, Select, Field,
  Table, Th, Tr, Td, Empty, Modal, Alert, Textarea,
  Tabs, Progress, cn
} from "../components/ui";
import {
  Plus, Search, FileText, ArrowRight, RefreshCw,
  DollarSign, Edit2, Trash2, Copy, Send,
  CheckCircle2, XCircle, Clock, LayoutGrid, List, X, Bot, Sparkles, Loader, Printer
} from "lucide-react";

// --- Types --------------------------------------------------------------------

type EstimateHeader = {
  id: string;
  project_id: string;
  title: string;
  status: "draft" | "sent" | "approved" | "declined";
  version: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // pricing
  markup_overall?: number | null;
  markup_type?: "overall" | "category" | null;
  contingency_pct?: number | null;
  contingency_amount?: number | null;
  subtotal_cost?: number | null;
  subtotal_markup?: number | null;
  total_client_price?: number | null;
  print_format?: string | null;
  // joined
  projects?: { name: string } | null;
};

type EstimateItem = {
  id: string;
  estimate_id: string;
  line_no: number;
  item_type: "labor" | "material" | "equipment" | "subcontractor" | "other";
  category: string | null;
  item: string;
  description: string | null;
  unit: string | null;
  qty: number;
  rate: number;
  amount: number;
};

type Tab = "all" | "draft" | "sent" | "approved" | "declined";
type ViewMode = "grid" | "list";

const STATUS_COLOR: Record<string, any> = {
  draft: "slate", sent: "blue", approved: "green", declined: "red",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  draft:    <Clock size={12}/>,
  sent:     <Send size={12}/>,
  approved: <CheckCircle2 size={12}/>,
  declined: <XCircle size={12}/>,
};

const ITEM_TYPE_COLOR: Record<string, string> = {
  labor: "text-blue-400", material: "text-emerald-400",
  equipment: "text-amber-400", subcontractor: "text-violet-400", other: "text-slate-400",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "JMD", maximumFractionDigits: 2
  }).format(n);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric"
  });
}

// --- Estimate Card ------------------------------------------------------------

function EstimateCard({ estimate, total, onView, onDelete, onDuplicate, onUpdateStatus, onAdvisor }: {
  estimate: EstimateHeader;
  total: number;
  onView: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onUpdateStatus: (status: EstimateHeader["status"]) => void;
  onAdvisor: () => void;
}) {
  return (
    <Card className="group hover:border-slate-300 dark:hover:border-white/[0.13] transition-all cursor-pointer" onClick={onView}>
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
          <FileText size={15} className="text-blue-400"/>
        </div>
        <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
          onClick={e => e.stopPropagation()}>
          <button onClick={onDuplicate}
            className="p-2.5 md:p-1.5 rounded-lg hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors" title="Duplicate">
            <Copy size={11}/>
          </button>
          <button onClick={onDelete}
            className="p-2.5 md:p-1.5 rounded-lg hover:bg-red-500/15 text-slate-600 hover:text-red-400 transition-colors" title="Delete">
            <Trash2 size={11}/>
          </button>
          <button onClick={onAdvisor}
            className="p-2.5 md:p-1.5 rounded-lg hover:bg-purple-500/15 text-slate-600 hover:text-purple-400 transition-colors" title="AI Advisor">
            <Bot size={11}/>
          </button>
        </div>
      </div>

      <div className="mb-3">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate mb-1">{estimate.title}</div>
        <div className="text-[10px] text-slate-600">
          {estimate.projects?.name || "No project"} · v{estimate.version}
        </div>
      </div>

      <div className="text-xl font-bold text-emerald-400 mb-3">{fmt(total)}</div>

      <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-white/[0.05]">
        <Badge color={STATUS_COLOR[estimate.status]} dot>{estimate.status}</Badge>
        <div className="text-[9px] text-slate-700">{fmtDate(estimate.updated_at)}</div>
      </div>

      {/* Status actions */}
      {estimate.status === "draft" && (
        <div className="mt-3 flex gap-1.5" onClick={e => e.stopPropagation()}>
          <button onClick={() => onUpdateStatus("sent")}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-[10px] text-blue-300 font-semibold transition-colors">
            <Send size={10}/> Send
          </button>
        </div>
      )}
      {estimate.status === "sent" && (
        <div className="mt-3 flex gap-1.5" onClick={e => e.stopPropagation()}>
          <button onClick={() => onUpdateStatus("approved")}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-[10px] text-emerald-300 font-semibold transition-colors">
            <CheckCircle2 size={10}/> Approve
          </button>
          <button onClick={() => onUpdateStatus("declined")}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-[10px] text-red-300 font-semibold transition-colors">
            <XCircle size={10}/> Decline
          </button>
        </div>
      )}
    </Card>
  );
}

// --- Detail Modal -------------------------------------------------------------

function EstimateDetailModal({ estimate, items, companyId, onClose }: {
  estimate: EstimateHeader;
  items: EstimateItem[];
  companyId: string | null;
  onClose: () => void;
}) {
  const nav = useNavigate();
  const total = items.reduce((s, i) => s + (i.amount || 0), 0);
  const byType = items.reduce((acc: Record<string, number>, i) => {
    acc[i.item_type] = (acc[i.item_type] || 0) + (i.amount || 0);
    return acc;
  }, {});

  // --- Pricing: markup + contingency ------------------------------------
  const [markupType, setMarkupType] = useState<"overall" | "category">(estimate.markup_type || "overall");
  const [markupOverall, setMarkupOverall] = useState<number>(estimate.markup_overall ?? 25);
  const [contingencyPct, setContingencyPct] = useState<number>(estimate.contingency_pct ?? 5);
  const [savingMarkup, setSavingMarkup] = useState(false);

  useEffect(() => {
    async function loadDefaults() {
      if (!companyId || estimate.markup_overall != null) return;
      const { data: cs } = await supabase
        .from("company_settings")
        .select("estimate_markup_overall, estimate_contingency")
        .eq("company_id", companyId)
        .maybeSingle();
      if (cs) {
        setMarkupOverall(cs.estimate_markup_overall ?? 25);
        setContingencyPct(cs.estimate_contingency ?? 5);
      }
    }
    loadDefaults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimate.id, companyId]);

  const subtotalCost = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const markupAmount = subtotalCost * (markupOverall / 100);
  const subtotalWithMarkup = subtotalCost + markupAmount;
  const contingencyAmount = subtotalWithMarkup * (contingencyPct / 100);
  const totalClientPrice = subtotalWithMarkup + contingencyAmount;

  async function saveMarkup() {
    setSavingMarkup(true);
    await supabase.from("estimate_headers").update({
      markup_overall: markupOverall,
      markup_type: markupType,
      contingency_pct: contingencyPct,
      contingency_amount: contingencyAmount,
      subtotal_cost: subtotalCost,
      subtotal_markup: markupAmount,
      total_client_price: totalClientPrice,
    }).eq("id", estimate.id);
    setSavingMarkup(false);
  }

  function handleGenerateContract() {
    const params = new URLSearchParams({
      estimate_id: estimate.id,
      project_id: estimate.project_id || "",
      amount: String(Math.round(totalClientPrice)),
      title: estimate.title,
    });
    nav(`/contracts?new=1&${params.toString()}`);
  }

  async function printProposal() {
    const fmtJMD = (n: number) => new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD",minimumFractionDigits:2}).format(n);

    const { data: { user } } = await supabase.auth.getUser();
    let cs: any = null;
    let proj: any = null;
    let client: any = null;
    if (user) {
      const { data: profile } = await supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
      if (profile?.company_id) {
        const { data } = await supabase.from("company_settings")
          .select("company_name, address_line1, address_line2, parish, phone, email, logo_url, estimate_validity_days, estimate_print_format")
          .eq("company_id", profile.company_id).maybeSingle();
        cs = data;
      }
    }
    const { data: projData } = await supabase.from("projects")
      .select("name, site_address, client_id").eq("id", estimate.project_id).maybeSingle();
    proj = projData;
    if (proj?.client_id) {
      const { data: c } = await supabase.from("clients").select("name, address, phone, email").eq("id", proj.client_id).maybeSingle();
      client = c;
    }

    const markup = markupAmount;
    const subtotal = subtotalWithMarkup;
    const contingency = contingencyAmount;
    const grandTotal = totalClientPrice;
    const validUntil = new Date(new Date(estimate.created_at).getTime() + (cs?.estimate_validity_days || 30) * 24 * 60 * 60 * 1000);
    const estNumber = `EST-${new Date(estimate.created_at).getFullYear()}-${estimate.id.slice(-6).toUpperCase()}`;
    const printFormat = estimate.print_format || cs?.estimate_print_format || "summary";

    const html = `<!DOCTYPE html><html><head>
    <title>${estimate.title} — Cost Proposal</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; color:#1e293b; background:white; padding:40px; font-size:13px; }
      .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; padding-bottom:20px; border-bottom:3px solid #1e3a5f; }
      .company-logo { height:60px; width:auto; object-fit:contain; margin-bottom:8px; }
      .company-name { font-size:22px; font-weight:900; color:#1e3a5f; }
      .company-sub { font-size:11px; color:#64748b; margin-top:2px; }
      .doc-title { font-size:28px; font-weight:900; color:#1e3a5f; text-align:right; }
      .doc-meta { font-size:11px; color:#64748b; text-align:right; margin-top:4px; line-height:1.8; }
      .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:28px; padding:16px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; }
      .info-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; margin-bottom:6px; }
      .info-value { font-size:14px; font-weight:700; color:#1e293b; }
      .info-sub { font-size:11px; color:#64748b; margin-top:2px; line-height:1.6; }
      table { width:100%; border-collapse:collapse; margin-bottom:24px; }
      th { background:#1e3a5f; color:white; padding:10px 12px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; }
      th.right { text-align:right; }
      td { padding:10px 12px; border-bottom:1px solid #e2e8f0; font-size:12px; }
      td.right { text-align:right; }
      tr:nth-child(even) td { background:#f8fafc; }
      .totals { display:flex; justify-content:flex-end; margin-bottom:32px; }
      .totals-box { width:320px; }
      .total-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #e2e8f0; font-size:12px; }
      .total-final { display:flex; justify-content:space-between; padding:14px 16px; background:#1e3a5f; border-radius:8px; margin-top:8px; }
      .total-final span { color:white; font-weight:700; font-size:14px; }
      .contingency-row { display:flex; justify-content:space-between; padding:8px 12px; background:#fffbeb; border:1px solid #fcd34d; border-radius:6px; margin:4px 0; font-size:12px; }
      .terms { margin-bottom:24px; padding:16px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; }
      .terms-title { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; margin-bottom:8px; }
      .terms-text { font-size:10px; color:#64748b; line-height:1.8; }
      .sigs { display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-bottom:32px; }
      .sig-line { border-top:2px solid #1e3a5f; padding-top:8px; }
      .sig-name { font-size:11px; font-weight:600; color:#1e293b; }
      .sig-sub { font-size:10px; color:#94a3b8; margin-top:4px; }
      .footer { text-align:center; padding-top:16px; border-top:1px solid #e2e8f0; font-size:10px; color:#94a3b8; line-height:1.8; }
      .badge { display:inline-block; padding:3px 10px; background:#dcfce7; color:#166534; font-size:10px; font-weight:700; border-radius:20px; text-transform:uppercase; }
      @media print { body { padding:20px; } }
    </style>
    </head><body>

    <div class="header">
      <div>
        ${cs?.logo_url ? `<img src="${cs.logo_url}" class="company-logo"/>` : `<div class="company-name">${cs?.company_name || "Magnus Boys Construction"}</div>`}
        <div class="company-sub">${cs?.address_line1 || ""}${cs?.parish ? ", " + cs.parish : ""}</div>
        <div class="company-sub">${cs?.phone || ""}${cs?.email ? " · " + cs.email : ""}</div>
      </div>
      <div>
        <div class="doc-title">COST PROPOSAL</div>
        <div class="doc-meta">
          Estimate #: ${estNumber}<br/>
          Date: ${new Date(estimate.created_at).toLocaleDateString("en-JM", {day:"numeric",month:"long",year:"numeric"})}<br/>
          Valid Until: ${validUntil.toLocaleDateString("en-JM", {day:"numeric",month:"long",year:"numeric"})}<br/>
          Version ${estimate.version || 1} &nbsp; <span class="badge">${estimate.status}</span>
        </div>
      </div>
    </div>

    <div class="info-grid">
      <div>
        <div class="info-label">Prepared For</div>
        <div class="info-value">${client?.name || "—"}</div>
        <div class="info-sub">${client?.address || ""}${client?.phone ? "<br/>" + client.phone : ""}${client?.email ? "<br/>" + client.email : ""}</div>
      </div>
      <div>
        <div class="info-label">Project</div>
        <div class="info-value">${proj?.name || estimate.title}</div>
        <div class="info-sub">${proj?.site_address || ""}${estimate.notes ? "<br/>" + estimate.notes : ""}</div>
      </div>
    </div>

    ${printFormat === "summary" ? `
    <table>
      <thead><tr>
        <th>#</th><th>Description</th><th class="right">Amount (JMD)</th>
      </tr></thead>
      <tbody>
        ${Object.entries(
          items.reduce((groups: Record<string, number>, item: any) => {
            const cat = item.category || "General Works";
            groups[cat] = (groups[cat] || 0) + (Number(item.amount) || 0);
            return groups;
          }, {})
        ).map(([cat, amt], i) => {
          const clientAmt = (amt as number) * (1 + markupOverall / 100);
          return `<tr><td>${i+1}</td><td><strong>${cat}</strong></td><td class="right"><strong>JMD ${clientAmt.toLocaleString(undefined,{maximumFractionDigits:0})}</strong></td></tr>`;
        }).join("")}
      </tbody>
    </table>
    ` : `
    <table>
      <thead><tr>
        <th>#</th><th>Item</th><th>Type</th><th>Unit</th>
        ${printFormat === "breakdown" ? "<th class='right'>Qty</th><th class='right'>Rate (JMD)</th>" : "<th class='right'>Qty</th>"}
        <th class="right">Amount (JMD)</th>
      </tr></thead>
      <tbody>
        ${items.map((item: any, i: number) => {
          const clientRate = (Number(item.rate)||0) * (1 + markupOverall/100);
          const clientAmt = (Number(item.amount)||0) * (1 + markupOverall/100);
          return `<tr>
            <td>${i+1}</td>
            <td><strong>${item.item||""}</strong>${item.description ? "<br/><span style='color:#64748b;font-size:10px'>" + item.description + "</span>" : ""}</td>
            <td>${item.item_type||""}</td>
            <td>${item.unit||""}</td>
            ${printFormat === "breakdown" ? `<td class="right">${Number(item.qty||0).toLocaleString()}</td><td class="right">${clientRate.toLocaleString(undefined,{maximumFractionDigits:0})}</td>` : `<td class="right">${Number(item.qty||0).toLocaleString()}</td>`}
            <td class="right"><strong>JMD ${clientAmt.toLocaleString(undefined,{maximumFractionDigits:0})}</strong></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
    `}

    <div class="totals">
      <div class="totals-box">
        <div class="total-row"><span>Subtotal</span><span>JMD ${subtotal.toLocaleString(undefined,{maximumFractionDigits:0})}</span></div>
        ${contingency > 0 ? `<div class="contingency-row"><span>Contingency (${contingencyPct}%)</span><span>JMD ${contingency.toLocaleString(undefined,{maximumFractionDigits:0})}</span></div>` : ""}
        <div class="total-final"><span>TOTAL CONTRACT VALUE</span><span>JMD ${grandTotal.toLocaleString(undefined,{maximumFractionDigits:0})}</span></div>
      </div>
    </div>

    <div class="terms">
      <div class="terms-title">Terms & Conditions</div>
      <div class="terms-text">
        1. This proposal is valid for ${cs?.estimate_validity_days || 30} days from date of issue.<br/>
        2. Prices are in Jamaican Dollars (JMD) and subject to change after validity period.<br/>
        3. A deposit is required before commencement of work.<br/>
        4. Progress payments as per agreed schedule.<br/>
        5. All materials remain property of ${cs?.company_name || "Magnus Boys Construction"} until full payment is received.<br/>
        6. Contingency allowance covers unforeseen site conditions and price variations.
      </div>
    </div>

    <div class="sigs">
      <div class="sig-line">
        <div class="sig-name">Client Acceptance</div>
        <div class="sig-sub">Signature &amp; Date</div>
      </div>
      <div class="sig-line">
        <div class="sig-name">Authorized By — ${cs?.company_name || "Magnus Boys Construction"}</div>
        <div class="sig-sub">Signature &amp; Date</div>
      </div>
    </div>

    <div class="footer">
      ${cs?.company_name || "Magnus Boys Construction"} · ${cs?.phone || ""} · ${cs?.email || ""}<br/>
      This proposal is valid for ${cs?.estimate_validity_days || 30} days from date of issue.
    </div>

    </body></html>`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
  }
  return (
    <Modal open onClose={onClose} title={estimate.title}
      subtitle={`v${estimate.version} · ${estimate.projects?.name || "No project"}`}
      width="max-w-3xl">
      <div className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(byType).map(([type, amt]) => (
            <div key={type} className="rounded-lg bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] p-2.5">
              <div className={cn("text-[9px] font-bold uppercase tracking-widest mb-1", ITEM_TYPE_COLOR[type] || "text-slate-600")}>{type}</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{fmt(amt)}</div>
            </div>
          ))}
        </div>

        {/* Pricing Panel */}
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/[0.06] flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pricing</span>
            <span className="text-[9px] text-slate-500 bg-slate-100 dark:bg-white/[0.06] px-2 py-0.5 rounded-full">Internal — client never sees markup</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">BOQ Cost</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">{fmt(subtotalCost)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-600 dark:text-slate-400">Markup</span>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="200"
                  value={markupOverall}
                  onChange={e => setMarkupOverall(Number(e.target.value))}
                  className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-sm text-right font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"/>
                <span className="text-sm text-slate-400">%</span>
                <span className="text-sm font-semibold text-emerald-500 dark:text-emerald-400">
                  = {fmt(markupAmount)}
                </span>
              </div>
            </div>
            <div className="border-t border-slate-100 dark:border-white/[0.06] pt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Subtotal (with markup)</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200">{fmt(subtotalWithMarkup)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 bg-amber-50 dark:bg-amber-500/10 rounded-lg p-3">
              <div>
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Contingency</span>
                <span className="text-[10px] text-amber-600 dark:text-amber-500 ml-2">shown to client</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="50"
                  value={contingencyPct}
                  onChange={e => setContingencyPct(Number(e.target.value))}
                  className="w-16 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-white/[0.04] text-sm text-right font-semibold text-amber-700 dark:text-amber-400 focus:outline-none"/>
                <span className="text-sm text-amber-600 dark:text-amber-500">%</span>
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  = {fmt(contingencyAmount)}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between bg-blue-600 rounded-xl px-4 py-3">
              <span className="text-sm font-bold text-white">TOTAL TO CLIENT</span>
              <span className="text-lg font-black text-white">{fmt(totalClientPrice)}</span>
            </div>
            <button onClick={saveMarkup} disabled={savingMarkup}
              className="w-full py-2 rounded-lg border border-slate-200 dark:border-white/[0.1] text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors">
              {savingMarkup ? "Saving..." : "Save markup settings"}
            </button>
          </div>
        </div>

        {/* Items table */}
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] overflow-hidden max-h-80 overflow-y-auto">
          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Item</Th>
                <Th>Type</Th>
                <Th>Unit</Th>
                <Th right>Qty</Th>
                <Th right>Rate</Th>
                <Th right>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><Td colSpan={7} className="text-center py-6 text-slate-600">No items</Td></tr>
              ) : items.map(item => (
                <Tr key={item.id}>
                  <Td muted className="font-mono text-[10px]">{item.line_no}</Td>
                  <Td>
                    <div className="font-medium text-slate-800 dark:text-slate-200 text-xs">{item.item}</div>
                    {item.description && <div className="text-[10px] text-slate-600">{item.description}</div>}
                  </Td>
                  <Td>
                    <span className={cn("text-[10px] font-semibold capitalize", ITEM_TYPE_COLOR[item.item_type] || "text-slate-500")}>
                      {item.item_type}
                    </span>
                  </Td>
                  <Td muted>{item.unit || "—"}</Td>
                  <Td right muted>{item.qty}</Td>
                  <Td right muted>{fmt(item.rate)}</Td>
                  <Td right><span className="font-semibold text-slate-800 dark:text-slate-200">{fmt(item.amount)}</span></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>

        {/* Total */}
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06]">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Total Estimate</span>
          <span className="text-xl font-bold text-emerald-400">{fmt(total)}</span>
        </div>

        {estimate.notes && (
          <div className="rounded-lg bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] px-3 py-2.5">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">Notes</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{estimate.notes}</div>
          </div>
        )}
             <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
          {estimate.status === "approved" && (
            <button onClick={handleGenerateContract}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition">
              <FileText size={14}/> Generate Contract
            </button>
          )}
          <button onClick={printProposal} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition"><Printer size={14}/> Print / Export Proposal</button>
        </div>
      </div>
    </Modal>
  );
}

// --- Main Page ----------------------------------------------------------------

export default function EstimatesPage() {
  const { projects, currentProject } = useProjectContext();
  const nav = useNavigate();
  const [estimates, setEstimates] = useState<EstimateHeader[]>([]);
  const [itemsByEstimate, setItemsByEstimate] = useState<Record<string, EstimateItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [projectFilter, setProjectFilter] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [viewingEstimate, setViewingEstimate] = useState<EstimateHeader | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [advisorEstimate, setAdvisorEstimate] = useState<EstimateHeader | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", project_id: currentProject?.id || "", notes: "", status: "draft" });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => { if (data?.company_id) setCompanyId(data.company_id); });
    });
  }, []);

  useEffect(() => { if (companyId) loadEstimates(); }, [companyId]);

  async function loadEstimates() {
    setLoading(true);
    try {
      const { data, error: e } = await supabase
        .from("estimate_headers")
        .select("*, projects(name)")
        
        .order("updated_at", { ascending: false });
      if (e) throw e;
      const hdrs = data || [];
      setEstimates(hdrs);

      // Load items for all estimates
      if (hdrs.length > 0) {
        const ids = hdrs.map((h: any) => h.id);
        const { data: items } = await supabase
          .from("estimate_items")
          .select("*")
          .in("estimate_id", ids)
          .order("line_no", { ascending: true });
        const map: Record<string, EstimateItem[]> = {};
        (items || []).forEach((item: EstimateItem) => {
          if (!map[item.estimate_id]) map[item.estimate_id] = [];
          map[item.estimate_id].push(item);
        });
        setItemsByEstimate(map);
      }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function createEstimate() {
    if (!form.project_id) { setError("Please select a project."); return; }
    if (!form.title.trim()) { setError("Please enter an estimate title."); return; }
    setSaving(true); setError(null);
    try {
      const { error: e } = await supabase.from("estimate_headers").insert({
        project_id: form.project_id,
        title: form.title.trim(),
        status: form.status,
        version: 1,
        notes: form.notes.trim() || null,
        company_id: companyId,
      });
      if (e) throw e;
      await loadEstimates();
      setShowNew(false);
      setForm({ title: "", project_id: currentProject?.id || "", notes: "", status: "draft" });
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function deleteEstimate(id: string) {
    try {
      await supabase.from("estimate_items").delete().eq("estimate_id", id);
      await supabase.from("estimate_headers").delete().eq("id", id);
      setEstimates(prev => prev.filter(e => e.id !== id));
    } catch (e: any) { setError(e.message); }
  }

  async function duplicateEstimate(estimate: EstimateHeader) {
    try {
      const { data: newHdr, error: e } = await supabase.from("estimate_headers").insert({
        company_id: companyId,
        project_id: estimate.project_id,
        title: estimate.title + " (Copy)",
        status: "draft",
        version: estimate.version + 1,
        notes: estimate.notes,
      }).select().maybeSingle();
      if (e) throw e;
      if (newHdr) {
        const srcItems = itemsByEstimate[estimate.id] || [];
        if (srcItems.length > 0) {
          await supabase.from("estimate_items").insert(
            srcItems.map(i => ({ ...i, id: undefined, estimate_id: newHdr.id, created_at: undefined, updated_at: undefined }))
          );
        }
        await loadEstimates();
      }
    } catch (e: any) { setError(e.message); }
  }

  async function updateStatus(id: string, status: EstimateHeader["status"]) {
    await supabase.from("estimate_headers").update({ status }).eq("id", id);
    setEstimates(prev => prev.map(e => e.id === id ? { ...e, status } : e));
  }

  async function getAISuggestion() {
    if (!form.title.trim()) return;
    setAiLoading(true); setAiSuggestion(null);
    try {
      const text = await magnusAI.chat(`You are a Jamaica construction expert. Write professional estimate notes for: "${form.title}". 2-3 sentences covering scope, terms, and conditions. Be concise and professional.`);
      setAiSuggestion(String(text).trim());
    } catch { setAiSuggestion(null); }
    setAiLoading(false);
  }

  function getTotal(estimateId: string) {
    return (itemsByEstimate[estimateId] || []).reduce((s, i) => s + (i.amount || 0), 0);
  }

  // Filter
  const filtered = estimates.filter(e => {
    const matchSearch = e.title.toLowerCase().includes(search.toLowerCase()) ||
      (e.projects?.name || "").toLowerCase().includes(search.toLowerCase());
    const matchTab = tab === "all" || e.status === tab;
    const matchProject = !projectFilter || e.project_id === projectFilter;
    return matchSearch && matchTab && matchProject;
  });

  const stats = {
    total: estimates.length,
    draft: estimates.filter(e => e.status === "draft").length,
    sent: estimates.filter(e => e.status === "sent").length,
    approved: estimates.filter(e => e.status === "approved").length,
    totalValue: estimates.filter(e => e.status === "approved").reduce((s, e) => s + getTotal(e.id), 0),
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Estimates"
        subtitle={`${stats.total} total · ${fmt(stats.totalValue)} approved`}
        actions={
          <>
            <Btn variant="ghost" size="sm"
              icon={<RefreshCw size={13} className={loading ? "animate-spin" : ""}/>}
              onClick={loadEstimates}/>
            <Btn variant="primary" size="sm" icon={<Plus size={13}/>} onClick={() => setShowNew(true)}>
              New Estimate
            </Btn>
          </>
        }
      />

      <div className="p-6 space-y-5">
        {/* Stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total",    value: stats.total,    color: "text-slate-800 dark:text-slate-200",   key: "all" as Tab },
            { label: "Draft",    value: stats.draft,    color: "text-slate-500 dark:text-slate-400",   key: "draft" as Tab },
            { label: "Sent",     value: stats.sent,     color: "text-blue-400",    key: "sent" as Tab },
            { label: "Approved", value: stats.approved, color: "text-emerald-400", key: "approved" as Tab },
          ].map(s => (
            <button key={s.key} onClick={() => setTab(s.key)}
              className={cn("rounded-xl border p-3 text-left transition-all",
                tab === s.key ? "border-cyan-500/30 bg-cyan-500/10" : "border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0c1018] hover:border-slate-300 dark:hover:border-white/[0.12]")}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">{s.label}</div>
              <div className={cn("text-2xl font-bold", s.color)}>{s.value}</div>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700"/>
            <Input className="pl-8" placeholder="Search estimates..."
              value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <Select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="w-44">
            <option value="">All projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] p-1">
            <button onClick={() => setViewMode("grid")}
              className={cn("p-1.5 rounded-md transition-colors", viewMode === "grid" ? "bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-slate-200" : "text-slate-600 hover:text-slate-400")}>
              <LayoutGrid size={13}/>
            </button>
            <button onClick={() => setViewMode("list")}
              className={cn("p-1.5 rounded-md transition-colors", viewMode === "list" ? "bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-slate-200" : "text-slate-600 hover:text-slate-400")}>
              <List size={13}/>
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-xs text-slate-600">
            <RefreshCw size={14} className="animate-spin mr-2"/> Loading estimates...
          </div>
        ) : filtered.length === 0 ? (
          <Empty
            icon={<FileText size={20}/>}
            title={search ? "No estimates match your search" : "No estimates yet"}
            body={search ? "Try a different search." : "Create your first estimate or generate one from a BOQ."}
            action={!search ? <Btn variant="primary" icon={<Plus size={13}/>} onClick={() => setShowNew(true)}>New Estimate</Btn> : undefined}
          />
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(e => (
              <EstimateCard
                key={e.id}
                estimate={e}
                total={getTotal(e.id)}
                onView={() => setViewingEstimate(e)}
                onDelete={() => deleteEstimate(e.id)}
                onDuplicate={() => duplicateEstimate(e)}
                onUpdateStatus={status => updateStatus(e.id, status)}
                onAdvisor={() => setAdvisorEstimate(e)}
              />
            ))}
          </div>
        ) : (
          <Card padding={false}>
            <Table>
              <thead>
                <tr>
                  <Th>Title</Th>
                  <Th>Project</Th>
                  <Th>Version</Th>
                  <Th>Status</Th>
                  <Th>Updated</Th>
                  <Th right>Total</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <Tr key={e.id} onClick={() => setViewingEstimate(e)}>
                    <Td><span className="font-semibold text-slate-800 dark:text-slate-200">{e.title}</span></Td>
                    <Td muted>{e.projects?.name || "—"}</Td>
                    <Td muted>v{e.version}</Td>
                    <Td><Badge color={STATUS_COLOR[e.status]} dot>{e.status}</Badge></Td>
                    <Td muted>{fmtDate(e.updated_at)}</Td>
                    <Td right><span className="font-semibold text-emerald-400">{fmt(getTotal(e.id))}</span></Td>
                    <Td>
                      <div className="flex items-center gap-1" onClick={ev => ev.stopPropagation()}>
                        <button onClick={() => duplicateEstimate(e)}
                          className="p-1.5 rounded hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors">
                          <Copy size={12}/>
                        </button>
                        <button onClick={() => deleteEstimate(e.id)}
                          className="p-1.5 rounded hover:bg-red-500/15 text-slate-600 hover:text-red-400 transition-colors">
                          <Trash2 size={12}/>
                        </button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>

      {/* Detail Modal */}
      {viewingEstimate && (
        <EstimateDetailModal
          estimate={viewingEstimate}
          items={itemsByEstimate[viewingEstimate.id] || []}
          companyId={companyId}
          onClose={() => setViewingEstimate(null)}
        />
      )}

      {/* AI Advisor Panel */}
      {advisorEstimate && companyId && (
        <EstimateAdvisorPanel
          estimateId={advisorEstimate.id}
          estimateTitle={advisorEstimate.title}
          estimateTotal={getTotal(advisorEstimate.id)}
          itemCount={(itemsByEstimate[advisorEstimate.id] || []).length}
          companyId={companyId}
          onClose={() => setAdvisorEstimate(null)}
        />
      )}

      {/* New Estimate Modal */}
      <Modal open={showNew} onClose={() => { setShowNew(false); setError(null); }}
        title="New Estimate" subtitle="Create a new project estimate">
        <div className="space-y-4">
          {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
          <Field label="Title">
            <Input placeholder="e.g. Phase 1 Construction Estimate"
              value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus/>
          </Field>
          <Field label="Project">
            <Select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
              <option value="" disabled>Select a project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
            </Select>
          </Field>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Notes</span>
              <button type="button" onClick={getAISuggestion} disabled={aiLoading || !form.title.trim()}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-[10px] text-purple-400 font-semibold disabled:opacity-40 transition">
                {aiLoading ? <Loader size={9} className="animate-spin"/> : <Sparkles size={9}/>}
                {aiLoading ? "Writing..." : "AI Write Notes"}
              </button>
            </div>
            {aiSuggestion && (
              <div className="mb-2 rounded-lg bg-purple-500/10 border border-purple-500/20 px-3 py-2 flex gap-2">
                <Bot size={11} className="text-purple-400 flex-shrink-0 mt-0.5"/>
                <div className="flex-1">
                  <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">{aiSuggestion}</p>
                  <button type="button" onClick={() => setForm(f => ({ ...f, notes: aiSuggestion }))}
                    className="mt-1 text-[10px] text-purple-400 hover:text-purple-300 font-semibold">Use this ?</button>
                </div>
                <button type="button" onClick={() => setAiSuggestion(null)} className="text-slate-600 hover:text-slate-400"><X size={10}/></button>
              </div>
            )}
            <textarea rows={2} placeholder="Any notes or terms..."
              value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 outline-none focus:border-blue-500/50 resize-none"/>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
            <Btn variant="ghost" onClick={() => { setShowNew(false); setError(null); }}>Cancel</Btn>
            <Btn variant="primary" onClick={createEstimate}
              disabled={!form.title.trim() || saving}>
              {saving ? "Creating..." : "Create Estimate"}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}