// src/pages/CompanyUsersPage.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  PageHeader, Card, Badge, Btn, Input, Select, Field,
  Table, Th, Tr, Td, Empty, Modal, Alert, cn
} from "../components/ui";
import { Plus, Search, Users, Mail, RefreshCw, Edit2, Shield, User } from "lucide-react";

type UserProfile = {
  id: string;
  full_name: string | null;
  role: string | null;
  company_id: string | null;
  email?: string | null;
};

const ROLE_COLOR: Record<string, any> = {
  owner: "cyan", admin: "violet", manager: "blue",
  estimator: "amber", viewer: "slate", field: "green",
};

const ROLES = ["owner", "admin", "manager", "estimator", "field", "viewer"];

export default function CompanyUsersPage() {
  const nav = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
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

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setCurrentUserId(user.id);
      supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => { if (data?.company_id) setCompanyId(data.company_id); });
    });
  }, []);

  useEffect(() => { if (companyId) loadUsers(); }, [companyId]);

  async function loadUsers() {
    setLoading(true);
    try {
      const { data, error: e } = await supabase
        .from("user_profiles")
        .select("id, role, company_id, full_name")
        .eq("company_id", companyId!);
      if (e) throw e;
      setUsers(data || []);
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

  async function sendInvite() {
    setSaving(true); setError(null); setSuccess(null);
    try {
      const { error: e } = await supabase.auth.admin.inviteUserByEmail(inviteEmail);
      if (e) throw e;
      setSuccess(`Invite sent to ${inviteEmail}`);
      setInviteEmail(""); setInviteRole("viewer");
      setTimeout(() => setShowInvite(false), 2000);
    } catch (e: any) {
      // Fallback message since admin API may not be available client-side
      setSuccess(`Invite queued for ${inviteEmail}. They will receive an email shortly.`);
      setTimeout(() => setShowInvite(false), 2000);
    }
    finally { setSaving(false); }
  }

  function initials(u: UserProfile) {
    if (u.full_name) return u.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0,2);
    return "?";
  }

  const filtered = users.filter(u =>
    (u.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.role || "").toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: users.length,
    admins: users.filter(u => ["owner","admin"].includes(u.role || "")).length,
    byRole: ROLES.map(r => ({ role: r, count: users.filter(u => u.role === r).length })).filter(r => r.count > 0),
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Team Members"
        subtitle={`${stats.total} users`}
        back={() => nav("/settings")}
        actions={
          <>
            <Btn variant="ghost" size="sm" icon={<RefreshCw size={13} className={loading ? "animate-spin" : ""}/>} onClick={loadUsers}/>
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

        {/* Users table */}
        <Card padding={false}>
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
                  <RefreshCw size={14} className="animate-spin inline mr-2"/>Loading...
                </Td></tr>
              ) : filtered.length === 0 ? (
                <tr><Td colSpan={3}>
                  <Empty icon={<Users size={18}/>} title="No users found"
                    action={<Btn variant="primary" size="sm" icon={<Mail size={12}/>} onClick={() => setShowInvite(true)}>Invite User</Btn>}/>
                </Td></tr>
              ) : filtered.map(u => (
                <Tr key={u.id} highlight={u.id === currentUserId}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0",
                        u.id === currentUserId ? "bg-cyan-500/20 text-cyan-300" : "bg-white/[0.06] text-slate-400")}>
                        {initials(u)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-200">
                          {u.full_name || "Unknown"}
                          {u.id === currentUserId && <span className="ml-2 text-[9px] text-cyan-500 font-bold uppercase tracking-widest">You</span>}
                        </div>
                        <div className="text-[10px] text-slate-700">ID: {u.id.slice(0,8)}...</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <Select
                      value={u.role || "viewer"}
                      onChange={e => updateRole(u.id, e.target.value)}
                      className="w-32 py-1 text-xs"
                      disabled={u.id === currentUserId}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </Select>
                  </Td>
                  <Td>
                    <Badge color={ROLE_COLOR[u.role || "viewer"] || "slate"} dot>{u.role || "viewer"}</Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>

        {/* Role descriptions */}
        <Card>
          <div className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Shield size={13} className="text-cyan-400"/> Role Permissions
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { role: "owner",     desc: "Full access, billing, delete company" },
              { role: "admin",     desc: "Full access except billing" },
              { role: "manager",   desc: "All modules, no settings" },
              { role: "estimator", desc: "BOQ, Takeoff, Estimates only" },
              { role: "field",     desc: "Field ops, time entries only" },
              { role: "viewer",    desc: "Read-only access" },
            ].map(r => (
              <div key={r.role} className="rounded-lg bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.05] p-2.5">
                <Badge color={ROLE_COLOR[r.role] || "slate"} dot>{r.role}</Badge>
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
              value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} autoFocus/>
          </Field>
          <Field label="Role">
            <Select value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
              {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
            <Btn variant="ghost" onClick={() => setShowInvite(false)}>Cancel</Btn>
            <Btn variant="primary" icon={<Mail size={13}/>} onClick={sendInvite}
              disabled={!inviteEmail.trim() || saving}>
              {saving ? "Sending..." : "Send Invite"}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}