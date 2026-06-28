// src/pages/CompanyUsersPage.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  PageHeader, Card, Badge, Btn, Input, Select, Field,
  Table, Th, Tr, Td, Empty, Modal, Alert, cn
} from "../components/ui";
import { Search, Users, Mail, RefreshCw, Trash2, Shield, Clock, RotateCcw, XCircle } from "lucide-react";

type UserProfile = {
  id: string;
  full_name: string | null;
  role: string | null;
  company_id: string | null;
  email?: string | null;
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string | null;
  created_at: string;
};

const ROLE_COLOR: Record<string, any> = {
  director: "cyan", admin: "violet", project_manager: "blue",
  site_supervisor: "green", estimator: "amber", procurement: "orange",
  accounts: "purple", viewer: "slate",
};

// Roles must match user_profiles.role CHECK constraint and edge function allowedRoles
const ROLES = ["director", "admin", "project_manager", "site_supervisor", "estimator", "procurement", "accounts", "viewer"];

export default function CompanyUsersPage() {
  const nav = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setCurrentUserId(user.id);
      supabase.from("user_profiles").select("company_id, role").eq("id", user.id).maybeSingle()
        .then(({ data }) => {
          if (data?.company_id) setCompanyId(data.company_id);
          if (data?.role) setCurrentUserRole(data.role);
        });
    });
  }, []);

  useEffect(() => { if (companyId) loadAll(); }, [companyId]);

  async function loadAll() {
    setLoading(true);
    try {
      const [usersRes, invitesRes] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("id, role, company_id, full_name, email")
          .eq("company_id", companyId!),
        supabase
          .from("company_invitations")
          .select("id, email, role, status, expires_at, created_at")
          .eq("company_id", companyId!)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
      ]);
      if (usersRes.error) throw usersRes.error;
      setUsers(usersRes.data || []);
      setInvitations(invitesRes.data || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function updateRole(userId: string, role: string) {
    try {
      const { error: e } = await supabase.from("user_profiles").update({ role }).eq("id", userId);
      if (e) throw e;
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
    } catch (e: any) { setError(e.message); }
  }

  async function deleteUser() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data, error: e } = await supabase.functions.invoke("admin-remove-user", {
        body: { userId: deleteTarget.id },
      });
      const msg = data?.error || (e ? e.message : null);
      if (msg) throw new Error(msg);
      setUsers(prev => prev.filter(u => u.id !== deleteTarget.id));
      setDeleteTarget(null);
      setSuccess(`${deleteTarget.full_name || "User"} has been removed.`);
    } catch (e: any) { setError(e.message); }
    finally { setDeleting(false); }
  }

  async function revokeInvite(inviteId: string) {
    try {
      const { error: e } = await supabase
        .from("company_invitations")
        .update({ status: "revoked", updated_at: new Date().toISOString() })
        .eq("id", inviteId);
      if (e) throw e;
      setInvitations(prev => prev.filter(i => i.id !== inviteId));
    } catch (e: any) { setError(e.message); }
  }

  async function resendInvite(inv: Invitation) {
    setSaving(true); setError(null); setSuccess(null);
    try {
      const { data, error: e } = await supabase.functions.invoke("admin-invite-user", {
        body: { email: inv.email, role: inv.role },
      });
      const resendMsg = data?.error || (e ? e.message : null);
      if (resendMsg) throw new Error(resendMsg);
      setSuccess(`Invite resent to ${inv.email}`);
      await loadAll();
    } catch (e: any) {
      setError(e.message || "Failed to resend invite.");
    } finally { setSaving(false); }
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) { setError("Email is required."); return; }
    setSaving(true); setError(null); setSuccess(null);
    try {
      const { data, error: e } = await supabase.functions.invoke("admin-invite-user", {
        body: { email: inviteEmail.trim().toLowerCase(), role: inviteRole },
      });
      const sendMsg = data?.error || (e ? e.message : null);
      if (sendMsg) throw new Error(sendMsg);
      setSuccess(`Invite sent to ${inviteEmail}`);
      setInviteEmail(""); setInviteRole("viewer");
      await loadAll();
      setTimeout(() => { setShowInvite(false); setSuccess(null); }, 2000);
    } catch (e: any) {
      setError(e.message || "Failed to send invite. Make sure you have director access.");
    } finally { setSaving(false); }
  }

  function initials(name: string | null) {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  }

  function isExpired(inv: Invitation) {
    if (!inv.expires_at) return false;
    return new Date(inv.expires_at) < new Date();
  }

  const isDirector = currentUserRole === "director";

  const filtered = users.filter(u =>
    (u.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.role || "").toLowerCase().includes(search.toLowerCase())
  );

  const filteredInvites = invitations.filter(i =>
    i.email.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: users.length,
    pending: invitations.length,
    byRole: ROLES.map(r => ({ role: r, count: users.filter(u => u.role === r).length })).filter(r => r.count > 0),
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Team Members"
        subtitle={`${stats.total} active · ${stats.pending} pending`}
        back={() => nav("/settings")}
        actions={
          <>
            <Btn variant="ghost" size="sm" icon={<RefreshCw size={13} className={loading ? "animate-spin" : ""} />} onClick={loadAll} />
            <Btn variant="primary" size="sm" icon={<Mail size={13}/>} onClick={() => setShowInvite(true)}>
              Invite User
            </Btn>
          </>
        }
      />

      <div className="p-6 space-y-5">
        {/* Role breakdown */}
        <div className="flex flex-wrap gap-2">
          {stats.byRole.map(r => (
            <div key={r.role} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0c1018] px-3 py-2">
              <Badge color={ROLE_COLOR[r.role] || "slate"}>{r.role}</Badge>
              <span className="text-xs font-semibold text-slate-400">{r.count}</span>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700"/>
          <Input className="pl-8" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>

        {/* Global alerts */}
        {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
        {success && <Alert type="success" onClose={() => setSuccess(null)}>{success}</Alert>}

        {/* Active users table */}
        <Card padding={false}>
          <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.06] flex items-center gap-2">
            <Users size={13} className="text-cyan-400" />
            <span className="text-xs font-semibold text-slate-300">Active Members</span>
            <span className="text-xs text-slate-600 ml-auto">{users.length} total</span>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><Td colSpan={3} className="text-center py-8 text-slate-600">
                  <RefreshCw size={14} className="animate-spin inline mr-2" />Loading...
                </Td></tr>
              ) : filtered.length === 0 ? (
                <tr><Td colSpan={3}>
                  <Empty icon={<Users size={18} />} title="No users found"
                    action={<Btn variant="primary" size="sm" icon={<Mail size={12} />} onClick={() => setShowInvite(true)}>Invite User</Btn>} />
                </Td></tr>
              ) : filtered.map(u => (
                <Tr key={u.id} highlight={u.id === currentUserId}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0",
                        u.id === currentUserId ? "bg-cyan-500/20 text-cyan-300" : "bg-white/[0.06] text-slate-400")}>
                        {initials(u.full_name)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-200">
                          {u.full_name || "Unknown"}
                          {u.id === currentUserId && <span className="ml-2 text-[9px] text-cyan-500 font-bold uppercase tracking-widest">You</span>}
                        </div>
                        <div className="text-[10px] text-slate-600">{u.email || `ID: ${u.id.slice(0, 8)}…`}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    {isDirector && u.id !== currentUserId ? (
                      <Select
                        value={u.role || "viewer"}
                        onChange={e => updateRole(u.id, e.target.value)}
                        className="w-36 py-1 text-xs"
                      >
                        {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                      </Select>
                    ) : (
                      <Badge color={ROLE_COLOR[u.role || "viewer"] || "slate"} dot>
                        {(u.role || "viewer").replace(/_/g, " ")}
                      </Badge>
                    )}
                  </Td>
                  <Td>
                    {u.id !== currentUserId && isDirector ? (
                      <Btn
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 size={13} className="text-red-400" />}
                        onClick={() => setDeleteTarget(u)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        Remove
                      </Btn>
                    ) : (
                      <span className="text-[10px] text-slate-700">—</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>

        {/* Pending invitations */}
        {filteredInvites.length > 0 && (
          <Card padding={false}>
            <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.06] flex items-center gap-2">
              <Clock size={13} className="text-amber-400" />
              <span className="text-xs font-semibold text-slate-300">Pending Invitations</span>
              <span className="text-xs text-slate-600 ml-auto">{filteredInvites.length} waiting</span>
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filteredInvites.map(inv => (
                  <Tr key={inv.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                          <Mail size={13} className="text-amber-400" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-300">{inv.email}</div>
                          <div className="text-[10px] text-slate-600">
                            Sent {new Date(inv.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <Badge color={ROLE_COLOR[inv.role] || "slate"}>
                        {inv.role.replace(/_/g, " ")}
                      </Badge>
                    </Td>
                    <Td>
                      {isExpired(inv) ? (
                        <Badge color="red" dot>Expired</Badge>
                      ) : (
                        <Badge color="amber" dot>Pending</Badge>
                      )}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Btn
                          variant="ghost"
                          size="sm"
                          icon={<RotateCcw size={12} />}
                          onClick={() => resendInvite(inv)}
                          disabled={saving}
                          className="text-slate-400 hover:text-slate-200"
                        >
                          Resend
                        </Btn>
                        <Btn
                          variant="ghost"
                          size="sm"
                          icon={<XCircle size={12} className="text-red-400" />}
                          onClick={() => revokeInvite(inv.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          Revoke
                        </Btn>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        {/* Role descriptions */}
        <Card>
          <div className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Shield size={13} className="text-cyan-400" /> Role Permissions
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { role: "director",        desc: "Full access, billing, delete company" },
              { role: "admin",           desc: "Full access except billing" },
              { role: "project_manager", desc: "All modules, no settings" },
              { role: "site_supervisor", desc: "Field ops, progress updates" },
              { role: "estimator",       desc: "BOQ, Takeoff, Estimates only" },
              { role: "procurement",     desc: "Purchase orders, suppliers" },
              { role: "accounts",        desc: "Finance, invoices, payments" },
              { role: "viewer",          desc: "Read-only access" },
            ].map(r => (
              <div key={r.role} className="rounded-lg bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.05] p-2.5">
                <Badge color={ROLE_COLOR[r.role] || "slate"} dot>{r.role.replace(/_/g, " ")}</Badge>
                <div className="text-[10px] text-slate-600 mt-1.5">{r.desc}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Invite Modal */}
      <Modal open={showInvite} onClose={() => { setShowInvite(false); setError(null); setSuccess(null); }}
        title="Invite User" subtitle="Send an invitation email to a new team member">
        <div className="space-y-4">
          {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
          {success && <Alert type="success">{success}</Alert>}
          <Field label="Email Address">
            <Input type="email" placeholder="colleague@company.com"
              value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} autoFocus />
          </Field>
          <Field label="Role">
            <Select value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
              {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
            <Btn variant="ghost" onClick={() => setShowInvite(false)}>Cancel</Btn>
            <Btn variant="primary" icon={<Mail size={13} />} onClick={sendInvite}
              disabled={!inviteEmail.trim() || saving}>
              {saving ? "Sending..." : "Send Invite"}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        title="Remove Team Member" subtitle="This will revoke their access immediately">
        <div className="space-y-4">
          {deleteTarget && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4">
              <p className="text-sm text-slate-300">
                Remove <strong className="text-white">{deleteTarget.full_name || deleteTarget.email || "this user"}</strong> from your team?
              </p>
              <p className="text-xs text-slate-500 mt-2">
                They will immediately lose access to all company data.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
            <Btn variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Btn>
            <Btn variant="danger" icon={<Trash2 size={13} />} onClick={deleteUser} disabled={deleting}>
              {deleting ? "Removing..." : "Remove Member"}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}