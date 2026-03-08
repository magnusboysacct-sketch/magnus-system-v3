// src/pages/CompanyUsersPage.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type CompanyUserRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: "director" | "admin" | "estimator" | "supervisor" | "client";
  status: "active" | "disabled";
  company_id: string;
};

type MyProfile = {
  id: string;
  role: string | null;
  company_id: string | null;
  full_name: string | null;
};

const ROLE_OPTIONS: CompanyUserRow["role"][] = [
  "director",
  "admin",
  "estimator",
  "supervisor",
  "client",
];

export default function CompanyUsersPage() {
  const [me, setMe] = useState<MyProfile | null>(null);
  const [rows, setRows] = useState<CompanyUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CompanyUserRow["role"]>("estimator");

  const isDirector = me?.role === "director";

  const loadPage = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("You are not logged in.");

      const { data: myProfile, error: myProfileError } = await supabase
        .from("user_profiles")
        .select("id, role, company_id, full_name")
        .eq("id", user.id)
        .single();

      if (myProfileError) throw myProfileError;
      setMe(myProfile as MyProfile);

      if (myProfile?.role !== "director") {
        setRows([]);
        setError("Only directors can access Company User Manager.");
        return;
      }

      const { data, error: rpcError } = await supabase.rpc("get_company_users");

      if (rpcError) throw rpcError;
      setRows((data || []) as CompanyUserRow[]);
    } catch (err: any) {
      console.error("CompanyUsersPage load error:", err);
      setError(err?.message || "Failed to load company users.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.status === "active").length;
    const disabled = rows.filter((r) => r.status === "disabled").length;
    const directors = rows.filter((r) => r.role === "director").length;
    return { total, active, disabled, directors };
  }, [rows]);

  const updateUser = useCallback(
    async (userId: string, patch: { role?: CompanyUserRow["role"]; status?: CompanyUserRow["status"] }) => {
      try {
        setSavingId(userId);
        setError("");

        const { error: rpcError } = await supabase.rpc("update_company_user_access", {
          p_user_id: userId,
          p_role: patch.role ?? null,
          p_status: patch.status ?? null,
        });

        if (rpcError) throw rpcError;

        setRows((prev) =>
          prev.map((row) =>
            row.id === userId
              ? {
                  ...row,
                  role: patch.role ?? row.role,
                  status: patch.status ?? row.status,
                }
              : row
          )
        );
      } catch (err: any) {
        console.error("updateUser error:", err);
        alert(err?.message || "Failed to update user.");
      } finally {
        setSavingId(null);
      }
    },
    []
  );

  const submitInvite = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      try {
        setInviteLoading(true);
        setError("");

        const cleanEmail = inviteEmail.trim().toLowerCase();
        const cleanName = inviteName.trim();

        if (!cleanEmail) throw new Error("Email is required.");
        if (!inviteRole) throw new Error("Role is required.");

        const { data, error: fnError } = await supabase.functions.invoke("admin-invite-user", {
          body: {
            email: cleanEmail,
            full_name: cleanName || null,
            role: inviteRole,
          },
        });

        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);

        setInviteOpen(false);
        setInviteName("");
        setInviteEmail("");
        setInviteRole("estimator");

        alert(data?.message || "Invite sent successfully.");
      } catch (err: any) {
        console.error("invite error:", err);
        alert(err?.message || "Failed to send invite.");
      } finally {
        setInviteLoading(false);
      }
    },
    [inviteEmail, inviteName, inviteRole]
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-slate-500">Loading Company User Manager...</div>
        </div>
      </div>
    );
  }

  if (!isDirector) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-red-700">Access denied</h1>
          <p className="mt-2 text-sm text-red-600">
            Only directors can view and manage company users.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Company User Manager</h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage users for your company only.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Invite User
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total Users</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{stats.total}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Active</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{stats.active}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Disabled</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{stats.disabled}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Directors</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{stats.directors}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                    No users found for this company.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const busy = savingId === row.id;
                  const isMe = me?.id === row.id;

                  return (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-900">
                          {row.full_name?.trim() || "—"}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-sm text-slate-700">{row.email || "—"}</td>

                      <td className="px-4 py-4">
                        <select
                          value={row.role}
                          disabled={busy}
                          onChange={(e) =>
                            updateUser(row.id, {
                              role: e.target.value as CompanyUserRow["role"],
                            })
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                            row.status === "active"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {row.status === "active" ? (
                            <button
                              type="button"
                              disabled={busy || isMe}
                              onClick={() => updateUser(row.id, { status: "disabled" })}
                              className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                              title={isMe ? "You cannot disable yourself" : "Disable user"}
                            >
                              Disable
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => updateUser(row.id, { status: "active" })}
                              className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Reactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {inviteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Invite New User</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Send an invite to join your company.
                </p>
              </div>

              <button
                type="button"
                onClick={() => !inviteLoading && setInviteOpen(false)}
                className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={submitInvite} className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Full Name</label>
                <input
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Enter full name"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Enter email address"
                  required
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as CompanyUserRow["role"])}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setInviteOpen(false)}
                  disabled={inviteLoading}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {inviteLoading ? "Sending..." : "Send Invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}