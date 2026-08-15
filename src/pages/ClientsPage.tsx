// src/pages/ClientsPage.tsx
import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useNavigate as useNav } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import {
  PageHeader, Card, Badge, Btn, Input, Select, Field,
  Table, Th, Tr, Td, Empty, Modal, Alert, Textarea,
  Tabs, cn
} from "../components/ui";
import {
  Plus, Search, Building2, Phone, Mail,
  MapPin, ArrowRight, Edit2, Trash2, RefreshCw,
  LayoutGrid, List, User, FolderOpen, MessageCircle, Send
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Client = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: "active" | "inactive";
  portal_enabled: boolean | null;
  portal_token: string | null;
  created_at: string;
  updated_at: string;
};

type Comment = {
  id: string;
  client_id: string;
  project_id: string | null;
  message: string;
  sender_type: "client" | "staff";
  sender_id: string | null;
  read_at: string | null;
  created_at: string;
};

type ViewMode = "grid" | "list";
type Tab = "all" | "active" | "inactive";

// Always use production domain for portal links
const PORTAL_BASE = window.location.hostname === "localhost" 
  ? window.location.origin 
  : "https://app.magnusboys.com";

const EMPTY_FORM = {
  name: "", contact_name: "", phone: "",
  email: "", address: "", notes: "", status: "active" as "active" | "inactive"
};

// ─── Client Card ──────────────────────────────────────────────────────────────

function ClientCard({ client, unreadCount, onEdit, onDelete, onPortalToggle, onResetPassword, onMessage }: {
  client: Client;
  unreadCount: number;
  onEdit: (c: Client) => void;
  onDelete: (id: string) => void;
  onPortalToggle: (c: Client) => void;
  onResetPassword: (c: Client) => void;
  onMessage: (c: Client) => void;
}) {
  const { userRole } = useProjectContext();
  const canDelete = userRole === "director";
  return (
    <Card className="group hover:border-slate-300 dark:hover:border-white/[0.13] transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
          <Building2 size={16} className="text-blue-400" />
        </div>
        <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <button onClick={() => onMessage(client)} title="Messages"
            className="relative p-2 rounded-lg hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors">
            <MessageCircle size={14}/>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          <button onClick={() => onEdit(client)}
            className="p-2 rounded-lg hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors">
            <Edit2 size={14}/>
          </button>
          <button onClick={() => onPortalToggle(client)} title={client.portal_enabled ? "Disable Portal" : "Enable Portal"}
            className={`p-2 rounded-lg transition-colors ${client.portal_enabled ? "text-green-400 hover:bg-green-500/15" : "text-slate-600 hover:bg-white/10 hover:text-slate-300"}`}>
            <ArrowRight size={14}/>
          </button>
          {client.portal_enabled && (
            <button onClick={()=>onResetPassword(client)} title="Reset Portal Password"
              className="p-2 rounded-lg text-amber-500 hover:bg-amber-500/15 transition-colors">
              🔑
            </button>
          )}
          {canDelete && (
            <button onClick={() => onDelete(client.id)}
              className="p-2 rounded-lg hover:bg-red-500/15 text-slate-600 hover:text-red-400 transition-colors">
              <Trash2 size={14}/>
            </button>
          )}
        </div>
      </div>

      <div className="mb-3">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-0.5 truncate">{client.name}</div>
        {client.contact_name && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
            <User size={9}/> {client.contact_name}
          </div>
        )}
      </div>

      <div className="space-y-1.5 mb-4">
        {client.phone && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
            <Phone size={9} className="flex-shrink-0"/> {client.phone}
          </div>
        )}
        {client.email && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600 truncate">
            <Mail size={9} className="flex-shrink-0"/> {client.email}
          </div>
        )}
        {client.address && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
            <MapPin size={9} className="flex-shrink-0"/>
            <span className="truncate">{client.address}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-white/[0.05]">
        <Badge color={client.status === "active" ? "green" : "slate"} dot>
          {client.status}
        </Badge>
        <div className="text-[9px] text-slate-700">
          {new Date(client.created_at).toLocaleDateString()}
        </div>
      </div>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const nav = useNavigate();
  const { userRole } = useProjectContext();
  const canDelete = userRole === "director";
  const [clients, setClients] = useState<Client[]>([]);
  // Exact row count, independent of the fetch below — see loadClients().
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [showNew, setShowNew] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [portalNotice, setPortalNotice] = useState<{name:string;url:string;phone?:string|null;email?:string|null} | null>(null);
  const [copied, setCopied] = useState(false);
  const portalNoticeRef = useRef<{name:string;url:string} | null>(null);

  // Messaging — client-scoped (not project-scoped), so it works whether or
  // not the client has a project yet. See ProjectDashboardPage.tsx for the
  // existing per-project thread this deliberately doesn't replace; this one
  // is the client-independent counterpart clients already have via the
  // portal's own always-available "Messages" panel.
  const [currentUser, setCurrentUser] = useState<{id:string; full_name?:string} | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [messagingClient, setMessagingClient] = useState<Client | null>(null);
  const [messages, setMessages] = useState<Comment[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => { loadClients(); loadUnreadCounts(); }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        supabase.from("user_profiles").select("id, full_name").eq("id", data.user.id).maybeSingle()
          .then(({ data: profile }) => setCurrentUser(profile));
      }
    });
  }, []);

  async function loadUnreadCounts() {
    const { data } = await supabase.from("client_comments")
      .select("client_id").eq("sender_type", "client").is("read_at", null);
    const counts: Record<string, number> = {};
    (data || []).forEach((row: any) => { counts[row.client_id] = (counts[row.client_id] || 0) + 1; });
    setUnreadCounts(counts);
  }

  async function openMessages(client: Client) {
    setMessagingClient(client);
    setLoadingMessages(true);
    try {
      const { data } = await supabase.from("client_comments")
        .select("*").eq("client_id", client.id).order("created_at", { ascending: true });
      setMessages(data || []);
      if (unreadCounts[client.id]) {
        await supabase.from("client_comments").update({ read_at: new Date().toISOString() })
          .eq("client_id", client.id).eq("sender_type", "client").is("read_at", null);
        setUnreadCounts(prev => { const next = { ...prev }; delete next[client.id]; return next; });
      }
    } finally {
      setLoadingMessages(false);
    }
  }

  function closeMessages() {
    setMessagingClient(null);
    setMessages([]);
    setNewMessage("");
  }

  async function sendMessage() {
    if (!newMessage.trim() || !messagingClient || !currentUser) return;
    setSendingMessage(true);
    try {
      const { data, error: e } = await supabase.from("client_comments").insert({
        client_id: messagingClient.id,
        project_id: null,
        message: newMessage.trim(),
        sender_type: "staff",
        sender_id: currentUser.id,
      }).select().single();
      if (!e && data) { setMessages(prev => [...prev, data]); setNewMessage(""); }
    } finally {
      setSendingMessage(false);
    }
  }

  async function loadClients() {
    setLoading(true);
    try {
      // PostgREST silently caps an unranged .select() at its default
      // max-rows (1000) — same bug confirmed and fixed on ExpensesPage.tsx.
      // .range() raises that ceiling explicitly; the separate exact-count
      // query isn't subject to the same row-return cap, so it keeps the
      // headline total correct even past the .range() bound.
      const [{ data, error: e }, { count }] = await Promise.all([
        supabase.from("clients").select("*").order("name", { ascending: true }).range(0, 49999),
        supabase.from("clients").select("*", { count: "exact", head: true }),
      ]);
      if (e) throw e;
      setClients(data || []);
      setTotalCount(count ?? null);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function saveClient() {
    setSaving(true); setError(null);
    try {
      if (editClient) {
        // Update
        const { error: e } = await supabase.from("clients").update({
          name: form.name.trim(),
          contact_name: form.contact_name.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          address: form.address.trim() || null,
          notes: form.notes.trim() || null,
          status: form.status,
        }).eq("id", editClient.id);
        if (e) throw e;
      } else {
        // Insert — get company_id first
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not logged in");
        const { data: profile } = await supabase
          .from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();

        if (!profile?.company_id) {
          throw new Error("Could not determine your company. Please contact support.");
        }

        const { error: e } = await supabase.from("clients").insert({
          name: form.name.trim(),
          contact_name: form.contact_name.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          address: form.address.trim() || null,
          notes: form.notes.trim() || null,
          status: form.status,
          company_id: profile?.company_id,
        });
        if (e) throw e;
      }
      await loadClients();
      closeModal();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

    async function togglePortal(client: Client) {
    if (client.portal_enabled) {
      await supabase.from("clients").update({ portal_enabled: false }).eq("id", client.id);
      setClients(prev => prev.map(cl => cl.id === client.id ? {...cl, portal_enabled: false} : cl));
    } else {
      const token = client.portal_token || crypto.randomUUID();
      await supabase.from("clients").update({ portal_enabled: true, portal_token: token }).eq("id", client.id);
      setClients(prev => prev.map(cl => cl.id === client.id ? {...cl, portal_enabled: true, portal_token: token} : cl));
      const url = `${PORTAL_BASE}/portal/${token}`;
      setPortalNotice({ name: client.name, url, phone: client.phone, email: client.email });
    }
  }

  function copyPortalLink(client: Client) {
    if (!client.portal_token) { alert("Enable the portal first."); return; }
    const url = `${PORTAL_BASE}/portal/${client.portal_token}`;
    navigator.clipboard.writeText(url);
    alert(`Portal link copied!\n\n${url}`);
  }

  async function resetPortalPassword(client: Client) {
    if (!confirm(`Reset portal password for ${client.name}? They will need to create a new password on next login.`)) return;
    await supabase.from("clients").update({
      portal_password_hash: null,
      portal_activated_at: null
    }).eq("id", client.id);
    alert(`Password reset for ${client.name}. They can now set a new password at app.magnusboys.com/client-login`);
  }

  async function deleteClient(id: string) {
    try {
      const { error: e } = await supabase.from("clients").delete().eq("id", id);
      if (e) throw e;
      setClients(prev => prev.filter(c => c.id !== id));
      setDeleteConfirm(null);
    } catch (e: any) { setError(e.message); }
  }

  function openEdit(client: Client) {
    setEditClient(client);
    setForm({
      name: client.name,
      contact_name: client.contact_name || "",
      phone: client.phone || "",
      email: client.email || "",
      address: client.address || "",
      notes: client.notes || "",
      status: client.status,
    });
    setShowNew(true);
  }

  function closeModal() {
    setShowNew(false);
    setEditClient(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  // Filter
  const filtered = clients.filter(c => {
    const matchSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.contact_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.email || "").toLowerCase().includes(search.toLowerCase());
    const matchTab = tab === "all" || c.status === tab;
    return matchSearch && matchTab;
  });

  const stats = {
    total: totalCount ?? clients.length,
    active: clients.filter(c => c.status === "active").length,
    inactive: clients.filter(c => c.status === "inactive").length,
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Clients"
        subtitle={`${stats.total} total · ${stats.active} active`}
        actions={
          <>
            <Btn variant="ghost" size="sm"
              icon={<RefreshCw size={13} className={loading ? "animate-spin" : ""}/>}
              onClick={loadClients}/>
            <Btn variant="primary" size="sm" icon={<Plus size={13}/>}
              onClick={() => { setEditClient(null); setForm(EMPTY_FORM); setShowNew(true); }}>
              New Client
            </Btn>
          </>
        }
      />

      <div className="p-6 space-y-5">
        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total",    value: stats.total,    color: "text-slate-800 dark:text-slate-200",    key: "all" as Tab },
            { label: "Active",   value: stats.active,   color: "text-emerald-400",  key: "active" as Tab },
            { label: "Inactive", value: stats.inactive, color: "text-slate-500",    key: "inactive" as Tab },
          ].map(s => (
            <button key={s.key} onClick={() => setTab(s.key)}
              className={cn("rounded-xl border p-3 text-left transition-all",
                    tab === s.key ? "border-cyan-500/30 bg-cyan-500/10" : "border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0c1018] hover:border-slate-300 dark:hover:border-white/[0.12]")}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">{s.label}</div>
              <div className={cn("text-2xl font-bold", s.color)}>{s.value}</div>
            </button>
          ))}
        </div>

        {/* Search + view toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] sm:max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700"/>
            <Input className="pl-8" placeholder="Search clients, contacts, email..."
              value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] p-1">
            <button onClick={() => setViewMode("grid")}
              className={cn("p-1.5 rounded-md transition-colors",
                viewMode === "grid" ? "bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-slate-200" : "text-slate-600 hover:text-slate-400")}>
              <LayoutGrid size={13}/>
            </button>
            <button onClick={() => setViewMode("list")}
              className={cn("p-1.5 rounded-md transition-colors",
                viewMode === "list" ? "bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-slate-200" : "text-slate-600 hover:text-slate-400")}>
              <List size={13}/>
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-xs text-slate-600">
            <RefreshCw size={14} className="animate-spin mr-2"/> Loading clients...
          </div>
        ) : filtered.length === 0 ? (
          <Empty
            icon={<Building2 size={20}/>}
            title={search ? "No clients match your search" : "No clients yet"}
            body={search ? "Try a different search term." : "Add your first client to get started."}
            action={
              !search
                ? <Btn variant="primary" icon={<Plus size={13}/>}
                    onClick={() => { setEditClient(null); setForm(EMPTY_FORM); setShowNew(true); }}>
                    Add Client
                  </Btn>
                : <Btn variant="ghost" onClick={() => setSearch("")}>Clear search</Btn>
            }
          />
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(c => (
              <ClientCard key={c.id} client={c}
                unreadCount={unreadCounts[c.id] || 0}
                onPortalToggle={togglePortal}
                onEdit={openEdit}
                onDelete={id => setDeleteConfirm(id)}
                onResetPassword={resetPortalPassword}
                onMessage={openMessages}
              />
            ))}
          </div>
        ) : (
          <Card padding={false}>
            <Table>
              <thead>
                <tr>
                  <Th>Client</Th>
                  <Th>Contact</Th>
                  <Th>Phone</Th>
                  <Th>Email</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <Tr key={c.id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                          <Building2 size={11} className="text-blue-400"/>
                        </div>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{c.name}</span>
                      </div>
                    </Td>
                    <Td muted>{c.contact_name || "—"}</Td>
                    <Td muted>{c.phone || "—"}</Td>
                    <Td muted>{c.email || "—"}</Td>
                    <Td>
                      <Badge color={c.status === "active" ? "green" : "slate"} dot>
                        {c.status}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openMessages(c)} title="Messages"
                          className="relative p-2 rounded-lg hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors">
                          <MessageCircle size={13}/>
                          {(unreadCounts[c.id] || 0) > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center leading-none">
                              {unreadCounts[c.id] > 9 ? "9+" : unreadCounts[c.id]}
                            </span>
                          )}
                        </button>
                        <button onClick={() => openEdit(c)}
                          className="p-2 rounded-lg hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors">
                          <Edit2 size={13}/>
                        </button>
                        {canDelete && (
                          <button onClick={() => setDeleteConfirm(c.id)}
                            className="p-2 rounded-lg hover:bg-red-500/15 text-slate-600 hover:text-red-400 transition-colors">
                            <Trash2 size={13}/>
                          </button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>

      {/* New / Edit Client Modal */}
      <Modal
        open={showNew}
        onClose={closeModal}
        title={editClient ? "Edit Client" : "New Client"}
        subtitle={editClient ? `Editing ${editClient.name}` : "Add a new client to your system"}
      >
        <div className="space-y-4">
          {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}

          <Field label="Company / Client Name">
            <Input placeholder="e.g. ABC Construction Ltd"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              autoFocus/>
          </Field>

          <Field label="Contact Person">
            <Input placeholder="e.g. John Smith"
              value={form.contact_name}
              onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}/>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone">
              <Input placeholder="e.g. 876-555-0100"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}/>
            </Field>
            <Field label="Email">
              <Input type="email" placeholder="e.g. john@abc.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}/>
            </Field>
          </div>

          <Field label="Address">
            <Input placeholder="e.g. 12 Main Street, Kingston"
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}/>
          </Field>

          <Field label="Status">
            <Select value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value as "active" | "inactive" }))}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>

          <Field label="Notes (optional)">
            <Textarea rows={2} placeholder="Any additional notes..."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}/>
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
            <Btn variant="ghost" onClick={closeModal}>Cancel</Btn>
            <Btn variant="primary" onClick={saveClient}
              disabled={!form.name.trim() || saving}>
              {saving ? "Saving..." : editClient ? "Save Changes" : "Add Client"}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      {portalNotice && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">✅ Portal Enabled!</div>
            <p className="text-sm text-slate-500 mb-2">Portal activated for <strong>{portalNotice.name}</strong>.</p>
            <div className="flex gap-3 mb-3 text-xs text-slate-500">
              {portalNotice.phone && <span>📞 {portalNotice.phone}</span>}
              {portalNotice.email && <span>✉️ {portalNotice.email}</span>}
            </div>
            <p className="text-xs text-slate-500 mb-2">Client Login Page:</p>
            <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-3 text-xs text-blue-500 break-all font-mono mb-4">{portalNotice.url}</div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => { navigator.clipboard.writeText(portalNotice!.url); setCopied(true); setTimeout(()=>setCopied(false),2000); }}
                className={`flex-1 py-2.5 text-white text-sm font-semibold rounded-xl transition-all ${copied ? "bg-green-600" : "bg-blue-600 hover:bg-blue-700"}`}>
                {copied ? "✓ Copied!" : "📋 Copy Link"}
              </button>
              <a href={portalNotice!.phone ? `https://wa.me/${portalNotice!.phone.replace(/\D/g,"")}?text=${encodeURIComponent("Hello " + (portalNotice!.name||"") + ",\n\nYour project portal is ready!\n\n" + portalNotice!.url + "\n\nSign in with your email: " + (portalNotice!.email||"your email") + "\n\nFirst time? You will be asked to create a password.\n\nMagnus Boys Construction")}` : `https://wa.me/?text=${encodeURIComponent("View your project portal: " + portalNotice!.url)}`} target="_blank" rel="noreferrer"
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors text-center no-underline flex items-center justify-center">
                💬 WhatsApp
              </a>
              <a href={`mailto:${portalNotice!.email||""}?subject=${encodeURIComponent("Your Project Portal - " + portalNotice!.name)}&body=${encodeURIComponent("Hello " + portalNotice!.name + ",\n\nYour client portal is ready.\n\nVisit: " + portalNotice!.url + "\n\nSign in with your email: " + (portalNotice!.email||"your registered email") + "\n\nIf this is your first visit, you will be prompted to create a password.\n\nBest regards,\nMagnus Boys Construction")}`}
                className="flex-1 py-2.5 bg-slate-600 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors text-center no-underline flex items-center justify-center">
                ✉️ Email
              </a>
            </div>
            <button onClick={() => { setPortalNotice(null); setCopied(false); }} className="w-full mt-2 py-2 text-slate-500 text-xs hover:text-slate-300 transition-colors">Close</button>
          </div>
        </div>
      )}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}
        title="Delete Client" subtitle="This action cannot be undone." width="max-w-sm">
        <div className="space-y-4">
          <Alert type="warning">
            This will permanently delete the client and cannot be undone. Any projects linked to this client will not be deleted.
          </Alert>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={() => deleteConfirm && deleteClient(deleteConfirm)}>
              Delete Client
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Messages Modal — client-scoped, no project required. Shows the
          full history for this client regardless of project_id, so it's
          also the more complete view compared to a single project's
          Messages tab (which only shows that one project's thread). */}
      <Modal open={!!messagingClient} onClose={closeMessages}
        title={messagingClient ? `Messages — ${messagingClient.name}` : "Messages"}
        subtitle={messagingClient?.contact_name || messagingClient?.email || undefined}
        width="max-w-lg">
        <div className="flex flex-col" style={{ height: 420 }}>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-3">
            {loadingMessages ? (
              <div className="flex items-center justify-center h-full text-xs text-slate-500">
                <RefreshCw size={14} className="animate-spin mr-2"/> Loading...
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-slate-500 text-center px-6">
                No messages yet. {messagingClient?.portal_enabled ? "Their portal is active — say hello!" : "Their portal isn't enabled yet, so they can't reply until it is."}
              </div>
            ) : messages.map(m => {
              const isStaff = m.sender_type === "staff";
              return (
                <div key={m.id} className={cn("flex", isStaff ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[75%] rounded-xl px-3 py-2",
                    isStaff ? "bg-cyan-600 text-white" : "bg-slate-100 dark:bg-white/[0.06] text-slate-800 dark:text-slate-200")}>
                    <p className="text-sm leading-snug whitespace-pre-wrap break-words">{m.message}</p>
                    <span className={cn("text-[10px] block mt-1", isStaff ? "text-cyan-100" : "text-slate-500")}>
                      {isStaff ? "You" : messagingClient?.contact_name || messagingClient?.name || "Client"} · {new Date(m.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-end gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
            <Textarea rows={2} placeholder="Type a message..." className="flex-1"
              value={newMessage} onChange={e => setNewMessage(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}/>
            <Btn variant="primary" icon={<Send size={13}/>} onClick={sendMessage}
              disabled={!newMessage.trim() || sendingMessage}>
              {sendingMessage ? "..." : "Send"}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}