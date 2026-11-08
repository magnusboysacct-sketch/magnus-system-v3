// src/pages/DocumentsPage.tsx — /documents: the company filing cabinet. Drawers on the left (like a filing cabinet in the office),
// documents on the right: add any kind of file, put it in a drawer, link it to a job if you like, search, open, download.
// Data and rules: lib/filingCabinet.ts, migration 20260993000000.
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import {
  MAX_DOC_MB, STARTER_DRAWERS, addDoc, addDrawer, addStarterDrawers, docIcon, listDocs, listDrawers, openDoc, removeDoc, removeDrawer, renameDrawer,
  sizeWords, updateDoc, type DocFile, type Drawer,
} from "../lib/filingCabinet";
import { RENEW_MS, downloadLink, fileLinks } from "../lib/fileLinks";

const card = "rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03]";
const btn = "min-h-[40px] rounded-lg px-3 text-sm font-semibold transition disabled:opacity-50";
const input = "rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#111820] px-3 py-2 text-sm text-slate-800 dark:text-slate-200";
const MANAGE = ["director", "admin", "secretary", "office_user"];
const ALL = "all", LOOSE = "loose";
const day = (d: string | null) => d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "";
const titleOf = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || name;

export default function DocumentsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [me, setMe] = useState<{ id: string; role: string; finance: string } | null>(null);
  const [drawers, setDrawers] = useState<Drawer[]>([]);
  const [docs, setDocs] = useState<DocFile[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [where, setWhere] = useState<string>(ALL);               // ALL, LOOSE, or a drawer id
  const [search, setSearch] = useState("");
  const [job, setJob] = useState("");                            // "" = every job
  const [picked, setPicked] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<DocFile | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: up } = await supabase.from("user_profiles").select("company_id, role, finance_access_level").eq("id", user.id).maybeSingle();
      if (!alive || !up?.company_id) return;
      setCompanyId(up.company_id); setMe({ id: user.id, role: up.role || "", finance: up.finance_access_level || "none" });
      const { data: pr } = await supabase.from("projects").select("id, name").eq("company_id", up.company_id).order("name");
      if (alive) setProjects((pr || []) as { id: string; name: string }[]);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!companyId) return;
    let alive = true;
    (async () => {
      try {
        const [d, f] = await Promise.all([listDrawers(companyId), listDocs(companyId)]);
        if (!alive) return;
        setDrawers(d); setDocs(f);
      } catch (e) { if (alive) setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not load." }); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [companyId, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const canManage = MANAGE.includes(me?.role || "");
  const canPrivate = me?.finance === "full";
  const current = drawers.find((d) => d.id === where) || null;
  const projName = (id: string | null) => projects.find((p) => p.id === id)?.name || "";
  const drawerName = (id: string | null) => drawers.find((d) => d.id === id)?.name || "Not filed yet";
  const canChange = (f: DocFile) => !!me && (f.uploaded_by === me.id || MANAGE.includes(me.role));
  const canRemove = (f: DocFile) => !!me && (f.uploaded_by === me.id || ["director", "admin"].includes(me.role));

  const counts = useMemo(() => {
    const m: Record<string, number> = { [ALL]: docs.length, [LOOSE]: docs.filter((d) => !d.drawer_id).length };
    docs.forEach((d) => { if (d.drawer_id) m[d.drawer_id] = (m[d.drawer_id] || 0) + 1; });
    return m;
  }, [docs]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => (where === ALL || (where === LOOSE ? !d.drawer_id : d.drawer_id === where))
      && (!job || d.project_id === job)
      && (!q || [d.title, d.file_name, d.note, projName(d.project_id), drawerName(d.drawer_id)].some((s) => (s || "").toLowerCase().includes(q))));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, where, job, search, drawers, projects]);


  // ready-made Open / Download links (plain links open on every phone; renewed before they run out)
  const [links, setLinks] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const load = () => { void fileLinks(shown.map((x) => x.file_path)).then((m) => { if (alive) setLinks(m); }).catch(() => { /* the buttons still work */ }); };
    load();
    const t = setInterval(load, RENEW_MS);
    return () => { alive = false; clearInterval(t); };
  }, [shown]);

  // ── adding ─────────────────────────────────────────────────────────────────────────────────────────────
  function pick(list: FileList | File[] | null) {
    const arr = Array.from(list || []);
    const big = arr.filter((f) => f.size > MAX_DOC_MB * 1024 * 1024).map((f) => f.name);
    setPicked(arr.filter((f) => f.size <= MAX_DOC_MB * 1024 * 1024));
    setMsg(big.length ? { ok: false, text: `Too big (more than ${MAX_DOC_MB} MB): ${big.join(", ")}` } : null);
  }
  function onDrop(e: DragEvent) { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files); }

  async function saveFiles(form: { drawerId: string; projectId: string; docDate: string; note: string; titles: string[] }) {
    if (!companyId) return;
    const drawer = drawers.find((d) => d.id === form.drawerId) || null;
    const errs: string[] = [];
    for (let i = 0; i < picked.length; i++) {
      setBusy(`Filing ${i + 1} of ${picked.length}…`);
      try { await addDoc({ companyId, drawer, projectId: form.projectId || null, file: picked[i], title: form.titles[i] || titleOf(picked[i].name), docDate: form.docDate || null, note: form.note.trim() || null }); }
      catch (e) { errs.push(e instanceof Error ? e.message : picked[i].name); }
    }
    setBusy(null);
    setMsg(errs.length ? { ok: false, text: `Not filed: ${errs.join(" · ")}` } : { ok: true, text: `${picked.length} document${picked.length === 1 ? "" : "s"} filed in ${drawer?.name || "Not filed yet"}.` });
    setPicked([]);
    reload();
  }

  // ── drawers ────────────────────────────────────────────────────────────────────────────────────────────
  async function newDrawer() {
    if (!companyId) return;
    const name = window.prompt("Name of the new drawer (for example: Insurance, Contracts, FFTP papers):", "");
    if (!name?.trim()) return;
    const priv = canPrivate && window.confirm("Make it PRIVATE? Only people with full finance access will see what is in it.\n\nOK = private, Cancel = normal");
    try { await addDrawer(companyId, name, priv); setMsg({ ok: true, text: `Drawer "${name.trim()}" made.` }); reload(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not make the drawer." }); }
  }
  async function starters() {
    if (!companyId) return;
    try { await addStarterDrawers(companyId); setMsg({ ok: true, text: "Starter drawers made. Rename or remove any you don't need." }); reload(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not make the drawers." }); }
  }
  async function rename(d: Drawer) {
    const name = window.prompt("New name for the drawer:", d.name);
    if (!name?.trim() || name.trim() === d.name) return;
    try { await renameDrawer(d.id, name); reload(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not rename." }); }
  }
  async function dropDrawer(d: Drawer) {
    const n = counts[d.id] || 0;
    if (!window.confirm(`Remove the drawer "${d.name}"?${n ? ` Its ${n} document${n === 1 ? "" : "s"} are kept and go to "Not filed yet".` : ""}`)) return;
    try { await removeDrawer(d.id); setWhere(ALL); reload(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not remove." }); }
  }

  // ── one document ───────────────────────────────────────────────────────────────────────────────────────
  async function open(f: DocFile, download = false) { try { await openDoc(f, download); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not open." }); } }
  async function remove(f: DocFile) {
    if (!window.confirm(`Remove "${f.title}"? The file is deleted.`)) return;
    try { await removeDoc(f); setMsg({ ok: true, text: "Removed." }); reload(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not remove." }); }
  }

  const DrawerBtn = ({ id, label, icon, n, lock }: { id: string; label: string; icon: string; n: number; lock?: boolean }) => (
    <button onClick={() => setWhere(id)}
      className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${where === id ? "bg-cyan-600 text-white" : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.05]"}`}>
      <span className="truncate">{icon} {label}{lock ? " 🔒" : ""}</span><span className={`text-xs ${where === id ? "text-white/80" : "text-slate-400"}`}>{n}</span>
    </button>
  );

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4" onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
      <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">🗄️ Documents</h1>
          <p className="text-xs text-slate-500">The company filing cabinet. Keep any document here, in drawers, and find it again fast.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => fileRef.current?.click()} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>📎 Add documents</button>
          <button onClick={() => camRef.current?.click()} className={`${btn} border border-slate-300 dark:border-white/[0.15] text-slate-700 dark:text-slate-300`}>📷 Take a picture</button>
        </div>
      </div>

      {msg && <div className={`rounded-lg border px-4 py-2 text-sm ${msg.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-800"}`}>{msg.text}</div>}
      {dragOver && <div className="rounded-xl border-2 border-dashed border-blue-400 bg-blue-50 dark:bg-blue-500/10 p-6 text-center text-blue-800 dark:text-blue-300">Drop the files here to file them</div>}

      {picked.length > 0 && <AddPanel files={picked} drawers={drawers} projects={projects} defaultDrawer={current?.id || ""} defaultJob={job} busy={busy}
        onSave={(f) => void saveFiles(f)} onCancel={() => setPicked([])} />}

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
        {/* the drawers */}
        <div className={`${card} p-2 space-y-1 self-start`}>
          <DrawerBtn id={ALL} label="All documents" icon="📚" n={counts[ALL] || 0} />
          <DrawerBtn id={LOOSE} label="Not filed yet" icon="📥" n={counts[LOOSE] || 0} />
          <div className="my-1 border-t border-slate-100 dark:border-white/[0.06]" />
          {drawers.map((d) => <DrawerBtn key={d.id} id={d.id} label={d.name} icon="🗂️" n={counts[d.id] || 0} lock={d.is_private} />)}
          {!loading && drawers.length === 0 && canManage && (
            <div className="p-2 space-y-2 text-xs text-slate-500">
              No drawers yet.
              <button onClick={() => void starters()} className={`${btn} w-full bg-cyan-600 hover:bg-cyan-500 text-white text-xs`}>✨ Set up starter drawers</button>
              <div className="text-[11px]">{STARTER_DRAWERS.map((d) => d.name).join(" · ")}</div>
            </div>
          )}
          {canManage && <button onClick={() => void newDrawer()} className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-cyan-700 dark:text-cyan-400 hover:bg-slate-100 dark:hover:bg-white/[0.05]">＋ New drawer</button>}
          {current && canManage && (
            <div className="flex gap-3 px-3 pt-1 text-xs">
              <button onClick={() => void rename(current)} className="text-slate-600 dark:text-slate-300 underline">Rename</button>
              {["director", "admin"].includes(me?.role || "") && <button onClick={() => void dropDrawer(current)} className="text-red-600 underline">Remove drawer</button>}
            </div>
          )}
        </div>

        {/* the documents */}
        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search title, file name, note, job…" className={`${input} flex-1 min-w-[200px]`} />
            <select value={job} onChange={(e) => setJob(e.target.value)} className={input}>
              <option value="">Every job</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {where === ALL ? "📚 All documents" : where === LOOSE ? "📥 Not filed yet" : `🗂️ ${current?.name || ""}${current?.is_private ? " 🔒 private" : ""}`} · {shown.length}
          </div>
          {loading ? <div className="text-sm text-slate-500">Loading…</div> : shown.length === 0 ? (
            <div className={`${card} p-8 text-center text-sm text-slate-500`}>
              {docs.length === 0 ? <>The cabinet is empty. Tap <b>📎 Add documents</b>, or drag files onto this page.</> : "Nothing here matches."}
            </div>
          ) : (
            <div className="space-y-2">
              {shown.map((f) => (
                <div key={f.id} className={`${card} p-3 flex flex-wrap items-center gap-3`}>
                  <div className="text-2xl">{docIcon(f.mime_type)}</div>
                  <div className="min-w-0 flex-1">
                    {links[f.file_path]
                      ? <a href={links[f.file_path]} target="_blank" rel="noopener noreferrer" className="text-left font-semibold text-blue-700 dark:text-blue-400 hover:underline break-words">{f.title}</a>
                      : <button onClick={() => void open(f)} className="text-left font-semibold text-blue-700 dark:text-blue-400 hover:underline break-words">{f.title}</button>}
                    <div className="text-xs text-slate-500 break-all">
                      {f.doc_date ? `${day(f.doc_date)} · ` : ""}{where === ALL ? `🗂️ ${drawerName(f.drawer_id)} · ` : ""}{f.project_id ? `🏗️ ${projName(f.project_id)} · ` : ""}{f.is_private ? "🔒 · " : ""}{f.file_name} · {sizeWords(f.size_bytes)}
                    </div>
                    {f.note && <div className="text-xs text-slate-600 dark:text-slate-400">{f.note}</div>}
                  </div>
                  <div className="flex gap-3 text-xs font-semibold">
                    {links[f.file_path]
                      ? <a href={links[f.file_path]} target="_blank" rel="noopener noreferrer" className="text-blue-700 dark:text-blue-400 underline">Open</a>
                      : <button onClick={() => void open(f)} className="text-blue-700 dark:text-blue-400 underline">Open</button>}
                    {links[f.file_path]
                      ? <a href={downloadLink(links[f.file_path], f.file_name)} download={f.file_name} className="text-slate-600 dark:text-slate-300 underline">Download</a>
                      : <button onClick={() => void open(f, true)} className="text-slate-600 dark:text-slate-300 underline">Download</button>}
                    {canChange(f) && <button onClick={() => setEditing(f)} className="text-slate-600 dark:text-slate-300 underline">Edit / move</button>}
                    {canRemove(f) && <button onClick={() => void remove(f)} className="text-red-600 underline">Remove</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editing && <EditDoc doc={editing} drawers={drawers} projects={projects} onClose={() => setEditing(null)}
        onSaved={(t) => { setEditing(null); setMsg({ ok: true, text: t }); reload(); }} onError={(t) => setMsg({ ok: false, text: t })} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs text-slate-500">{label}<div className="mt-1">{children}</div></label>;
}

// After choosing files: where to file them.
function AddPanel({ files, drawers, projects, defaultDrawer, defaultJob, busy, onSave, onCancel }: {
  files: File[]; drawers: Drawer[]; projects: { id: string; name: string }[]; defaultDrawer: string; defaultJob: string; busy: string | null;
  onSave: (f: { drawerId: string; projectId: string; docDate: string; note: string; titles: string[] }) => void; onCancel: () => void;
}) {
  const [drawerId, setDrawerId] = useState(defaultDrawer);
  const [projectId, setProjectId] = useState(defaultJob);
  const [docDate, setDocDate] = useState("");
  const [note, setNote] = useState("");
  const [titles, setTitles] = useState<string[]>(() => files.map((f) => titleOf(f.name)));
  return (
    <div className={`${card} p-4 space-y-3 border-blue-300`}>
      <div className="font-semibold text-slate-800 dark:text-slate-100">File {files.length} document{files.length === 1 ? "" : "s"}</div>
      <div className="space-y-2">
        {files.map((f, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="text-xl">{docIcon(f.type || null)}</span>
            <input value={titles[i] || ""} onChange={(e) => setTitles((t) => t.map((x, j) => j === i ? e.target.value : x))} className={`${input} flex-1 min-w-[180px]`} aria-label={`Title for ${f.name}`} />
            <span className="text-xs text-slate-500">{f.name} · {sizeWords(f.size)}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <Field label="Drawer"><select value={drawerId} onChange={(e) => setDrawerId(e.target.value)} className={`${input} w-full`}>
          <option value="">📥 Not filed yet</option>
          {drawers.map((d) => <option key={d.id} value={d.id}>{d.name}{d.is_private ? " 🔒" : ""}</option>)}
        </select></Field>
        <Field label="Job (optional)"><select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={`${input} w-full`}>
          <option value="">No job</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></Field>
        <Field label="Date on the document (optional)"><input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className={`${input} w-full`} /></Field>
        <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. signed copy" className={`${input} w-full`} /></Field>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ drawerId, projectId, docDate, note, titles })} disabled={!!busy} className={`${btn} bg-green-600 hover:bg-green-500 text-white`}>{busy || "🗄️ File it"}</button>
        <button onClick={onCancel} disabled={!!busy} className={`${btn} border border-slate-300 text-slate-600 dark:text-slate-300`}>Cancel</button>
      </div>
    </div>
  );
}

function EditDoc({ doc, drawers, projects, onClose, onSaved, onError }: {
  doc: DocFile; drawers: Drawer[]; projects: { id: string; name: string }[]; onClose: () => void; onSaved: (t: string) => void; onError: (t: string) => void;
}) {
  const [title, setTitle] = useState(doc.title);
  const [drawerId, setDrawerId] = useState(doc.drawer_id || "");
  const [projectId, setProjectId] = useState(doc.project_id || "");
  const [docDate, setDocDate] = useState(doc.doc_date || "");
  const [note, setNote] = useState(doc.note || "");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await updateDoc(doc, { title, drawer: drawerId === (doc.drawer_id || "") ? undefined : (drawers.find((d) => d.id === drawerId) || null),
        project_id: projectId || null, doc_date: docDate || null, note: note.trim() || null });
      onSaved("Saved.");
    } catch (e) { onError(e instanceof Error ? e.message : "Could not save."); setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white dark:bg-[#0f151c] p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Edit / move</h2><button onClick={onClose} className="text-2xl text-slate-500" aria-label="Close">×</button></div>
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} className={`${input} w-full`} /></Field>
        <Field label="Drawer"><select value={drawerId} onChange={(e) => setDrawerId(e.target.value)} className={`${input} w-full`}>
          <option value="">📥 Not filed yet</option>
          {drawers.map((d) => <option key={d.id} value={d.id}>{d.name}{d.is_private ? " 🔒" : ""}</option>)}
        </select></Field>
        <Field label="Job"><select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={`${input} w-full`}>
          <option value="">No job</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></Field>
        <Field label="Date on the document"><input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className={`${input} w-full`} /></Field>
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} className={`${input} w-full`} /></Field>
        <div className="flex gap-2">
          <button onClick={() => void save()} disabled={saving} className={`${btn} bg-green-600 hover:bg-green-500 text-white`}>{saving ? "Saving…" : "Save"}</button>
          <button onClick={onClose} className={`${btn} border border-slate-300 text-slate-600 dark:text-slate-300`}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
