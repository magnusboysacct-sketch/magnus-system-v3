// src/pages/dashboard/ProjectHealthCard.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { AlertTriangle, Info } from "lucide-react";
import { Card, CardHeader, Btn, Spinner, Empty } from "../../components/ui";
import { supabase } from "../../lib/supabase";

interface ProjectHealth {
  project: string;
  budget: number;
  actual: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const SHOWN_LIMIT = 6; // same cap DashboardPage.tsx uses (activeProjectsAll.slice(0, 6))

export default function ProjectHealthCard() {
  const nav = useNavigate();
  const [projects, setProjects] = useState<ProjectHealth[] | null>(null);
  const [totalActiveCount, setTotalActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // company_id resolved from the logged-in session, same pattern as
        // every other card so far.
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not signed in");
        const { data: profile, error: profErr } = await supabase
          .from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
        if (profErr) throw profErr;
        if (!profile?.company_id) throw new Error("Couldn't determine company");

        // v_project_finance_summary's REAL live columns (confirmed by Veron
        // directly against information_schema, not the migration file,
        // which drifted) do NOT include company_id or project_status —
        // querying it directly with those filters fails outright. Real
        // company/status filtering has to happen on `projects` itself
        // (which DOES have both, and has real, working RLS scoping to
        // company_id — confirmed via 20260510120000_add_projects_
        // company_id.sql). Fetching active-project ids from `projects`
        // FIRST, then filtering the view to just those ids, keeps this
        // card correctly isolated to the current company even if the view
        // itself turns out not to enforce RLS the same way (a separate,
        // flagged concern — the view has no security_invoker option set,
        // so it likely runs with its owner's privileges, not the caller's).
        const { data: projectRows, error: projErr } = await supabase
          .from("projects")
          .select("id, name")
          .eq("company_id", profile.company_id)
          .eq("status", "active");
        if (projErr) throw projErr;

        const activeIds = (projectRows || []).map(p => p.id);
        if (!alive) return;
        setTotalActiveCount(activeIds.length);

        if (activeIds.length === 0) {
          setProjects([]);
          return;
        }

        const { data: finData, error: finErr } = await supabase
          .from("v_project_finance_summary")
          .select("project_id, budget_total, actual_total")
          .in("project_id", activeIds);
        if (finErr) throw finErr;

        const finById = new Map((finData || []).map((f: any) => [f.project_id, f]));
        const merged: ProjectHealth[] = (projectRows || [])
          .map(p => {
            const fin = finById.get(p.id) as any;
            return {
              project: p.name,
              budget: Number(fin?.budget_total) || 0,
              actual: Number(fin?.actual_total) || 0,
            };
          })
          .sort((a, b) => b.budget - a.budget)
          .slice(0, SHOWN_LIMIT);

        if (!alive) return;
        setProjects(merged);
      } catch (e: any) {
        if (!alive) return;
        // Logged, not thrown further — a failed query must never break the
        // rest of the dashboard, same standard as Cards 1 and 2.
        console.error("ProjectHealthCard failed to load:", e);
        setError(e.message || "Couldn't load project health");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <CardHeader title="Project Health" subtitle="Budget vs actual, active projects" />
        {totalActiveCount > SHOWN_LIMIT && (
          <Btn variant="ghost" size="xs" onClick={() => nav("/projects")}>View all ({totalActiveCount})</Btn>
        )}
      </div>

      {/* TEMP: remove this note once BOQs and project_costs are populated
          for at least some active projects — Veron will ask for this
          specifically. Verified real, not a bug: all active projects
          currently return budget_total = 0 and actual_total = 0, because
          v_project_finance_summary depends on BOQ items (budget) and the
          project_costs table (actual spend), and neither was part of the
          Import Wizard's 11 entity types migrated from Zoho. Same visual
          pattern as Cash Position/P&L Overview's caveat notes, duplicated
          inline rather than shared per the same "don't touch other cards"
          constraint as before. */}
      <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06]">
        <Info size={13} className="text-slate-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-slate-500 dark:text-slate-500 leading-snug">
          Budget and actual-cost figures depend on BOQ items and job-costing data, which haven't
          been populated for these projects yet. Figures will populate once that data is entered.
        </p>
      </div>

      {loading ? (
        <div className="h-72 flex items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : error ? (
        <div className="h-72 flex flex-col items-center justify-center gap-2 text-center px-4">
          <AlertTriangle size={20} className="text-amber-400" />
          <div className="text-xs text-slate-500">Couldn't load project health right now.</div>
        </div>
      ) : !projects || projects.length === 0 ? (
        <div className="h-72 flex items-center justify-center">
          <Empty title="No active projects" body="No projects with status = 'active' exist yet." />
        </div>
      ) : projects.every(p => p.budget === 0 && p.actual === 0) ? (
        // Every project has real $0 in both series — a zero-height bar
        // chart just renders axis lines and a legend with nothing visible,
        // which reads as broken rather than intentionally empty. The
        // caveat note above already explains why; this replaces the
        // empty-looking chart area itself with an explicit message,
        // rather than leaving it looking like a rendering failure. Only
        // triggers when EVERY project is zero — a mix of real and zero
        // data still renders the normal chart below, since that's
        // genuinely informative (some projects have data, some don't).
        <div className="h-72 flex items-center justify-center">
          <Empty
            title="No budget or cost data entered yet"
            body="Figures will appear here once BOQs and job costs are added for these projects."
          />
        </div>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={projects}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-white/10" />
              <XAxis dataKey="project" tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis tickFormatter={fmt} tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
              <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="budget" name="Budget" fill="#60a5fa" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" name="Actual" fill="#f472b6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
