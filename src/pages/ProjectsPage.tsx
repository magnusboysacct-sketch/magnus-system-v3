import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type ClientRow = { id: string; name: string };

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

type AssignableUserRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  status: string | null;
};

type ProjectMemberRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  company_role: string | null;
  project_role: string | null;
};

const PROJECT_MEMBER_ROLES = [
  "project_manager",
  "site_supervisor",
  "estimator",
  "procurement",
  "accounts",
  "viewer",
] as const;

function prettyRole(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);

  // New project form
  const [clientId, setClientId] = useState<string>("");
  const [name, setName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [siteLat, setSiteLat] = useState<string>("");
  const [siteLng, setSiteLng] = useState<string>("");
  const [status, setStatus] = useState<ProjectRow["status"]>("planning");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eClientId, setEClientId] = useState<string>("");
  const [eName, setEName] = useState("");
  const [eSiteAddress, setESiteAddress] = useState("");
  const [eSiteLat, setESiteLat] = useState<string>("");
  const [eSiteLng, setESiteLng] = useState<string>("");
  const [eStatus, setEStatus] = useState<ProjectRow["status"]>("planning");
  const [eStartDate, setEStartDate] = useState("");
  const [eEndDate, setEEndDate] = useState("");
  const [eNotes, setENotes] = useState("");
  const [eLocationLoading, setELocationLoading] = useState(false);
  const [eLocationError, setELocationError] = useState<string | null>(null);

  // Team modal state
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamSaving, setTeamSaving] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamProject, setTeamProject] = useState<ProjectRow | null>(null);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUserRow[]>([]);
  const [projectMembers, setProjectMembers] = useState<ProjectMemberRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedProjectRole, setSelectedProjectRole] = useState<string>("viewer");

  const clientNameById = useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [clients]);

  const assignedUserIds = useMemo(() => {
    return new Set(projectMembers.map((m) => m.user_id));
  }, [projectMembers]);

  const availableUsers = useMemo(() => {
    return assignableUsers.filter((u) => !assignedUserIds.has(u.user_id));
  }, [assignableUsers, assignedUserIds]);

  async function loadAll() {
    setLoading(true);
    setError(null);

    const c = await supabase
      .from("clients")
      .select("id,name")
      .order("name", { ascending: true });

    if (c.error) {
      setError(c.error.message);
      setLoading(false);
      return;
    }
    setClients((c.data ?? []) as ClientRow[]);

    const p = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (p.error) {
      setError(p.error.message);
      setProjects([]);
      setLoading(false);
      return;
    }
    setProjects((p.data ?? []) as ProjectRow[]);

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function addProject() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Project name is required.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error } = await supabase.from("projects").insert({
      client_id: clientId || null,
      name: trimmed,
      site_address: siteAddress.trim() || null,
      site_lat: siteLat || null,
      site_lng: siteLng || null,
      status,
      start_date: startDate || null,
      end_date: endDate || null,
      notes: notes.trim() || null,
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setClientId("");
    setName("");
    setSiteAddress("");
    setSiteLat("");
    setSiteLng("");
    setStatus("planning");
    setStartDate("");
    setEndDate("");
    setNotes("");
    setLocationError(null);

    await loadAll();
    setSaving(false);
  }

  function startEdit(p: ProjectRow) {
    setEditingId(p.id);
    setEClientId(p.client_id ?? "");
    setEName(p.name ?? "");
    setESiteAddress(p.site_address ?? "");
    setESiteLat((p as any).site_lat ?? "");
    setESiteLng((p as any).site_lng ?? "");
    setEStatus(p.status);
    setEStartDate(p.start_date ?? "");
    setEEndDate(p.end_date ?? "");
    setENotes(p.notes ?? "");
    setELocationError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  async function saveEdit() {
    if (!editingId) return;

    const trimmed = eName.trim();
    if (!trimmed) {
      setError("Project name is required.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error } = await supabase
      .from("projects")
      .update({
        client_id: eClientId || null,
        name: trimmed,
        site_address: eSiteAddress.trim() || null,
        site_lat: eSiteLat || null,
        site_lng: eSiteLng || null,
        status: eStatus,
        start_date: eStartDate || null,
        end_date: eEndDate || null,
        notes: eNotes.trim() || null,
      })
      .eq("id", editingId);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setEditingId(null);
    await loadAll();
    setSaving(false);
  }

  async function deleteProject(id: string) {
    const ok = confirm("Delete this project? This cannot be undone.");
    if (!ok) return;

    setSaving(true);
    setError(null);

    const { error } = await supabase.from("projects").delete().eq("id", id);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    if (editingId === id) setEditingId(null);
    await loadAll();
    setSaving(false);
  }

  // Geolocation functions
  async function getCurrentLocation(isEdit: boolean = false) {
    if (!navigator.geolocation) {
      const error = "Geolocation is not supported by this browser";
      if (isEdit) {
        setELocationError(error);
      } else {
        setLocationError(error);
      }
      return;
    }

    if (isEdit) {
      setELocationLoading(true);
      setELocationError(null);
    } else {
      setLocationLoading(true);
      setLocationError(null);
    }

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });

      const lat = position.coords.latitude.toFixed(6);
      const lng = position.coords.longitude.toFixed(6);

      if (isEdit) {
        setESiteLat(lat);
        setESiteLng(lng);
        setELocationError(null);
      } else {
        setSiteLat(lat);
        setSiteLng(lng);
        setLocationError(null);
      }
    } catch (error: any) {
      let errorMessage = "Unable to get your location";
      
      if (error.code === 1) {
        errorMessage = "Location access denied. Please enable location permissions.";
      } else if (error.code === 2) {
        errorMessage = "Location unavailable. Please check your device settings.";
      } else if (error.code === 3) {
        errorMessage = "Location request timed out. Please try again.";
      }

      if (isEdit) {
        setELocationError(errorMessage);
      } else {
        setLocationError(errorMessage);
      }
    } finally {
      if (isEdit) {
        setELocationLoading(false);
      } else {
        setLocationLoading(false);
      }
    }
  }

  async function loadProjectTeam(projectId: string) {
    setTeamLoading(true);
    setTeamError(null);

    const [assignableResp, membersResp] = await Promise.all([
      supabase.rpc("get_company_assignable_users"),
      supabase.rpc("get_project_members", { p_project_id: projectId }),
    ]);

    if (assignableResp.error) {
      setAssignableUsers([]);
      setProjectMembers([]);
      setTeamLoading(false);
      setTeamError(assignableResp.error.message);
      return;
    }

    if (membersResp.error) {
      setAssignableUsers([]);
      setProjectMembers([]);
      setTeamLoading(false);
      setTeamError(membersResp.error.message);
      return;
    }

    setAssignableUsers((assignableResp.data ?? []) as AssignableUserRow[]);
    setProjectMembers((membersResp.data ?? []) as ProjectMemberRow[]);

    setTeamLoading(false);
  }

  async function openTeamModal(project: ProjectRow) {
    setTeamProject(project);
    setTeamOpen(true);
    setSelectedUserId("");
    setSelectedProjectRole("viewer");
    setTeamError(null);
    await loadProjectTeam(project.id);
  }

  function closeTeamModal() {
    if (teamSaving) return;
    setTeamOpen(false);
    setTeamProject(null);
    setAssignableUsers([]);
    setProjectMembers([]);
    setSelectedUserId("");
    setSelectedProjectRole("viewer");
    setTeamError(null);
    setTeamLoading(false);
  }

  async function addTeamMember() {
    if (!teamProject) return;
    if (!selectedUserId) {
      setTeamError("Please select a user.");
      return;
    }

    setTeamSaving(true);
    setTeamError(null);

    const { error } = await supabase.rpc("upsert_project_member", {
      p_project_id: teamProject.id,
      p_user_id: selectedUserId,
      p_role: selectedProjectRole,
    });

    if (error) {
      setTeamError(error.message);
      setTeamSaving(false);
      return;
    }

    setSelectedUserId("");
    setSelectedProjectRole("viewer");
    await loadProjectTeam(teamProject.id);
    setTeamSaving(false);
  }

  async function updateMemberRole(userId: string, role: string) {
    if (!teamProject) return;

    setTeamSaving(true);
    setTeamError(null);

    const { error } = await supabase.rpc("upsert_project_member", {
      p_project_id: teamProject.id,
      p_user_id: userId,
      p_role: role,
    });

    if (error) {
      setTeamError(error.message);
      setTeamSaving(false);
      return;
    }

    await loadProjectTeam(teamProject.id);
    setTeamSaving(false);
  }

  return (
    <>
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Projects</h1>
            <p className="text-slate-400 mt-1">
              Track jobs, statuses, BOQs, takeoffs, procurement, and payments.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={addProject}
              disabled={saving}
              className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm disabled:opacity-50"
            >
              {saving ? "Saving..." : "+ New Project"}
            </button>
            <button
              onClick={loadAll}
              className="px-3 py-2 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 text-sm"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Add Project */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
            <div className="text-sm font-semibold mb-3">Add Project</div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400">Client (optional)</label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                >
                  <option value="">— No client selected —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400">Project Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                  placeholder="e.g., Brown House Extension"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400">Site Address</label>
                <input
                  value={siteAddress}
                  onChange={(e) => setSiteAddress(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400">Location</label>
                <div className="mt-1 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={siteLat}
                      onChange={(e) => setSiteLat(e.target.value)}
                      placeholder="Latitude"
                      className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                    />
                    <input
                      type="text"
                      value={siteLng}
                      onChange={(e) => setSiteLng(e.target.value)}
                      placeholder="Longitude"
                      className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => getCurrentLocation(false)}
                    disabled={locationLoading}
                    className="w-full px-3 py-2 rounded-lg bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 text-sm border border-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {locationLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full animate-spin"></div>
                        Getting Location...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Use Current Location
                      </>
                    )}
                  </button>
                  {locationError && (
                    <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-2 py-1">
                      {locationError}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ProjectRow["status"])}
                    className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                  >
                    <option value="planning">planning</option>
                    <option value="active">active</option>
                    <option value="on_hold">on_hold</option>
                    <option value="completed">completed</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                  />
                </div>
                <div />
              </div>

              <div>
                <label className="text-xs text-slate-400">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600 min-h-[90px]"
                />
              </div>
            </div>
          </div>

          {/* Project List */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Project List</div>
              <div className="text-xs text-slate-400">
                {loading ? "Loading..." : projects.length + " projects"}
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {loading ? (
                <div className="text-sm text-slate-400">Loading…</div>
              ) : projects.length === 0 ? (
                <div className="text-sm text-slate-400">No projects yet.</div>
              ) : (
                projects.map((p) => {
                  const isEditing = editingId === p.id;

                  return (
                    <div
                      key={p.id}
                      className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <div className="space-y-2">
                              <select
                                value={eClientId}
                                onChange={(e) => setEClientId(e.target.value)}
                                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                              >
                                <option value="">— No client selected —</option>
                                {clients.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>

                              <input
                                value={eName}
                                onChange={(e) => setEName(e.target.value)}
                                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                              />

                              <input
                                value={eSiteAddress}
                                onChange={(e) => setESiteAddress(e.target.value)}
                                placeholder="Site address"
                                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                              />

                              <div>
                                <label className="text-xs text-slate-400">Location</label>
                                <div className="mt-1 space-y-2">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <input
                                      type="text"
                                      value={eSiteLat}
                                      onChange={(e) => setESiteLat(e.target.value)}
                                      placeholder="Latitude"
                                      className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                                    />
                                    <input
                                      type="text"
                                      value={eSiteLng}
                                      onChange={(e) => setESiteLng(e.target.value)}
                                      placeholder="Longitude"
                                      className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => getCurrentLocation(true)}
                                    disabled={eLocationLoading}
                                    className="w-full px-3 py-2 rounded-lg bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 text-sm border border-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                  >
                                    {eLocationLoading ? (
                                      <>
                                        <div className="w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full animate-spin"></div>
                                        Getting Location...
                                      </>
                                    ) : (
                                      <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        Use Current Location
                                      </>
                                    )}
                                  </button>
                                  {eLocationError && (
                                    <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-2 py-1">
                                      {eLocationError}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <select
                                  value={eStatus}
                                  onChange={(e) => setEStatus(e.target.value as ProjectRow["status"])}
                                  className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                                >
                                  <option value="planning">planning</option>
                                  <option value="active">active</option>
                                  <option value="on_hold">on_hold</option>
                                  <option value="completed">completed</option>
                                  <option value="cancelled">cancelled</option>
                                </select>

                                <input
                                  type="date"
                                  value={eStartDate}
                                  onChange={(e) => setEStartDate(e.target.value)}
                                  className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                                />
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <input
                                  type="date"
                                  value={eEndDate}
                                  onChange={(e) => setEEndDate(e.target.value)}
                                  className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                                />
                                <div />
                              </div>

                              <textarea
                                value={eNotes}
                                onChange={(e) => setENotes(e.target.value)}
                                placeholder="Notes"
                                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600 min-h-[70px]"
                              />

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={saveEdit}
                                  disabled={saving}
                                  className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm disabled:opacity-50"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="px-3 py-2 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 text-sm"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="font-semibold text-sm truncate">{p.name}</div>
                              <div className="text-xs text-slate-400 mt-1">
                                {(p.client_id
                                  ? clientNameById.get(p.client_id) || "Unknown client"
                                  : "No client") +
                                  " • " +
                                  p.status}
                              </div>
                              {p.site_address && (
                                <div className="text-xs text-slate-500 mt-1">{p.site_address}</div>
                              )}
                              {(p.start_date || p.end_date) && (
                                <div className="text-xs text-slate-500 mt-1">
                                  {p.start_date || "—"} to {p.end_date || "—"}
                                </div>
                              )}
                              {p.notes && (
                                <div className="text-xs text-slate-300 mt-2 whitespace-pre-wrap">
                                  {p.notes}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {!isEditing && (
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            <button
                              onClick={() => navigate(`/projects/${p.id}`)}
                              className="px-3 py-2 rounded-xl bg-blue-900/20 hover:bg-blue-900/35 border border-blue-900/40 text-sm"
                            >
                              Open
                            </button>

                            <button
                              onClick={() => openTeamModal(p)}
                              className="px-3 py-2 rounded-xl bg-indigo-900/20 hover:bg-indigo-900/35 border border-indigo-900/40 text-sm"
                            >
                              Team
                            </button>

                            <button
                              onClick={() => startEdit(p)}
                              className="px-3 py-2 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 text-sm"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() => deleteProject(p.id)}
                              disabled={saving}
                              className="px-3 py-2 rounded-xl bg-red-900/20 hover:bg-red-900/35 border border-red-900/40 text-sm disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {teamOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={closeTeamModal}
          />
          <div className="relative z-10 w-full max-w-4xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-4">
              <div>
                <h2 className="text-lg font-semibold">Project Team</h2>
                <p className="text-sm text-slate-400 mt-1">
                  {teamProject?.name || "Selected project"}
                </p>
              </div>
              <button
                onClick={closeTeamModal}
                disabled={teamSaving}
                className="px-3 py-2 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 text-sm disabled:opacity-50"
              >
                Close
              </button>
            </div>

            {teamError && (
              <div className="mx-4 mt-4 rounded-xl border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-200">
                {teamError}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="text-sm font-semibold mb-3">Add Team Member</div>

                {teamLoading ? (
                  <div className="text-sm text-slate-400">Loading team data...</div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-slate-400">User</label>
                      <select
                        value={selectedUserId}
                        onChange={(e) => setSelectedUserId(e.target.value)}
                        className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                      >
                        <option value="">— Select a user —</option>
                        {availableUsers.map((u) => (
                          <option key={u.user_id} value={u.user_id}>
                            {u.full_name?.trim()
                              ? `${u.full_name} (${u.email ?? "no email"})`
                              : u.email ?? u.user_id}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-slate-400">Project Role</label>
                      <select
                        value={selectedProjectRole}
                        onChange={(e) => setSelectedProjectRole(e.target.value)}
                        className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                      >
                        {PROJECT_MEMBER_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {prettyRole(role)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={addTeamMember}
                      disabled={teamSaving || teamLoading || !selectedUserId}
                      className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm disabled:opacity-50"
                    >
                      {teamSaving ? "Saving..." : "Add to Project"}
                    </button>

                    {availableUsers.length === 0 && (
                      <div className="text-xs text-slate-500">
                        No more assignable users available for this project.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold">Assigned Members</div>
                  <div className="text-xs text-slate-400">
                    {teamLoading ? "Loading..." : `${projectMembers.length} members`}
                  </div>
                </div>

                {teamLoading ? (
                  <div className="text-sm text-slate-400">Loading members...</div>
                ) : projectMembers.length === 0 ? (
                  <div className="text-sm text-slate-400">No team members assigned yet.</div>
                ) : (
                  <div className="space-y-2">
                    {projectMembers.map((member) => (
                      <div
                        key={member.user_id}
                        className="rounded-xl border border-slate-800 bg-slate-900/40 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">
                              {member.full_name?.trim() || member.email || member.user_id}
                            </div>
                            {member.email && (
                              <div className="text-xs text-slate-400 mt-1 truncate">
                                {member.email}
                              </div>
                            )}
                            <div className="text-xs text-slate-500 mt-1">
                              Company role: {prettyRole(member.company_role)}
                            </div>
                          </div>

                          <div className="w-[180px]">
                            <label className="text-[11px] text-slate-500">Project role</label>
                            <select
                              value={member.project_role ?? "viewer"}
                              onChange={(e) => updateMemberRole(member.user_id, e.target.value)}
                              disabled={teamSaving}
                              className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600 disabled:opacity-50"
                            >
                              {PROJECT_MEMBER_ROLES.map((role) => (
                                <option key={role} value={role}>
                                  {prettyRole(role)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
