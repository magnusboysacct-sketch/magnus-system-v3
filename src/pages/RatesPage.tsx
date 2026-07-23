import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import MasterCategorySelect from "../components/master/MasterCategorySelect.tsx";
import MasterUnitSelect from "../components/master/MasterUnitSelect.tsx";
import EditableDropdown from "../components/common/EditableDropdown.tsx";
import { useMasterLists } from "../hooks/useMasterLists";
import { useProjectContext } from "../context/ProjectContext";
import { buildDefaultVars, computeQuantity } from "../lib/calculatorEngine";
import { SmartItemSelectorButton } from "../components/SmartItemSelectorButton";
import AIPriceLookup from "../components/AIPriceLookup";
import {
  Plus, Download, Upload, RefreshCw, Zap, RotateCcw,
  Edit2, Trash2, ChevronDown, Search, Package,
  Layers, Wrench, Users, MoreHorizontal, Copy
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const ITEM_TYPES = ["Material","Labor","Equipment","Subcontract","Other"] as const;

const STANDARD_UNITS = [
  "each","ft","m","in","ft²","m²","ft³","m³","yd³",
  "bag","box","roll","lb","kg","ton","gal","L",
  "hour","day","week","sq yd","sq m"
] as const;

const TYPE_STYLE: Record<string,{pill:string;icon:React.ReactNode}> = {
  Material:   {pill:"bg-blue-500/10 text-blue-400 border-blue-500/20",   icon:<Package size={10}/>},
  Labor:      {pill:"bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon:<Users size={10}/>},
  Equipment:  {pill:"bg-amber-500/10 text-amber-400 border-amber-500/20", icon:<Wrench size={10}/>},
  Subcontract:{pill:"bg-purple-500/10 text-purple-400 border-purple-500/20",icon:<Layers size={10}/>},
  Other:      {pill:"bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20", icon:<MoreHorizontal size={10}/>},
};

const FORMULA_BADGE: Record<string,{label:string;pill:string}> = {
  length:    {label:"Length",    pill:"bg-blue-500/15 text-blue-400 border-blue-500/20"},
  area:      {label:"Area",      pill:"bg-green-500/15 text-green-400 border-green-500/20"},
  volume:    {label:"Volume",    pill:"bg-purple-500/15 text-purple-400 border-purple-500/20"},
  count:     {label:"Count",     pill:"bg-orange-500/15 text-orange-400 border-orange-500/20"},
  weight:    {label:"Weight",    pill:"bg-red-500/15 text-red-400 border-red-500/20"},
  coverage:  {label:"Coverage",  pill:"bg-cyan-500/15 text-cyan-400 border-cyan-500/20"},
  labor:     {label:"Labor",     pill:"bg-emerald-500/15 text-emerald-400 border-emerald-500/20"},
  perimeter: {label:"Perimeter", pill:"bg-amber-500/15 text-amber-400 border-amber-500/20"},
};

// ─── Types ────────────────────────────────────────────────────────────────────
type CostItem = {
  id: string;
  item_name: string;
  description: string | null;
  cost_code: string | null;
  variant: string | null;
  grade: string | null;
  unit: string | null;
  category: string | null;
  item_type: string | null;
  updated_at: string | null;
  current_rate: number | null;
  current_currency: string | null;
  current_effective_date: string | null;
  current_source: string | null;
  current_batch_id: string | null;
};

type ImportRow = {
  rowNum: number;
  cost_code: string;
  item_name: string;
  rate: number | null;
  currency: string;
  unit?: string;
  category?: string;
  item_type?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normCategory(c: string | null | undefined) {
  const t = (c || "").trim();
  return t ? t : "Uncategorized";
}
function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
}
function formatMoney(n: number | null) {
  if (n == null || !isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD",minimumFractionDigits:2}).format(n);
}
function csvEscape(v: any) {
  const s = v == null ? "" : String(v);
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
  return s;
}
function downloadCsv(filename: string, rows: any[][]) {
  const content = rows.map(r=>r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([content],{type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function slug3(s: string) {
  const t=(s||"").toUpperCase().replace(/&/g," AND ").replace(/[^A-Z0-9]+/g," ").trim().split(" ").filter(Boolean);
  return t.slice(0,3).join("").slice(0,8)||"MISC";
}
function typePrefix(t: string) {
  const x=(t||"").toLowerCase();
  if(x==="material") return "MAT";
  if(x==="labor")    return "LAB";
  if(x==="equipment")return "EQP";
  if(x==="subcontract")return "SUB";
  return "OTH";
}
function pad3(n: number){return String(n).padStart(3,"0");}
function nextCodeFor(category: string, itemType: string, existing: CostItem[]) {
  const catKey=slug3(category);
  const pre=typePrefix(itemType);
  const base=`${pre}-${catKey}-`;
  let max=0;
  for(const it of existing){
    const c=(it.cost_code||"").toUpperCase();
    if(!c.startsWith(base)) continue;
    const num=Number(c.slice(base.length));
    if(Number.isFinite(num)) max=Math.max(max,num);
  }
  return `${base}${pad3(max+1)}`;
}
function parseCsvText(text: string):{headers:string[];rows:string[][]}{
  const rows:string[][]=[];
  let cur="",inQuotes=false,row:string[]=[];
  const pushCell=()=>{row.push(cur);cur="";};
  const pushRow=()=>{rows.push(row);row=[];};
  for(let i=0;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(ch==='"'){if(inQuotes&&next==='"'){cur+='"';i++;}else{inQuotes=!inQuotes;}continue;}
    if(!inQuotes&&ch===","){pushCell();continue;}
    if(!inQuotes&&ch==="\n"){pushCell();pushRow();continue;}
    if(!inQuotes&&ch==="\r")continue;
    cur+=ch;
  }
  pushCell();if(row.length)pushRow();
  const headers=(rows.shift()||[]).map(h=>h.trim());
  return{headers,rows};
}
function normalizeHeader(h:string){return h.trim().toLowerCase().replace(/\s+/g,"_");}
function toNum(v:string){const n=Number(String(v||"").replace(/,/g,"").trim());return isFinite(n)?n:null;}

// ─── SmartCombobox ────────────────────────────────────────────────────────────
function SmartCombobox(props:{value:string;options:string[];onChange:(v:string)=>void;placeholder?:string;widthClassName?:string}){
  const{value,options,onChange,placeholder="Search…",widthClassName="w-full"}=props;
  const[open,setOpen]=useState(false);
  const[q,setQ]=useState("");
  const wrapRef=useRef<HTMLDivElement|null>(null);
  const inputRef=useRef<HTMLInputElement|null>(null);
  useEffect(()=>{
    function onDoc(e:MouseEvent){if(wrapRef.current&&!wrapRef.current.contains(e.target as Node))setOpen(false);}
    document.addEventListener("mousedown",onDoc);
    return()=>document.removeEventListener("mousedown",onDoc);
  },[]);
  const filtered=useMemo(()=>{const qq=q.trim().toLowerCase();return qq?options.filter(o=>o.toLowerCase().includes(qq)):options;},[options,q]);
  return(
    <div ref={wrapRef} className={`relative ${widthClassName}`}>
      <button type="button" onClick={()=>{setOpen(v=>!v);setTimeout(()=>inputRef.current?.focus(),0);}}
        className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-left hover:bg-slate-200 dark:bg-white/[0.07] transition flex items-center justify-between text-slate-700 dark:text-slate-300">
        <span className="truncate">{value||"Select…"}</span>
        <ChevronDown size={13} className="opacity-50 flex-shrink-0"/>
      </button>
      {open&&(
        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1117] shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-slate-200 dark:border-white/[0.06]">
            <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} placeholder={placeholder}
              className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-2 py-1.5 text-sm outline-none focus:border-blue-500/50 text-slate-800 dark:text-slate-200 placeholder:text-slate-500 dark:text-slate-600"/>
          </div>
          <div className="max-h-64 overflow-auto">
            {filtered.map(opt=>(
              <button key={opt} type="button" onClick={()=>{onChange(opt);setOpen(false);setQ("");}}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-200 dark:bg-white/[0.06] transition ${value===opt?"bg-slate-200 dark:bg-white/[0.06] text-blue-400":"text-slate-700 dark:text-slate-300"}`}
                title={opt}>{opt}</button>
            ))}
            {filtered.length===0&&<div className="px-3 py-3 text-sm text-slate-500 dark:text-slate-600">No matches.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RatesPage() {
  const { categories, refresh: refreshCategories } = useMasterLists();
  const { userRole } = useProjectContext();
  const canDelete = userRole === "director";
  const canEdit = userRole === "director" || userRole === "estimator";
  const [items,setItems]=useState<CostItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [companyId,setCompanyId]=useState<string>("");
  const [categoryFilter,setCategoryFilter]=useState<string>("__ALL__");
  const [search,setSearch]=useState("");
  const [typeFilter,setTypeFilter]=useState<Record<string,boolean>>({Material:true,Labor:true,Equipment:true,Subcontract:true,Other:true});
  const [editingId,setEditingId]=useState<string|null>(null);
  const [editingRate,setEditingRate]=useState<string>("");
  const [editingCatId,setEditingCatId]=useState<string|null>(null);
  const [editingCatValue,setEditingCatValue]=useState<string>("");
  const [editingTypeId,setEditingTypeId]=useState<string|null>(null);
  const [editingTypeValue,setEditingTypeValue]=useState<string>("");
  const [editingDescId,setEditingDescId]=useState<string|null>(null);
  const [editingDescValue,setEditingDescValue]=useState<string>("");
  const [editingCodeId,setEditingCodeId]=useState<string|null>(null);
  const [editingCodeValue,setEditingCodeValue]=useState<string>("");
  const [busy,setBusy]=useState(false);
  const [isModalOpen,setIsModalOpen]=useState(false);
  const [mode,setMode]=useState<"add"|"edit">("add");
  const [activeId,setActiveId]=useState<string|null>(null);
  const [autoCode,setAutoCode]=useState(true);
  const [bulkOpen,setBulkOpen]=useState(false);
  const [bulkTitle,setBulkTitle]=useState("Bulk rate update");
  const [bulkReason,setBulkReason]=useState("");
  const [bulkMode,setBulkMode]=useState<"percent"|"add"|"set">("percent");
  const [bulkValue,setBulkValue]=useState<string>("");
  const [lastBulkBatches,setLastBulkBatches]=useState<string[]>([]);
  const [exportOpen,setExportOpen]=useState(false);
  const [importOpen,setImportOpen]=useState(false);
  const [importTitle,setImportTitle]=useState("CSV import");
  const [importReason,setImportReason]=useState("");
  const [importCsvName,setImportCsvName]=useState<string>("");
  const [importRows,setImportRows]=useState<ImportRow[]>([]);
  const [importMatched,setImportMatched]=useState<{src:ImportRow;matchId:string;matchName:string}[]>([]);
  const [importUnmatched,setImportUnmatched]=useState<ImportRow[]>([]);
  const fileInputRef=useRef<HTMLInputElement|null>(null);
  const todayISO=new Date().toISOString().slice(0,10);
  const [bulkEffectiveDate,setBulkEffectiveDate]=useState<string>(todayISO);
  const [importEffectiveDate,setImportEffectiveDate]=useState<string>(todayISO);
  const [fName,setFName]=useState("");
  const [fDesc,setFDesc]=useState("");
  const [fCode,setFCode]=useState("");
  const [fVariant,setFVariant]=useState("");
  const [fGrade,setFGrade]=useState("");
  const [saveError,setSaveError]=useState<string|null>(null);
  const [toast,setToast]=useState<string|null>(null);
  function showToast(msg:string){setToast(msg);setTimeout(()=>setToast(null),3000);}
  const [itemTypes,setItemTypes]=useState<string[]>(()=>{
    try{const s=localStorage.getItem("magnus_item_types");return s?JSON.parse(s):["Material","Labor","Equipment","Subcontract","Other"];}
    catch{return ["Material","Labor","Equipment","Subcontract","Other"];}
  });
  const [fCategory,setFCategory]=useState<string>(categories[0]?.name??"Uncategorized");
  const [fType,setFType]=useState<string>(itemTypes[0]??"Material");
  const [fUnit,setFUnit]=useState<string>("each");
  const [fRate,setFRate]=useState<string>("");
  const [showAdvanced,setShowAdvanced]=useState<boolean>(false);
  const [formulaType,setFormulaType]=useState<string>("");
  const [formulaInput,setFormulaInput]=useState<string>("");
  const [formulaPreview,setFormulaPreview]=useState<number|null>(null);
  const [fUnitWeight,setFUnitWeight]=useState("");
  const [fWeightUnit,setFWeightUnit]=useState("kg");
  const [fCoverageRate,setFCoverageRate]=useState("");
  const [fLaborMode,setFLaborMode]=useState<"day"|"hour">("day");
  const [fCrewSize,setFCrewSize]=useState("1");

  function toggleType(t:string){setTypeFilter(prev=>({...prev,[t]:!prev[t]}));}
  function setOnlyType(t:string){setTypeFilter({Material:false,Labor:false,Equipment:false,Subcontract:false,Other:false,[t]:true});}
  function setAllTypes(on:boolean){setTypeFilter({Material:on,Labor:on,Equipment:on,Subcontract:on,Other:on});}
  const selectedTypeCount=useMemo(()=>Object.values(typeFilter).filter(Boolean).length,[typeFilter]);

  async function addItemType(name:string){
    const updated=[...itemTypes,name];
    setItemTypes(updated);
    localStorage.setItem("magnus_item_types",JSON.stringify(updated));
  }
  async function deleteItemType(name:string){
    const updated=itemTypes.filter(t=>t!==name);
    setItemTypes(updated);
    localStorage.setItem("magnus_item_types",JSON.stringify(updated));
  }

  useEffect(()=>{
    let alive=true;
    async function load(){
      setLoading(true);
      const{data:{user}}=await supabase.auth.getUser();
      if(user){
        const{data:profile}=await supabase.from("user_profiles").select("company_id").eq("id",user.id).single();
        if(profile?.company_id&&alive) setCompanyId(profile.company_id);
      }
      const sel="id,item_name,description,cost_code,unit,category,item_type,updated_at,calc_engine_json,current_rate,current_currency,current_effective_date,current_source,current_batch_id";
      let resp=await supabase.from("v_cost_items_current").select(sel).order("item_name",{ascending:true});
      if(resp.error){
        console.error("RatesPage load error:",resp.error);
        resp=await supabase.from("v_cost_items_current").select(sel).order("item_name",{ascending:true});
      }
      if(!alive) return;
      const rawItems=resp.data as any[];
      if(rawItems&&rawItems.length>0){
        const ids=rawItems.map(i=>i.id);
        const variants=await supabase.from("cost_items").select("id,variant,grade").in("id",ids);
        const varMap=new Map((variants.data||[]).map((v:any)=>[v.id,{variant:v.variant,grade:v.grade}]));
        setItems(rawItems.map(i=>({...i,variant:(varMap.get(i.id)?.variant||"") as string,grade:(varMap.get(i.id)?.grade||"") as string})) as CostItem[]);
      } else setItems([]);
      setLoading(false);
    }
    load();
    return()=>{alive=false;};
  },[]);

  const reload=()=>{
    let alive=true;
    async function load(){
      setLoading(true);
      const sel="id,item_name,description,cost_code,unit,category,item_type,updated_at,calc_engine_json,current_rate,current_currency,current_effective_date,current_source,current_batch_id";
      let resp=await supabase.from("v_cost_items_current").select(sel).order("item_name",{ascending:true});
      if(!alive) return;
      const rawItems=resp.data as any[];
      if(rawItems&&rawItems.length>0){
        const ids=rawItems.map(i=>i.id);
        const variants=await supabase.from("cost_items").select("id,variant,grade").in("id",ids);
        const varMap=new Map((variants.data||[]).map((v:any)=>[v.id,{variant:v.variant,grade:v.grade}]));
        setItems(rawItems.map(i=>({...i,variant:(varMap.get(i.id)?.variant||"") as string,grade:(varMap.get(i.id)?.grade||"") as string})) as CostItem[]);
      } else setItems([]);
      setLoading(false);
    }
    load();
    return()=>{alive=false;};
  };

  useEffect(()=>{
    if(!isModalOpen||!autoCode) return;
    setFCode(nextCodeFor(fCategory||"Uncategorized",fType||"Other",items));
  },[isModalOpen,autoCode,fCategory,fType]);

  useEffect(()=>{
    function onDoc(e:MouseEvent){if(!(e.target as HTMLElement).closest("[data-export-menu]"))setExportOpen(false);}
    if(exportOpen) document.addEventListener("mousedown",onDoc);
    return()=>document.removeEventListener("mousedown",onDoc);
  },[exportOpen]);

  const categoryOptions=useMemo(()=>{
    const base=categories.map(c=>c.name);
    const baseSet=new Set<string>(base);
    const extras:string[]=[];
    for(const it of items){const c=normCategory(it.category);if(!baseSet.has(c))extras.push(c);}
    return [...base,...Array.from(new Set(extras)).sort((a,b)=>a.localeCompare(b))];
  },[items,categories]);

  const unitOptions=useMemo(()=>{
    const base=Array.from(new Set(STANDARD_UNITS as unknown as string[]));
    const baseSet=new Set<string>(base);
    const extras:string[]=[];
    for(const it of items){const u=(it.unit||"").trim();if(u&&!baseSet.has(u))extras.push(u);}
    return [...base,...Array.from(new Set(extras)).sort((a,b)=>a.localeCompare(b))];
  },[items]);

  const filteredItems=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return items.filter(it=>{
      const cat=normCategory(it.category);
      if(categoryFilter!=="__ALL__"&&cat!==categoryFilter) return false;
      const type=(it.item_type||"Other").trim();
      const safeType=(ITEM_TYPES as unknown as string[]).includes(type)?type:"Other";
      if(!typeFilter[safeType]) return false;
      if(!q) return true;
      return (it.item_name||"").toLowerCase().includes(q)||
        (it.variant||"").toLowerCase().includes(q)||
        (it.grade||"").toLowerCase().includes(q)||
        (it.unit||"").toLowerCase().includes(q)||
        (it.item_type||"").toLowerCase().includes(q)||
        cat.toLowerCase().includes(q)||
        (it.current_rate==null?"":String(it.current_rate)).includes(q)||
        (it.cost_code||"").toLowerCase().includes(q)||
        (it.description||"").toLowerCase().includes(q);
    });
  },[items,categoryFilter,search,typeFilter]);

  const selectedTypes=useMemo(()=>{
    const chosen=ITEM_TYPES.filter(t=>!!typeFilter[t]);
    return chosen.length?chosen:[...ITEM_TYPES];
  },[typeFilter]);

  const bulkTargetCount=useMemo(()=>filteredItems.filter(x=>x.current_rate!=null).length,[filteredItems]);

  // Stats
  const total=items.length;
  const priced=items.filter(i=>i.current_rate!=null).length;
  const coverage=total>0?Math.round((priced/total)*100):0;
  const typeCounts=useMemo(()=>{const c:Record<string,number>={};items.forEach(i=>{const t=i.item_type||"Other";c[t]=(c[t]||0)+1;});return c;},[items]);

  function openAdd(){
    setMode("add");setActiveId(null);setFName("");setFDesc("");setFVariant("");setFGrade("");
    setFCategory(categories[0]?.name??"Uncategorized");setFType(ITEM_TYPES[0]);
    setFUnit(unitOptions[0]??"each");setFRate("");setFormulaType("");setFormulaInput("");setFormulaPreview(null);
    setFUnitWeight("");setFWeightUnit("kg");setFCoverageRate("");setFLaborMode("day");setFCrewSize("1");
    setIsModalOpen(true);
  }
  function openEdit(item:CostItem){
    setMode("edit");setActiveId(item.id);
    setFName(item.item_name||"");setFDesc(item.description||"");
    setFCode(item.cost_code||"");setFCategory(normCategory(item.category));
    setFType(item.item_type||ITEM_TYPES[0]);setFUnit((item.unit||"").trim()||(unitOptions[0]??"each"));
    setFRate(item.current_rate==null?"":String(item.current_rate));setFVariant(item.variant||"");setFGrade(item.grade||"");
    setFUnitWeight("");setFWeightUnit("kg");setFCoverageRate("");setFLaborMode("day");setFCrewSize("1");
    const calcJson=(item as any).calc_engine_json;
    if(calcJson){
      try{
        const p=typeof calcJson==="string"?JSON.parse(calcJson):calcJson;
        if(p.formula_type){
          setFormulaType(p.formula_type);
          setFormulaInput(p.formulas?.qty||"");
          if(p.consts){
            if(p.consts.unit_weight!=null) setFUnitWeight(String(p.consts.unit_weight));
            if(p.consts.weight_unit) setFWeightUnit(p.consts.weight_unit);
            if(p.consts.coverage_rate!=null) setFCoverageRate(String(p.consts.coverage_rate));
            if(p.consts.labor_mode) setFLaborMode(p.consts.labor_mode);
            if(p.consts.crew_size!=null) setFCrewSize(String(p.consts.crew_size));
          }
        } else if(p.vars?.length>0){
          // Fallback for items saved before formula_type was tracked explicitly
          const keys=p.vars.map((v:any)=>v.key);
          if(keys.includes("count")){setFormulaType("count");setFormulaInput(p.formulas?.qty||"count");}
          else if(keys.includes("area")){setFormulaType("area");setFormulaInput(p.formulas?.qty||"area");}
          else if(keys.includes("length")&&keys.includes("width")){setFormulaType("volume");setFormulaInput(p.formulas?.qty||"length * width * height");}
          else if(keys.includes("length")){setFormulaType("length");setFormulaInput(p.formulas?.qty||"length");}
        } else {
          setFormulaType("");setFormulaInput("");
        }
      }catch{setFormulaType("");setFormulaInput("");}
    } else{setFormulaType("");setFormulaInput("");}
    setIsModalOpen(true);
  }
  function closeModal(){
    setIsModalOpen(false);setFName("");setFDesc("");setFCode("");setFVariant("");setFGrade("");
    setFCategory(categories[0]?.name??"Uncategorized");setFType(ITEM_TYPES[0]);
    setFUnit("each");setFRate("");setFormulaType("");setFormulaInput("");setFormulaPreview(null);
    setFUnitWeight("");setFWeightUnit("kg");setFCoverageRate("");setFLaborMode("day");setFCrewSize("1");
    setActiveId(null);setMode("add");setSaveError(null);
  }

  function buildCalcJson(type:string,formula:string){
    if(!type) return null;
    const base={version:1,qty_expr:"qty",formula_type:type};
    switch(type){
      case "length": return{...base,vars:[{key:"length",label:"Length"}],formulas:{qty:formula||"length"}};
      case "area":   return{...base,vars:[{key:"area",label:"Area"}],formulas:{qty:formula||"area"}};
      case "volume": return{...base,vars:[{key:"length",label:"Length"},{key:"width",label:"Width"},{key:"height",label:"Height"}],formulas:{qty:formula||"length * width * height"}};
      case "count":  return{...base,vars:[{key:"count",label:"Count"}],formulas:{qty:formula||"count"}};
      case "weight": {
        const uw=parseFloat(fUnitWeight)||1;
        return{...base,vars:[{key:"length",label:"Length (m)"}],consts:{unit_weight:uw,weight_unit:fWeightUnit},formulas:{qty:`length * ${uw}`}};
      }
      case "coverage": {
        const cr=parseFloat(fCoverageRate)||400;
        return{...base,vars:[{key:"area",label:"Area (sf)"}],consts:{coverage_rate:cr},formulas:{qty:`area / ${cr}`}};
      }
      case "labor":
        return{...base,
          vars: fLaborMode==="day"?[{key:"days",label:"Days"},{key:"crew",label:"Crew Size"}]:[{key:"hours",label:"Hours"},{key:"crew",label:"Crew Size"}],
          consts:{labor_mode:fLaborMode,crew_size:parseFloat(fCrewSize)||1},
          formulas:{qty: fLaborMode==="day"?"days * crew":"hours * crew"}};
      case "perimeter":
        return{...base,vars:[{key:"length",label:"Length"},{key:"width",label:"Width"},{key:"height",label:"Height"}],formulas:{qty:formula||"(length + width) * 2 * height"}};
      default:       return null;
    }
  }
  function previewFormula(type:string,formula:string){
    if(!type||!formula){setFormulaPreview(null);return;}
    const vars:any={length:10,width:5,height:2,area:100,count:1,days:5,hours:8,crew:2};
    const result=computeQuantity(formula,vars,{roundTo:2,clampZero:true});
    setFormulaPreview(result.ok?result.value:null);
  }

  function autoFillDescription(name:string,grade:string,size:string){
    const parts=[name.trim(),grade.trim(),size.trim()].filter(Boolean);
    if(parts.length>0) setFDesc(parts.join(", "));
  }

  async function duplicateItem(item:CostItem){
    setBusy(true);
    try{
      const calcJson=(item as any).calc_engine_json||null;
      const{data:newItem,error:insertError}=await supabase.from("cost_items").insert({
        item_name:`Copy of ${item.item_name}`,
        description:item.description,
        cost_code:null,
        variant:item.variant,
        grade:item.grade,
        category:item.category,
        item_type:item.item_type,
        unit:item.unit,
        company_id:companyId||null,
        calc_engine_json:calcJson,
      }).select("id").single();
      if(insertError){alert(insertError.message);return;}
      if(item.current_rate&&newItem){
        await supabase.from("cost_item_rates").insert({
          cost_item_id:(newItem as any).id,
          rate:item.current_rate,
          currency:item.current_currency||"JMD",
          effective_date:new Date().toISOString().slice(0,10),
          source:"manual",
        });
      }

      // Build the new item and splice it right after the original in local
      // state instead of reload()-ing — a DB refetch re-sorts alphabetically
      // by item_name, which is exactly why "Copy of X" used to land somewhere
      // else in the list instead of next to X.
      const newCostItem:CostItem={
        id:(newItem as any).id,
        item_name:`Copy of ${item.item_name}`,
        description:item.description,
        cost_code:null,
        variant:item.variant,
        grade:item.grade,
        category:item.category,
        item_type:item.item_type,
        unit:item.unit,
        current_rate:item.current_rate,
        current_currency:item.current_currency,
        current_effective_date:new Date().toISOString().slice(0,10),
        current_source:"manual",
        current_batch_id:null,
        updated_at:new Date().toISOString(),
      };
      (newCostItem as any).calc_engine_json=calcJson;

      setItems(prev=>{
        const idx=prev.findIndex(i=>i.id===item.id);
        if(idx===-1) return [...prev,newCostItem];
        const next=[...prev];
        next.splice(idx+1,0,newCostItem);
        return next;
      });

      setTimeout(()=>{
        const el=document.getElementById(`rate-item-${newCostItem.id}`);
        if(el) el.scrollIntoView({behavior:"smooth",block:"center"});
        openEdit(newCostItem);
        showToast("✅ Duplicated — rename and customize it");
      },150);
    }finally{setBusy(false);}
  }
  async function saveRate(itemId:string,nextRate:number){
    setBusy(true);
    try{
      const{error}=await supabase.from("cost_item_rates").insert({cost_item_id:itemId,rate:nextRate,currency:"JMD",effective_date:new Date().toISOString().slice(0,10),source:"manual_edit"});
      if(error){console.error("Rate update error:",error);return;}
      await reload();
    }finally{setBusy(false);}
  }
  async function saveCategory(itemId:string,nextCategory:string){
    setBusy(true);
    try{
      const{error}=await supabase.from("cost_items").update({category:nextCategory}).eq("id",itemId);
      if(error){console.error(error);return;}
      setItems(prev=>prev.map(r=>r.id===itemId?{...r,category:nextCategory,updated_at:new Date().toISOString()}:r));
    }finally{setBusy(false);}
  }
  async function saveItemType(itemId:string,nextType:string){
    setBusy(true);
    try{
      const{error}=await supabase.from("cost_items").update({item_type:nextType}).eq("id",itemId);
      if(error){console.error(error);return;}
      setItems(prev=>prev.map(r=>r.id===itemId?{...r,item_type:nextType,updated_at:new Date().toISOString()}:r));
    }finally{setBusy(false);}
  }
  async function saveDescription(itemId:string,nextDesc:string){
    setBusy(true);
    try{
      const{error}=await supabase.from("cost_items").update({description:nextDesc}).eq("id",itemId);
      if(error){console.error(error);return;}
      setItems(prev=>prev.map(r=>r.id===itemId?{...r,description:nextDesc,updated_at:new Date().toISOString()}:r));
    }finally{setBusy(false);}
  }
  async function saveCostCode(itemId:string,nextCode:string){
    setBusy(true);
    try{
      const{error}=await supabase.from("cost_items").update({cost_code:nextCode}).eq("id",itemId);
      if(error){console.error(error);return;}
      setItems(prev=>prev.map(r=>r.id===itemId?{...r,cost_code:nextCode,updated_at:new Date().toISOString()}:r));
    }finally{setBusy(false);}
  }

  async function applyBulk(){
    const n=Number(bulkValue);
    if(!isFinite(n)) return;
    const cat=categoryFilter==="__ALL__"?null:categoryFilter;
    setBusy(true);
    try{
      for(const t of selectedTypes){
        const{data,error}=await supabase.rpc("bulk_update_rates",{p_title:bulkTitle,p_reason:bulkReason||null,p_type_filter:t,p_category_filter:cat,p_mode:bulkMode,p_value:n,p_effective_date:bulkEffectiveDate});
        if(error){alert(`Bulk update failed for ${t}: ${error.message}`);return;}
        setLastBulkBatches(prev=>[data as string,...prev].slice(0,10));
      }
      setBulkOpen(false);
      await reload();
    }finally{setBusy(false);}
  }

  async function undoLastBulk(){
    if(lastBulkBatches.length===0) return;
    if(!confirm("Undo last bulk update?")) return;
    setBusy(true);
    try{
      for(const batchId of lastBulkBatches){
        const{data,error}=await supabase.rpc("undo_rate_batch",{p_batch_id:batchId});
        if(error) console.error("undo error:",error);
      }
      setLastBulkBatches([]);
      await reload();
    }finally{setBusy(false);}
  }

  function exportCurrentViewCsv(){
    const ts=new Date();
    const cat=categoryFilter==="__ALL__"?"AllCategories":categoryFilter.replace(/\s+/g,"_");
    downloadCsv(`rate-library_${cat}_${ts.toISOString().slice(0,10)}.csv`,[
      ["Item","Variant","Description","Cost Code","Category","Type","Unit","Rate","Currency","Last Updated"],
      ...filteredItems.map(it=>[it.item_name||"",it.variant||"",it.description||"",it.cost_code||"",normCategory(it.category),it.item_type||"",it.unit||"",it.current_rate??"",it.current_currency??"JMD",it.updated_at||""])
    ]);
  }
  function exportByTypeCsv(forcedType:string|null,label:string){
    const ts=new Date();
    const cat=categoryFilter==="__ALL__"?"AllCategories":categoryFilter.replace(/\s+/g,"_");
    const typeLabel=forcedType?forcedType.replace(/\s+/g,"_"):"CurrentView";
    let rows=filteredItems;
    if(forcedType) rows=rows.filter(it=>(it.item_type||"").toLowerCase()===forcedType.toLowerCase());
    downloadCsv(`rate-library_${label}_${cat}_${typeLabel}_${ts.toISOString().slice(0,10)}.csv`,[
      ["Item","Description","Cost Code","Category","Type","Unit","Rate","Currency","Last Updated"],
      ...rows.map(it=>[it.item_name||"",it.description||"",it.cost_code||"",normCategory(it.category),it.item_type||"",it.unit||"",it.current_rate??"",it.current_currency??"JMD",it.updated_at||""])
    ]);
  }
  function downloadTemplateCurrentView(){
    const cat=categoryFilter==="__ALL__"?"AllCategories":categoryFilter.replace(/\s+/g,"_");
    downloadCsv(`rate-template_${cat}_${new Date().toISOString().slice(0,10)}.csv`,[
      ["cost_code","item_name","rate","currency","unit","category","item_type"],
      ...filteredItems.map(it=>[it.cost_code||"",it.item_name||"",it.current_rate??"",it.current_currency||"JMD",it.unit||"",normCategory(it.category),it.item_type||""])
    ]);
  }

  function buildLookupMaps(){
    const byCode=new Map<string,CostItem>();
    const byName=new Map<string,CostItem>();
    for(const it of items){
      const cc=(it.cost_code||"").trim().toLowerCase();
      const nm=(it.item_name||"").trim().toLowerCase();
      if(cc) byCode.set(cc,it);
      if(nm) byName.set(nm,it);
    }
    return{byCode,byName};
  }
  function computeImportMatches(rows:ImportRow[]){
    const{byCode,byName}=buildLookupMaps();
    const matched:{src:ImportRow;matchId:string;matchName:string}[]=[];
    const unmatched:ImportRow[]=[];
    for(const r of rows){
      const cc=(r.cost_code||"").trim().toLowerCase();
      const nm=(r.item_name||"").trim().toLowerCase();
      let hit=cc?byCode.get(cc):undefined;
      if(!hit&&nm) hit=byName.get(nm);
      if(hit&&r.rate!=null) matched.push({src:r,matchId:hit.id,matchName:hit.item_name});
      else unmatched.push(r);
    }
    setImportMatched(matched);setImportUnmatched(unmatched);
  }
  async function onPickImportFile(file:File){
    setImportCsvName(file.name);
    const text=await file.text();
    const{headers,rows}=parseCsvText(text);
    const H=headers.map(normalizeHeader);
    const idx=(name:string)=>H.indexOf(name);
    const parsed:ImportRow[]=rows.map((r,k)=>({
      rowNum:k+2,
      cost_code:idx("cost_code")>=0?(r[idx("cost_code")]||"").trim():"",
      item_name:idx("item_name")>=0?(r[idx("item_name")]||"").trim():"",
      rate:idx("rate")>=0?toNum(r[idx("rate")]||""):null,
      currency:(idx("currency")>=0?(r[idx("currency")]||"").trim():"JMD")||"JMD",
      unit:idx("unit")>=0?(r[idx("unit")]||"").trim()||undefined:undefined,
      category:idx("category")>=0?(r[idx("category")]||"").trim()||undefined:undefined,
      item_type:idx("item_type")>=0?(r[idx("item_type")]||"").trim()||undefined:idx("type")>=0?(r[idx("type")]||"").trim()||undefined:undefined,
    })).filter(r=>r.cost_code||r.item_name);
    setImportRows(parsed);computeImportMatches(parsed);
  }
  async function applyImport(){
    if(importMatched.length===0) return;
    setBusy(true);
    try{
      const{data:batch,error:bErr}=await supabase.from("rate_update_batches").insert({title:importTitle||"CSV import",reason:importReason||null}).select("id").single();
      if(bErr){alert(bErr.message);return;}
      const batchId=batch.id as string;
      const payload=importMatched.map(m=>({cost_item_id:m.matchId,rate:m.src.rate,currency:(m.src.currency||"JMD").toUpperCase(),effective_date:importEffectiveDate,source:"import",batch_id:batchId,note:importReason||`CSV: ${importCsvName||"import"}`}));
      const{error:rErr}=await supabase.from("cost_item_rates").insert(payload);
      if(rErr){alert(rErr.message);return;}
      setLastBulkBatches(prev=>[batchId,...prev].slice(0,10));
      setImportOpen(false);
      await reload();
    }finally{setBusy(false);}
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">

      {/* Header */}
      <div className="border-b border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0d1117]">
        <div className="px-6 py-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Rate Library</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {total} items &nbsp;·&nbsp; {priced} priced &nbsp;·&nbsp;
              <span className={coverage>=80?"text-green-400":coverage>=50?"text-amber-400":"text-red-400"}>
                {coverage}% coverage
              </span>
              &nbsp;·&nbsp;
              {ITEM_TYPES.map(t=>(
                <span key={t} className="mr-2 text-slate-500 dark:text-slate-600">
                  {t}: <span className="text-slate-600 dark:text-slate-400">{typeCounts[t]||0}</span>
                </span>
              ))}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {canEdit && (
              <button onClick={openAdd} disabled={busy}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition shadow-sm disabled:opacity-50">
                <Plus size={13}/> Add Rate
              </button>
            )}
            <div className="relative" data-export-menu>
              <button onClick={()=>setExportOpen(v=>!v)} disabled={busy||loading||filteredItems.length===0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.05] hover:bg-white/[0.08] text-slate-700 dark:text-slate-300 text-xs font-medium border border-slate-200 dark:border-white/[0.08] transition disabled:opacity-40">
                <Download size={12}/> Export <ChevronDown size={11} className="opacity-60"/>
              </button>
              {exportOpen&&(
                <div className="absolute right-0 mt-1.5 w-[240px] rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1117] shadow-2xl overflow-hidden z-50">
                  <div className="px-3 py-2 text-[10px] text-slate-500 dark:text-slate-600 border-b border-slate-200 dark:border-white/[0.06] uppercase tracking-wider">Export Options</div>
                  {[
                    {label:"Import CSV (preview)",action:()=>{setExportOpen(false);setImportOpen(true);setImportTitle("CSV import");setImportReason("");setImportCsvName("");setImportRows([]);setImportMatched([]);setImportUnmatched([]);setTimeout(()=>fileInputRef.current?.click(),0);}},
                    {label:"Download Template",action:()=>{downloadTemplateCurrentView();setExportOpen(false);}},
                    {label:"Export Current View",action:()=>{exportCurrentViewCsv();setExportOpen(false);}},
                    {label:"Materials only",action:()=>{exportByTypeCsv("Material","MaterialsOnly");setExportOpen(false);}},
                    {label:"Labor only",action:()=>{exportByTypeCsv("Labor","LaborOnly");setExportOpen(false);}},
                    {label:"Equipment only",action:()=>{exportByTypeCsv("Equipment","EquipmentOnly");setExportOpen(false);}},
                    {label:"Subcontract only",action:()=>{exportByTypeCsv("Subcontract","SubcontractOnly");setExportOpen(false);}},
                  ].map(({label,action})=>(
                    <button key={label} type="button" onClick={action}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:bg-white/[0.05] transition">{label}</button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={()=>{setBulkTitle("Bulk rate update");setBulkReason("");setBulkValue("");setBulkOpen(true);}} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.05] hover:bg-white/[0.08] text-slate-700 dark:text-slate-300 text-xs font-medium border border-slate-200 dark:border-white/[0.08] transition disabled:opacity-40">
              <Zap size={12}/> Bulk Update
            </button>
            <button onClick={undoLastBulk} disabled={busy||lastBulkBatches.length===0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.05] hover:bg-white/[0.08] text-slate-600 dark:text-slate-400 text-xs font-medium border border-slate-200 dark:border-white/[0.08] transition disabled:opacity-30"
              title={lastBulkBatches.length?`Last: ${lastBulkBatches[0]}`:"No bulk batch yet"}>
              <RotateCcw size={12}/> Undo Bulk
            </button>
          </div>
        </div>
        {/* Coverage bar */}
        <div className="px-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1 bg-slate-50 dark:bg-white/[0.04] rounded-full overflow-hidden">
              <div className="h-1 rounded-full transition-all duration-700"
                style={{width:`${coverage}%`,background:coverage>=80?"linear-gradient(90deg,#22c55e,#16a34a)":coverage>=50?"linear-gradient(90deg,#f59e0b,#d97706)":"linear-gradient(90deg,#ef4444,#dc2626)"}}/>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-600 font-medium">{priced}/{total} priced</span>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-3">
        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-[240px]">
            <EditableDropdown
              value={categoryFilter==="__ALL__"?"":categoryFilter}
              onChange={val=>setCategoryFilter(val||"__ALL__")}
              options={categoryOptions}
              placeholder="All Categories"
              onAddOption={async(name)=>{
                const{data:{user}}=await supabase.auth.getUser();
                const{data:profile}=await supabase.from("user_profiles").select("company_id").eq("id",user!.id).single();
                await supabase.from("master_categories").insert({name,company_id:profile?.company_id,is_active:true,sort_order:categories.length+1});
                await refreshCategories();
              }}
              onDeleteOption={async(name)=>{
                await supabase.from("master_categories").delete().eq("name",name);
                await refreshCategories();
                if(categoryFilter===name) setCategoryFilter("__ALL__");
              }}
            />
          </div>
          <div className="relative flex-1 min-w-52 max-w-sm">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-600 pointer-events-none"/>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search item, size/spec, category, unit, type, code, rate…"
              className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg pl-8 pr-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-500 dark:text-slate-600 outline-none focus:border-blue-500/50 transition"/>
          </div>
          <button onClick={()=>companyId&&reload()}
            className="p-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] hover:bg-slate-200 dark:bg-white/[0.07] border border-slate-200 dark:border-white/[0.08] text-slate-500 hover:text-slate-700 dark:text-slate-300 transition">
            <RefreshCw size={13} className={loading?"animate-spin":""}/>
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-600 ml-auto">{filteredItems.length} item{filteredItems.length===1?"":"s"}</span>
        </div>

        {/* Type pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500 dark:text-slate-600 mr-1">Type</span>
          <button onClick={()=>setAllTypes(true)}
            className="px-2.5 py-1 rounded-md bg-slate-50 dark:bg-white/[0.04] hover:bg-slate-200 dark:bg-white/[0.07] border border-slate-200 dark:border-white/[0.07] text-xs text-slate-500 transition">All</button>
          <button onClick={()=>setAllTypes(false)}
            className="px-2.5 py-1 rounded-md bg-slate-50 dark:bg-white/[0.04] hover:bg-slate-200 dark:bg-white/[0.07] border border-slate-200 dark:border-white/[0.07] text-xs text-slate-500 transition">None</button>
          {ITEM_TYPES.map(t=>{
            const on=!!typeFilter[t];
            const s=TYPE_STYLE[t]||TYPE_STYLE.Other;
            return(
              <button key={t} onClick={()=>toggleType(t)} onDoubleClick={()=>setOnlyType(t)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold border transition ${on?s.pill:"bg-slate-50 dark:bg-white/[0.03] text-slate-500 dark:text-slate-600 border-slate-200 dark:border-white/[0.06] opacity-60 hover:opacity-100"}`}
                title="Click toggle · Double-click isolate">
                {s.icon}{t}
                <span className="opacity-60">({typeCounts[t]||0})</span>
              </button>
            );
          })}
          <span className="text-[10px] text-slate-400 dark:text-slate-700 ml-auto">{selectedTypeCount} selected</span>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] overflow-x-auto bg-white dark:bg-[#0d1117]">
          {/* Header */}
          <div className="grid min-w-[860px] text-[10px] font-semibold text-slate-500 dark:text-slate-600 uppercase tracking-wider px-4 py-2.5 border-b border-slate-100 dark:border-white/[0.05] bg-slate-50 dark:bg-white/[0.02]"
            style={{gridTemplateColumns:"2fr 1.2fr 0.7fr 1fr 1fr 0.7fr 1fr 0.9fr 96px"}}>
            <span>Item</span><span>Description</span><span>Code</span>
            <span>Category</span><span>Type</span><span>Unit</span>
            <span>Rate (JMD)</span><span>Updated</span><span></span>
          </div>

          {loading?(
            <div className="flex items-center justify-center py-16 text-slate-500 dark:text-slate-600 text-sm gap-2">
              <RefreshCw size={14} className="animate-spin"/> Loading rates…
            </div>
          ):filteredItems.length===0?(
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Package size={20} className="text-slate-400 dark:text-slate-700"/>
              <span className="text-slate-500 text-sm">No items match your filters</span>
              {!search&&categoryFilter==="__ALL__"&&canEdit&&(
                <button onClick={openAdd} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition mt-1">
                  <Plus size={12}/> Add First Rate
                </button>
              )}
            </div>
          ):filteredItems.map((item,idx)=>{
            const calcJson=(item as any).calc_engine_json;
            let formulaBadge:React.ReactNode=null;
            if(calcJson){
              try{
                const p=typeof calcJson==="string"?JSON.parse(calcJson):calcJson;
                let ftype:string|null=p.formula_type||null;
                if(!ftype&&p.vars?.length>0){
                  // Fallback for items saved before formula_type was tracked explicitly
                  const keys=p.vars.map((v:any)=>v.key);
                  if(keys.includes("count")) ftype="count";
                  else if(keys.includes("area")) ftype="area";
                  else if(keys.includes("length")&&keys.includes("width")) ftype="volume";
                  else if(keys.includes("length")) ftype="length";
                }
                const badge=ftype?FORMULA_BADGE[ftype]:null;
                if(badge) formulaBadge=<span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold ${badge.pill}`}>{badge.label}</span>;
              }catch{}
            }
            const ts=TYPE_STYLE[item.item_type||"Other"]||TYPE_STYLE.Other;
            return(
              <div key={item.id} id={`rate-item-${item.id}`}
                className={`group grid min-w-[860px] items-center px-4 py-3 gap-2 border-b border-slate-100 dark:border-white/[0.04] border-l-2 transition-colors cursor-default ${idx===filteredItems.length-1?"border-b-0":""} ${
                  activeId===item.id
                    ? "bg-blue-50 dark:bg-blue-500/10 border-l-blue-500"
                    : "border-l-transparent hover:bg-blue-50 dark:hover:bg-blue-500/5 hover:border-l-blue-400"
                }`}
                style={{gridTemplateColumns:"2fr 1.2fr 0.7fr 1fr 1fr 0.7fr 1fr 0.9fr 96px"}}>

                {/* Item */}
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{item.item_name}</div>
                  {(item.grade||item.variant)&&(
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {item.grade&&(
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          {item.grade}
                        </span>
                      )}
                      {item.variant&&(
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                          📐 {item.variant}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {formulaBadge||<span className="text-[9px] text-slate-400 dark:text-slate-700">No formula</span>}
                  </div>
                </div>

                {/* Description */}
                <div className="min-w-0">
                  {editingDescId===item.id?(
                    <input autoFocus value={editingDescValue} onChange={e=>setEditingDescValue(e.target.value)}
                      onBlur={()=>setEditingDescId(null)}
                      onKeyDown={async e=>{if(e.key==="Escape")return setEditingDescId(null);if(e.key==="Enter"){await saveDescription(item.id,editingDescValue);setEditingDescId(null);}}}
                      className="w-full bg-slate-200 dark:bg-white/[0.06] border border-blue-500/40 rounded-md px-2 py-1 text-xs text-slate-800 dark:text-slate-200 outline-none"/>
                  ):(
                    <button type="button" disabled={busy}
                      onClick={()=>{setEditingDescId(item.id);setEditingDescValue(item.description||"");}}
                      className="text-left text-xs text-slate-500 hover:text-slate-700 dark:text-slate-300 truncate w-full transition disabled:opacity-50"
                      title={item.description||"Click to add description"}>
                      {item.description||<span className="text-slate-400 dark:text-slate-700 italic">—</span>}
                    </button>
                  )}
                </div>

                {/* Cost Code */}
                <div>
                  {editingCodeId===item.id?(
                    <input autoFocus value={editingCodeValue} onChange={e=>setEditingCodeValue(e.target.value)}
                      onBlur={()=>setEditingCodeId(null)}
                      onKeyDown={async e=>{if(e.key==="Escape")return setEditingCodeId(null);if(e.key==="Enter"){await saveCostCode(item.id,editingCodeValue.trim());setEditingCodeId(null);}}}
                      className="w-full bg-slate-200 dark:bg-white/[0.06] border border-blue-500/40 rounded-md px-2 py-1 text-xs text-slate-800 dark:text-slate-200 outline-none font-mono"/>
                  ):(
                    <button type="button" disabled={busy}
                      onClick={()=>{setEditingCodeId(item.id);setEditingCodeValue(item.cost_code||"");}}
                      className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-300 font-mono transition disabled:opacity-50">
                      {item.cost_code||<span className="text-slate-400 dark:text-slate-700 italic">—</span>}
                    </button>
                  )}
                </div>

                {/* Category */}
                <div>
                  {editingCatId===item.id?(
                    <select autoFocus value={editingCatValue} onChange={e=>setEditingCatValue(e.target.value)}
                      onBlur={()=>setEditingCatId(null)}
                      onKeyDown={async e=>{if(e.key==="Escape")setEditingCatId(null);if(e.key==="Enter"){await saveCategory(item.id,(editingCatValue||"Uncategorized").trim());setEditingCatId(null);}}}
                      className="bg-white dark:bg-[#0b1220] border border-blue-500/40 rounded-md px-2 py-1 text-xs text-slate-800 dark:text-slate-200 outline-none w-full">
                      {categoryOptions.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  ):(
                    <button type="button" disabled={busy}
                      onClick={()=>{setEditingCatId(item.id);setEditingCatValue(normCategory(item.category));}}
                      className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 transition truncate disabled:opacity-50">
                      {normCategory(item.category)}
                    </button>
                  )}
                </div>

                {/* Type */}
                <div>
                  {editingTypeId===item.id?(
                    <select autoFocus value={editingTypeValue} onChange={e=>setEditingTypeValue(e.target.value)}
                      onBlur={()=>setEditingTypeId(null)}
                      onKeyDown={async e=>{if(e.key==="Escape")setEditingTypeId(null);if(e.key==="Enter"){await saveItemType(item.id,editingTypeValue||"Other");setEditingTypeId(null);}}}
                      className="bg-white dark:bg-[#0b1220] border border-blue-500/40 rounded-md px-2 py-1 text-xs text-slate-800 dark:text-slate-200 outline-none">
                      {ITEM_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  ):(
                    <button type="button" disabled={busy}
                      onClick={()=>{setEditingTypeId(item.id);setEditingTypeValue(item.item_type||"Material");}}
                      className={`text-[10px] font-bold px-2 py-1 rounded-md border transition ${ts.pill}`}>
                      {item.item_type||"—"}
                    </button>
                  )}
                </div>

                {/* Unit */}
                <div>
                  <span className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] rounded-md px-2 py-0.5">{item.unit||"—"}</span>
                </div>

                {/* Rate */}
                <div>
                  {editingId===item.id?(
                    <input autoFocus value={editingRate} onChange={e=>setEditingRate(e.target.value)} type="number"
                      onBlur={()=>setEditingId(null)}
                      onKeyDown={async e=>{
                        if(e.key==="Escape")return setEditingId(null);
                        if(e.key==="Enter"){const n=Number(editingRate);if(isFinite(n)&&n>0){await saveRate(item.id,n);}setEditingId(null);}
                      }}
                      className="bg-slate-200 dark:bg-white/[0.06] border border-blue-500/40 rounded-md px-2 py-1 text-sm text-green-400 font-bold w-32 outline-none"/>
                  ):(
                    <button type="button" disabled={busy}
                      onClick={()=>{setEditingId(item.id);setEditingRate(item.current_rate==null?"":String(item.current_rate));}}
                      className="text-sm font-bold text-green-400 hover:text-green-300 transition disabled:opacity-50">
                      {item.current_rate!=null?formatMoney(item.current_rate):<span className="text-slate-400 dark:text-slate-700 text-xs font-normal italic">Set rate</span>}
                    </button>
                  )}
                </div>

                {/* Updated */}
                <div className="text-[11px] text-slate-400 dark:text-slate-700">{formatDate(item.updated_at)}</div>

                {/* Actions */}
                <div className={`flex gap-1 transition-opacity justify-end ${activeId===item.id?"opacity-100":"md:opacity-0 md:group-hover:opacity-100"}`}>
                  {canEdit && (
                    <button type="button" onClick={()=>openEdit(item)} disabled={busy}
                      className={`p-1.5 rounded-lg hover:bg-blue-500/15 transition ${activeId===item.id?"text-blue-500":"text-slate-500 dark:text-slate-600 hover:text-blue-400"}`} title="Edit">
                      <Edit2 size={13}/>
                    </button>
                  )}
                  {canEdit && (
                    <button type="button" onClick={()=>duplicateItem(item)} disabled={busy}
                      className="p-1.5 rounded-lg hover:bg-blue-500/10 text-slate-500 dark:text-slate-600 hover:text-blue-400 transition" title="Duplicate item">
                      <Copy size={13}/>
                    </button>
                  )}
                  {canDelete && (
                    <button type="button" disabled={busy}
                      onClick={async()=>{
                        if(!confirm("Delete this item?")) return;
                        setBusy(true);
                        try{
                          const{error}=await supabase.from("cost_items").delete().eq("id",item.id);
                          if(error){console.error(error);return;}
                          setItems(prev=>prev.filter(r=>r.id!==item.id));
                        }finally{setBusy(false);}
                      }}
                      className={`p-1.5 rounded-lg hover:bg-red-500/15 transition ${activeId===item.id?"text-red-500":"text-slate-500 dark:text-slate-600 hover:text-red-400"}`} title="Delete">
                      <Trash2 size={13}/>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!loading&&filteredItems.length>0&&(
          <div className="text-xs text-slate-400 dark:text-slate-700 text-right pr-1">
            {filteredItems.length} of {total} items · Click any cell to edit inline
          </div>
        )}
      </div>

      {/* ── Add/Edit Modal ──────────────────────────────────────────────────── */}
      {isModalOpen&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1117] shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/[0.07]">
              <div>
                <div className="text-base font-bold text-slate-900 dark:text-slate-100">{mode==="add"?"Add Rate":"Edit Rate"}</div>
                <div className="text-xs text-slate-500 mt-0.5">{mode==="add"?"Add a new item to your rate library":"Update item details and rate"}</div>
              </div>
              <button type="button" onClick={closeModal} className="p-1.5 rounded-lg hover:bg-slate-200 dark:bg-white/[0.06] text-slate-500 hover:text-slate-700 dark:text-slate-300 transition">✕</button>
            </div>
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {mode==="add"&&companyId&&(
                <div className="pb-4 border-b border-slate-200 dark:border-white/[0.07]">
                  <SmartItemSelectorButton companyId={companyId}
                    onSelect={sel=>{
                      if(sel.itemName) setFName(sel.itemName);
                      if(sel.category) setFCategory(sel.category);
                      if(sel.unit) setFUnit(sel.unit);
                      if(sel.variant) setFVariant(sel.variant);
                      if(sel.currentRate!=null) setFRate(sel.currentRate.toString());
                    }}
                    className="w-full" label="🪄 Smart Selector (Guided Selection)"/>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <div className="text-xs text-slate-500 mb-1.5 font-medium">Item Name</div>
                  <input value={fName} onChange={e=>{setFName(e.target.value);autoFillDescription(e.target.value,fGrade,fVariant);}}
                    className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500/50 transition placeholder:text-slate-500 dark:text-slate-600"
                    placeholder="e.g. Ready Mix Concrete"/>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1.5 font-medium">Grade / Type</div>
                  <input value={fGrade} onChange={e=>{setFGrade(e.target.value);autoFillDescription(fName,e.target.value,fVariant);}}
                    className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500/50 transition placeholder:text-slate-500 dark:text-slate-600"
                    placeholder="e.g. Standard, Moisture-Resistant, Hollow, Corrugated"/>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1.5 font-medium">Size / Spec</div>
                  <input value={fVariant} onChange={e=>{setFVariant(e.target.value);autoFillDescription(fName,fGrade,e.target.value);}}
                    className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500/50 transition placeholder:text-slate-500 dark:text-slate-600"
                    placeholder='e.g. 4×8, 1/2", 20ft, Grade A'/>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1.5 font-medium">Cost Code</div>
                  <input value={fCode} onChange={e=>setFCode(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 font-mono outline-none focus:border-blue-500/50 transition"
                    placeholder="e.g. MAT-CON-001"/>
                  <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                    <input type="checkbox" checked={autoCode} onChange={e=>setAutoCode(e.target.checked)} className="rounded"/>
                    <span className="text-[11px] text-slate-500 dark:text-slate-600">Auto-generate from Type + Category</span>
                  </label>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1.5 font-medium">Category</div>
                  <MasterCategorySelect value={fCategory} onChange={setFCategory}/>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1.5 font-medium">Type</div>
                  <EditableDropdown
                    value={fType}
                    onChange={setFType}
                    options={itemTypes}
                    onAddOption={addItemType}
                    onDeleteOption={deleteItemType}
                    placeholder="Select type..."
                  />
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1.5 font-medium">Unit</div>
                  <MasterUnitSelect value={fUnit} onChange={setFUnit} placeholder="Select unit..."/>
                </div>
                <div className="col-span-2">
                  <div className="text-xs text-slate-500 mb-1.5 font-medium">Rate (JMD)</div>
                  <input value={fRate} onChange={e=>setFRate(e.target.value)} type="number" step="0.01"
                    className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-green-400 font-bold outline-none focus:border-blue-500/50 transition"
                    placeholder="e.g. 18500"/>
                </div>
              </div>

              {/* Advanced: Calculator */}
              <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] overflow-hidden">
                <button type="button" onClick={()=>setShowAdvanced(v=>!v)}
                  className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-white/[0.02] hover:bg-slate-50 dark:bg-white/[0.04] transition">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Advanced · Calculator Engine</span>
                  <ChevronDown size={13} className={`text-slate-500 dark:text-slate-600 transition-transform ${showAdvanced?"rotate-180":""}`}/>
                </button>
                {showAdvanced&&(
                  <div className="p-4 bg-slate-50 dark:bg-[#080b10] space-y-3 border-t border-slate-200 dark:border-white/[0.06]">
                    <div>
                      <div className="text-xs text-slate-500 mb-1.5">Formula Type</div>
                      <select value={formulaType} onChange={e=>{
                        const t=e.target.value;setFormulaType(t);
                        const def:Record<string,string>={length:"length",area:"area",volume:"length * width * height",count:"count",perimeter:"(length + width) * 2 * height"};
                        const d=def[t]||"";
                        setFormulaInput(d);previewFormula(t,d);
                      }} className="w-full bg-white dark:bg-[#0b1220] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500/50">
                        <option value="">No formula</option>
                        <option value="length">Length (lf / m)</option>
                        <option value="area">Area (sf / m²)</option>
                        <option value="volume">Volume (cf / m³ / yd³)</option>
                        <option value="count">Count (each / piece)</option>
                        <option value="weight">Weight (kg / tonne) — Steel &amp; Rebar</option>
                        <option value="coverage">Coverage (paint, waterproofing, adhesive)</option>
                        <option value="labor">Labor (man-days / man-hours)</option>
                        <option value="perimeter">Perimeter (fencing, skirting, molding)</option>
                      </select>
                    </div>

                    {/* Weight type — extra fields */}
                    {formulaType==="weight"&&(
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs text-slate-500 mb-1.5">
                            Unit Weight <span className="text-slate-400 dark:text-slate-600">(kg per metre or lbs per foot)</span>
                          </div>
                          <input type="number" value={fUnitWeight}
                            onChange={e=>{setFUnitWeight(e.target.value);previewFormula(formulaType,`length * ${e.target.value||1}`);}}
                            placeholder="e.g. 0.560 for #3 rebar, 2.235 for #6 rebar"
                            className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500/50"/>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-1.5">Default Output Unit</div>
                          <div className="flex gap-2">
                            {["kg","tonne","lb"].map(u=>(
                              <button key={u} type="button" onClick={()=>setFWeightUnit(u)}
                                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${fWeightUnit===u?"bg-blue-600 text-white":"bg-white dark:bg-white/[0.04] text-slate-500 border border-slate-200 dark:border-white/[0.08] hover:bg-slate-100 dark:hover:bg-white/[0.08]"}`}>
                                {u}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-600 bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.07] rounded-lg p-2">
                          Formula: <span className="font-mono text-blue-500">length × {fUnitWeight||"unit_weight"} = {fWeightUnit}</span>
                          <br/>User can toggle kg/tonne in the BOQ measurement modal
                        </div>
                      </div>
                    )}

                    {/* Coverage type — extra fields */}
                    {formulaType==="coverage"&&(
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs text-slate-500 mb-1.5">
                            Coverage Rate <span className="text-slate-400 dark:text-slate-600">(area covered per unit, e.g. sf per gallon)</span>
                          </div>
                          <input type="number" value={fCoverageRate}
                            onChange={e=>{setFCoverageRate(e.target.value);previewFormula(formulaType,`area / ${e.target.value||400}`);}}
                            placeholder="e.g. 400 (sf per gallon of paint)"
                            className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500/50"/>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-600 bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.07] rounded-lg p-2">
                          Formula: <span className="font-mono text-blue-500">area ÷ {fCoverageRate||"coverage_rate"} = units needed</span>
                        </div>
                      </div>
                    )}

                    {/* Labor type — extra fields */}
                    {formulaType==="labor"&&(
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs text-slate-500 mb-1.5">Labor Mode</div>
                          <div className="flex gap-2">
                            {(["day","hour"] as const).map(m=>(
                              <button key={m} type="button" onClick={()=>setFLaborMode(m)}
                                className={`px-4 py-2 rounded-lg text-xs font-semibold capitalize transition-colors ${fLaborMode===m?"bg-emerald-600 text-white":"bg-white dark:bg-white/[0.04] text-slate-500 border border-slate-200 dark:border-white/[0.08] hover:bg-slate-100 dark:hover:bg-white/[0.08]"}`}>
                                Per {m}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-1.5">Default Crew Size</div>
                          <input type="number" min="1" value={fCrewSize} onChange={e=>setFCrewSize(e.target.value)}
                            placeholder="e.g. 2"
                            className="w-32 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500/50"/>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-600 bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.07] rounded-lg p-2">
                          Formula: <span className="font-mono text-emerald-500">crew × {fLaborMode==="day"?"days":"hours"} = man-{fLaborMode}s</span>
                          <br/>Rate = JMD per person per {fLaborMode}
                        </div>
                      </div>
                    )}

                    {/* Standard formula expression for other types */}
                    {formulaType&&!["weight","coverage","labor"].includes(formulaType)&&(
                      <div>
                        <div className="text-xs text-slate-500 mb-1.5">Formula Expression</div>
                        <input value={formulaInput} onChange={e=>{setFormulaInput(e.target.value);previewFormula(formulaType,e.target.value);}}
                          placeholder="Enter formula…"
                          className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 font-mono outline-none focus:border-blue-500/50"/>
                        <div className="text-[11px] text-slate-500 dark:text-slate-600 mt-1">
                          Variables: {formulaType==="volume"||formulaType==="perimeter"?"length, width, height":formulaType}
                        </div>
                      </div>
                    )}
                    {formulaPreview!=null&&(
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500">Preview qty:</span>
                        <span className="text-green-400 font-bold">{formulaPreview.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs text-slate-500 mb-1.5 font-medium">Description</div>
                <input value={fDesc} onChange={e=>setFDesc(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500/50 transition"
                  placeholder="Optional description"/>
              </div>
            </div>
            {saveError&&(
              <div className="mx-6 mb-4 px-4 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-xs">
                ⚠️ {saveError}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-white/[0.07]">
              <button type="button" onClick={closeModal} disabled={busy}
                className="px-4 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] hover:bg-slate-200 dark:bg-white/[0.07] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-700 dark:text-slate-300 transition disabled:opacity-50">Cancel</button>
              <button type="button" disabled={busy||!fName.trim()} onClick={async()=>{
                const name=fName.trim();if(!name) return;
                const payload:any={
                  item_name:name,description:fDesc.trim()||null,variant:fVariant.trim()||null,
                  grade:fGrade.trim()||null,
                  cost_code:fCode.trim()||null,category:(fCategory||"Uncategorized").trim(),
                  item_type:(fType||"Other").trim(),unit:(fUnit||"each").trim(),
                  updated_at:new Date().toISOString(),
                  calc_engine_json:formulaType?buildCalcJson(formulaType,formulaInput):null,
                };
                setSaveError(null);
                setBusy(true);
                try{
                  if(mode==="add"){
                    const{data:newItem,error:insertError}=await supabase.from("cost_items").insert(payload).select("id").single();
                    if(insertError){console.error(insertError);setSaveError(insertError.message||"Save failed. Please try again.");return;}
                    if(fRate.trim()){
                      await supabase.from("cost_item_rates").insert({cost_item_id:(newItem as any).id,rate:Number(fRate),currency:"JMD",effective_date:new Date().toISOString().slice(0,10),source:"manual",note:null});
                    }
                  } else {
                    if(!activeId) return;
                    const{error:updateError}=await supabase.from("cost_items").update(payload).eq("id",activeId);
                    if(updateError){console.error(updateError);setSaveError(updateError.message||"Save failed. Please try again.");return;}
                    if(fRate.trim()){
                      await supabase.from("cost_item_rates").insert({cost_item_id:activeId,rate:Number(fRate),currency:"JMD",effective_date:new Date().toISOString().slice(0,10),source:"manual",note:null});
                    }
                  }
                  showToast(mode==="add"?"✅ Rate added!":"✅ Rate updated!");
                  reload();closeModal();
                }finally{setBusy(false);}
              }}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition disabled:opacity-40">
                {busy?"Saving…":mode==="add"?"Save Rate":"Update"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Update Modal ───────────────────────────────────────────────── */}
      {bulkOpen&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1117] shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/[0.07]">
              <div>
                <div className="text-base font-bold text-slate-900 dark:text-slate-100">Bulk Update Rates</div>
                <div className="text-xs text-slate-500 mt-0.5">Will update <span className="text-amber-400 font-semibold">{bulkTargetCount}</span> items in current view</div>
              </div>
              <button type="button" onClick={()=>setBulkOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-200 dark:bg-white/[0.06] text-slate-500 hover:text-slate-700 dark:text-slate-300 transition">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <div className="text-xs text-slate-500 mb-1.5 font-medium">Batch Name</div>
                <input value={bulkTitle} onChange={e=>setBulkTitle(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500/50"
                  placeholder="e.g. Materials +8% March 2026"/>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1.5 font-medium">Reason (optional)</div>
                <input value={bulkReason} onChange={e=>setBulkReason(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500/50"
                  placeholder="e.g. Supplier price increase"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-500 mb-1.5 font-medium">Mode</div>
                  <select value={bulkMode} onChange={e=>setBulkMode(e.target.value as any)}
                    className="w-full bg-white dark:bg-[#0b1220] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500/50">
                    <option value="percent">Percent (+/- %)</option>
                    <option value="add">Add amount (+/-)</option>
                    <option value="set">Set value</option>
                  </select>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1.5 font-medium">Value</div>
                  <input value={bulkValue} onChange={e=>setBulkValue(e.target.value)} type="number" step="0.01"
                    className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500/50"
                    placeholder={bulkMode==="percent"?"8":bulkMode==="add"?"250":"18500"}/>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1.5 font-medium">Effective Date</div>
                <input type="date" value={bulkEffectiveDate} onChange={e=>setBulkEffectiveDate(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500/50"/>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-600">Scope: current Category filter + selected Type toggles</div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-white/[0.07]">
              <button type="button" onClick={()=>setBulkOpen(false)} disabled={busy}
                className="px-4 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] hover:bg-slate-200 dark:bg-white/[0.07] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-700 dark:text-slate-300 transition disabled:opacity-50">Cancel</button>
              <button type="button" disabled={busy||!bulkValue.trim()||bulkTargetCount===0} onClick={applyBulk}
                className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition disabled:opacity-40">
                {busy?"Applying…":"Apply Bulk Update"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import Modal ────────────────────────────────────────────────────── */}
      {importOpen&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1117] shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/[0.07]">
              <div>
                <div className="text-base font-bold text-slate-900 dark:text-slate-100">Import CSV</div>
                <div className="text-xs text-slate-500 mt-0.5">Preview matches before applying · {importMatched.length} matched · {importUnmatched.length} unmatched</div>
              </div>
              <button type="button" onClick={()=>setImportOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-200 dark:bg-white/[0.06] text-slate-500 hover:text-slate-700 dark:text-slate-300 transition">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden"
                onChange={e=>{const f=e.target.files?.[0];if(!f)return;onPickImportFile(f);e.currentTarget.value="";}}/>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[220px]">
                  <div className="text-xs text-slate-500 mb-1.5 font-medium">Batch Title</div>
                  <input value={importTitle} onChange={e=>setImportTitle(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500/50"
                    placeholder="e.g. Rapid True Value price update"/>
                </div>
                <div className="flex-1 min-w-[220px]">
                  <div className="text-xs text-slate-500 mb-1.5 font-medium">Reason</div>
                  <input value={importReason} onChange={e=>setImportReason(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500/50"
                    placeholder="Optional note"/>
                </div>
                <div className="min-w-[160px]">
                  <div className="text-xs text-slate-500 mb-1.5 font-medium">Effective Date</div>
                  <input type="date" value={importEffectiveDate} onChange={e=>setImportEffectiveDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500/50"/>
                </div>
                <button type="button" onClick={()=>fileInputRef.current?.click()} disabled={busy}
                  className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-white/[0.06] hover:bg-white/[0.09] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-700 dark:text-slate-300 transition flex items-center gap-1.5">
                  <Upload size={13}/> Choose CSV
                </button>
              </div>
              {importCsvName&&<div className="text-xs text-slate-500 dark:text-slate-600">File: <span className="text-slate-600 dark:text-slate-400">{importCsvName}</span> · {importRows.length} rows parsed</div>}
              <div className="grid grid-cols-2 gap-4">
                {[
                  {title:`Matched — will update (${importMatched.length})`,color:"text-green-400",rows:importMatched.map(m=>({row:m.src.rowNum,code:m.src.cost_code||"—",name:m.src.item_name||"—",match:m.matchName,rate:m.src.rate,cur:m.src.currency})),cols:["Row","Code","CSV Item","Match","Rate","Cur"]},
                  {title:`Unmatched — not applied (${importUnmatched.length})`,color:"text-slate-500",rows:importUnmatched.map(r=>({row:r.rowNum,code:r.cost_code||"—",name:r.item_name||"—",match:"",rate:r.rate,cur:""})),cols:["Row","Code","Item","","Rate",""]},
                ].map(({title,color,rows,cols})=>(
                  <div key={title} className="rounded-xl border border-slate-200 dark:border-white/[0.07] overflow-hidden">
                    <div className={`px-3 py-2 text-xs font-semibold ${color} border-b border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02]`}>{title}</div>
                    <div className="max-h-56 overflow-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-slate-100 dark:border-white/[0.05]">{cols.map((c,i)=><th key={i} className="py-2 px-3 text-left text-slate-500 dark:text-slate-600 font-medium">{c}</th>)}</tr></thead>
                        <tbody>
                          {(rows as any[]).slice(0,100).map((r:any)=>(
                            <tr key={r.row} className="border-b border-white/[0.03] hover:bg-slate-50 dark:bg-white/[0.02]">
                              <td className="py-1.5 px-3 text-slate-400 dark:text-slate-700">{r.row}</td>
                              <td className="py-1.5 px-3 text-slate-500 font-mono">{r.code}</td>
                              <td className="py-1.5 px-3 text-slate-600 dark:text-slate-400">{r.name}</td>
                              <td className="py-1.5 px-3 text-slate-500">{r.match}</td>
                              <td className="py-1.5 px-3 text-green-400 font-semibold">{r.rate??""}</td>
                              <td className="py-1.5 px-3 text-slate-500 dark:text-slate-600">{r.cur}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-slate-400 dark:text-slate-700">Columns: cost_code, item_name, rate, currency, unit, category, type/item_type · cost_code is best match; item_name is fallback</div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-white/[0.07]">
              <button type="button" onClick={()=>setImportOpen(false)} disabled={busy}
                className="px-4 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] hover:bg-slate-200 dark:bg-white/[0.07] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-700 dark:text-slate-300 transition disabled:opacity-50">Cancel</button>
              <button type="button" disabled={busy||importMatched.length===0} onClick={applyImport}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition disabled:opacity-40">
                {busy?"Applying…":`Apply ${importMatched.length} Updates`}
              </button>
            </div>
          </div>
        </div>
      )}

      {!isModalOpen && <AIPriceLookup/>}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-emerald-600 text-white text-sm font-semibold shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
