// src/pages/SettingsPayrollPage.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectContext } from "../context/ProjectContext";
import { supabase } from "../lib/supabase";
import { PageHeader } from "../components/ui";
import { Save, Percent, DollarSign, FileText, ArrowLeft, Landmark } from "lucide-react";

type PayrollRates = {
  nis_employee_rate: number;
  nht_employee_rate: number;
  education_tax_employee_rate: number;
  nht_monthly_cap: number;
  paye_threshold_annual: number;
  paye_rate_band1: number;
  paye_band1_ceiling: number;
  paye_rate_band2: number;
  nis_employer_rate: number;
  nht_employer_rate: number;
  education_tax_employer_rate: number;
  heart_trust_rate: number;
  notes: string;
};

// Displayed/edited as percentages (2.75), stored in the DB as fractions (0.0275).
const DEFAULTS: PayrollRates = {
  nis_employee_rate: 2.75,
  nht_employee_rate: 2.00,
  education_tax_employee_rate: 2.25,
  nht_monthly_cap: 125000,
  paye_threshold_annual: 1500096,
  paye_rate_band1: 25,
  paye_band1_ceiling: 6000000,
  paye_rate_band2: 30,
  nis_employer_rate: 2.50,
  nht_employer_rate: 3.00,
  education_tax_employer_rate: 3.50,
  heart_trust_rate: 3.00,
  notes: "",
};

export default function SettingsPayrollPage() {
  const nav = useNavigate();
  const { userRole } = useProjectContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [settings, setSettings] = useState<PayrollRates>(DEFAULTS);
  const [lastUpdated, setLastUpdated] = useState<{ date: string; by: string } | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: profile } = await supabase
        .from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
      if (!profile?.company_id) { setLoading(false); return; }
      setCompanyId(profile.company_id);

      const { data, error } = await supabase
        .from("payroll_tax_settings")
        .select("*")
        .eq("company_id", profile.company_id)
        .maybeSingle();

      if (error) {
        console.error("Error loading payroll tax settings:", error);
      } else if (data) {
        setSettings({
          nis_employee_rate: Number(data.nis_employee_rate) * 100,
          nht_employee_rate: Number(data.nht_employee_rate) * 100,
          education_tax_employee_rate: Number(data.education_tax_employee_rate) * 100,
          nht_monthly_cap: Number(data.nht_monthly_cap),
          paye_threshold_annual: Number(data.paye_threshold_annual),
          paye_rate_band1: Number(data.paye_rate_band1) * 100,
          paye_band1_ceiling: Number(data.paye_band1_ceiling),
          paye_rate_band2: Number(data.paye_rate_band2) * 100,
          nis_employer_rate: Number(data.nis_employer_rate) * 100,
          nht_employer_rate: Number(data.nht_employer_rate) * 100,
          education_tax_employer_rate: Number(data.education_tax_employer_rate) * 100,
          heart_trust_rate: Number(data.heart_trust_rate) * 100,
          notes: data.notes || "",
        });

        if (data.updated_at) {
          let byName = "—";
          if (data.last_updated_by) {
            const { data: updater } = await supabase
              .from("user_profiles").select("full_name").eq("id", data.last_updated_by).maybeSingle();
            byName = updater?.full_name || "—";
          }
          setLastUpdated({ date: new Date(data.updated_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }), by: byName });
        }
      }
      // No row yet — DEFAULTS (already the initial state) stand in until saved.
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    if (!companyId) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        company_id: companyId,
        nis_employee_rate: settings.nis_employee_rate / 100,
        nht_employee_rate: settings.nht_employee_rate / 100,
        education_tax_employee_rate: settings.education_tax_employee_rate / 100,
        paye_threshold_annual: settings.paye_threshold_annual,
        paye_rate_band1: settings.paye_rate_band1 / 100,
        paye_rate_band2: settings.paye_rate_band2 / 100,
        paye_band1_ceiling: settings.paye_band1_ceiling,
        nis_employer_rate: settings.nis_employer_rate / 100,
        nht_employer_rate: settings.nht_employer_rate / 100,
        education_tax_employer_rate: settings.education_tax_employer_rate / 100,
        heart_trust_rate: settings.heart_trust_rate / 100,
        nht_monthly_cap: settings.nht_monthly_cap,
        notes: settings.notes.trim() || null,
        last_updated_by: user?.id,
        updated_at: new Date().toISOString(),
        effective_date: new Date().toISOString().split("T")[0],
      };
      const { error } = await supabase
        .from("payroll_tax_settings")
        .upsert(payload, { onConflict: "company_id" });
      if (error) {
        alert("Failed to save: " + error.message);
        return;
      }
      setLastUpdated({ date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }), by: "you" });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof PayrollRates>(k: K, v: PayrollRates[K]) {
    setSettings(s => ({ ...s, [k]: v }));
  }

  function numberInput(key: keyof PayrollRates, opts: { max?: number; step?: string } = {}) {
    return (
      <input
        type="number"
        min="0"
        max={opts.max}
        step={opts.step || "0.01"}
        value={settings[key] as number}
        onChange={e => set(key, Number(e.target.value) as any)}
        className="w-32 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-sm text-right font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      />
    );
  }

  if (userRole && userRole !== "director") {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Access Restricted</h2>
          <p className="text-sm text-slate-500">You don't have permission to access this page.<br/>Contact your administrator.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
        <PageHeader title="Payroll & Tax Rates" subtitle="Jamaican statutory deduction rates"/>
        <div className="p-8 text-slate-400 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Payroll & Tax Rates"
        subtitle="Jamaican statutory deduction rates. Update here when government changes rates."
        actions={
          <button onClick={() => nav("/settings")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-xs font-semibold text-slate-600 dark:text-slate-300 transition">
            <ArrowLeft size={13}/> Back to Settings
          </button>
        }
      />
      <div className="max-w-2xl mx-auto p-6 space-y-8">

        {lastUpdated && (
          <p className="text-xs text-slate-400">Last updated: {lastUpdated.date} by {lastUpdated.by}</p>
        )}

        {/* Employee Deductions */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <Percent size={15} className="text-blue-500"/>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Employee Deductions</h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Withheld from staff pay every run.</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">NIS Rate</div>
                <div className="text-xs text-slate-400">National Insurance Scheme</div>
              </div>
              <div className="flex items-center gap-2">{numberInput("nis_employee_rate")}<span className="text-sm text-slate-400">%</span></div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">NHT Rate</div>
                <div className="text-xs text-slate-400">National Housing Trust</div>
              </div>
              <div className="flex items-center gap-2">{numberInput("nht_employee_rate")}<span className="text-sm text-slate-400">%</span></div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Education Tax Rate</div>
              </div>
              <div className="flex items-center gap-2">{numberInput("education_tax_employee_rate")}<span className="text-sm text-slate-400">%</span></div>
            </div>
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
              <div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">NHT Monthly Cap</div>
                <div className="text-xs text-slate-400">Maximum NHT deduction per month</div>
              </div>
              <div className="flex items-center gap-2">{numberInput("nht_monthly_cap", { step: "1000" })}<span className="text-sm text-slate-400">JMD</span></div>
            </div>
          </div>
        </div>

        {/* PAYE */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <Landmark size={15} className="text-amber-500"/>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">PAYE Income Tax</h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Progressive bands applied to annualised taxable income (gross minus NIS/NHT).</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Tax-Free Threshold (annual)</div>
              </div>
              <div className="flex items-center gap-2">{numberInput("paye_threshold_annual", { step: "1" })}<span className="text-sm text-slate-400">JMD</span></div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Rate Band 1</div>
                <div className="text-xs text-slate-400">Applied between the threshold and the Band 1 ceiling</div>
              </div>
              <div className="flex items-center gap-2">{numberInput("paye_rate_band1")}<span className="text-sm text-slate-400">%</span></div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Band 1 Ceiling</div>
              </div>
              <div className="flex items-center gap-2">{numberInput("paye_band1_ceiling", { step: "1" })}<span className="text-sm text-slate-400">JMD</span></div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Rate Band 2</div>
                <div className="text-xs text-slate-400">Applied above the Band 1 ceiling</div>
              </div>
              <div className="flex items-center gap-2">{numberInput("paye_rate_band2")}<span className="text-sm text-slate-400">%</span></div>
            </div>
          </div>
        </div>

        {/* Employer Contributions */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <DollarSign size={15} className="text-emerald-500"/>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Employer Contributions</h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Paid by the company on top of gross salary — not deducted from staff.</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div><div className="text-sm font-semibold text-slate-700 dark:text-slate-200">NIS Employer Rate</div></div>
              <div className="flex items-center gap-2">{numberInput("nis_employer_rate")}<span className="text-sm text-slate-400">%</span></div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div><div className="text-sm font-semibold text-slate-700 dark:text-slate-200">NHT Employer Rate</div></div>
              <div className="flex items-center gap-2">{numberInput("nht_employer_rate")}<span className="text-sm text-slate-400">%</span></div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div><div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Education Tax Employer Rate</div></div>
              <div className="flex items-center gap-2">{numberInput("education_tax_employer_rate")}<span className="text-sm text-slate-400">%</span></div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div><div className="text-sm font-semibold text-slate-700 dark:text-slate-200">HEART Trust Rate</div></div>
              <div className="flex items-center gap-2">{numberInput("heart_trust_rate")}<span className="text-sm text-slate-400">%</span></div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <FileText size={15} className="text-purple-500"/>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Notes</h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Optional — e.g. "Updated per TAJ circular Jan 2027"</p>
          </div>
          <div className="p-5">
            <textarea
              rows={3}
              value={settings.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Reason for this rate change, source, effective date..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-sm text-slate-700 dark:text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
            <Save size={15}/>
            {saving ? "Saving..." : saved ? "✓ Saved!" : "Save Rates"}
          </button>
        </div>
      </div>
    </div>
  );
}
