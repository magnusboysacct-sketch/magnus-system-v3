// src/pages/SettingsMasterListsPage.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  PageHeader, Card, Badge, Btn, Input, Select, Field,
  Table, Th, Tr, Td, Empty, Modal, Alert, cn
} from "../components/ui";
import { Plus, Search, BookOpen, Edit2, Trash2, RefreshCw, ChevronLeft, ToggleLeft, ToggleRight } from "lucide-react";

type MasterUnit = {
  id: string;
  name: string;
  unit_type: string | null;
  is_active: boolean;
  sort_order: number | null;
};

const UNIT_TYPES = ["length", "area", "volume", "weight", "count", "time", "other"];

const EMPTY_FORM = { name: "", unit_type: "other", sort_order: "" };

export default function SettingsMasterListsPage() {
  const nav = useNavigate();
  const [units, setUnits] = useState<MasterUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editUnit, setEditUnit] = useState<MasterUnit | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadUnits(); }, []);

  async function loadUnits() {
    setLoading(true);
    try {
      const { data, error: e } = await supabase
        .from("master_units")
        .select("*")
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });
      if (e) throw e;
      setUnits(data || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function saveUnit() {
    setSaving(true); setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        unit_type: form.unit_type || null,
        sort_order: form.sort_order ? parseInt(form.sort_order) : null,
        is_active: true,
      };
      if (editUnit) {
        const { error: e } = await supabase.from("master_units").update(payload).eq("id", editUnit.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from("master_units").insert(payload);
        if (e) throw e;
      }
      await loadUnits();
      closeModal();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function toggleActive(unit: MasterUnit) {
    await supabase.from("master_units").update({ is_active: !unit.is_active }).eq("id", unit.id);
    setUnits(prev => prev.map(u => u.id === unit.id ? { ...u, is_active: !u.is_active } : u));
  }

  async function deleteUnit(id: string) {
    try {
      const { error: e } = await supabase.from("master_units").delete().eq("id", id);
      if (e) throw e;
      setUnits(prev => prev.filter(u => u.id !== id));
    } catch (e: any) { setError(e.message); }
  }

  function openEdit(unit: MasterUnit) {
    setEditUnit(unit);
    setForm({ name: unit.name, unit_type: unit.unit_type || "other", sort_order: unit.sort_order?.toString() || "" });
    setShowNew(true);
  }

  function closeModal() { setShowNew(false); setEditUnit(null); setForm(EMPTY_FORM); setError(null); }

  const filtered = units.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase());
    const matchType = !typeFilter || u.unit_type === typeFilter;
    return matchSearch && matchType;
  });

  const stats = { total: units.length, active: units.filter(u => u.is_active).length };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Master Units"
        subtitle={`${stats.total} units · ${stats.active} active`}
        back={() => nav("/settings")}
        actions={
          <>
            <Btn variant="ghost" size="sm" icon={<RefreshCw size={13} className={loading ? "animate-spin" : ""}/>} onClick={loadUnits}/>
            <Btn variant="primary" size="sm" icon={<Plus size={13}/>} onClick={() => { setEditUnit(null); setForm(EMPTY_FORM); setShowNew(true); }}>
              Add Unit
            </Btn>
          </>
        }
      />
      <div className="p-6 space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700"/>
            <Input className="pl-8" placeholder="Search units..." value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <Select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="w-36">
            <option value="">All types</option>
            {UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
        <Card padding={false}>
          <Table>
            <thead><tr><Th>Unit Name</Th><Th>Type</Th><Th>Sort Order</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
            <tbody>
              {loading ? (
                <tr><Td colSpan={5} className="text-center py-8 text-slate-600"><RefreshCw size={14} className="animate-spin inline mr-2"/>Loading...</Td></tr>
              ) : filtered.length === 0 ? (
                <tr><Td colSpan={5}><Empty icon={<BookOpen size={18}/>} title="No units found" action={<Btn variant="primary" size="sm" icon={<Plus size={12}/>} onClick={() => setShowNew(true)}>Add Unit</Btn>}/></Td></tr>
              ) : filtered.map(u => (
                <Tr key={u.id}>
                  <Td><span className="font-semibold text-slate-800 dark:text-slate-200">{u.name}</span></Td>
                  <Td><Badge color="slate">{u.unit_type || "—"}</Badge></Td>
                  <Td muted>{u.sort_order ?? "—"}</Td>
                  <Td>
                    <button onClick={() => toggleActive(u)} className="flex items-center gap-1.5 text-xs transition-colors"
                      style={{ color: u.is_active ? "#34d399" : "#64748b" }}>
                      {u.is_active ? <ToggleRight size={16}/> : <ToggleLeft size={16}/>}
                      {u.is_active ? "Active" : "Inactive"}
                    </button>
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(u)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"><Edit2 size={12}/></button>
                      <button onClick={() => deleteUnit(u.id)} className="p-1.5 rounded hover:bg-red-500/15 text-slate-600 hover:text-red-400 transition-colors"><Trash2 size={12}/></button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
      <Modal open={showNew} onClose={closeModal} title={editUnit ? "Edit Unit" : "Add Unit"}>
        <div className="space-y-4">
          {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
          <Field label="Unit Name"><Input placeholder="e.g. sq ft, m², each" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus/></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Type"><Select value={form.unit_type} onChange={e => setForm(f => ({ ...f, unit_type: e.target.value }))}>{UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</Select></Field>
            <Field label="Sort Order"><Input type="number" placeholder="0" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}/></Field>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
            <Btn variant="ghost" onClick={closeModal}>Cancel</Btn>
            <Btn variant="primary" onClick={saveUnit} disabled={!form.name.trim() || saving}>{saving ? "Saving..." : editUnit ? "Save" : "Add Unit"}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}