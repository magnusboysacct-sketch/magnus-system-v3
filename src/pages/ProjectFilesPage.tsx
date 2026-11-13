// src/pages/ProjectFilesPage.tsx — /projects/:projectId/files?folder=client_boq|statement: the project's two folders for papers the
// client gives: "Client BOQ" (e.g. Food For The Poor's BOQ) and "Statements" (their payment statements). See lib/projectFiles.ts.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { todayLocal } from "../lib/jamaica";
import {
  FOLDER_WORDS, addProjectFile, fileProblem, listProjectFiles, openProjectFile, removeProjectFile, updateProjectFile,
  type FileFolder, type ProjectFile,
} from "../lib/projectFiles";
import { RENEW_MS, downloadLink, fileLinks } from "../lib/fileLinks";
import FileViewer from "../components/FileViewer";
import { projectFileLink } from "../lib/projectFiles";

const card = "rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03]";
const btn = "min-h-[40px] rounded-lg px-3 text-sm font-semibold transition disabled:opacity-50";
const input = "rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#111820] px-3 py-2 text-sm text-slate-800 dark:text-slate-200";
const money = (n: number) => `JMD ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: string | null) => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "";
const kb = (n: number | null) => n == null ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
const icon = (f: ProjectFile) => /pdf/.test(f.mime_type || "") ? "📕" : /image/.test(f.mime_type || "") ? "🖼️" : /sheet|excel|csv/.test(f.mime_type || "") ? "📊" : /word/.test(f.mime_type || "") ? "📝" : "📄";

export default function ProjectFilesPage() {
  const { projectId = "" } = useParams();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const folder: FileFolder = sp.get("folder") === "statement" ? "statement" : sp.get("folder") === "drawing" ? "drawing" : "client_boq";
  const [project, setProject] = useState<{ name: string; company_id: string } | null>(null);
  const [me, setMe] = useState<{ id: string; role: string; finance: string } | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  // the add form
  const [picked, setPicked] = useState<File[]>([]);
  const [docDate, setDocDate] = useState(todayLocal());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: p }, { data: { user } }] = await Promise.all([
        supabase.from("projects").select("name, company_id").eq("id", projectId).maybeSingle(),
        supabase.auth.getUser(),
      ]);
      if (!alive) return;
      setProject(p as { name: string; company_id: string } | null);
      if (user) {
        const { data: up } = await supabase.from("user_profiles").select("role, finance_access_level").eq("id", user.id).maybeSingle();
        if (alive) setMe({ id: user.id, role: up?.role || "", finance: up?.finance_access_level || "none" });
      }
    })();
    return () => { alive = false; };
  }, [projectId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try { const r = await listProjectFiles(projectId); if (alive) setFiles(r); }
      catch (e) { if (alive) setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not load." }); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [projectId, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const inFolder = useMemo(() => files.filter((f) => f.folder === folder), [files, folder]);
  const counts = useMemo(() => ({ client_boq: files.filter((f) => f.folder === "client_boq").length, statement: files.filter((f) => f.folder === "statement").length,
    drawing: files.filter((f) => f.folder === "drawing").length }), [files]);
  const paidTotal = useMemo(() => inFolder.reduce((t, f) => t + (Number(f.amount) || 0), 0), [inFolder]);
  const canStatements = me?.finance === "full";
  const blocked = folder === "statement" && me != null && !canStatements;
  const canChange = (f: ProjectFile) => me != null && (f.uploaded_by === me.id || ["director", "admin"].includes(me.role));


  // ready-made Open / Download links (plain links open on every phone; renewed before they run out)
  const [links, setLinks] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const load = () => { void fileLinks(inFolder.map((x) => x.file_path)).then((m) => { if (alive) setLinks(m); }).catch(() => { /* the buttons still work */ }); };
    load();
    const t = setInterval(load, RENEW_MS);
    return () => { alive = false; clearInterval(t); };
  }, [inFolder]);

  function pick(list: FileList | null) {
    const arr = Array.from(list || []);
    const bad = arr.map(fileProblem).filter(Boolean) as string[];
    const good = arr.filter((f) => !fileProblem(f));
    const dup = good.filter((f) => inFolder.some((x) => x.file_name === f.name)).map((f) => f.name);
    setPicked(good);
    setMsg(bad.length ? { ok: false, text: bad.join(" ") } : dup.length ? { ok: false, text: `Already in this folder: ${dup.join(", ")}. It will be added again if you save.` } : null);
  }

  async function save() {
    if (!project || !picked.length) return;
    const amt = amount.trim() ? Number(amount.replace(/,/g, "")) : null;
    if (amt != null && (!isFinite(amt) || amt < 0)) { setMsg({ ok: false, text: "Type the amount as a number, for example 250000." }); return; }
    setMsg(null);
    const errs: string[] = [];
    for (let i = 0; i < picked.length; i++) {
      setBusy(`Saving ${i + 1} of ${picked.length}…`);
      try {
        await addProjectFile({ companyId: project.company_id, projectId, folder, file: picked[i], docDate: docDate || null,
          amount: folder === "statement" && i === 0 ? amt : null, note: note.trim() || null });
      } catch (e) { errs.push(e instanceof Error ? e.message : picked[i].name); }
    }
    setBusy(null);
    setMsg(errs.length ? { ok: false, text: `Not saved: ${errs.join(" · ")}` } : { ok: true, text: `${picked.length} file${picked.length === 1 ? "" : "s"} saved in ${FOLDER_WORDS[folder].title}.` });
    setPicked([]); setAmount(""); setNote(""); setDocDate(todayLocal());
    reload();
  }

  // Open = the in-app viewer (same on phone, tablet and computer)
  const [viewer, setViewer] = useState<{ url: string; name: string; mime: string | null } | null>(null);
  async function view(f: ProjectFile) {
    try { setViewer({ url: links[f.file_path] || await projectFileLink(f), name: f.file_name, mime: f.mime_type }); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not open." }); }
  }
  async function open(f: ProjectFile, download = false) {
    try { await openProjectFile(f, download); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not open." }); }
  }
  async function edit(f: ProjectFile) {
    const d = window.prompt("Date (YYYY-MM-DD):", f.doc_date || "");
    if (d === null) return;
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) { setMsg({ ok: false, text: "Type the date like 2026-11-07." }); return; }
    let amt: number | null = f.amount;
    if (f.folder === "statement") {
      const a = window.prompt("Amount paid (JMD), or leave empty:", f.amount != null ? String(f.amount) : "");
      if (a === null) return;
      amt = a.trim() ? Number(a.replace(/,/g, "")) : null;
      if (amt != null && (!isFinite(amt) || amt < 0)) { setMsg({ ok: false, text: "Type the amount as a number." }); return; }
    }
    const n = window.prompt("Note (optional):", f.note || "");
    if (n === null) return;
    try { await updateProjectFile(f.id, { doc_date: d || null, amount: amt, note: n.trim() || null }); reload(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save." }); }
  }
  async function remove(f: ProjectFile) {
    if (!window.confirm(`Remove "${f.file_name}" from ${FOLDER_WORDS[f.folder].title}? The file is deleted.`)) return;
    try { await removeProjectFile(f); setMsg({ ok: true, text: "Removed." }); reload(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not remove." }); }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <input ref={fileRef} type="file" multiple accept=".pdf,image/*,.xlsx,.xls,.docx,.doc,.csv" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <button onClick={() => nav(`/projects/${projectId}`)} className="text-xs text-slate-500 hover:underline">← {project?.name || "Project"}</button>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">📁 Project files</h1>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["client_boq", "drawing", "statement"] as FileFolder[]).map((k) => (
          <button key={k} onClick={() => { setSp({ folder: k }, { replace: true }); setPicked([]); setMsg(null); }}
            className={`${btn} ${folder === k ? "bg-cyan-600 text-white" : "border border-slate-200 dark:border-white/[0.1] text-slate-600 dark:text-slate-300"}`}>
            {FOLDER_WORDS[k].icon} {FOLDER_WORDS[k].title} <span className="opacity-70">({counts[k]})</span>
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-500">{FOLDER_WORDS[folder].hint}</p>

      {msg && <div className={`rounded-lg border px-4 py-2 text-sm ${msg.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-800"}`}>{msg.text}</div>}

      {blocked ? (
        <div className={`${card} p-6 text-center text-sm text-slate-500`}>🔒 Statements are money papers. Only people with full finance access can see or add them. Ask a director.</div>
      ) : (<>
        {/* add */}
        <div className={`${card} p-4 space-y-3`}>
          <div className="font-semibold text-slate-800 dark:text-slate-100">Add to {FOLDER_WORDS[folder].title}</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => fileRef.current?.click()} disabled={!!busy} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>📎 Choose file(s)</button>
            <button onClick={() => camRef.current?.click()} disabled={!!busy} className={`${btn} border border-slate-300 text-slate-700 dark:text-slate-300`}>📷 Take a picture</button>
          </div>
          {picked.length > 0 && (<>
            <div className="text-sm text-slate-700 dark:text-slate-300">{picked.map((f) => `${f.name} (${kb(f.size)})`).join(", ")}</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="text-xs text-slate-500">{folder === "statement" ? "Statement / payment date" : "Date on the BOQ"}
                <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className={`${input} mt-1 w-full`} /></label>
              {folder === "statement" && <label className="text-xs text-slate-500">Amount paid (JMD, optional)
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="250000" className={`${input} mt-1 w-full`} /></label>}
              <label className={`text-xs text-slate-500 ${folder === "statement" ? "" : "sm:col-span-2"}`}>Note (optional)
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={folder === "statement" ? "e.g. 2nd payment" : "e.g. Revised BOQ"} className={`${input} mt-1 w-full`} /></label>
            </div>
            <div className="flex gap-2">
              <button onClick={() => void save()} disabled={!!busy} className={`${btn} bg-green-600 hover:bg-green-500 text-white`}>{busy || "💾 Save"}</button>
              <button onClick={() => { setPicked([]); setMsg(null); }} disabled={!!busy} className={`${btn} border border-slate-300 text-slate-600 dark:text-slate-300`}>Cancel</button>
            </div>
          </>)}
        </div>

        {folder === "statement" && inFolder.length > 0 && (
          <div className={`${card} p-3 text-sm text-slate-700 dark:text-slate-300`}>Total of the amounts on these statements: <b>{money(paidTotal)}</b></div>
        )}

        {/* list */}
        {loading ? <div className="text-sm text-slate-500">Loading…</div> : inFolder.length === 0 ? (
          <div className={`${card} p-6 text-center text-sm text-slate-500`}>Nothing in {FOLDER_WORDS[folder].title} yet.</div>
        ) : (
          <div className="space-y-2">
            {inFolder.map((f) => (
              <div key={f.id} className={`${card} p-3 flex flex-wrap items-center gap-3`}>
                <div className="text-2xl">{icon(f)}</div>
                <div className="min-w-0 flex-1">
                  <button onClick={() => void view(f)} className="text-left font-semibold text-blue-700 dark:text-blue-400 hover:underline break-all">{f.file_name}</button>
                  <div className="text-xs text-slate-500">
                    {f.doc_date ? day(f.doc_date) : "No date"}{f.amount != null ? ` · ${money(Number(f.amount))}` : ""}{f.note ? ` · ${f.note}` : ""} · {kb(f.size_bytes)}
                  </div>
                </div>
                <div className="flex gap-3 text-xs font-semibold">
                  <button onClick={() => void view(f)} className="text-blue-700 dark:text-blue-400 underline">Open</button>
                  {links[f.file_path]
                    ? <a href={downloadLink(links[f.file_path], f.file_name)} download={f.file_name} className="text-slate-600 dark:text-slate-300 underline">Download</a>
                    : <button onClick={() => void open(f, true)} className="text-slate-600 dark:text-slate-300 underline">Download</button>}
                  {canChange(f) && <button onClick={() => void edit(f)} className="text-slate-600 dark:text-slate-300 underline">Edit</button>}
                  {canChange(f) && <button onClick={() => void remove(f)} className="text-red-600 underline">Remove</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </>)}
      {viewer && <FileViewer url={viewer.url} name={viewer.name} mime={viewer.mime} downloadUrl={downloadLink(viewer.url, viewer.name)} onClose={() => setViewer(null)} />}
    </div>
  );
}
