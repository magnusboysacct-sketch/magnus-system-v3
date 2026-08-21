// src/pages/dashboard/AISummaryBanner.tsx
import React from "react";
import { Sparkles } from "lucide-react";

// TODO: Stage 2 — wire to src/lib/magnusAI.ts, calling the existing
// magnus-ai Supabase Edge Function (same client already used in
// FieldAppPage.tsx ~line 625: supabase.functions.invoke("magnus-ai", {...}))
// to generate a real narrative summary from the company's actual financial
// and operational data — do not build a second, separate AI integration.
export default function AISummaryBanner() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 via-white dark:via-[#0c1018] to-emerald-500/10 p-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
          <Sparkles size={16} className="text-cyan-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-600 dark:text-cyan-400 mb-1">
            Magnus AI Summary
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            Placeholder: Cash position is stable across operating accounts. Three
            active projects are tracking within 5% of budget; one is running over
            on materials. Payroll remittance is due in a few days, and a couple of
            invoices are overdue by more than 30 days — see Needs Attention below.
          </p>
        </div>
      </div>
    </div>
  );
}
