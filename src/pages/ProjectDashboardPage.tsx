// src/pages/ProjectDashboardPage.tsx
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  PageHeader, StatCard, Card, CardHeader, Badge, Btn,
  Progress, Empty, Tabs, Alert, cn
} from "../components/ui";
import {
  Ruler, ShoppingCart, Wallet, FileText, BarChart3,
  ArrowRight, DollarSign, Users, Package, Receipt,
  Clock, CheckCircle2, AlertCircle, Edit2, Hammer,
  TrendingUp, TrendingDown, Calendar, Building2
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Project = {
  id: string;
  name: string;
  status: string;
  client_id: string | null;
};

type ProjectStats = {
  totalExpenses: number;
  openPOs: number;
  approvedPOs: number;
  totalPOValue: number;
  activeWorkers: number;
  boqTotal: number;
  boqItems: number;
  budgetTotal: number;
};

type ActivityItem = {
  id: string;
  type: "expense" | "po" | "worker" | "boq";
  label: string;
  amount?: number;
  time: string;
  status?: string;
};

type Tab = "overview" | "financials" | "team" | "activity";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0
  }).format(n);
}

function fmtTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const STATUS_COLOR: Record<string, any> = {
  active: "green", completed: "blue",
  on_hold: "amber", cancelled: "red", planning: "violet"
};

const MODULE_LINKS = (projectId: string) => [
  { label: "BOQ Builder",  icon: <FileText size={16}/>,    to: `/projects/${projectId}/boq`,        color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20",    desc: "Bills of quantities" },
  { label: "Takeoff",      icon: <Ruler size={16}/>,       to: `/projects/${projectId}/takeoff`,     color: "text-cyan-400",   bg: "bg-cyan-500/10 border-cyan-500/20",    desc: "PDF measurements" },
  { label: "Procurement",  icon: <ShoppingCart size={16}/>,to: `/projects/${projectId}/procurement`, color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/20",  desc: "Purchase orders" },
  { label: "Finance",      icon: <Wallet size={16}/>,      to: `/projects/${projectId}/finance`,     color: "text-emerald-400",bg: "bg-emerald-500/10 border-emerald-500/20", desc: "Project finances" },
  { label: "Reports",      icon: <BarChart3 size={16}/>,   to: `/projects/${projectId}/reports`,     color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20", desc: "Analytics & exports" },
];

// ─── Activity Icon ────────────────────────────────────────────────────────────

function ActivityIcon({ type }: { type: ActivityItem["type"] }) {
  const map = {
    expense: { icon: <Receipt size={12}/>, bg: "bg-amber-500/15", color: "text-amber-400" },
    po:      { icon: <Package size={12}/>, bg: "bg-blue-500/15",  color: "text-blue-400" },
    worker:  { icon: <Users size={12}/>,   bg: "bg-violet-500/15",color: "text-violet-400" },
    boq:     { icon: <FileText size={12}/>,bg: "bg-emerald-500/15",color: "text-emerald-400" },
  };
  const s = map[type];
  return (
    <div className={cn("w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0", s.bg)}>
      <span className={s.color}>{s.icon}</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProjectDashboardPage() {
  const { projectId } = useParams();
  const nav = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<any>(null);
  const [stats, setStats] = useState<ProjectStats>({
    totalExpenses: 0, openPOs: 0, approvedPOs: 0,
    totalPOValue: 0, activeWorkers: 0, boqTotal: 0, boqItems: 0, budgetTotal: 0
  });
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    loadAll();
  }, [projectId]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      // Project
      const { data: proj, error: pe } = await supabase
        .from("projects")
        .select("id, name, status, client_id")
        .eq("id", projectId!)
        .maybeSingle();
      if (pe) throw pe;
      if (!proj) throw new Error("Project not found");
      setProject(proj);

      // Client
      if (proj.client_id) {
        const { data: cl } = await supabase
          .from("clients").select("id, name, email, phone")
          .eq("id", proj.client_id).maybeSingle();
        setClient(cl);
      }

      // Load stats in parallel
      const [expRes, poRes, workerRes, boqRes, boqsRes] = await Promise.allSettled([
        // Expenses
        supabase.from("expenses")
          .select("amount, description, created_at")
          .eq("project_id", projectId!),
        // Purchase orders
        supabase.from("purchase_orders")
          .select("id, status, total_amount, created_at, supplier_name")
          .eq("project_id", projectId!),
        // Workers assigned to project (fallback: all workers if no project_workers table)
        supabase.from("workers")
          .select("id, name, trade, daily_rate")
          .eq("is_active", true)
          .limit(20),
        // BOQ section items for this project
        supabase.from("boqs")
          .select("id, boq_sections(id, boq_section_items(total_amount))")
          .eq("project_id", projectId!),
        // BOQ totals from boqs table
        supabase.from("boqs")
          .select("id, name, status")
          .eq("project_id", projectId!),
      ]);

      // Process expenses
      const expenses = expRes.status === "fulfilled" ? expRes.value.data || [] : [];
      const totalExpenses = expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0);

      // Process POs
      const pos = poRes.status === "fulfilled" ? poRes.value.data || [] : [];
      const openPOs = pos.filter((p: any) => ["pending", "submitted", "approved"].includes(p.status)).length;
      const approvedPOs = pos.filter((p: any) => p.status === "approved").length;
      const totalPOValue = pos.reduce((s: number, p: any) => s + (p.total_amount || 0), 0);

      // Process workers
      const workerList = workerRes.status === "fulfilled" ? workerRes.value.data || [] : [];
      setWorkers(workerList);

      // Process BOQ — flatten nested structure
      const boqData = boqRes.status === "fulfilled" ? boqRes.value.data || [] : [];
      let boqTotal = 0;
      let boqItemCount = 0;
      boqData.forEach((boq: any) => {
        (boq.boq_sections || []).forEach((section: any) => {
          (section.boq_section_items || []).forEach((item: any) => {
            boqTotal += item.total_amount || 0;
            boqItemCount++;
          });
        });
      });

      setStats({
        totalExpenses,
        openPOs,
        approvedPOs,
        totalPOValue,
        activeWorkers: workerList.length,
        boqTotal,
        boqItems: boqItemCount,
        budgetTotal: boqTotal, // use BOQ total as budget reference
      });

      // Build activity feed from POs and expenses
      const acts: ActivityItem[] = [];
      pos.slice(0, 5).forEach((p: any) => {
        acts.push({ id: p.id, type: "po", label: `PO to ${p.supplier_name || "Supplier"}`, amount: p.total_amount, time: p.created_at, status: p.status });
      });
      expenses.slice(0, 5).forEach((e: any, i: number) => {
        acts.push({ id: `exp-${i}`, type: "expense", label: e.description || "Expense", amount: e.amount, time: e.created_at || new Date().toISOString() });
      });
      acts.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setActivity(acts.slice(0, 8));

    } catch (e: any) {
      setError(e.message || "Failed to load project");
    } finally {
      setLoading(false);
    }
  }

  // ── Loading / error states ──────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10] flex items-center justify-center">
      <div className="flex items-center gap-2.5 text-xs text-slate-600">
        <div className="w-4 h-4 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"/>
        Loading project...
      </div>
    </div>
  );

  if (error || !project) return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10] flex items-center justify-center p-6">
      <div className="text-center space-y-3">
        <AlertCircle size={32} className="text-red-400 mx-auto"/>
        <div className="text-sm text-slate-300">{error || "Project not found"}</div>
        <Btn variant="ghost" onClick={() => nav("/projects")}>Back to Projects</Btn>
      </div>
    </div>
  );

  const spent = stats.totalExpenses;
  const budget = stats.budgetTotal || 0;
  const budgetPct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const remaining = budget - spent;
  const budgetColor = budgetPct > 90 ? "red" : budgetPct > 70 ? "amber" : "cyan";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title={project.name}
        subtitle={client ? client.name : "No client assigned"}
        back={() => nav("/projects")}
        actions={
          <>
            <Badge color={STATUS_COLOR[project.status] || "slate"} dot>
              {project.status?.replace("_", " ")}
            </Badge>
            <Btn variant="secondary" size="sm" icon={<Ruler size={13}/>}
              onClick={() => nav(`/projects/${projectId}/takeoff`)}>
              Takeoff
            </Btn>
            <Btn variant="primary" size="sm" icon={<FileText size={13}/>}
              onClick={() => nav(`/projects/${projectId}/boq`)}>
              BOQ
            </Btn>
          </>
        }
      />

      {/* Tabs */}
      <Tabs
        tabs={[
          { key: "overview" as Tab,   label: "Overview" },
          { key: "financials" as Tab, label: "Financials" },
          { key: "team" as Tab,       label: "Team", count: stats.activeWorkers },
          { key: "activity" as Tab,   label: "Activity", count: activity.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="p-6 space-y-5">

        {/* ── Overview Tab ── */}
        {tab === "overview" && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Budget"
                value={budget ? fmt(budget) : "Not set"}
                icon={<DollarSign size={15}/>}
                color="text-emerald-300"
                sub={budget ? `${fmt(remaining)} remaining` : undefined}
              />
              <StatCard
                label="Spent"
                value={fmt(spent)}
                icon={<Receipt size={15}/>}
                color={spent > budget * 0.9 ? "text-red-300" : "text-amber-300"}
                sub={budget ? `${budgetPct.toFixed(0)}% of budget` : undefined}
              />
              <StatCard
                label="Open POs"
                value={stats.openPOs}
                icon={<ShoppingCart size={15}/>}
                color="text-blue-300"
                sub={`${fmt(stats.totalPOValue)} total value`}
              />
              <StatCard
                label="Team Size"
                value={stats.activeWorkers}
                icon={<Users size={15}/>}
                color="text-violet-300"
                sub="assigned workers"
              />
            </div>

            {/* Budget bar */}
            {budget > 0 && (
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-200">Budget Utilization</div>
                    <div className="text-[10px] text-slate-600 mt-0.5">
                      {fmt(spent)} spent of {fmt(budget)}
                    </div>
                  </div>
                  <div className={cn("text-lg font-bold", budgetColor === "red" ? "text-red-400" : budgetColor === "amber" ? "text-amber-400" : "text-cyan-400")}>
                    {budgetPct.toFixed(1)}%
                  </div>
                </div>
                <Progress value={budgetPct} max={100} color={budgetColor} height={6}/>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-slate-700">{fmt(spent)} used</span>
                  <span className={cn("text-[10px] font-semibold", remaining < 0 ? "text-red-400" : "text-slate-600")}>
                    {remaining < 0 ? `${fmt(Math.abs(remaining))} over budget` : `${fmt(remaining)} remaining`}
                  </span>
                </div>
              </Card>
            )}

            {/* Module links */}
            <Card padding={false}>
              <div className="px-4 py-3 border-b border-white/[0.06]">
                <span className="text-sm font-semibold text-slate-200">Project Modules</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5">
                {MODULE_LINKS(projectId!).map(l => (
                  <button key={l.to} onClick={() => nav(l.to)}
                    className="flex flex-col items-center gap-2 p-5 hover:bg-white/[0.03] transition-colors group border-r border-b border-white/[0.04] last:border-r-0">
                    <div className={cn("w-11 h-11 rounded-xl border flex items-center justify-center transition-transform group-hover:scale-110", l.bg)}>
                      <span className={l.color}>{l.icon}</span>
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">{l.label}</div>
                      <div className="text-[9px] text-slate-700 mt-0.5">{l.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            {/* Project info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader title="Project Details"/>
                <div className="space-y-3 text-xs">
                  {[
                    { label: "Status",    value: <Badge color={STATUS_COLOR[project.status] || "slate"} dot>{project.status?.replace("_", " ")}</Badge> },
                    { label: "BOQ Items", value: stats.boqItems },
                    { label: "BOQ Total", value: stats.boqTotal ? fmt(stats.boqTotal) : "—" },
                    { label: "Open POs",  value: stats.openPOs },
                    { label: "PO Value",  value: stats.totalPOValue ? fmt(stats.totalPOValue) : "—" },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between">
                      <span className="text-slate-600">{row.label}</span>
                      <span className="text-slate-300 font-medium">{row.value}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {client ? (
                <Card>
                  <CardHeader title="Client"/>
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                        <Building2 size={16} className="text-cyan-400"/>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-200">{client.name}</div>
                        {client.email && <div className="text-[10px] text-slate-600">{client.email}</div>}
                      </div>
                    </div>
                    {client.phone && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Phone</span>
                        <span className="text-slate-300">{client.phone}</span>
                      </div>
                    )}
                  </div>
                </Card>
              ) : (
                <Card>
                  <CardHeader title="Client"/>
                  <Empty icon={<Building2 size={16}/>} title="No client assigned" body="Edit the project to assign a client."/>
                </Card>
              )}
            </div>
          </>
        )}

        {/* ── Financials Tab ── */}
        {tab === "financials" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Total Budget"    value={budget ? fmt(budget) : "—"}  color="text-emerald-300" icon={<DollarSign size={15}/>}/>
              <StatCard label="Total Spent"     value={fmt(spent)}                  color="text-amber-300"   icon={<TrendingDown size={15}/>}/>
              <StatCard label="Remaining"       value={budget ? fmt(remaining) : "—"} color={remaining < 0 ? "text-red-300" : "text-cyan-300"} icon={<TrendingUp size={15}/>}/>
              <StatCard label="PO Commitments"  value={fmt(stats.totalPOValue)}     color="text-blue-300"    icon={<Package size={15}/>}/>
            </div>
            {budget > 0 && (
              <Card>
                <CardHeader title="Budget vs Spent" subtitle="Live project financial status"/>
                <Progress value={budgetPct} max={100} color={budgetColor} height={8}/>
                <div className="grid grid-cols-3 gap-4 mt-4 text-center text-xs">
                  <div><div className="text-slate-600 mb-1">Budget</div><div className="font-bold text-slate-200">{fmt(budget)}</div></div>
                  <div><div className="text-slate-600 mb-1">Spent</div><div className="font-bold text-amber-400">{fmt(spent)}</div></div>
                  <div><div className="text-slate-600 mb-1">Remaining</div><div className={cn("font-bold", remaining < 0 ? "text-red-400" : "text-emerald-400")}>{fmt(Math.abs(remaining))}{remaining < 0 ? " over" : ""}</div></div>
                </div>
              </Card>
            )}
            <Card>
              <CardHeader title="Quick Links" subtitle="Jump to financial sections"/>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Expenses",          to: "/expenses",            icon: <Receipt size={13}/>,      color: "text-amber-400" },
                  { label: "Purchase Orders",   to: `/projects/${projectId}/procurement`, icon: <ShoppingCart size={13}/>, color: "text-blue-400" },
                  { label: "Cash Flow",         to: "/cash-flow",           icon: <TrendingUp size={13}/>,   color: "text-cyan-400" },
                  { label: "Accounts Recv.",    to: "/accounts-receivable", icon: <FileText size={13}/>,     color: "text-violet-400" },
                ].map(l => (
                  <button key={l.to} onClick={() => nav(l.to)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.03] transition-colors text-left">
                    <span className={l.color}>{l.icon}</span>
                    <span className="text-xs text-slate-400">{l.label}</span>
                    <ArrowRight size={11} className="ml-auto text-slate-700"/>
                  </button>
                ))}
              </div>
            </Card>
          </>
        )}

        {/* ── Team Tab ── */}
        {tab === "team" && (
          <Card padding={false}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <span className="text-sm font-semibold text-slate-200">Assigned Workers</span>
              <Btn size="xs" variant="primary" icon={<Users size={11}/>} onClick={() => nav("/workers")}>
                Manage Workers
              </Btn>
            </div>
            {workers.length === 0 ? (
              <Empty
                icon={<Users size={18}/>}
                title="No workers assigned"
                body="Go to Workers to assign people to this project."
                action={<Btn variant="primary" size="sm" onClick={() => nav("/workers")}>Go to Workers</Btn>}
              />
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {workers.map((w: any) => (
                  <div key={w.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-full bg-violet-500/15 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                      <Users size={12} className="text-violet-400"/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-200">{w.name}</div>
                      <div className="text-[10px] text-slate-600">{w.trade || "General"}</div>
                    </div>
                    {w.daily_rate && (
                      <div className="text-xs font-semibold text-emerald-400">${w.daily_rate}/day</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* ── Activity Tab ── */}
        {tab === "activity" && (
          <Card padding={false}>
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <span className="text-sm font-semibold text-slate-200">Recent Activity</span>
            </div>
            {activity.length === 0 ? (
              <Empty icon={<Clock size={18}/>} title="No activity yet" body="Activity will appear here as you use the project modules."/>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {activity.map(a => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <ActivityIcon type={a.type}/>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-300 truncate">{a.label}</div>
                      <div className="text-[10px] text-slate-700 mt-0.5 capitalize">{a.type} · {fmtTime(a.time)}</div>
                    </div>
                    {a.amount !== undefined && (
                      <div className="text-xs font-semibold text-slate-300 flex-shrink-0">{fmt(a.amount)}</div>
                    )}
                    {a.status && (
                      <Badge color={a.status === "approved" ? "green" : a.status === "pending" ? "amber" : "slate"}>
                        {a.status}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
