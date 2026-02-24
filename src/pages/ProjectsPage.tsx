import React, { useEffect, useMemo, useState } from "react";
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

export default function ProjectsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);

  // New project form
  const [clientId, setClientId] = useState<string>("");
  const [name, setName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [status, setStatus] = useState<ProjectRow["status"]>("planning");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eClientId, setEClientId] = useState<string>("");
  const [eName, setEName] = useState("");
  const [eSiteAddress, setESiteAddress] = useState("");
  const [eStatus, setEStatus] = useState<ProjectRow["status"]>("planning");
  const [eStartDate, setEStartDate] = useState("");
  const [eEndDate, setEEndDate] = useState("");
  const [eNotes, setENotes] = useState("");

  const clientNameById = useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [clients]);

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
    setStatus("planning");
    setStartDate("");
    setEndDate("");
    setNotes("");

    await loadAll();
    setSaving(false);
  }

  function startEdit(p: ProjectRow) {
    setEditingId(p.id);
    setEClientId(p.client_id ?? "");
    setEName(p.name ?? "");
    setESiteAddress(p.site_address ?? "");
    setEStatus(p.status);
    setEStartDate(p.start_date ?? "");
    setEEndDate(p.end_date ?? "");
    setENotes(p.notes ?? "");
    setError(null);
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

  return (
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
                            {p.notes && (
                              <div className="text-xs text-slate-300 mt-2 whitespace-pre-wrap">
                                {p.notes}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {!isEditing && (
                        <div className="flex items-center gap-2">
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
  );
}
