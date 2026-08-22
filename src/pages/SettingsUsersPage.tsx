import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield } from "lucide-react";
import { supabase } from "../lib/supabase";
import { canManageStaff } from "../lib/permissions";

// Role universe is the literal live user_profiles.role CHECK constraint,
// confirmed via pg_get_constraintdef (see role-vocabulary audit) — not the
// migration file, which is stale and doesn't reflect the live constraint.
type Role =
  | "director"
  | "admin"
  | "estimator"
  | "supervisor"
  | "office_user"
  | "site_user"
  | "secretary";

type Status = "active" | "disabled";
type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role | null;
  status: Status | null;
  created_at: string | null;
  updated_at: string | null;
};

type InvitationRow = {
  id: string;
  email: string;
  role: Role;
  status: InviteStatus;
  created_at: string;
  expires_at: string;
};

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "director", label: "Director" },
  { value: "admin", label: "Admin" },
  { value: "estimator", label: "Estimator" },
  { value: "supervisor", label: "Supervisor" },
  { value: "office_user", label: "Office User" },
  { value: "site_user", label: "Site User" },
  { value: "secretary", label: "Secretary" },
];

const ROLE_META: Record<
  Role,
  { color: string; dot: string; label: string; desc: string }
> = {
  director: {
    color: "bg-cyan-100 text-cyan-800 border-cyan-300",
    dot: "bg-cyan-500",
    label: "Director",
    desc: "Full access to everything",
  },
  admin: {
    color: "bg-violet-100 text-violet-800 border-violet-300",
    dot: "bg-violet-500",
    label: "Admin",
    desc: "Full access except billing",
  },
  estimator: {
    color: "bg-amber-100 text-amber-800 border-amber-300",
    dot: "bg-amber-500",
    label: "Estimator",
    desc: "BOQ, estimates, rate library",
  },
  supervisor: {
    color: "bg-emerald-100 text-emerald-800 border-emerald-300",
    dot: "bg-emerald-500",
    label: "Supervisor",
    desc: "Field operations and workers",
  },
  office_user: {
    color: "bg-orange-100 text-orange-800 border-orange-300",
    dot: "bg-orange-500",
    label: "Office User",
    desc: "Back-office staff — limited admin, no Finance or Settings",
  },
  site_user: {
    color: "bg-blue-100 text-blue-800 border-blue-300",
    dot: "bg-blue-500",
    label: "Site User",
    desc: "Field oversight, worker and field-payment access",
  },
  secretary: {
    color: "bg-pink-100 text-pink-800 border-pink-300",
    dot: "bg-pink-500",
    label: "Secretary",
    desc: "Correspondence, worker admin documents, compliance filing, scheduling — no financial or settings access",
  },
};

function RoleBadge({ role }: { role: Role | null }) {
  const meta = role ? ROLE_META[role] : null;
  if (!meta) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
        Unknown
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${meta.color}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

function cleanEmail(s: string) {
  return s.trim().toLowerCase();
}

function initials(name: string | null, email: string | null) {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  if (email) return email[0].toUpperCase();
  return "?";
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

async function loadPendingInvitations(): Promise<InvitationRow[]> {
  const { data, error } = await supabase
    .from("company_invitations")
    .select("id,email,role,status,created_at,expires_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load invitations:", error);
    return [];
  }

  return (data as InvitationRow[]) || [];
}

export default function SettingsUsersPage() {
  const nav = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [tableNote, setTableNote] = useState<string>("");

  const [q, setQ] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

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
      const [{ rows: data, note }, invites] = await Promise.all([
        safeSelectProfiles(),
        loadPendingInvitations(),
      ]);
      setRows(data);
      setTableNote(note || "");
      setInvitations(invites);
    } catch (e: any) {
      console.error("Load users failed:", e);
      setErr(e?.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id || null;
      setCurrentUserId(uid);
      if (!uid) { setAllowed(false); setLoading(false); return; }
      const { data: profile } = await supabase
        .from("user_profiles").select("role").eq("id", uid).maybeSingle();
      const ok = canManageStaff(profile?.role);
      setAllowed(ok);
      if (ok) load(); else setLoading(false);
    })();
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
        // supabase-js's functions.invoke() only ever surfaces a generic
        // "Edge Function returned a non-2xx status code" on error.message —
        // the edge function's actual { error: "..." } response body (the
        // useful part) lives on error.context, the raw fetch Response,
        // which isn't read by default. Unpack it so the modal shows the
        // real reason instead of the useless generic wrapper text.
        let detail = error.message || "Failed to send invite.";
        if (error.context && typeof error.context.json === "function") {
          try {
            const body = await error.context.clone().json();
            if (body?.error) detail = String(body.error);
          } catch {
            // Response body wasn't JSON (or already consumed) — fall back to the generic message.
          }
        }
        setInviteErr(detail);
        return;
      }

      if (!data) {
        setInviteErr("Unexpected empty response from server.");
        return;
      }

      if (data.error) {
        setInviteErr(String(data.error));
        return;
      }

      if (data.success) {
        const sentRole = data.invitation?.role || inviteRole;
        setInviteMsg(`Invite sent successfully as "${sentRole}".`);
        setMsg(`Invite sent to ${email} as ${sentRole}`);

        if (data.inviteLink) {
          setInviteLink(data.inviteLink);
        }

        await load();
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

  async function doResend(invite: InvitationRow) {
    setBusy(true);
    setErr("");
    setMsg("");

    try {
      const { data, error } = await supabase.functions.invoke("admin-invite-user", {
        body: {
          email: invite.email,
          role: invite.role,
          redirectTo: `${window.location.origin}/accept-invite`,
        },
      });

      if (error) {
        setErr(error.message || "Resend failed.");
        return;
      }

      if (data?.error) {
        setErr(String(data.error));
        return;
      }

      if (data?.success) {
        setMsg(`Invite resent to ${invite.email}`);
        await load();
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
      const { error } = await supabase
        .from("user_profiles")
        .update({ status: next, updated_at: new Date().toISOString() })
        .eq("id", r.id);

      if (error) {
        setErr(error.message || "Failed to update status.");
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

  async function doDeleteUser(r: ProfileRow) {
    if (
      !confirm(
        `Permanently delete ${r.full_name || r.email}? This removes their login and cannot be undone.`
      )
    ) {
      return;
    }

    setBusy(true);
    setErr("");
    setMsg("");

    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-user", {
        body: { userId: r.id },
      });

      if (error) {
        setErr(error.message || "Delete failed.");
        return;
      }

      if (data?.error) {
        setErr(String(data.error));
        return;
      }

      setRows((prev) => prev.filter((x) => x.id !== r.id));
      setMsg("User permanently deleted.");
    } catch (e: any) {
      console.error("Delete failed:", e);
      setErr(e?.message || "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  async function doDeleteInvitation(invite: InvitationRow) {
    if (!confirm(`Permanently delete the pending invite for ${invite.email}?`)) {
      return;
    }

    setBusy(true);
    setErr("");
    setMsg("");

    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-user", {
        body: { invitationId: invite.id },
      });

      if (error) {
        setErr(error.message || "Delete failed.");
        return;
      }

      if (data?.error) {
        setErr(String(data.error));
        return;
      }

      setInvitations((prev) => prev.filter((x) => x.id !== invite.id));
      setMsg("Invitation permanently deleted.");
    } catch (e: any) {
      console.error("Delete invitation failed:", e);
      setErr(e?.message || "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const key = r.role || "unknown";
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [rows]);

  if (allowed === null) {
    return <div className="p-8 text-sm text-slate-500">Checking access...</div>;
  }
  if (allowed === false) {
    return (
      <div className="p-8 text-center">
        <Shield size={40} className="mx-auto mb-4 text-red-400" />
        <div className="text-lg font-bold text-slate-700 dark:text-slate-300">Access Restricted</div>
        <div className="mt-2 text-sm text-slate-500">Only Directors and Admins can manage users.</div>
        <button onClick={() => nav("/settings")} className="mt-4 rounded-lg bg-slate-200 px-4 py-2 text-sm text-slate-600 dark:bg-white/[0.06] dark:text-slate-400">
          ← Back to Settings
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 dark:bg-[#080b10]">
      {/* Role count chips */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {Object.entries(roleCounts).map(([role, count]) => (
          <span
            key={role}
            className="inline-flex items-center gap-2 rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cyan-800 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300"
          >
            {role}
            <span className="rounded-full bg-white/70 px-1.5 text-[10px] dark:bg-white/10">
              {count}
            </span>
          </span>
        ))}
      </div>

      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="w-full max-w-md">
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
              />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search users..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-cyan-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openInvite}
            disabled={busy}
            className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:opacity-60"
          >
            Invite User
          </button>

          <button
            type="button"
            onClick={load}
            disabled={busy}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
          >
            Refresh
          </button>
        </div>
      </div>

      {(msg || err || tableNote) && (
        <div className="mb-4 space-y-2">
          {tableNote && (
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
              {tableNote}
            </div>
          )}
          {msg && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              {msg}
            </div>
          )}
          {err && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {err}
            </div>
          )}
        </div>
      )}

      {/* Active Members card */}
      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.02]">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <svg className="h-4 w-4 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-4a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            Active Members
          </div>
          <span className="text-xs text-slate-400">{filtered.length} total</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2 font-semibold">User</th>
                  <th className="px-5 py-2 font-semibold">Role</th>
                  <th className="px-5 py-2 font-semibold">Status</th>
                  <th className="px-5 py-2 font-semibold">Joined</th>
                  <th className="px-5 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isYou = r.id === currentUserId;
                  return (
                    <tr
                      key={r.id}
                      className={`border-t border-slate-100 dark:border-white/5 ${
                        isYou ? "bg-cyan-50/60 dark:bg-cyan-500/10" : ""
                      }`}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                              isYou
                                ? "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300"
                                : "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400"
                            }`}
                          >
                            {initials(r.full_name, r.email)}
                          </div>
                          <div>
                            <div className="font-medium text-slate-800 dark:text-slate-200">
                              {r.full_name || "Unknown"}
                              {isYou && (
                                <span className="ml-2 text-[9px] font-bold uppercase tracking-widest text-cyan-600 dark:text-cyan-400">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">{r.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <RoleBadge role={r.role} />
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={
                            (r.status || "active") === "active"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-500 dark:text-red-400"
                          }
                        >
                          {r.status || "active"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-400">{formatDate(r.created_at)}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex gap-3 text-xs font-medium">
                          {!isYou && (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => doToggleStatus(r)}
                                className="text-slate-500 hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:text-white"
                              >
                                {(r.status || "active") === "active" ? "Disable" : "Enable"}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => doDeleteUser(r)}
                                className="text-red-500 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                              >
                                Delete
                              </button>
                            </>
                          )}
                          {isYou && <span className="text-slate-300">—</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td className="px-5 py-8 text-center text-sm text-slate-400" colSpan={5}>
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pending Invitations card */}
      {invitations.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.02]">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Pending Invitations
            </div>
            <span className="text-xs text-slate-400">{invitations.length} waiting</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2 font-semibold">Email</th>
                  <th className="px-5 py-2 font-semibold">Role</th>
                  <th className="px-5 py-2 font-semibold">Status</th>
                  <th className="px-5 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id} className="border-t border-slate-100 dark:border-white/5">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-slate-800 dark:text-slate-200">{inv.email}</div>
                          <div className="text-xs text-slate-400">Sent {formatDate(inv.created_at)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <RoleBadge role={inv.role} />
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Pending
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex gap-3 text-xs font-medium">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => doResend(inv)}
                          className="text-slate-500 hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:text-white"
                        >
                          Resend
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => doDeleteInvitation(inv)}
                          className="text-red-500 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                        >
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Role Permissions reference grid */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.02]">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <svg className="h-4 w-4 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Role Permissions
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {ROLE_OPTIONS.map((r) => {
            const meta = ROLE_META[r.value];
            return (
              <div
                key={r.value}
                className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/[0.02]"
              >
                <RoleBadge role={r.value} />
                <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{meta.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Invite modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0f1722]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
              <div className="text-base font-semibold text-slate-800 dark:text-white">Invite User</div>
              <button
                type="button"
                onClick={closeInvite}
                className="text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 p-5">
              {(inviteMsg || inviteErr || inviteLink) && (
                <>
                  {inviteMsg && (
                    <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                      {inviteMsg}
                    </div>
                  )}
                  {inviteErr && (
                    <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                      {inviteErr}
                    </div>
                  )}
                  {inviteLink && (
                    <div className="mt-3 rounded-md border border-blue-300 bg-blue-50 p-3 dark:border-blue-500/30 dark:bg-blue-500/10">
                      <div className="mb-2 text-xs text-blue-700 dark:text-blue-200">
                        Invite Link (click to copy):
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 break-all font-mono text-sm text-slate-700 dark:text-slate-200">
                          {inviteLink}
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(inviteLink)}
                          className="rounded bg-blue-600 px-3 py-1 text-xs text-white transition-colors hover:bg-blue-700"
                        >
                          Copy Link
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div>
                <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Email</div>
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-cyan-400 dark:border-white/15 dark:bg-white/10 dark:text-white dark:placeholder:text-white/40"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Role</div>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as Role)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-cyan-400 dark:border-white/15 dark:bg-white/10 dark:text-white"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end text-xs text-slate-500 dark:text-slate-400">
                  <div className="w-full rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
                    Invites are sent by email via Edge Function. User sets password from invite link.
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-white/10">
              <button
                type="button"
                onClick={closeInvite}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doInvite}
                className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60"
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
