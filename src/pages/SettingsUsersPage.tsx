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

  const [q, setQ] = useState("");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("estimator");
  const [inviteMsg, setInviteMsg] = useState<string>("");
  const [inviteErr, setInviteErr] = useState<string>("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);

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

    try {
      const { rows: data, note } = await safeSelectProfiles();
      setRows(data);
      setTableNote(note || "");
    } catch (e: any) {
      console.error("Load users failed:", e);
      setErr(e?.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
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
    if (busy) return;
    setInviteOpen(false);
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setInviteMsg("Invite link copied.");
    } catch (e) {
      console.error("Failed to copy:", e);
      setInviteErr("Failed to copy invite link.");
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
    setInviteLink(null);
    setErr("");
    setMsg("");

    try {
      const { data, error } = await supabase.functions.invoke("admin-invite-user", {
        body: {
          email,
          role: inviteRole,
          redirectTo: `${window.location.origin}/accept-invite`,
        },
      });

      if (error) {
        console.error("Invite error:", error);
        setInviteErr(error.message || "Failed to send invite.");
        return;
      }

      if (!data) {
        setInviteErr("Unexpected empty response from server.");
        return;
      }

      if (data.success || data.ok) {
        const invitedEmail = data.invited || data?.invitation?.email || email;

        setInviteMsg("Invite sent successfully.");
        setMsg(`Invite sent to ${invitedEmail}`);

        if (data.inviteLink) {
          setInviteLink(data.inviteLink);
        }

        await load();
        return;
      }

      if (data.error) {
        setInviteErr(String(data.error));
        return;
      }

      setInviteErr("Unknown invite response.");
    } catch (e: any) {
      console.error("Invite crash:", e);
      setInviteErr(e?.message || "Invite failed.");
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
        body: {
          email: cleanEmail(email),
          role: role || "estimator",
          redirectTo: `${window.location.origin}/accept-invite`,
        },
      });

      if (error) {
        setErr(error.message || "Resend failed.");
        return;
      }

      if (data?.success || data?.ok) {
        setMsg(`Invite resent to ${data.invited || cleanEmail(email)}`);
        await load();
        return;
      }

      if (data?.error) {
        setErr(String(data.error));
        return;
      }

      setErr("Unknown resend response.");
    } catch (e: any) {
      console.error("Resend crash:", e);
      setErr(e?.message || "Resend failed.");
    } finally {
      setBusy(false);
    }
  }

  async function doToggleStatus(r: ProfileRow) {
    if (!r.id) return;

    setBusy(true);
    setErr("");
    setMsg("");

    const next: Status = (r.status || "active") === "active" ? "disabled" : "active";

    try {
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
    } catch (e: any) {
      console.error("Toggle status failed:", e);
      setErr(e?.message || "Failed to update status.");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete(r: ProfileRow) {
    if (!confirm("Delete this user profile row? (Auth user deletion is a later upgrade)")) {
      return;
    }

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
    } catch (e: any) {
      console.error("Delete failed:", e);
      setErr(e?.message || "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <div className="text-sm opacity-70">Users and access management.</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openInvite}
            disabled={busy}
            className="rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm transition hover:bg-white/15 disabled:opacity-60"
          >
            Invite User
          </button>

          <button
            type="button"
            onClick={load}
            disabled={busy}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm transition hover:bg-white/10 disabled:opacity-60"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-4">
        <div className="inline-flex overflow-hidden rounded-lg border border-white/10 bg-white/5">
          <div className="bg-white/10 px-4 py-2 text-sm">Users</div>
        </div>
      </div>

      {(msg || err || tableNote) && (
        <div className="mb-4 space-y-2">
          {tableNote && (
            <div className="rounded-md border border-white/10 bg-white/5 p-3 text-xs opacity-70">
              {tableNote}
            </div>
          )}

          {msg && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
              {msg}
            </div>
          )}

          {err && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm">
              {err}
            </div>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="text-sm opacity-80">Search</div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by email, name, role, or status…"
          className="min-w-[260px] flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
        />

        <div className="ml-auto text-sm opacity-70">
          {filtered.length} user{filtered.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-white/10">
        {loading ? (
          <div className="p-6 text-sm opacity-70">Loading users...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr className="border-b border-white/10 text-left">
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-white/5">
                    <td className="px-4 py-3">{r.email || "-"}</td>
                    <td className="px-4 py-3">{r.full_name || "-"}</td>
                    <td className="px-4 py-3">
                      {r.role
                        ? ROLE_OPTIONS.find((x) => x.value === r.role)?.label || r.role
                        : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-1 text-xs ${
                          (r.status || "active") === "active"
                            ? "border-emerald-500/30 bg-emerald-500/10"
                            : "border-orange-500/30 bg-orange-500/10"
                        }`}
                      >
                        {r.status || "active"}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => doResend(r.email, r.role)}
                          className="rounded-md border border-white/10 bg-white/10 px-3 py-1 text-xs disabled:opacity-60"
                        >
                          Resend
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => doToggleStatus(r)}
                          className="rounded-md border border-white/10 bg-white/5 px-3 py-1 text-xs disabled:opacity-60"
                        >
                          {(r.status || "active") === "active" ? "Disable" : "Enable"}
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => doDelete(r)}
                          className="rounded-md border border-white/10 bg-white/5 px-3 py-1 text-xs disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-sm opacity-70" colSpan={6}>
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-xl border border-white/10 bg-[#0b1220] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="text-base font-semibold">Invite User</div>
              <button
                type="button"
                onClick={closeInvite}
                className="opacity-70 hover:opacity-100"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 p-5">
              {(inviteMsg || inviteErr || inviteLink) && (
                <>
                  {inviteMsg && (
                    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                      {inviteMsg}
                    </div>
                  )}

                  {inviteErr && (
                    <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm">
                      {inviteErr}
                    </div>
                  )}

                  {inviteLink && (
                    <div className="mt-3 rounded-md border border-blue-500/30 bg-blue-500/10 p-3">
                      <div className="mb-2 text-xs text-blue-200">
                        Invite Link (click to copy):
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 break-all font-mono text-sm">{inviteLink}</div>

                        <button
                          type="button"
                          onClick={() => copyToClipboard(inviteLink)}
                          className="rounded px-3 py-1 text-xs text-white transition-colors bg-blue-600 hover:bg-blue-700"
                        >
                          Copy Link
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div>
                <div className="mb-1 text-xs opacity-70">Email</div>
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs opacity-70">Role</div>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as Role)}
                    className="w-full rounded-md border border-white/10 bg-[#0b1220] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                  >
                    {ROLE_OPTIONS
                      .filter((r) => r.value !== "director")
                      .map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex items-end text-xs opacity-70">
                  <div className="w-full rounded-md border border-white/10 bg-white/5 p-3">
                    Invites are sent by email via Edge Function. User sets password from invite link.
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
              <button
                type="button"
                onClick={closeInvite}
                className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
                disabled={busy}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={doInvite}
                className="rounded-md border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
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