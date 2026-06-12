// src/pages/ClientsPage.tsx
import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useNavigate as useNav } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  PageHeader, Card, Badge, Btn, Input, Select, Field,
  Table, Th, Tr, Td, Empty, Modal, Alert, Textarea,
  Tabs, cn
} from "../components/ui";
import {
  Plus, Search, Building2, Phone, Mail,
  MapPin, ArrowRight, Edit2, Trash2, RefreshCw,
  LayoutGrid, List, User, FolderOpen
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

function ClientCard({ client, onEdit, onDelete, onPortalToggle, onCopyLink }: {
  client: Client;
  onEdit: (c: Client) => void;
  onDelete: (id: string) => void;
  onPortalToggle: (c: Client) => void;
  onCopyLink: (c: Client) => void;
}) {
  return (
    <Card className="group hover:border-white/[0.13] transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
          <Building2 size={16} className="text-blue-400" />
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(client)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors">
            <Edit2 size={12}/>
          </button>
          <button onClick={() => onPortalToggle(client)} title={client.portal_enabled ? "Disable Portal" : "Enable Portal"}
            className={`p-1.5 rounded-lg transition-colors ${client.portal_enabled ? "text-green-400 hover:bg-green-500/15" : "text-slate-600 hover:bg-white/10 hover:text-slate-300"}`}>
            <ArrowRight size={12}/>
          </button>
          <button onClick={() => onDelete(client.id)}
            className="p-1.5 rounded-lg hover:bg-red-500/15 text-slate-600 hover:text-red-400 transition-colors">
            <Trash2 size={12}/>
          </button>
        </div>
      </div>

      <div className="mb-3">
        <div className="text-sm font-semibold text-slate-100 mb-0.5 truncate">{client.name}</div>
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

      <div className="flex items-center justify-between pt-3 border-t border-white/[0.05]">
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
  const [clients, setClients] = useState<Client[]>([]);
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

  useEffect(() => { loadClients(); }, []);

  async function loadClients() {
    setLoading(true);
    try {
      const { data, error: e } = await supabase
        .from("clients")
        .select("*")
        .order("name", { ascending: true });
      if (e) throw e;
      setClients(data || []);
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
    total: clients.length,
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
            { label: "Total",    value: stats.total,    color: "text-slate-200",    key: "all" as Tab },
            { label: "Active",   value: stats.active,   color: "text-emerald-400",  key: "active" as Tab },
            { label: "Inactive", value: stats.inactive, color: "text-slate-500",    key: "inactive" as Tab },
          ].map(s => (
            <button key={s.key} onClick={() => setTab(s.key)}
              className={cn("rounded-xl border p-3 text-left transition-all",
                tab === s.key ? "border-cyan-500/30 bg-cyan-500/10" : "border-white/[0.07] bg-[#0c1018] hover:border-white/[0.12]")}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">{s.label}</div>
              <div className={cn("text-2xl font-bold", s.color)}>{s.value}</div>
            </button>
          ))}
        </div>

        {/* Search + view toggle */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700"/>
            <Input className="pl-8" placeholder="Search clients, contacts, email..."
              value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] p-1">
            <button onClick={() => setViewMode("grid")}
              className={cn("p-1.5 rounded-md transition-colors",
                viewMode === "grid" ? "bg-white/10 text-slate-200" : "text-slate-600 hover:text-slate-400")}>
              <LayoutGrid size={13}/>
            </button>
            <button onClick={() => setViewMode("list")}
              className={cn("p-1.5 rounded-md transition-colors",
                viewMode === "list" ? "bg-white/10 text-slate-200" : "text-slate-600 hover:text-slate-400")}>
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
                onPortalToggle={togglePortal}
                onCopyLink={copyPortalLink}
                onEdit={openEdit}
                onDelete={id => setDeleteConfirm(id)}
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
                        <span className="font-semibold text-slate-200">{c.name}</span>
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
                        <button onClick={() => openEdit(c)}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors">
                          <Edit2 size={12}/>
                        </button>
                        <button onClick={() => setDeleteConfirm(c.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/15 text-slate-600 hover:text-red-400 transition-colors">
                          <Trash2 size={12}/>
                        </button>
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

          <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
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
            <p className="text-xs text-slate-500 mb-2">Share this link:</p>
            <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-3 text-xs text-blue-500 break-all font-mono mb-4">{portalNotice.url}</div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => { navigator.clipboard.writeText(portalNotice!.url); setCopied(true); setTimeout(()=>setCopied(false),2000); }}
                className={`flex-1 py-2.5 text-white text-sm font-semibold rounded-xl transition-all ${copied ? "bg-green-600" : "bg-blue-600 hover:bg-blue-700"}`}>
                {copied ? "✓ Copied!" : "📋 Copy Link"}
              </button>
              <a href={portalNotice!.phone ? `https://wa.me/${portalNotice!.phone.replace(/\D/g,"")}?text=${encodeURIComponent("Hello " + (portalNotice!.name||"") + ",\n\nYour project portal is ready. Tap the link below to view your project updates, invoices and progress:\n\n" + portalNotice!.url + "\n\nThis link is private and secure.")}` : `https://wa.me/?text=${encodeURIComponent("View your project portal: " + portalNotice!.url)}`} target="_blank" rel="noreferrer"
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors text-center no-underline flex items-center justify-center">
                💬 WhatsApp
              </a>
              <a href={`mailto:${portalNotice!.email||""}?subject=${encodeURIComponent("Your Project Portal - " + portalNotice!.name)}&body=${encodeURIComponent("Hello " + portalNotice!.name + ",\n\nYou can view your project updates, invoices and progress here:\n\n" + portalNotice!.url + "\n\nBest regards,\n" + (portalNotice!.name||"The Team"))}`}
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
    </div>
  );
}
