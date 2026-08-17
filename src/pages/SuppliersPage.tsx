// src/pages/SuppliersPage.tsx
//
// Vendors/Suppliers list — mirrors ClientsPage.tsx's structure (grid/list
// toggle, search, tab filter, create/edit modal, delete confirmation), minus
// the client-portal/messaging pieces that don't apply to suppliers. Uses the
// existing src/lib/suppliers.ts CRUD (listSuppliers/createSupplier/
// updateSupplier/deleteSupplier), not a fresh inline implementation, so the
// same shared, now-pagination-safe fetch backs both this page and
// ProcurementPage.tsx's supplier picker.
import React, { useEffect, useState } from "react";
import {
  listSuppliers, createSupplier, updateSupplier, deleteSupplier,
  type Supplier,
} from "../lib/suppliers";
import { useProjectContext } from "../context/ProjectContext";
import {
  PageHeader, Card, Badge, Btn, Input, Select, Field,
  Table, Th, Tr, Td, Empty, Modal, Alert, Textarea,
  cn
} from "../components/ui";
import {
  Plus, Search, Truck, Phone, Mail,
  MapPin, Edit2, Trash2, RefreshCw,
  LayoutGrid, List, User, CreditCard as CreditCardIcon,
} from "lucide-react";

type ViewMode = "grid" | "list";
type Tab = "all" | "active" | "inactive";

const EMPTY_FORM = {
  supplier_name: "", contact_name: "", phone: "",
  email: "", address: "", payment_terms: "", notes: "", is_active: true,
};

// ─── Supplier Card ────────────────────────────────────────────────────────────

function SupplierCard({ supplier, canDelete, onEdit, onDelete }: {
  supplier: Supplier;
  canDelete: boolean;
  onEdit: (s: Supplier) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card className="group hover:border-slate-300 dark:hover:border-white/[0.13] transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
          <Truck size={16} className="text-orange-400" />
        </div>
        <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(supplier)}
            className="p-2 rounded-lg hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors">
            <Edit2 size={14}/>
          </button>
          {canDelete && (
            <button onClick={() => onDelete(supplier.id)}
              className="p-2 rounded-lg hover:bg-red-500/15 text-slate-600 hover:text-red-400 transition-colors">
              <Trash2 size={14}/>
            </button>
          )}
        </div>
      </div>

      <div className="mb-3">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-0.5 truncate">{supplier.supplier_name}</div>
        {supplier.contact_name && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
            <User size={9}/> {supplier.contact_name}
          </div>
        )}
      </div>

      <div className="space-y-1.5 mb-4">
        {supplier.phone && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
            <Phone size={9} className="flex-shrink-0"/> {supplier.phone}
          </div>
        )}
        {supplier.email && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600 truncate">
            <Mail size={9} className="flex-shrink-0"/> {supplier.email}
          </div>
        )}
        {supplier.address && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
            <MapPin size={9} className="flex-shrink-0"/>
            <span className="truncate">{supplier.address}</span>
          </div>
        )}
        {supplier.payment_terms && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
            <CreditCardIcon size={9} className="flex-shrink-0"/>
            <span className="truncate">{supplier.payment_terms}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-white/[0.05]">
        <Badge color={supplier.is_active ? "green" : "slate"} dot>
          {supplier.is_active ? "active" : "inactive"}
        </Badge>
        <div className="text-[9px] text-slate-700">
          {new Date(supplier.created_at).toLocaleDateString()}
        </div>
      </div>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const { userRole } = useProjectContext();
  const canDelete = userRole === "director" || userRole === "site_supervisor";
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [showNew, setShowNew] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => { loadSuppliers(); }, []);

  async function loadSuppliers() {
    setLoading(true);
    try {
      const data = await listSuppliers(false);
      setSuppliers(data);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function saveSupplier() {
    setSaving(true); setError(null);
    try {
      const input = {
        supplier_name: form.supplier_name.trim(),
        contact_name: form.contact_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        payment_terms: form.payment_terms.trim() || null,
        notes: form.notes.trim() || null,
        is_active: form.is_active,
      };
      if (editSupplier) {
        await updateSupplier(editSupplier.id, input);
      } else {
        await createSupplier(input);
      }
      await loadSuppliers();
      closeModal();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    try {
      await deleteSupplier(id);
      setSuppliers(prev => prev.filter(s => s.id !== id));
      setDeleteConfirm(null);
    } catch (e: any) { setError(e.message); }
  }

  function openEdit(supplier: Supplier) {
    setEditSupplier(supplier);
    setForm({
      supplier_name: supplier.supplier_name,
      contact_name: supplier.contact_name || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      payment_terms: supplier.payment_terms || "",
      notes: supplier.notes || "",
      is_active: supplier.is_active,
    });
    setShowNew(true);
  }

  function closeModal() {
    setShowNew(false);
    setEditSupplier(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  // Filter — is_active is a real boolean column (not a text status enum
  // like Clients' status), so the tab match branches on it directly rather
  // than a string comparison.
  const filtered = suppliers.filter(s => {
    const matchSearch =
      s.supplier_name.toLowerCase().includes(search.toLowerCase()) ||
      (s.contact_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (s.email || "").toLowerCase().includes(search.toLowerCase());
    const matchTab = tab === "all" || (tab === "active" ? s.is_active : !s.is_active);
    return matchSearch && matchTab;
  });

  const stats = {
    total: suppliers.length,
    active: suppliers.filter(s => s.is_active).length,
    inactive: suppliers.filter(s => !s.is_active).length,
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Vendors"
        subtitle={`${stats.total} total · ${stats.active} active`}
        actions={
          <>
            <Btn variant="ghost" size="sm"
              icon={<RefreshCw size={13} className={loading ? "animate-spin" : ""}/>}
              onClick={loadSuppliers}/>
            <Btn variant="primary" size="sm" icon={<Plus size={13}/>}
              onClick={() => { setEditSupplier(null); setForm(EMPTY_FORM); setShowNew(true); }}>
              New Vendor
            </Btn>
          </>
        }
      />

      <div className="p-6 space-y-5">
        {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}

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
            <Input className="pl-8" placeholder="Search vendors, contacts, email..."
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
            <RefreshCw size={14} className="animate-spin mr-2"/> Loading vendors...
          </div>
        ) : filtered.length === 0 ? (
          <Empty
            icon={<Truck size={20}/>}
            title={search ? "No vendors match your search" : "No vendors yet"}
            body={search ? "Try a different search term." : "Add your first vendor to get started."}
            action={
              !search
                ? <Btn variant="primary" icon={<Plus size={13}/>}
                    onClick={() => { setEditSupplier(null); setForm(EMPTY_FORM); setShowNew(true); }}>
                    Add Vendor
                  </Btn>
                : <Btn variant="ghost" onClick={() => setSearch("")}>Clear search</Btn>
            }
          />
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(s => (
              <SupplierCard key={s.id} supplier={s} canDelete={canDelete}
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
                  <Th>Vendor</Th>
                  <Th>Contact</Th>
                  <Th>Phone</Th>
                  <Th>Email</Th>
                  <Th>Payment Terms</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <Tr key={s.id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
                          <Truck size={11} className="text-orange-400"/>
                        </div>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{s.supplier_name}</span>
                      </div>
                    </Td>
                    <Td muted>{s.contact_name || "—"}</Td>
                    <Td muted>{s.phone || "—"}</Td>
                    <Td muted>{s.email || "—"}</Td>
                    <Td muted>{s.payment_terms || "—"}</Td>
                    <Td>
                      <Badge color={s.is_active ? "green" : "slate"} dot>
                        {s.is_active ? "active" : "inactive"}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(s)}
                          className="p-2 rounded-lg hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors">
                          <Edit2 size={13}/>
                        </button>
                        {canDelete && (
                          <button onClick={() => setDeleteConfirm(s.id)}
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

      {/* New / Edit Vendor Modal */}
      <Modal
        open={showNew}
        onClose={closeModal}
        title={editSupplier ? "Edit Vendor" : "New Vendor"}
        subtitle={editSupplier ? `Editing ${editSupplier.supplier_name}` : "Add a new vendor to your system"}
      >
        <div className="space-y-4">
          {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}

          <Field label="Vendor Name">
            <Input placeholder="e.g. ABC Building Supplies"
              value={form.supplier_name}
              onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))}
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

          <div className="grid grid-cols-2 gap-4">
            <Field label="Payment Terms">
              <Input placeholder="e.g. Net 30, COD"
                value={form.payment_terms}
                onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))}/>
            </Field>
            <Field label="Status">
              <Select value={form.is_active ? "active" : "inactive"}
                onChange={e => setForm(f => ({ ...f, is_active: e.target.value === "active" }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          </div>

          <Field label="Notes (optional)">
            <Textarea rows={2} placeholder="Any additional notes..."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}/>
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
            <Btn variant="ghost" onClick={closeModal}>Cancel</Btn>
            <Btn variant="primary" onClick={saveSupplier}
              disabled={!form.supplier_name.trim() || saving}>
              {saving ? "Saving..." : editSupplier ? "Save Changes" : "Add Vendor"}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}
        title="Delete Vendor" subtitle="This action cannot be undone." width="max-w-sm">
        <div className="space-y-4">
          <Alert type="warning">
            This will permanently delete the vendor and cannot be undone. Bills or purchase orders linked to this vendor will not be deleted.
          </Alert>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>
              Delete Vendor
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
