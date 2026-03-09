import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getProjectCostSummary } from "../lib/costs";
import type { CostSummary } from "../lib/costs";

type ProjectRow = {
  id: string;
  client_id: string | null;
  name: string;
  site_address: string | null;
  status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ClientRow = {
  id: string;
  name: string;
};

type ProjectMemberRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  company_role: string | null;
  project_role: string | null;
};

function prettyRole(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function ProjectDashboardPage() {
  const { projectId: routeProjectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const pathnameParts = location.pathname.split("/").filter(Boolean);
  const fallbackProjectId =
    pathnameParts.length >= 2 && pathnameParts[0] === "projects"
      ? pathnameParts[1]
      : null;

  const projectId = routeProjectId || fallbackProjectId || null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [project, setProject] = useState<ProjectRow | null>(null);
  const [client, setClient] = useState<ClientRow | null>(null);
  const [members, setMembers] = useState<ProjectMemberRow[]>([]);
  const [costSummary, setCostSummary] = useState<CostSummary>({
    material_cost: 0,
    labor_cost: 0,
    equipment_cost: 0,
    other_cost: 0,
    total_cost: 0,
  });

  const projectStatusTone = useMemo(() => {
    switch (project?.status) {
      case "active":
        return "bg-emerald-900/20 text-emerald-300 border border-emerald-900/40";
      case "planning":
        return "bg-sky-900/20 text-sky-300 border border-sky-900/40";
      case "on_hold":
        return "bg-amber-900/20 text-amber-300 border border-amber-900/40";
      case "completed":
        return "bg-violet-900/20 text-violet-300 border border-violet-900/40";
      case "cancelled":
        return "bg-red-900/20 text-red-300 border border-red-900/40";
      default:
        return "bg-slate-900/20 text-slate-300 border border-slate-800";
    }
  }, [project?.status]);

  useEffect(() => {
    async function loadProjectDashboard() {
      if (!projectId) {
        setError("Missing project ID.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const projectResp = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();

      if (projectResp.error) {
        setError(projectResp.error.message);
        setProject(null);
        setClient(null);
        setMembers([]);
        setLoading(false);
        return;
      }

      const projectData = projectResp.data as ProjectRow;
      setProject(projectData);

      if (projectData.client_id) {
        const clientResp = await supabase
          .from("clients")
          .select("id,name")
          .eq("id", projectData.client_id)
          .single();

        if (!clientResp.error && clientResp.data) {
          setClient(clientResp.data as ClientRow);
        } else {
          setClient(null);
        }
      } else {
        setClient(null);
      }

      const membersResp = await supabase.rpc("get_project_members", {
        p_project_id: projectId,
      });

      if (membersResp.error) {
        setError(membersResp.error.message);
        setMembers([]);
        setLoading(false);
        return;
      }

      setMembers((membersResp.data ?? []) as ProjectMemberRow[]);

      const costs = await getProjectCostSummary(projectId);
      setCostSummary(costs);

      setLoading(false);
    }

    loadProjectDashboard();
  }, [projectId]);

  if (loading) {
    return <div className="p-6 text-sm text-slate-400">Loading project dashboard...</div>;
  }

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Project Dashboard</h1>
          <p className="text-slate-400 mt-1">Unable to load this project.</p>
        </div>

        <div className="rounded-xl border border-red-900/40 bg-red-950/30 p-4 text-sm text-red-200">
          {error}
        </div>

        <button
          onClick={() => navigate("/projects")}
          className="px-3 py-2 rounded-xl bg-slate-800/50 hover:bg-slate-800 text-sm"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Project Dashboard</h1>
          <p className="text-slate-400 mt-1">Project not found.</p>
        </div>

        <button
          onClick={() => navigate("/projects")}
          className="px-3 py-2 rounded-xl bg-slate-800/50 hover:bg-slate-800 text-sm"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="text-xs text-yellow-400 mb-2">
        Route Project ID: {projectId || "NONE"}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-2">
            <Link to="/projects" className="hover:text-slate-300">
              Projects
            </Link>
            <span>›</span>
            <span className="text-slate-400">{project.name}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <span className={`px-2.5 py-1 rounded-full text-xs ${projectStatusTone}`}>
              {project.status}
            </span>
          </div>

          <p className="text-slate-400 mt-1">
            Project workspace for BOQ, takeoff, procurement, finance, documents, and team.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigate("/projects")}
            className="px-3 py-2 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 text-sm"
          >
            Back
          </button>
          <button
            onClick={() => navigate(`/projects/${projectId}/boq`)}
            className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm"
          >
            Open BOQ
          </button>
          <button
            onClick={() => navigate(`/projects/${projectId}/takeoff`)}
            className="px-3 py-2 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 text-sm"
          >
            Open Takeoff
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="text-sm font-semibold mb-4">Project Cost Summary</div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-500">Material Cost</div>
            <div className="mt-1 text-lg font-semibold text-blue-400">
              ${costSummary.material_cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-500">Labor Cost</div>
            <div className="mt-1 text-lg font-semibold text-amber-400">
              ${costSummary.labor_cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-500">Equipment Cost</div>
            <div className="mt-1 text-lg font-semibold text-purple-400">
              ${costSummary.equipment_cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-500">Other Cost</div>
            <div className="mt-1 text-lg font-semibold text-slate-400">
              ${costSummary.other_cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/40 p-4">
            <div className="text-xs text-emerald-400">Total Cost</div>
            <div className="mt-1 text-lg font-semibold text-emerald-300">
              ${costSummary.total_cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="text-sm font-semibold mb-4">Overview</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-xs text-slate-500">Client</div>
              <div className="mt-1 text-sm font-medium">{client?.name || "No client"}</div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-xs text-slate-500">Site Address</div>
              <div className="mt-1 text-sm font-medium">{project.site_address || "—"}</div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-xs text-slate-500">Start Date</div>
              <div className="mt-1 text-sm font-medium">{project.start_date || "—"}</div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-xs text-slate-500">End Date</div>
              <div className="mt-1 text-sm font-medium">{project.end_date || "—"}</div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-500">Notes</div>
            <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
              {project.notes || "No notes added yet."}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold">Project Team</div>
            <div className="text-xs text-slate-400">{members.length} members</div>
          </div>

          {members.length === 0 ? (
            <div className="text-sm text-slate-400">No team members assigned yet.</div>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.user_id}
                  className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"
                >
                  <div className="text-sm font-medium">
                    {member.full_name?.trim() || member.email || member.user_id}
                  </div>
                  {member.email && (
                    <div className="text-xs text-slate-400 mt-1">{member.email}</div>
                  )}
                  <div className="text-xs text-slate-500 mt-2">
                    Company role: {prettyRole(member.company_role)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Project role: {prettyRole(member.project_role)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="text-sm font-semibold mb-4">Workspace</div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <button
            onClick={() => navigate(`/projects/${projectId}/boq`)}
            className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-left hover:bg-slate-900/60 transition"
          >
            <div className="text-sm font-semibold">BOQ</div>
            <div className="text-xs text-slate-400 mt-1">
              Build and manage bills of quantities for this project.
            </div>
          </button>

          <button
            onClick={() => navigate(`/projects/${projectId}/takeoff`)}
            className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-left hover:bg-slate-900/60 transition"
          >
            <div className="text-sm font-semibold">Takeoff</div>
            <div className="text-xs text-slate-400 mt-1">
              Open the measurement workspace and drawing tools.
            </div>
          </button>

          <button
            onClick={() => navigate(`/projects/${projectId}/procurement`)}
            className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-left hover:bg-slate-900/60 transition"
          >
            <div className="text-sm font-semibold">Procurement</div>
            <div className="text-xs text-slate-400 mt-1">
              Track materials, suppliers, and purchasing activity.
            </div>
          </button>

          <button
            onClick={() => navigate(`/projects/${projectId}/finance`)}
            className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-left hover:bg-slate-900/60 transition"
          >
            <div className="text-sm font-semibold">Finance</div>
            <div className="text-xs text-slate-400 mt-1">
              Monitor project costs, valuations, and payment status.
            </div>
          </button>

          <button
            onClick={() => navigate(`/projects/${projectId}/reports`)}
            className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-left hover:bg-slate-900/60 transition"
          >
            <div className="text-sm font-semibold">Reports</div>
            <div className="text-xs text-slate-400 mt-1">
              Generate project summaries and management reports.
            </div>
          </button>

          <button
            onClick={() => navigate("/projects")}
            className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-left hover:bg-slate-900/60 transition"
          >
            <div className="text-sm font-semibold">Manage Projects</div>
            <div className="text-xs text-slate-400 mt-1">
              Return to the full projects list and edit project details.
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}