// src/components/AIPriceLookup.tsx — Floating AI price assistant for Rate Library
// Units loaded from master_units table — no hardcoding
// Saving updates the EXISTING Rate Library item when there is one (it used to always create a new item, making duplicates):
// matching items are listed while typing; an exact name + unit match is picked by itself. Updating adds an "ai" price to the
// item's price history (the Rate Library shows the latest price), so earlier prices are kept.
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { magnusAI } from "../lib/magnusAI";

const JMD_RATE = 157;

async function askAI(item: string, unit: string): Promise<{jmd:number;usd:number;notes:string}|null> {
  try {
    const text = await magnusAI.chat(
      `You are a Jamaica construction materials pricing assistant. Based on typical Jamaica market rates, estimate the price for "${item}" per ${unit} in Kingston Jamaica. Use J$157 per USD. Give a realistic estimate even if approximate. Respond ONLY with this JSON and nothing else: {"price_jmd":1500,"price_usd":10,"notes":"Estimated based on Hardware and Lumber Kingston typical rates"}`
    );
    const clean = String(text).replace(/```json|```/g,"").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON: " + clean.slice(0,100));
    const p = JSON.parse(clean.slice(start, end+1));
    return {jmd:Number(p.price_jmd)||0, usd:Number(p.price_usd)||0, notes:p.notes||""};
  } catch(e) { console.error("AI price error:", e); return null; }
}

function fmt(n:number,cur="JMD"){
  return new Intl.NumberFormat("en-US",{style:"currency",currency:cur,minimumFractionDigits:2}).format(n);
}

// Fallback units in case DB is unavailable
const FALLBACK_UNITS = [
  "each","ft","m","bag","lb","kg","ton","gal","L",
  "sq ft","m²","ft³","m³","yd³","roll","sheet","box",
  "bundle","pack","board","day","hr","week","job","load","trip"
];

interface LibraryItem { id: string; item_name: string; unit: string | null; current_rate: number | null }
const normName = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const today = () => new Date().toISOString().slice(0, 10);

export default function AIPriceLookup() {
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState("");
  const [unit, setUnit] = useState("each");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{jmd:number;usd:number;notes:string}|null>(null);
  const [history, setHistory] = useState<{item:string;unit:string;jmd:number;usd:number}[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string|null>(null);
  const [units, setUnits] = useState<string[]>(FALLBACK_UNITS);
  // Rate Library items like the one typed, and the one being priced (null = a new item).
  const [matches, setMatches] = useState<LibraryItem[]>([]);
  const [chosen, setChosen] = useState<LibraryItem | null>(null);

  useEffect(() => {
    const term = item.trim();
    if (chosen || term.length < 3) return;
    let alive = true;
    const t = window.setTimeout(async () => {
      const words = normName(term).split(" ").filter((w) => w.length >= 2).slice(0, 3);
      let q = supabase.from("v_cost_items_current").select("id,item_name,unit,current_rate");
      for (const w of words) q = q.ilike("item_name", `%${w}%`);
      const { data } = await q.order("item_name").limit(6);
      if (alive) setMatches(((data || []) as LibraryItem[]).map((m) => ({ ...m, current_rate: m.current_rate == null ? null : Number(m.current_rate) })));
    }, 400);
    return () => { alive = false; window.clearTimeout(t); };
  }, [item, chosen]);

  function choose(m: LibraryItem | null) {
    setChosen(m);
    setSaved(false); setSaveError(null);
    if (m) { setItem(m.item_name); if (m.unit) setUnit(m.unit); }
  }

  // Load units from master_units table
  useEffect(() => {
    supabase
      .from("master_units")
      .select("name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        if (data && data.length > 0) {
          setUnits(data.map((u: any) => u.name));
        }
      });
  }, []);

  async function lookup() {
    if (!item.trim()) return;
    setLoading(true); setResult(null); setSaved(false); setSaveError(null);
    // The same name and unit already in the Rate Library: price that item.
    if (!chosen) {
      const exact = matches.find((m) => normName(m.item_name) === normName(item) && (m.unit || "") === unit);
      if (exact) setChosen(exact);
    }
    const r = await askAI(item, unit);
    if (r) { setResult(r); setHistory(h=>[{item,unit,jmd:r.jmd,usd:r.usd},...h.slice(0,9)]); }
    setLoading(false);
  }

  // Adds today's AI price to an item's price history (one AI price per item per day: a second lookup the same day replaces it).
  async function addAiPrice(costItemId: string, jmd: number, notes: string) {
    const { error } = await supabase.from("cost_item_rates").upsert({
      cost_item_id: costItemId, rate: jmd, currency: "JMD", effective_date: today(), source: "ai", note: notes || null,
      created_at: new Date().toISOString(),
    }, { onConflict: "cost_item_id,effective_date,source" });
    if (error) throw error;
  }

  async function saveToLibrary() {
    if (!result) return;
    setSaving(true); setSaveError(null);
    try {
      if (chosen) {
        await addAiPrice(chosen.id, result.jmd, result.notes);
        setChosen({ ...chosen, current_rate: result.jmd });
        setSaved(true);
        window.dispatchEvent(new Event("magnus:rates-changed"));
        setSaving(false);
        return;
      }
      // A new item - unless the same name and unit is already there (then that one gets the price).
      const { data: same } = await supabase.from("v_cost_items_current").select("id,item_name,unit,current_rate").ilike("item_name", item.trim()).limit(5);
      const dup = ((same || []) as LibraryItem[]).find((m) => normName(m.item_name) === normName(item) && (m.unit || "") === unit);
      if (dup) {
        await addAiPrice(dup.id, result.jmd, result.notes);
        setChosen({ ...dup, current_rate: result.jmd });
        setSaved(true);
        window.dispatchEvent(new Event("magnus:rates-changed"));
        setSaving(false);
        return;
      }
      const {data:{user}} = await supabase.auth.getUser();
      if (!user) { setSaving(false); return; }
      const {data:p} = await supabase.from("user_profiles").select("company_id").eq("id",user.id).maybeSingle();
      const {data:ci, error:e1} = await supabase.from("cost_items").insert({
        item_name: item, unit, unit_rate: result.jmd,
        rate_jmd: result.jmd, rate_usd: result.usd,
        price_notes: result.notes, ai_suggested: true,
        company_id: p?.company_id, is_active: true,
        item_type: "Material", category: "AI Suggested",
      }).select().single();
      if (e1) throw e1;
      await addAiPrice(ci.id, result.jmd, result.notes);
      setChosen({ id: ci.id, item_name: item, unit, current_rate: result.jmd });
      setSaved(true);
      window.dispatchEvent(new Event("magnus:rates-changed"));
    } catch(e:any) {
      console.error("Save error:", e);
      setSaveError(e?.message || String(e));
    }
    setSaving(false);
  }

  // Icon-only below sm: — the full "AI Price Lookup" label pill was a
  // large fixed-position footprint relative to a narrow phone screen,
  // overlapping/covering table rows underneath it. Position (bottom-20
  // on mobile vs bottom-6 on desktop) is untouched — that offset already
  // looks deliberately tuned for mobile chrome and there's no evidence
  // it's wrong, only that the button's own size was too large. padding
  // moved from the inline style into responsive Tailwind classes so it
  // can differ by breakpoint (inline style can't do that).
  if (!open) return (
    <button onClick={()=>setOpen(true)}
      className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-[200] p-3 sm:py-3 sm:px-[18px]"
      style={{background:"linear-gradient(135deg,#7c3aed,#4f46e5)",border:"none",borderRadius:16,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:8,boxShadow:"0 8px 32px rgba(124,58,237,0.4)"}}>
      <span style={{fontSize:16}}>✨</span>
      <span className="hidden sm:inline">AI Price Lookup</span>
    </button>
  );

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-[200]"
      style={{width:340,background:"#0d1117",border:"1px solid rgba(124,58,237,0.3)",borderRadius:20,boxShadow:"0 16px 48px rgba(0,0,0,0.5)",overflow:"hidden"}}>
      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#7c3aed,#4f46e5)",padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>✨</span>
          <div>
            <div style={{fontWeight:700,fontSize:14,color:"#fff"}}>AI Price Lookup</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.6)"}}>Jamaica market prices</div>
          </div>
        </div>
        <button onClick={()=>setOpen(false)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,padding:"4px 8px",color:"#fff",cursor:"pointer",fontSize:12}}>✕</button>
      </div>

      <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
        {/* Input */}
        <div style={{display:"flex",gap:8}}>
          <input value={item} onChange={e=>{ setItem(e.target.value); if (chosen) setChosen(null); setSaved(false); }} onKeyDown={e=>e.key==="Enter"&&lookup()}
            placeholder="e.g. Portland Cement 50kg"
            style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"9px 12px",fontSize:13,color:"#f1f5f9",outline:"none"}}/>
          <select value={unit} onChange={e=>setUnit(e.target.value)}
            style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"9px 8px",fontSize:12,color:"#f1f5f9",outline:"none",cursor:"pointer",maxWidth:90}}>
            {units.map(u=><option key={u} value={u}>{u}</option>)}
          </select>
        </div>

        {chosen ? (
          <div style={{fontSize:11,color:"#a78bfa",background:"rgba(124,58,237,0.1)",border:"1px solid rgba(124,58,237,0.25)",borderRadius:8,padding:"6px 10px",display:"flex",justifyContent:"space-between",gap:8}}>
            <span>Updating your Rate Library item: <b>{chosen.item_name}</b>{chosen.unit?` / ${chosen.unit}`:""}{chosen.current_rate!=null?` (now ${fmt(chosen.current_rate)})`:""}</span>
            <button onClick={()=>choose(null)} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:11,textDecoration:"underline"}}>new item</button>
          </div>
        ) : matches.length > 0 && item.trim().length >= 3 ? (
          <div>
            <div style={{fontSize:10,color:"#475569",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Already in your Rate Library - tap to update it</div>
            <div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:130,overflowY:"auto"}}>
              {matches.map(m=>(
                <button key={m.id} onClick={()=>choose(m)}
                  style={{display:"flex",justifyContent:"space-between",gap:8,padding:"5px 9px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:7,cursor:"pointer",textAlign:"left"}}>
                  <span style={{fontSize:11,color:"#cbd5e1"}}>{m.item_name}{m.unit?` / ${m.unit}`:""}</span>
                  <span style={{fontSize:11,color:"#22c55e",fontWeight:600,whiteSpace:"nowrap"}}>{m.current_rate!=null?fmt(m.current_rate):"no price"}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <button onClick={lookup} disabled={loading||!item.trim()}
          style={{width:"100%",padding:"10px 0",background:loading?"rgba(124,58,237,0.4)":"#7c3aed",border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",transition:"all 0.2s"}}>
          {loading?"Getting Jamaica price…":"Get AI Price ✨"}
        </button>

        {/* Result */}
        {result && (
          <div style={{background:"rgba(124,58,237,0.1)",border:"1px solid rgba(124,58,237,0.25)",borderRadius:12,padding:14}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div style={{textAlign:"center",background:"rgba(34,197,94,0.1)",borderRadius:8,padding:"10px 6px",border:"1px solid rgba(34,197,94,0.2)"}}>
                <div style={{fontSize:16,fontWeight:800,color:"#22c55e"}}>{fmt(result.jmd)}</div>
                <div style={{fontSize:10,color:"#475569",marginTop:2}}>Jamaican Dollar</div>
              </div>
              <div style={{textAlign:"center",background:"rgba(59,130,246,0.1)",borderRadius:8,padding:"10px 6px",border:"1px solid rgba(59,130,246,0.2)"}}>
                <div style={{fontSize:16,fontWeight:800,color:"#3b82f6"}}>{fmt(result.usd,"USD")}</div>
                <div style={{fontSize:10,color:"#475569",marginTop:2}}>US Dollar</div>
              </div>
            </div>
            <div style={{fontSize:11,color:"#64748b",marginBottom:10,lineHeight:1.5}}>📍 {result.notes}</div>
            {saveError && (
              <div style={{background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,padding:"8px 10px",fontSize:11,color:"#f87171",marginBottom:6,wordBreak:"break-all"}}>
                ❌ {saveError}
              </div>
            )}
            <button onClick={saveToLibrary} disabled={saving||saved}
              style={{width:"100%",padding:"8px 0",background:saved?"rgba(34,197,94,0.2)":saving?"rgba(255,255,255,0.05)":"rgba(124,58,237,0.2)",border:`1px solid ${saved?"rgba(34,197,94,0.3)":"rgba(124,58,237,0.3)"}`,borderRadius:8,color:saved?"#22c55e":"#a78bfa",fontSize:12,fontWeight:600,cursor:"pointer"}}>
              {saved?(chosen?`✓ Price updated: ${chosen.item_name}`:"✓ Saved to Rate Library!"):saving?"Saving…":chosen?`Update price of ${chosen.item_name}`:"+ Save as a new item"}
            </button>
          </div>
        )}

        {/* History */}
        {history.length>0 && (
          <div>
            <div style={{fontSize:10,color:"#475569",fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>Recent Lookups</div>
            <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:120,overflowY:"auto"}}>
              {history.map((h,i)=>(
                <button key={i} onClick={()=>{setItem(h.item);setUnit(h.unit);setResult({jmd:h.jmd,usd:h.usd,notes:""});}}
                  style={{display:"flex",justifyContent:"space-between",padding:"6px 10px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,cursor:"pointer",textAlign:"left"}}>
                  <span style={{fontSize:12,color:"#94a3b8"}}>{h.item} / {h.unit}</span>
                  <span style={{fontSize:12,color:"#22c55e",fontWeight:600}}>{fmt(h.jmd)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Unit count indicator */}
        <div style={{fontSize:9,color:"#334155",textAlign:"center"}}>
          {units.length} units from Settings · Add more in Settings → Master Lists
        </div>
      </div>
    </div>
  );
}
