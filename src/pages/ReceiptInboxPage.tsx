// src/pages/ReceiptInboxPage.tsx — /receipt-inbox. Staff snap receipts and leave them here; the accountant (full finance access)
// turns each one into an expense, a supplier bill, a document, or "not needed", and it leaves the inbox. See lib/receiptInbox.ts.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { NewBillModal } from "../components/NewBillModal";
import { listDrawers, type Drawer } from "../lib/filingCabinet";
import {
  asFile, discard, dropReceipt, fileAsDocument, listInbox, markDone, readReceipt, signedUrls, type FromInbox, type InboxItem,
} from "../lib/receiptInbox";

const card = "rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03]";
const btn = "min-h-[40px] rounded-lg px-3 text-sm font-semibold transition disabled:opacity-50";
const input = "rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#111820] px-3 py-2 text-sm text-slate-800 dark:text-slate-200";
const money = (n?: number | null) => n ? `JMD ${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "";
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
const DONE_WORDS: Record<string, string> = { expense: "➕ Expense", bill: "🧾 Supplier bill", document: "🗄️ Document", discarded: "🗑 Not needed" };

export default function ReceiptInboxPage() {
  const nav = useNavigate();
  const location = useLocation();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [me, setMe] = useState<{ id: string; role: string; handler: boolean } | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"new" | "done">("new");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(() => {
    const f = (location.state as { filed?: string } | null)?.filed; return f ? { ok: true, text: f } : null;
  });
  // dropping in
  const [dropJob, setDropJob] = useState("");
  const [dropNote, setDropNote] = useState("");
  const [dropping, setDropping] = useState<string | null>(null);
  const [lastDrops, setLastDrops] = useState(0);
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // handling
  const [big, setBig] = useState<string | null>(null);
  const [billFor, setBillFor] = useState<{ item: InboxItem; file: File } | null>(null);
  const [docFor, setDocFor] = useState<InboxItem | null>(null);
  const [drawers, setDrawers] = useState<Drawer[]>([]);
  const reading = useRef(new Set<string>());

  useEffect(() => {
    if (location.state) nav(location.pathname, { replace: true, state: null });
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: up } = await supabase.from("user_profiles").select("company_id, role, finance_access_level").eq("id", user.id).maybeSingle();
      if (!alive || !up?.company_id) return;
      setCompanyId(up.company_id);
      setMe({ id: user.id, role: up.role || "", handler: up.finance_access_level === "full" });
      const [{ data: pr }, { data: people }] = await Promise.all([
        supabase.from("projects").select("id, name, status").eq("company_id", up.company_id).order("name"),
        supabase.from("user_profiles").select("id, full_name").eq("company_id", up.company_id),
      ]);
      if (!alive) return;
      setProjects(((pr || []) as { id: string; name: string; status: string | null }[]).filter((p) => !["cancelled", "archived"].includes(p.status || "")));
      setNames(Object.fromEntries(((people || []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name || "Staff"])));
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!companyId || !me) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        let r = await listInbox(companyId, tab);
        if (!me.handler) r = r.filter((x) => x.dropped_by === me.id);      // (the database already shows only their own)
        const u = await signedUrls(r.filter((x) => x.status === "new" || x.status === "expense" || x.status === "bill").map((x) => x.file_path));
        if (!alive) return;
        setItems(r); setUrls(u);
      } catch (e) { if (alive) setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not load." }); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [companyId, me, tab, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  // The AI reads any receipt it has not read yet (one at a time, for the person handling the inbox).
  useEffect(() => {
    if (!me?.handler || tab !== "new") return;
    const next = items.find((x) => x.ai_status === "pending" && !reading.current.has(x.id));
    if (!next) return;
    reading.current.add(next.id);
    void readReceipt(next).then((ai) => setItems((list) => list.map((x) => x.id === next.id ? { ...x, ai_status: ai ? "done" : "failed", ai_data: ai } : x)));
  }, [items, me, tab]);

  // ── drop in ────────────────────────────────────────────────────────────────────────────────────────────
  async function drop(list: FileList | null) {
    const files = Array.from(list || []);
    if (!files.length || !companyId) return;
    setMsg(null);
    let ok = 0; const errs: string[] = [];
    for (let i = 0; i < files.length; i++) {
      setDropping(files.length > 1 ? `Saving ${i + 1} of ${files.length}…` : "Saving…");
      try {
        const item = await dropReceipt({ companyId, file: files[i], projectId: dropJob || null, note: dropNote.trim() || null });
        ok++;
        void readReceipt(item, files[i]);                     // the AI reads it in the background
      } catch (e) { errs.push(e instanceof Error ? e.message : files[i].name); }
    }
    setDropping(null); setLastDrops(ok); setDropNote("");
    setMsg(errs.length ? { ok: false, text: `Not saved: ${errs.join(" · ")}` } : { ok: true, text: `✅ ${ok} receipt${ok === 1 ? "" : "s"} dropped in. The accountant takes it from here.` });
    reload();
  }

  // ── handle ─────────────────────────────────────────────────────────────────────────────────────────────
  function toExpense(it: InboxItem) {
    const fi: FromInbox = { id: it.id, path: it.file_path, ai: it.ai_data, projectId: it.project_id, note: it.note };
    nav("/expenses", { state: { fromInbox: fi } });
  }
  async function toBill(it: InboxItem) {
    try { setBillFor({ item: it, file: await asFile(it) }); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not open the picture." }); }
  }
  async function toDocument(it: InboxItem) {
    if (companyId) { try { setDrawers(await listDrawers(companyId)); } catch { setDrawers([]); } }
    setDocFor(it);
  }
  async function notNeeded(it: InboxItem) {
    const own = it.dropped_by === me?.id && !me?.handler;
    const reason = own ? (window.confirm("Take this receipt back out of the inbox? The picture is deleted.") ? "" : null)
      : window.prompt("Why is it not needed? (for example: duplicate, not a receipt, personal)", "");
    if (reason === null || (!own && !reason.trim())) return;
    try { await discard(it, reason); setMsg({ ok: true, text: own ? "Taken back." : "Marked as not needed." }); reload(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not remove." }); }
  }

  const waiting = useMemo(() => items.filter((x) => x.status === "new"), [items]);
  const projName = (id: string | null) => projects.find((p) => p.id === id)?.name || "";
  const isImg = (it: InboxItem) => /^image\//.test(it.mime_type || "");

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void drop(e.target.files); e.target.value = ""; }} />
      <input ref={fileRef} type="file" accept="image/*,.pdf" multiple className="hidden" onChange={(e) => { void drop(e.target.files); e.target.value = ""; }} />

      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">📥 Receipt Inbox</h1>
        <p className="text-xs text-slate-500">Snap the receipt and leave it here. {me?.handler ? "File each one: it leaves the inbox when it's done." : "The accountant files it."}</p>
      </div>

      {/* drop in: big and simple */}
      <div className={`${card} p-4 space-y-3`}>
        <button onClick={() => camRef.current?.click()} disabled={!!dropping || !companyId}
          className="w-full min-h-[96px] rounded-2xl bg-green-600 hover:bg-green-500 active:bg-green-700 text-white shadow disabled:opacity-60">
          <div className="text-4xl leading-none">📷</div>
          <div className="mt-1 text-2xl font-extrabold">{dropping || "SNAP RECEIPT"}</div>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => fileRef.current?.click()} disabled={!!dropping} className={`${btn} border border-slate-300 dark:border-white/[0.15] text-slate-700 dark:text-slate-300`}>📎 Add pictures or PDFs</button>
          <select value={dropJob} onChange={(e) => setDropJob(e.target.value)} className={input} aria-label="Job (optional)">
            <option value="">Job (optional)</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input value={dropNote} onChange={(e) => setDropNote(e.target.value)} placeholder="Note (optional): diesel for the truck" className={`${input} flex-1 min-w-[180px]`} />
        </div>
        {lastDrops > 0 && !dropping && <div className="text-sm text-slate-600 dark:text-slate-400">Have another one? Tap 📷 again.</div>}
      </div>

      {msg && <div className={`rounded-lg border px-4 py-2 text-sm ${msg.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-800"}`}>{msg.text}</div>}

      <div className="flex gap-2">
        {([["new", me?.handler ? `📥 Waiting${tab === "new" ? ` (${waiting.length})` : ""}` : "📥 My receipts waiting"], ["done", "✅ Done"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`${btn} ${tab === k ? "bg-cyan-600 text-white" : "border border-slate-200 dark:border-white/[0.1] text-slate-600 dark:text-slate-300"}`}>{l}</button>
        ))}
      </div>

      {loading ? <div className="text-sm text-slate-500">Loading…</div> : items.length === 0 ? (
        <div className={`${card} p-8 text-center text-sm text-slate-500`}>{tab === "new" ? "🎉 Nothing waiting. The inbox is empty." : "Nothing filed yet."}</div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const a = it.ai_data;
            return (
              <div key={it.id} className={`${card} p-3 flex flex-wrap gap-3`}>
                {urls[it.file_path] && isImg(it)
                  ? <button onClick={() => setBig(urls[it.file_path])} className="shrink-0"><img src={urls[it.file_path]} alt="Receipt" className="h-24 w-20 rounded-lg object-cover border border-slate-200" /></button>
                  : <a href={urls[it.file_path] || undefined} target="_blank" rel="noreferrer" className="shrink-0 h-24 w-20 rounded-lg bg-slate-100 dark:bg-white/[0.05] flex items-center justify-center text-3xl">📄</a>}
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="text-sm text-slate-500">📷 {names[it.dropped_by || ""] || "Staff"} · {when(it.dropped_at)}{it.project_id ? ` · 🏗️ ${projName(it.project_id)}` : ""}</div>
                  {it.note && <div className="text-sm text-slate-700 dark:text-slate-300">“{it.note}”</div>}
                  {it.status === "new" && (
                    it.ai_status === "pending" ? <div className="text-sm text-slate-500">🤖 Reading the receipt…</div>
                    : it.ai_status === "failed" || !a ? <div className="text-sm text-slate-500">🤖 Could not read it. Look at the picture.</div>
                    : <div className="text-sm text-slate-800 dark:text-slate-200">🤖 <b>{a.vendor || "?"}</b>{a.amount ? ` · ${money(a.amount)}` : ""}{a.date ? ` · ${a.date}` : ""}{a.receiptNumber ? ` · #${a.receiptNumber}` : ""}{a.tax ? ` · GCT ${money(a.tax)}` : ""}</div>
                  )}
                  {it.status !== "new" && (
                    <div className="text-sm text-slate-700 dark:text-slate-300">{DONE_WORDS[it.status]}{it.discard_reason ? `: ${it.discard_reason}` : ""} · {names[it.handled_by || ""] || ""} · {when(it.handled_at)}
                      {it.status === "bill" && it.bill_id && <button onClick={() => nav("/accounts-payable")} className="ml-2 text-xs underline text-blue-700">Payables</button>}
                      {it.status === "expense" && <button onClick={() => nav("/expenses")} className="ml-2 text-xs underline text-blue-700">Expenses</button>}
                      {it.status === "document" && <button onClick={() => nav("/documents")} className="ml-2 text-xs underline text-blue-700">Documents</button>}
                    </div>
                  )}
                  {it.status === "new" && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {me?.handler && (<>
                        <button onClick={() => toExpense(it)} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>➕ Expense</button>
                        <button onClick={() => void toBill(it)} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>🧾 Supplier bill</button>
                        <button onClick={() => void toDocument(it)} className={`${btn} border border-slate-300 dark:border-white/[0.15] text-slate-700 dark:text-slate-300`}>🗄️ Document</button>
                      </>)}
                      <button onClick={() => void notNeeded(it)} className={`${btn} border border-red-200 text-red-600`}>{me?.handler ? "🗑 Not needed" : "↩ Take back"}</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {big && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setBig(null)}>
          <img src={big} alt="Receipt" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}

      {billFor && (
        <NewBillModal open companyId={companyId} canApprove={["director", "admin", "office_user", "accountant"].includes(me?.role || "")}
          onClose={() => setBillFor(null)} onDone={(m) => { setMsg({ ok: true, text: m }); reload(); }}
          inbox={{ path: billFor.item.file_path, file: billFor.file, projectId: billFor.item.project_id, onFiled: (billId) => markDone(billFor.item.id, "bill", billId) }} />
      )}

      {docFor && <DocModal item={docFor} drawers={drawers} onClose={() => setDocFor(null)}
        onDone={(t) => { setDocFor(null); setMsg({ ok: true, text: t }); reload(); }} onError={(t) => setMsg({ ok: false, text: t })} />}
    </div>
  );
}

function DocModal({ item, drawers, onClose, onDone, onError }: { item: InboxItem; drawers: Drawer[]; onClose: () => void; onDone: (t: string) => void; onError: (t: string) => void }) {
  const [drawerId, setDrawerId] = useState("");
  const [title, setTitle] = useState(item.note || (item.ai_data?.vendor ? `Receipt from ${item.ai_data.vendor}` : "Receipt"));
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try { await fileAsDocument(item, { drawer: drawers.find((d) => d.id === drawerId) || null, title }); onDone("Filed in Documents."); }
    catch (e) { onError(e instanceof Error ? e.message : "Could not file it."); setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white dark:bg-[#0f151c] p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">🗄️ File in Documents</h2>
        <p className="text-sm text-slate-500">For a paper that is not a cost (a warranty, a guarantee, a delivery note…).</p>
        <label className="block text-xs text-slate-500">Title<input value={title} onChange={(e) => setTitle(e.target.value)} className={`${input} mt-1 w-full`} /></label>
        <label className="block text-xs text-slate-500">Drawer<select value={drawerId} onChange={(e) => setDrawerId(e.target.value)} className={`${input} mt-1 w-full`}>
          <option value="">📥 Not filed yet</option>
          {drawers.map((d) => <option key={d.id} value={d.id}>{d.name}{d.is_private ? " 🔒" : ""}</option>)}
        </select></label>
        <div className="flex gap-2">
          <button onClick={() => void save()} disabled={saving} className={`${btn} bg-green-600 hover:bg-green-500 text-white`}>{saving ? "Filing…" : "File it"}</button>
          <button onClick={onClose} className={`${btn} border border-slate-300 text-slate-600 dark:text-slate-300`}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
