// src/pages/MaterialsLibraryPage.tsx — Smart Materials Library
import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useCompanySettings } from "../hooks/useCompanySettings";
import {
  PageHeader, Card, Badge, Btn, Input, Select, Field,
  Table, Th, Tr, Td, Empty, Modal, Alert, Textarea, cn
} from "../components/ui";
import {
  Plus, Search, Package, Edit2, Trash2, RefreshCw,
  Download, Upload, Sparkles, TrendingUp, DollarSign,
  Filter, ChevronDown, ChevronUp, History, Tag, Layers
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Material {
  id: string;
  name: string;
  description: string | null;
  item_code: string | null;
  base_unit: string | null;
  category_id: string | null;
  price_jmd: number | null;
  price_usd: number | null;
  supplier_name: string | null;
  last_price_update: string | null;
  price_notes: string | null;
  ai_suggested: boolean | null;
  is_active: boolean;
  default_waste_percent: number | null;
}

interface Category { id: string; name: string; }
interface PriceHistory { id: string; price_jmd: number; price_usd: number; supplier_name: string|null; notes: string|null; created_at: string; }

const CATEGORIES_DEFAULT = [
  "Concrete & Masonry", "Lumber & Timber", "Steel & Metal",
  "Electrical", "Plumbing", "Paint & Finishes",
  "Hardware & Fasteners", "Roofing", "Flooring",
  "Insulation", "Tools & Equipment", "Labour", "Other"
];

const UNITS = ["bag", "each", "ft", "m", "m²", "sq ft", "lb", "kg", "gallon", "litre", "roll", "sheet", "box", "set", "pair", "bundle", "yard", "ton", "board"];

const JMD_USD_RATE = 157; // approximate JMD per USD

function fmt(n: number, currency = "JMD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
}

const EMPTY_FORM = {
  name: "", description: "", item_code: "", base_unit: "each",
  category_id: "", price_jmd: "", price_usd: "",
  supplier_name: "", price_notes: "", default_waste_percent: "0",
};

// ─── AI Price Suggestion ──────────────────────────────────────────────────────
async function getAIPriceSuggestion(itemName: string, unit: string): Promise<{jmd: number; usd: number; notes: string}|null> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `You are a Jamaica construction materials price expert. Give me a realistic current market price for: "${itemName}" per ${unit} in Jamaica.

Respond ONLY with this exact JSON format (no other text):
{"price_jmd": 1500, "price_usd": 10, "notes": "Hardware & Lumber Kingston estimate, prices vary by supplier"}

Use realistic Jamaica market prices. JMD/USD rate is approximately 157.`
        }]
      })
    });
    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return { jmd: parsed.price_jmd, usd: parsed.price_usd, notes: parsed.notes };
  } catch { return null; }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MaterialsLibraryPage() {
  const { settings: co } = useCompanySettings();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Material | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showHistory, setShowHistory] = useState<string | null>(null);
  const [history, setHistory] = useState<PriceHistory[]>([]);
  const [tab, setTab] = useState<"materials"|"categories"|"units">("materials");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: p } = await supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
      if (p?.company_id) {
        setCompanyId(p.company_id);
        await Promise.all([loadMaterials(p.company_id), loadCategories(p.company_id)]);
      }
    }
    init();
  }, []);

  async function loadMaterials(cid: string) {
    setLoading(true);
    const { data } = await supabase.from("items").select("*").eq("company_id", cid).eq("is_active", true).order("name");
    setMaterials(data || []);
    setLoading(false);
  }

  async function loadCategories(cid: string) {
    const { data } = await supabase.from("master_categories").select("id,name").order("name");
    if (data && data.length > 0) {
      setCategories(data);
    } else {
      // Create default categories
      const inserts = CATEGORIES_DEFAULT.map(name => ({ name, is_active: true, company_id: cid }));
      const { data: created } = await supabase.from("master_categories").insert(inserts).select("id,name");
      setCategories(created || []);
    }
  }

  async function saveMaterial() {
    if (!form.name.trim() || !companyId) return;
    setSaving(true); setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload: any = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        item_code: form.item_code.trim() || null,
        base_unit: form.base_unit || "each",
        category_id: form.category_id || null,
        price_jmd: form.price_jmd ? parseFloat(form.price_jmd) : null,
        price_usd: form.price_usd ? parseFloat(form.price_usd) : null,
        supplier_name: form.supplier_name.trim() || null,
        price_notes: form.price_notes.trim() || null,
        default_waste_percent: form.default_waste_percent ? parseFloat(form.default_waste_percent) : 0,
        last_price_update: new Date().toISOString(),
        company_id: companyId,
        is_active: true,
        item_kind: "material",
        updated_by: user?.id,
      };

      if (editItem) {
        await supabase.from("items").update(payload).eq("id", editItem.id);
        // Log price history
        if (form.price_jmd || form.price_usd) {
          await supabase.from("material_price_history").insert({
            item_id: editItem.id, company_id: companyId,
            price_jmd: parseFloat(form.price_jmd) || 0,
            price_usd: parseFloat(form.price_usd) || 0,
            supplier_name: form.supplier_name || null,
            notes: form.price_notes || null,
            updated_by: user?.id,
          });
        }
      } else {
        const { data: created } = await supabase.from("items").insert({ ...payload, created_by: user?.id }).select().single();
        if (created && (form.price_jmd || form.price_usd)) {
          await supabase.from("material_price_history").insert({
            item_id: created.id, company_id: companyId,
            price_jmd: parseFloat(form.price_jmd) || 0,
            price_usd: parseFloat(form.price_usd) || 0,
            supplier_name: form.supplier_name || null,
          });
        }
      }
      await loadMaterials(companyId);
      closeModal();
      setToast(editItem ? "Material updated!" : "Material added!");
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function deleteMaterial(id: string) {
    await supabase.from("items").update({ is_active: false }).eq("id", id);
    setMaterials(prev => prev.filter(m => m.id !== id));
    setDeleteConfirm(null);
    setToast("Material deleted.");
  }

  async function loadHistory(itemId: string) {
    const { data } = await supabase.from("material_price_history").select("*").eq("item_id", itemId).order("created_at", { ascending: false }).limit(10);
    setHistory(data || []);
    setShowHistory(itemId);
  }

  async function getAISuggestion() {
    if (!form.name.trim()) { setError("Enter item name first."); return; }
    setAiLoading(true); setError(null);
    const suggestion = await getAIPriceSuggestion(form.name, form.base_unit || "each");
    if (suggestion) {
      setForm(f => ({ ...f, price_jmd: suggestion.jmd.toString(), price_usd: suggestion.usd.toString(), price_notes: suggestion.notes }));
      setToast("AI price suggestion applied!");
    } else {
      setError("AI suggestion unavailable. Please enter price manually.");
    }
    setAiLoading(false);
  }

  function openEdit(m: Material) {
    setEditItem(m);
    setForm({
      name: m.name, description: m.description || "",
      item_code: m.item_code || "", base_unit: m.base_unit || "each",
      category_id: m.category_id || "", price_jmd: m.price_jmd?.toString() || "",
      price_usd: m.price_usd?.toString() || "", supplier_name: m.supplier_name || "",
      price_notes: m.price_notes || "", default_waste_percent: m.default_waste_percent?.toString() || "0",
    });
    setShowModal(true);
  }

  function closeModal() { setShowModal(false); setEditItem(null); setForm(EMPTY_FORM); setError(null); }

  // Auto-convert JMD to USD and vice versa
  function handlePriceJMD(val: string) {
    setForm(f => ({ ...f, price_jmd: val, price_usd: val ? (parseFloat(val) / JMD_USD_RATE).toFixed(2) : "" }));
  }
  function handlePriceUSD(val: string) {
    setForm(f => ({ ...f, price_usd: val, price_jmd: val ? (parseFloat(val) * JMD_USD_RATE).toFixed(2) : "" }));
  }

  // CSV Import
  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;
    const text = await file.text();
    const lines = text.split("\n").slice(1); // skip header
    const { data: { user } } = await supabase.auth.getUser();
    let count = 0;
    for (const line of lines) {
      const [name, unit, priceJmd, priceUsd, supplier, category] = line.split(",").map(s => s.trim().replace(/"/g, ""));
      if (!name) continue;
      await supabase.from("items").insert({
        name, base_unit: unit || "each",
        price_jmd: parseFloat(priceJmd) || null,
        price_usd: parseFloat(priceUsd) || null,
        supplier_name: supplier || null,
        company_id: companyId, is_active: true,
        item_kind: "material", created_by: user?.id,
        last_price_update: new Date().toISOString(),
      });
      count++;
    }
    await loadMaterials(companyId);
    setToast(`${count} items imported!`);
    if (csvRef.current) csvRef.current.value = "";
  }

  // CSV Export
  function exportCSV() {
    const rows = [
      ["Name", "Unit", "Price JMD", "Price USD", "Supplier", "Category", "Last Updated"],
      ...filtered.map(m => [
        m.name, m.base_unit || "", m.price_jmd || "", m.price_usd || "",
        m.supplier_name || "", getCatName(m.category_id), fmtDate(m.last_price_update)
      ])
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `materials-library-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  function getCatName(id: string | null) {
    return categories.find(c => c.id === id)?.name || "—";
  }

  const filtered = materials.filter(m => {
    const matchSearch = m.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.supplier_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (m.item_code || "").toLowerCase().includes(search.toLowerCase());
    const matchCat = !catFilter || m.category_id === catFilter;
    return matchSearch && matchCat;
  });

  const totalItems = materials.length;
  const withPrices = materials.filter(m => m.price_jmd || m.price_usd).length;
  const avgJmd = materials.filter(m=>m.price_jmd).reduce((s,m)=>s+(m.price_jmd||0),0) / (materials.filter(m=>m.price_jmd).length||1);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Materials Library"
        subtitle="Smart price database for Jamaica construction"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium transition-colors border border-white/10">
              <Download size={13}/> Export CSV
            </button>
            <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium transition-colors border border-white/10 cursor-pointer">
              <Upload size={13}/> Import CSV
              <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCSVImport}/>
            </label>
            <Btn variant="primary" size="sm" icon={<Plus size={13}/>} onClick={() => { setEditItem(null); setForm(EMPTY_FORM); setShowModal(true); }}>
              Add Material
            </Btn>
          </div>
        }
      />

      <div className="p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center"><Package size={15} className="text-blue-400"/></div>
              <div>
                <div className="text-2xl font-bold text-slate-100">{totalItems}</div>
                <div className="text-xs text-slate-500">Total Items</div>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center"><DollarSign size={15} className="text-green-400"/></div>
              <div>
                <div className="text-2xl font-bold text-green-400">{withPrices}</div>
                <div className="text-xs text-slate-500">With Prices</div>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center"><TrendingUp size={15} className="text-amber-400"/></div>
              <div>
                <div className="text-2xl font-bold text-amber-400">{avgJmd > 0 ? fmt(avgJmd) : "—"}</div>
                <div className="text-xs text-slate-500">Avg Price JMD</div>
              </div>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {[
            {id:"materials",label:"Materials",icon:<Package size={13}/>},
            {id:"categories",label:"Categories",icon:<Tag size={13}/>},
          ].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id as any)}
              className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                tab===t.id?"bg-blue-600 text-white":"bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 border border-white/10")}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {tab==="materials" && (
          <>
            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48 max-w-sm">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700"/>
                <Input className="pl-8" placeholder="Search materials, suppliers, codes..." value={search} onChange={e=>setSearch(e.target.value)}/>
              </div>
              <Select value={catFilter} onChange={e=>setCatFilter(e.target.value)} className="w-44">
                <option value="">All categories</option>
                {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Btn variant="ghost" size="sm" icon={<RefreshCw size={13} className={loading?"animate-spin":""}/>} onClick={()=>companyId&&loadMaterials(companyId)}/>
            </div>

            {/* CSV template hint */}
            <div className="text-xs text-slate-600 bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2">
              💡 CSV format: <span className="font-mono text-slate-500">Name, Unit, Price JMD, Price USD, Supplier, Category</span>
            </div>

            {/* Table */}
            <Card padding={false}>
              <Table>
                <thead>
                  <tr>
                    <Th>Item Name</Th>
                    <Th>Code</Th>
                    <Th>Unit</Th>
                    <Th>Category</Th>
                    <Th>Price JMD</Th>
                    <Th>Price USD</Th>
                    <Th>Supplier</Th>
                    <Th>Updated</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><Td colSpan={9} className="text-center py-12 text-slate-600"><RefreshCw size={14} className="animate-spin inline mr-2"/>Loading library…</Td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><Td colSpan={9}>
                      <Empty icon={<Package size={20}/>} title="No materials yet"
                        body="Add your first material or import from CSV."
                        action={<Btn variant="primary" size="sm" icon={<Plus size={12}/>} onClick={()=>setShowModal(true)}>Add Material</Btn>}/>
                    </Td></tr>
                  ) : filtered.map(m => (
                    <Tr key={m.id}>
                      <Td>
                        <div>
                          <div className="text-sm font-semibold text-slate-200">{m.name}</div>
                          {m.description && <div className="text-[10px] text-slate-600 truncate max-w-[200px]">{m.description}</div>}
                          {m.ai_suggested && <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-medium">AI ✨</span>}
                        </div>
                      </Td>
                      <Td muted>{m.item_code || "—"}</Td>
                      <Td><Badge color="slate">{m.base_unit || "—"}</Badge></Td>
                      <Td muted>{getCatName(m.category_id)}</Td>
                      <Td>
                        {m.price_jmd ? (
                          <span className="text-sm font-semibold text-green-400">{fmt(m.price_jmd)}</span>
                        ) : <span className="text-slate-700">—</span>}
                      </Td>
                      <Td>
                        {m.price_usd ? (
                          <span className="text-sm font-semibold text-blue-400">{fmt(m.price_usd, "USD")}</span>
                        ) : <span className="text-slate-700">—</span>}
                      </Td>
                      <Td muted>{m.supplier_name || "—"}</Td>
                      <Td muted>{fmtDate(m.last_price_update)}</Td>
                      <Td>
                        <div className="flex gap-1">
                          <button onClick={()=>loadHistory(m.id)} title="Price History"
                            className="p-1.5 rounded hover:bg-white/10 text-slate-600 hover:text-amber-400 transition-colors"><History size={12}/></button>
                          <button onClick={()=>openEdit(m)}
                            className="p-1.5 rounded hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors"><Edit2 size={12}/></button>
                          <button onClick={()=>setDeleteConfirm(m.id)}
                            className="p-1.5 rounded hover:bg-red-500/15 text-slate-600 hover:text-red-400 transition-colors"><Trash2 size={12}/></button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </>
        )}

        {tab==="categories" && (
          <Card padding={false}>
            <Table>
              <thead><tr><Th>Category Name</Th><Th>Items</Th></tr></thead>
              <tbody>
                {categories.map(c=>(
                  <Tr key={c.id}>
                    <Td><span className="font-semibold text-slate-200">{c.name}</span></Td>
                    <Td muted>{materials.filter(m=>m.category_id===c.id).length} items</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal open={showModal} onClose={closeModal} title={editItem?"Edit Material":"Add Material"}
        subtitle={editItem?`Editing ${editItem.name}`:"Add to your materials library"}>
        <div className="space-y-4">
          {error && <Alert type="error" onClose={()=>setError(null)}>{error}</Alert>}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Item Name">
              <Input placeholder="e.g. Portland Cement (50kg bag)" value={form.name}
                onChange={e=>setForm(f=>({...f,name:e.target.value}))} autoFocus/>
            </Field>
            <Field label="Item Code">
              <Input placeholder="e.g. CEM-001" value={form.item_code}
                onChange={e=>setForm(f=>({...f,item_code:e.target.value}))}/>
            </Field>
            <Field label="Unit">
              <Select value={form.base_unit} onChange={e=>setForm(f=>({...f,base_unit:e.target.value}))}>
                {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
              </Select>
            </Field>
          </div>

          <Field label="Category">
            <Select value={form.category_id} onChange={e=>setForm(f=>({...f,category_id:e.target.value}))}>
              <option value="">Select category</option>
              {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>

          {/* Price Section */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pricing</div>
              <button onClick={getAISuggestion} disabled={aiLoading||!form.name.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-xs font-medium border border-purple-500/20 transition-colors disabled:opacity-40">
                <Sparkles size={12}/> {aiLoading?"Getting AI price…":"Get AI Price"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price JMD (J$)">
                <Input type="number" placeholder="0.00" value={form.price_jmd}
                  onChange={e=>handlePriceJMD(e.target.value)}/>
              </Field>
              <Field label="Price USD ($)">
                <Input type="number" placeholder="0.00" value={form.price_usd}
                  onChange={e=>handlePriceUSD(e.target.value)}/>
              </Field>
            </div>
            <div className="text-[10px] text-slate-600">💱 Auto-converts at J$157 per US$1 (adjust manually if needed)</div>
            <Field label="Supplier / Source">
              <Input placeholder="e.g. Hardware & Lumber Kingston" value={form.supplier_name}
                onChange={e=>setForm(f=>({...f,supplier_name:e.target.value}))}/>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Waste % (optional)">
              <Input type="number" placeholder="0" value={form.default_waste_percent}
                onChange={e=>setForm(f=>({...f,default_waste_percent:e.target.value}))}/>
            </Field>
            <Field label="Description">
              <Input placeholder="Brief description" value={form.description}
                onChange={e=>setForm(f=>({...f,description:e.target.value}))}/>
            </Field>
          </div>

          {form.price_notes && (
            <div className="text-xs text-slate-500 bg-purple-500/5 border border-purple-500/15 rounded-lg px-3 py-2">
              🤖 {form.price_notes}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
            <Btn variant="ghost" onClick={closeModal}>Cancel</Btn>
            <Btn variant="primary" onClick={saveMaterial} disabled={!form.name.trim()||saving}>
              {saving?"Saving…":editItem?"Save Changes":"Add Material"}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Price History Modal */}
      <Modal open={!!showHistory} onClose={()=>setShowHistory(null)} title="Price History" subtitle="Previous prices for this item">
        <Table>
          <thead><tr><Th>Date</Th><Th>JMD</Th><Th>USD</Th><Th>Supplier</Th><Th>Notes</Th></tr></thead>
          <tbody>
            {history.length===0?(
              <tr><Td colSpan={5} className="text-center py-6 text-slate-600">No price history yet.</Td></tr>
            ):history.map(h=>(
              <Tr key={h.id}>
                <Td muted>{fmtDate(h.created_at)}</Td>
                <Td><span className="text-green-400 font-semibold">{h.price_jmd?fmt(h.price_jmd):"—"}</span></Td>
                <Td><span className="text-blue-400 font-semibold">{h.price_usd?fmt(h.price_usd,"USD"):"—"}</span></Td>
                <Td muted>{h.supplier_name||"—"}</Td>
                <Td muted>{h.notes||"—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Modal>

      {/* Delete Confirm */}
      <Modal open={!!deleteConfirm} onClose={()=>setDeleteConfirm(null)} title="Delete Material" width="max-w-sm">
        <div className="space-y-4">
          <Alert type="warning">This will remove the material from your library.</Alert>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={()=>setDeleteConfirm(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={()=>deleteConfirm&&deleteMaterial(deleteConfirm)}>Delete</Btn>
          </div>
        </div>
      </Modal>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 border border-green-500/30 text-green-400 text-sm font-semibold px-5 py-3 rounded-xl shadow-2xl z-50">
          ✓ {toast}
        </div>
      )}
      {toast && setTimeout(()=>setToast(null),3000) as any}
    </div>
  );
}
