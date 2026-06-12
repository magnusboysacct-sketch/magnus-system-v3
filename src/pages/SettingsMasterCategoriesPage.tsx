// src/pages/SettingsMasterCategoriesPage.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  PageHeader, Card, Badge, Btn, Input, Field,
  Table, Th, Tr, Td, Empty, Modal, Alert, Textarea, cn
} from "../components/ui";
import { Plus, Search, Tag, Edit2, Trash2, RefreshCw, ToggleLeft, ToggleRight } from "lucide-react";

type MasterCategory = {
  id: string;
  name: string;
  scope_of_work: string | null;
  is_active: boolean;
  sort_order: number | null;
};

const EMPTY_FORM = { name: "", scope_of_work: "", sort_order: "" };

export default function SettingsMasterCategoriesPage() {
  const nav = useNavigate();
  const [cats, setCats] = useState<MasterCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editCat, setEditCat] = useState<MasterCategory | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadCats(); }, []);

  async function loadCats() {
    setLoading(true);
    try {
      const { data, error: e } = await supabase
        .from("master_categories")
        .select("id, name, scope_of_work, is_active, sort_order")
        .order("name", { ascending: true });
      if (e) throw e;
      setCats(data || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function saveCat() {
    setSaving(true); setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        scope_of_work: form.scope_of_work.trim() || null,
        sort_order: form.sort_order ? parseInt(form.sort_order) : null,
        is_active: true,
      };
      if (editCat) {
        const { error: e } = await supabase.from("master_categories").update(payload).eq("id", editCat.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from("master_categories").insert(payload);
        if (e) throw e;
      }
      await loadCats(); closeModal();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function toggleActive(cat: MasterCategory) {
    await supabase.from("master_categories").update({ is_active: !cat.is_active }).eq("id", cat.id);
    setCats(prev => prev.map(c => c.id === cat.id ? { ...c, is_active: !c.is_active } : c));
  }

  async function deleteCat(id: string) {
    try {
      const { error: e } = await supabase.from("master_categories").delete().eq("id", id);
      if (e) throw e;
      setCats(prev => prev.filter(c => c.id !== id));
    } catch (e: any) { setError(e.message); }
  }

  function openEdit(cat: MasterCategory) {
    setEditCat(cat);
    setForm({ name: cat.name, scope_of_work: cat.scope_of_work || "", sort_order: cat.sort_order?.toString() || "" });
    setShowNew(true);
  }

  function closeModal() { setShowNew(false); setEditCat(null); setForm(EMPTY_FORM); setError(null); }

  const filtered = cats.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || (c.scope_of_work || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Master Categories"
        subtitle={`${cats.length} categories · ${cats.filter(c => c.is_active).length} active`}
        back={() => nav("/settings")}
        actions={
          <>
            <Btn variant="ghost" size="sm" icon={<RefreshCw size={13} className={loading ? "animate-spin" : ""}/>} onClick={loadCats}/>
            <Btn variant="primary" size="sm" icon={<Plus size={13}/>} onClick={() => { setEditCat(null); setForm(EMPTY_FORM); setShowNew(true); }}>
              Add Category
            </Btn>
          </>
        }
      />
      <div className="p-6 space-y-4">
        <div className="relative max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700"/>
          <Input className="pl-8" placeholder="Search categories..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <Card padding={false}>
          <Table>
            <thead><tr><Th>Category Name</Th><Th>Scope of Work</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
            <tbody>
              {loading ? (
                <tr><Td colSpan={4} className="text-center py-8 text-slate-600"><RefreshCw size={14} className="animate-spin inline mr-2"/>Loading...</Td></tr>
              ) : filtered.length === 0 ? (
                <tr><Td colSpan={4}><Empty icon={<Tag size={18}/>} title="No categories found" action={<Btn variant="primary" size="sm" icon={<Plus size={12}/>} onClick={() => setShowNew(true)}>Add Category</Btn>}/></Td></tr>
              ) : filtered.map(c => (
                <Tr key={c.id}>
                  <Td><span className="font-semibold text-slate-200">{c.name}</span></Td>
                  <Td muted className="max-w-xs truncate">{c.scope_of_work || "—"}</Td>
                  <Td>
                    <button onClick={() => toggleActive(c)} className="flex items-center gap-1.5 text-xs transition-colors"
                      style={{ color: c.is_active ? "#34d399" : "#64748b" }}>
                      {c.is_active ? <ToggleRight size={16}/> : <ToggleLeft size={16}/>}
                      {c.is_active ? "Active" : "Inactive"}
                    </button>
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors"><Edit2 size={12}/></button>
                      <button onClick={() => deleteCat(c.id)} className="p-1.5 rounded hover:bg-red-500/15 text-slate-600 hover:text-red-400 transition-colors"><Trash2 size={12}/></button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
      <Modal open={showNew} onClose={closeModal} title={editCat ? "Edit Category" : "Add Category"}>
        <div className="space-y-4">
          {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
          <Field label="Category Name"><Input placeholder="e.g. Concrete Works" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus/></Field>
          <Field label="Scope of Work (optional)"><Textarea rows={2} placeholder="Brief description of this category..." value={form.scope_of_work} onChange={e => setForm(f => ({ ...f, scope_of_work: e.target.value }))}/></Field>
          <Field label="Sort Order"><Input type="number" placeholder="0" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}/></Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
            <Btn variant="ghost" onClick={closeModal}>Cancel</Btn>
            <Btn variant="primary" onClick={saveCat} disabled={!form.name.trim() || saving}>{saving ? "Saving..." : editCat ? "Save" : "Add Category"}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
