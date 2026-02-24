import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type ClientRow = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

export default function ClientsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clients, setClients] = useState<ClientRow[]>([]);

  // New client form
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [eContactName, setEContactName] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [eAddress, setEAddress] = useState("");
  const [eNotes, setENotes] = useState("");
  const [eStatus, setEStatus] = useState<ClientRow["status"]>("active");

  async function loadClients() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setClients([]);
      setLoading(false);
      return;
    }

    setClients((data ?? []) as ClientRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadClients();
  }, []);

  async function addClient() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Client name is required.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error } = await supabase.from("clients").insert({
      name: trimmed,
      contact_name: contactName.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
      status: "active",
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setName("");
    setContactName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setNotes("");

    await loadClients();
    setSaving(false);
  }

  function startEdit(c: ClientRow) {
    setEditingId(c.id);
    setEName(c.name ?? "");
    setEContactName(c.contact_name ?? "");
    setEPhone(c.phone ?? "");
    setEEmail(c.email ?? "");
    setEAddress(c.address ?? "");
    setENotes(c.notes ?? "");
    setEStatus(c.status);
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
      setError("Client name is required.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error } = await supabase
      .from("clients")
      .update({
        name: trimmed,
        contact_name: eContactName.trim() || null,
        phone: ePhone.trim() || null,
        email: eEmail.trim() || null,
        address: eAddress.trim() || null,
        notes: eNotes.trim() || null,
        status: eStatus,
      })
      .eq("id", editingId);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setEditingId(null);
    await loadClients();
    setSaving(false);
  }

  async function deleteClient(id: string) {
    const ok = confirm("Delete this client? This cannot be undone.");
    if (!ok) return;

    setSaving(true);
    setError(null);

    const { error } = await supabase.from("clients").delete().eq("id", id);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    if (editingId === id) setEditingId(null);
    await loadClients();
    setSaving(false);
  }

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="text-slate-400 mt-1">
            Manage clients, contacts, addresses, and notes.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={addClient}
            disabled={saving}
            className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm disabled:opacity-50"
          >
            {saving ? "Saving..." : "+ New Client"}
          </button>
          <button
            onClick={loadClients}
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
        {/* Add Client */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="text-sm font-semibold mb-3">Add Client</div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400">Client Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                placeholder="e.g., Mr. Brown / ABC Company"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400">Contact Name</label>
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Phone</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Address</label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                />
              </div>
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

        {/* Client List */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Client List</div>
            <div className="text-xs text-slate-400">
              {loading ? "Loading..." : clients.length + " clients"}
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {loading ? (
              <div className="text-sm text-slate-400">Loading…</div>
            ) : clients.length === 0 ? (
              <div className="text-sm text-slate-400">No clients yet.</div>
            ) : (
              clients.map((c) => {
                const isEditing = editingId === c.id;

                return (
                  <div
                    key={c.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              value={eName}
                              onChange={(e) => setEName(e.target.value)}
                              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                            />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <input
                                value={eContactName}
                                onChange={(e) => setEContactName(e.target.value)}
                                placeholder="Contact"
                                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                              />
                              <input
                                value={ePhone}
                                onChange={(e) => setEPhone(e.target.value)}
                                placeholder="Phone"
                                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                              />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <input
                                value={eEmail}
                                onChange={(e) => setEEmail(e.target.value)}
                                placeholder="Email"
                                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                              />
                              <input
                                value={eAddress}
                                onChange={(e) => setEAddress(e.target.value)}
                                placeholder="Address"
                                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                              />
                            </div>

                            <textarea
                              value={eNotes}
                              onChange={(e) => setENotes(e.target.value)}
                              placeholder="Notes"
                              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600 min-h-[70px]"
                            />

                            <div className="flex items-center gap-2">
                              <select
                                value={eStatus}
                                onChange={(e) => setEStatus(e.target.value as ClientRow["status"])}
                                className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                              >
                                <option value="active">active</option>
                                <option value="inactive">inactive</option>
                              </select>

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
                            <div className="font-semibold text-sm truncate">{c.name}</div>
                            <div className="text-xs text-slate-400 mt-1">
                              {(c.contact_name || "—") +
                                " • " +
                                (c.phone || "—") +
                                " • " +
                                (c.email || "—")}
                            </div>
                            {c.address && (
                              <div className="text-xs text-slate-500 mt-1">{c.address}</div>
                            )}
                            {c.notes && (
                              <div className="text-xs text-slate-300 mt-2 whitespace-pre-wrap">
                                {c.notes}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {!isEditing && (
                        <div className="flex items-center gap-2">
                          <div className="text-[10px] px-2 py-1 rounded-full border border-slate-700 text-slate-300">
                            {c.status}
                          </div>

                          <button
                            onClick={() => startEdit(c)}
                            className="px-3 py-2 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 text-sm"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() => deleteClient(c.id)}
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
