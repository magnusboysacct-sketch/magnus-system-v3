// src/pages/SettingsEstimatesPage.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { PageHeader } from "../components/ui";
import { Save, Percent, DollarSign, FileText, ArrowLeft } from "lucide-react";

type EstimateSettings = {
  estimate_markup_overall: number;
  estimate_markup_materials: number;
  estimate_markup_labor: number;
  estimate_markup_equipment: number;
  estimate_markup_subcontractor: number;
  estimate_contingency: number;
  estimate_validity_days: number;
  estimate_deposit_pct: number;
  estimate_progress_pct: number;
  estimate_completion_pct: number;
  estimate_print_format: string;
};

const DEFAULTS: EstimateSettings = {
  estimate_markup_overall: 25,
  estimate_markup_materials: 20,
  estimate_markup_labor: 35,
  estimate_markup_equipment: 15,
  estimate_markup_subcontractor: 10,
  estimate_contingency: 5,
  estimate_validity_days: 30,
  estimate_deposit_pct: 30,
  estimate_progress_pct: 40,
  estimate_completion_pct: 30,
  estimate_print_format: "summary",
};

export default function SettingsEstimatesPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [settings, setSettings] = useState<EstimateSettings>(DEFAULTS);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: profile } = await supabase
        .from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
      if (!profile?.company_id) { setLoading(false); return; }
      setCompanyId(profile.company_id);
      const { data } = await supabase
        .from("company_settings")
        .select(Object.keys(DEFAULTS).join(","))
        .eq("company_id", profile.company_id)
        .maybeSingle();
      if (data) {
        setSettings(s => ({
          ...s,
          ...Object.fromEntries(
            Object.keys(DEFAULTS).map(k => [k, (data as any)[k] ?? (s as any)[k]])
          ),
        }));
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    if (!companyId) return;
    setSaving(true);
    await supabase.from("company_settings").upsert({
      company_id: companyId,
      ...settings,
    }, { onConflict: "company_id" });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function set<K extends keyof EstimateSettings>(k: K, v: EstimateSettings[K]) {
    setSettings(s => ({ ...s, [k]: v }));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
        <PageHeader title="Estimate Settings" subtitle="Markup, contingency and payment terms"/>
        <div className="p-8 text-slate-400 text-sm">Loading...</div>
      </div>
    );
  }

  const paymentTotal = settings.estimate_deposit_pct + settings.estimate_progress_pct + settings.estimate_completion_pct;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Estimate Settings"
        subtitle="Default markup, contingency and payment terms applied to all new estimates"
        actions={
          <button onClick={() => nav("/settings")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-xs font-semibold text-slate-600 dark:text-slate-300 transition">
            <ArrowLeft size={13}/> Back to Settings
          </button>
        }
      />
      <div className="max-w-2xl mx-auto p-6 space-y-8">

      {/* Markup */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <Percent size={15} className="text-blue-500"/>
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Markup (Internal — never shown to client)</h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Your profit margin added to BOQ costs before presenting to client.</p>
        </div>
        <div className="p-5 space-y-4">
          {/* Overall markup */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Overall Markup</div>
              <div className="text-xs text-slate-400">Applied to all items unless overridden by category</div>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" min="0" max="200"
                value={settings.estimate_markup_overall}
                onChange={e => set("estimate_markup_overall", Number(e.target.value))}
                className="w-20 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-sm text-right font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"/>
              <span className="text-sm text-slate-400">%</span>
            </div>
          </div>

          {/* Category overrides */}
          <div className="border-t border-slate-100 dark:border-white/[0.06] pt-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Category Overrides</div>
            <div className="space-y-3">
              {([
                { key: "estimate_markup_materials", label: "Materials", hint: "Blocks, cement, steel, etc." },
                { key: "estimate_markup_labor", label: "Labor", hint: "Site workers, tradesmen" },
                { key: "estimate_markup_equipment", label: "Equipment", hint: "Plant hire, machinery" },
                { key: "estimate_markup_subcontractor", label: "Subcontractor", hint: "Specialist trades" },
              ] as const).map(({ key, label, hint }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">{label}</div>
                    <div className="text-xs text-slate-400">{hint}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" max="200"
                      value={settings[key]}
                      onChange={e => set(key, Number(e.target.value))}
                      className="w-20 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-sm text-right font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"/>
                    <span className="text-sm text-slate-400">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Contingency */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <DollarSign size={15} className="text-amber-500"/>
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Contingency (Shown to client)</h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Buffer for unexpected costs. Shown as a separate line on client estimate.</p>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Contingency %</div>
              <div className="text-xs text-slate-400">Typically 5-10% for construction projects</div>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" min="0" max="50"
                value={settings.estimate_contingency}
                onChange={e => set("estimate_contingency", Number(e.target.value))}
                className="w-20 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-sm text-right font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"/>
              <span className="text-sm text-slate-400">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Terms */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <DollarSign size={15} className="text-emerald-500"/>
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Default Payment Terms</h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Applied when generating contracts from estimates. Must total 100%.</p>
        </div>
        <div className="p-5 space-y-3">
          {([
            { key: "estimate_deposit_pct", label: "Deposit (upfront)" },
            { key: "estimate_progress_pct", label: "Progress payment (mid-project)" },
            { key: "estimate_completion_pct", label: "Completion payment" },
          ] as const).map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <div className="text-sm text-slate-600 dark:text-slate-300">{label}</div>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="100"
                  value={settings[key]}
                  onChange={e => set(key, Number(e.target.value))}
                  className="w-20 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-sm text-right font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"/>
                <span className="text-sm text-slate-400">%</span>
              </div>
            </div>
          ))}
          {paymentTotal !== 100 && (
            <div className="text-xs text-red-500 font-semibold">
              ⚠ Payment terms must total 100% (currently {paymentTotal}%)
            </div>
          )}
        </div>
      </div>

      {/* Print Format + Validity */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <FileText size={15} className="text-purple-500"/>
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Estimate Format</h3>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Default print format</div>
            <div className="flex flex-col gap-2">
              {[
                { value: "summary", label: "Section summary only", hint: "Client sees section totals — no line items" },
                { value: "breakdown", label: "Full line item breakdown", hint: "Client sees every material and quantity" },
                { value: "quantities", label: "Quantities only (no rates)", hint: "Client sees items and quantities but not unit prices" },
              ].map(opt => (
                <label key={opt.value}
                  className={`flex items-start gap-3 cursor-pointer p-3 rounded-xl border-2 transition-colors ${settings.estimate_print_format === opt.value ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10" : "border-slate-200 dark:border-white/[0.08]"}`}>
                  <input type="radio" name="print_format"
                    value={opt.value}
                    checked={settings.estimate_print_format === opt.value}
                    onChange={() => set("estimate_print_format", opt.value)}
                    className="mt-0.5 accent-blue-600"/>
                  <div>
                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{opt.label}</div>
                    <div className="text-xs text-slate-400">{opt.hint}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
            <div>
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Estimate validity</div>
              <div className="text-xs text-slate-400">How many days the estimate is valid from issue date</div>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" min="7" max="365"
                value={settings.estimate_validity_days}
                onChange={e => set("estimate_validity_days", Number(e.target.value))}
                className="w-20 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-sm text-right font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"/>
              <span className="text-sm text-slate-400">days</span>
            </div>
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving || paymentTotal !== 100}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
          <Save size={15}/>
          {saving ? "Saving..." : saved ? "✓ Saved!" : "Save Estimate Settings"}
        </button>
      </div>
      </div>
    </div>
  );
}
