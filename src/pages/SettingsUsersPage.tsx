import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Role =
  | "director"
  | "estimator"
  | "supervisor"
  | "office_user"
  | "site_user";

type Status = "active" | "disabled";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role | null;
  status: Status | null;
  created_at: string | null;
  updated_at: string | null;
};

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "director", label: "Director" },
  { value: "estimator", label: "Estimator" },
  { value: "supervisor", label: "Supervisor" },
  { value: "office_user", label: "Office User" },
  { value: "site_user", label: "Site User" },
];

function formatDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

function cleanEmail(s: string) {
  return s.trim().toLowerCase();
}

async function safeSelectProfiles(): Promise<{ rows: ProfileRow[]; note?: string }> {
  // Tries common table names/views. If none exist, it returns empty with note.
  const candidates = ["user_profiles", "profiles", "v_user_profiles"];

  for (const name of candidates) {
    const resp = await supabase
      // @ts-ignore
      .from(name)
      .select("id,email,full_name,role,status,created_at,updated_at")
      .limit(500);

    if (!resp.error) {
      return { rows: (resp.data as ProfileRow[]) || [] };
    }
  }

  return {
    rows: [],
    note:
      "Profiles table/view not found yet (user_profiles / profiles / v_user_profiles). Invite will still work via Edge Function.",
  };
}

export default function SettingsUsersPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [tableNote, setTableNote] = useState<string>("");

  // toolbar
  const [q, setQ] = useState("");

  // invite modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("estimator");
  const [inviteMsg, setInviteMsg] = useState<string>("");
  const [inviteErr, setInviteErr] = useState<string>("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  // page messages
  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string>("");

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const email = (r.email || "").toLowerCase();
      const name = (r.full_name || "").toLowerCase();
      const role = (r.role || "").toLowerCase();
      const status = (r.status || "").toLowerCase();
      return (
        email.includes(qq) ||
        name.includes(qq) ||
        role.includes(qq) ||
        status.includes(qq)
      );
    });
  }, [rows, q]);

  async function load() {
    setLoading(true);
    setErr("");
    setMsg("");

    const { rows: data, note } = await safeSelectProfiles();
    setRows(data);
    setTableNote(note || "");
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openInvite() {
    setInviteEmail("");
    setInviteRole("estimator");
    setInviteErr("");
    setInviteMsg("");
    setInviteLink(null);
    setInviteOpen(true);
  }

  function closeInvite() {
    setInviteOpen(false);
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here if you want
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }

  async function doInvite() {
    const email = cleanEmail(inviteEmail);
    if (!email.includes("@") || email.length < 6) {
      setInviteErr("Enter a valid email.");
      return;
    }

    setBusy(true);
    setInviteErr("");
    setInviteMsg("");

    try {
      const { data, error } = await supabase.functions.invoke("admin-invite-user", {
        body: { email: inviteEmail.trim(), role: inviteRole },
      });

      if (error) {
        setInviteErr(error.message);
        console.log("invite error:", error);
        return;
      }

      // Edge function returns { ok: true, invited: email, inviteLink: url } on success
      if (data?.ok) {
        setInviteMsg("Invite sent.");
        setMsg(`Invite sent to ${data.invited}`);
        
        // Show invite link if available
        if (data.inviteLink) {
          console.log("Invite link:", data.inviteLink);
          setInviteLink(data.inviteLink);
        }
        
        // DO NOT auto-close modal if inviteLink exists
        // refresh list (if your profile table exists)
        await load();
      } else if (data?.error) {
        setInviteErr(String(data.error));
        return;
      }
    } finally {
      setBusy(false);
    }
  }

  async function doResend(email: string | null, role: Role | null) {
    if (!email) return;
    setBusy(true);
    setErr("");
    setMsg("");

    try {
      const { data, error } = await supabase.functions.invoke("admin-invite-user", {
        body: { email: cleanEmail(email), role: role || "estimator" },
      });

      if (error) {
        setErr(error.message || "Resend failed.");
        return;
      }

      // Edge function returns { ok: true, invited: email } on success
      if (data?.ok) {
        setMsg(`Invite resent to ${data.invited}`);
      } else if (data?.error) {
        setErr(String(data.error));
        return;
      }
    } finally {
      setBusy(false);
    }
  }

  async function doToggleStatus(r: ProfileRow) {
    // This only works if you have a profiles table/view that supports updates.
    // If not, we show a friendly message (no crash).
    if (!r.id) return;

    setBusy(true);
    setErr("");
    setMsg("");

    const next: Status = (r.status || "active") === "active" ? "disabled" : "active";

    try {
      // try update across common tables
      const candidates = ["user_profiles", "profiles"];
      let ok = false;

      for (const name of candidates) {
        const resp = await supabase
          // @ts-ignore
          .from(name)
          .update({ status: next, updated_at: new Date().toISOString() })
          .eq("id", r.id);

        if (!resp.error) {
          ok = true;
          break;
        }
      }

      if (!ok) {
        setErr(
          "Could not update status yet (profiles table not updateable). Invite works fine; status toggles can be wired later."
        );
        return;
      }

      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: next } : x)));
      setMsg(`User ${next === "active" ? "enabled" : "disabled"}.`);
    } finally {
      setBusy(false);
    }
  }

  async function doDelete(r: ProfileRow) {
    // Deleting auth users must be done server-side (Edge Function).
    // For now we only delete profile row if possible.
    if (!confirm("Delete this user profile row? (Auth user deletion is a later upgrade)")) return;

    setBusy(true);
    setErr("");
    setMsg("");

    try {
      const candidates = ["user_profiles", "profiles"];
      let ok = false;

      for (const name of candidates) {
        const resp = await supabase
          // @ts-ignore
          .from(name)
          .delete()
          .eq("id", r.id);

        if (!resp.error) {
          ok = true;
          break;
        }
      }

      if (!ok) {
        setErr(
          "Could not delete yet (profiles table not deleteable). We can add a server-side delete later."
        );
        return;
      }

      setRows((prev) => prev.filter((x) => x.id !== r.id));
      setMsg("Deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <div className="text-sm opacity-70">Users and access management.</div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openInvite}
            disabled={busy}
            className="bg-white/10 hover:bg-white/15 border border-white/10 rounded-md px-3 py-2 text-sm transition disabled:opacity-60"
          >
            Invite User
          </button>

          <button
            type="button"
            onClick={load}
            disabled={busy}
            className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-md px-3 py-2 text-sm transition disabled:opacity-60"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs (simple now, users-only; you already have Company tab in your Settings page) */}
      <div className="mb-4">
        <div className="inline-flex rounded-lg border border-white/10 bg-white/5 overflow-hidden">
          <div className="px-4 py-2 text-sm bg-white/10">Users</div>
        </div>
      </div>

      {/* Messages */}
      {(msg || err || tableNote) && (
        <div className="mb-4 space-y-2">
          {tableNote && (
            <div className="text-xs opacity-70 border border-white/10 bg-white/5 rounded-md p-3">
              {tableNote}
            </div>
          )}
          {msg && (
            <div className="text-sm border border-emerald-500/30 bg-emerald-500/10 rounded-md p-3">
              {msg}
            </div>
          )}
          {err && (
            <div className="text-sm border border-red-500/30 bg-red-500/10 rounded-md p-3">
              {err}
            </div>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="text-sm opacity-80">Search</div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by email, name, role, or status…"
          className="flex-1 min-w-[260px] bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
        />

        <div className="text-sm opacity-70 ml-auto">
          {filtered.length} user{filtered.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* Table */}
      <div className="border border-white/10 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm opacity-70">Loading users...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr className="text-left border-b border-white/10">
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-white/5">
                    <td className="py-3 px-4">{r.email || "-"}</td>
                    <td className="py-3 px-4">{r.full_name || "-"}</td>
                    <td className="py-3 px-4">
                      {r.role
                        ? ROLE_OPTIONS.find((x) => x.value === r.role)?.label || r.role
                        : "-"}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-md text-xs border ${
                          (r.status || "active") === "active"
                            ? "border-emerald-500/30 bg-emerald-500/10"
                            : "border-orange-500/30 bg-orange-500/10"
                        }`}
                      >
                        {r.status || "active"}
                      </span>
                    </td>
                    <td className="py-3 px-4">{formatDate(r.created_at)}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => doResend(r.email, r.role)}
                          className="bg-white/10 hover:bg-white/15 border border-white/10 rounded-md px-3 py-1 text-xs disabled:opacity-60"
                        >
                          Resend
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => doToggleStatus(r)}
                          className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-md px-3 py-1 text-xs disabled:opacity-60"
                        >
                          {(r.status || "active") === "active" ? "Disable" : "Enable"}
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => doDelete(r)}
                          className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-md px-3 py-1 text-xs disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 && (
                  <tr>
                    <td className="py-8 px-4 text-sm opacity-70" colSpan={6}>
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-xl border border-white/10 bg-[#0b1220] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="text-base font-semibold">Invite User</div>
              <button
                type="button"
                onClick={closeInvite}
                className="opacity-70 hover:opacity-100"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              {(inviteMsg || inviteErr) && (
                <>
                  {inviteMsg && (
                    <div className="text-sm border border-emerald-500/30 bg-emerald-500/10 rounded-md p-3">
                      {inviteMsg}
                    </div>
                  )}
                  {inviteErr && (
                    <div className="text-sm border border-red-500/30 bg-red-500/10 rounded-md p-3">
                      {inviteErr}
                    </div>
                  )}
                  
                  {/* Show invite link if available */}
                  {inviteLink && (
                    <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-md">
                      <div className="text-xs text-blue-200 mb-2">Invite Link (click to copy):</div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-mono break-all flex-1">{inviteLink}</div>
                        <button
                          onClick={() => copyToClipboard(inviteLink)}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                        >
                          Copy Link
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div>
                <div className="text-xs opacity-70 mb-1">Email</div>
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs opacity-70 mb-1">Role</div>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as Role)}
                    className="w-full bg-[#0b1220] border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="text-xs opacity-70 flex items-end">
                  <div className="border border-white/10 bg-white/5 rounded-md p-3 w-full">
                    Invites are sent by email via Edge Function. User sets password from invite link.
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/10">
              <button
                type="button"
                onClick={closeInvite}
                className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-md px-4 py-2 text-sm"
                disabled={busy}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={doInvite}
                className="bg-white/10 hover:bg-white/15 border border-white/10 rounded-md px-4 py-2 text-sm"
                disabled={busy || !inviteEmail.trim()}
              >
                {busy ? "Sending..." : "Send Invite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
