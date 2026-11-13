// src/pages/ProjectReaderPage.tsx — /projects/:projectId/reader: 🤖 Project Reader (step 1).
// Pick the project's drawings / BOQ / contract (folders "Drawings & contract" and "Client BOQ"), optionally ask a question,
// and Claude explains the job in plain words, checks the documents against each other and lists questions for the client.
// 🔊 Listen reads it out with the phone's own voice. Every reading is saved with the project (open it again for free).
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { addProjectFile, fileProblem, listProjectFiles, type FileFolder, type ProjectFile } from "../lib/projectFiles";
import { deleteRead, listReads, readProjectFiles, speechText, type ReadResult, type SavedRead } from "../lib/projectReader";

const card = "rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03]";
const btn = "min-h-[40px] rounded-lg px-3 text-sm font-semibold transition disabled:opacity-50";
const input = "rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#111820] px-3 py-2 text-sm text-slate-800 dark:text-slate-200";
const icon = (f: ProjectFile) => /pdf/.test(f.mime_type || "") ? "📕" : /image/.test(f.mime_type || "") ? "🖼️" : /sheet|excel|csv/.test(f.mime_type || "") ? "📊" : /word/.test(f.mime_type || "") ? "📝" : "📄";
const readable = (f: ProjectFile) => /\.(pdf|jpe?g|png|webp|gif|xlsx|xls|csv)$/i.test(f.file_name);
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

// The phone's own voice. Long text is read in small pieces (some phones stop after about 15 seconds otherwise).
function speakAll(text: string, onEnd: () => void): void {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!synth) { onEnd(); return; }
  synth.cancel();
  const pieces = (text.match(/[^.!?\n]+[.!?]*\s*/g) || [text]).reduce<string[]>((out, s) => {
    const last = out[out.length - 1];
    if (last && last.length + s.length < 220) out[out.length - 1] = last + s; else out.push(s);
    return out;
  }, []).map((s) => s.trim()).filter(Boolean);
  pieces.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p);
    u.lang = "en-US"; u.rate = 0.95;
    if (i === pieces.length - 1) { u.onend = onEnd; u.onerror = onEnd; }
    synth.speak(u);
  });
}

export default function ProjectReaderPage() {
  const { projectId = "" } = useParams();
  const nav = useNavigate();
  const [project, setProject] = useState<{ name: string; company_id: string } | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [question, setQuestion] = useState("");
  const [reads, setReads] = useState<SavedRead[]>([]);
  const [shown, setShown] = useState<SavedRead | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [talking, setTalking] = useState(false);
  const [tick, setTick] = useState(0);
  const upRef = useRef<HTMLInputElement>(null);
  const [upFolder, setUpFolder] = useState<FileFolder>("drawing");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [{ data: p }, fl, rd] = await Promise.all([
          supabase.from("projects").select("name, company_id").eq("id", projectId).maybeSingle(),
          listProjectFiles(projectId),
          listReads(projectId).catch(() => [] as SavedRead[]),
        ]);
        if (!alive) return;
        setProject(p as { name: string; company_id: string } | null);
        const usable = fl.filter((f) => f.folder !== "statement");
        setFiles(usable);
        setChosen((c) => (c.size ? c : new Set(usable.filter(readable).map((f) => f.id))));
        setReads(rd);
        setShown((s) => s ?? rd[0] ?? null);
      } catch (e) { if (alive) setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not load." }); }
    })();
    return () => { alive = false; };
  }, [projectId, tick]);

  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch { /* fine */ } }, []);

  const pickedFiles = useMemo(() => files.filter((f) => chosen.has(f.id)), [files, chosen]);
  const flip = (id: string) => setChosen((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function upload(list: FileList | null) {
    if (!list?.length || !project) return;
    const bad = Array.from(list).map(fileProblem).filter(Boolean) as string[];
    if (bad.length) { setMsg({ ok: false, text: bad.join(" ") }); return; }
    setBusy("Saving the file…"); setMsg(null);
    try {
      for (const f of Array.from(list)) {
        await addProjectFile({ companyId: project.company_id, projectId, folder: upFolder, file: f, docDate: null, amount: null, note: null });
      }
      setChosen(new Set());   // pick everything again, with the new files
      setTick((t) => t + 1);
      setMsg({ ok: true, text: `Saved in the project's ${upFolder === "drawing" ? "Drawings & contract" : "Client BOQ"} folder.` });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save the file." }); }
    setBusy(null);
  }

  async function read() {
    if (pickedFiles.length === 0) { setMsg({ ok: false, text: "Tick at least one file to read." }); return; }
    setBusy(`Reading ${pickedFiles.length} file${pickedFiles.length === 1 ? "" : "s"}… this usually takes 30 to 90 seconds. Keep this page open.`); setMsg(null);
    stop();
    try {
      const r = await readProjectFiles(projectId, pickedFiles.map((f) => f.id), question);
      const saved: SavedRead = { ...r, file_names: pickedFiles.map((f) => f.file_name) };
      setShown(saved);
      setReads((rs) => [saved, ...rs]);
      setQuestion("");
      setMsg({ ok: true, text: "Done. Scroll down to see it, or tap 🔊 Listen." });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not read the files." }); }
    setBusy(null);
  }

  function listen(r: ReadResult) { setTalking(true); speakAll(speechText(r), () => setTalking(false)); }
  function stop() { try { window.speechSynthesis?.cancel(); } catch { /* fine */ } setTalking(false); }

  async function remove(r: SavedRead) {
    if (!window.confirm("Remove this saved reading?")) return;
    try { await deleteRead(r.id); setReads((rs) => rs.filter((x) => x.id !== r.id)); if (shown?.id === r.id) setShown(null); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not remove it." }); }
  }

  const res = shown?.result;
  const checks = res?.checks || [];
  const nProb = checks.filter((c) => c.level === "problem").length, nWarn = checks.filter((c) => c.level === "warning").length;
  const colour = (l: string) => l === "problem" ? "border-red-300 bg-red-50 text-red-900" : l === "warning" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-800";

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div>
        <button onClick={() => nav(`/projects/${projectId}`)} className="text-xs text-slate-500 hover:underline">← {project?.name || "Project"}</button>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">🤖 Project Reader</h1>
        <p className="text-sm text-slate-500">Claude reads the drawings, the BOQ and the contract, explains the job in plain words and checks them against each other. 🔊 Listen reads it out.</p>
      </div>

      {msg && <div className={`rounded-lg border px-4 py-2 text-sm ${msg.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-800"}`}>{msg.text}</div>}

      {/* 1. the files */}
      <div className={`${card} p-4 space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold text-slate-800 dark:text-slate-100">1. Tick the files to read</div>
          <div className="flex flex-wrap gap-2">
            <input ref={upRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.csv" className="hidden" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
            <button disabled={!!busy || !project} onClick={() => { setUpFolder("drawing"); upRef.current?.click(); }} className={`${btn} border border-slate-300 text-slate-700 dark:text-slate-300`}>+ 📐 Drawing / contract</button>
            <button disabled={!!busy || !project} onClick={() => { setUpFolder("client_boq"); upRef.current?.click(); }} className={`${btn} border border-slate-300 text-slate-700 dark:text-slate-300`}>+ 📄 BOQ</button>
          </div>
        </div>
        {files.length === 0 ? (
          <div className="text-sm text-slate-500">No files in this project yet. Add the drawing and the BOQ with the buttons above (PDF, picture or Excel, up to 10 MB each).</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/[0.05] rounded-lg border border-slate-200 dark:border-white/[0.08]">
            {files.map((f) => (
              <label key={f.id} className={`flex min-h-[44px] items-center gap-3 px-3 text-sm ${readable(f) ? "cursor-pointer" : "opacity-60"}`}>
                <input type="checkbox" className="h-5 w-5" disabled={!readable(f)} checked={chosen.has(f.id)} onChange={() => flip(f.id)} />
                <span>{icon(f)}</span>
                <span className="flex-1 min-w-0 truncate text-slate-800 dark:text-slate-200">{f.file_name}</span>
                <span className="text-xs text-slate-500">{f.folder === "drawing" ? "Drawing / contract" : "Client BOQ"}{readable(f) ? "" : " · can't be read (save as PDF)"}</span>
              </label>
            ))}
          </div>
        )}
        <div className="font-semibold text-slate-800 dark:text-slate-100 pt-1">2. Ask something (optional)</div>
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} maxLength={1500}
          placeholder="e.g. How many toilets and sinks? What is the retention? Is anything missing from the BOQ?" className={`${input} w-full`} />
        {busy ? (
          <div className="flex items-center justify-center gap-3 rounded-lg border-2 border-blue-400 bg-blue-50 px-3 py-4 text-sm font-bold text-blue-900">
            <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-blue-300 border-t-blue-700" />{busy}
          </div>
        ) : (
          <button onClick={() => void read()} disabled={pickedFiles.length === 0} className={`${btn} w-full min-h-[52px] bg-violet-600 hover:bg-violet-500 text-white text-base`}>
            🤖 Read {pickedFiles.length || ""} file{pickedFiles.length === 1 ? "" : "s"}{question.trim() ? " and answer" : ""}
          </button>
        )}
        <p className="text-[11px] text-slate-500">Each reading is a small charge on the AI account and is saved below, so opening it again costs nothing. Check anything important against the documents.</p>
      </div>

      {/* the reading */}
      {res && shown && (
        <div className={`${card} p-4 space-y-4`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{res.title || "Reading"}</div>
              <div className="text-xs text-slate-500">{when(shown.created_at)}{shown.file_names?.length ? ` · ${shown.file_names.join(", ")}` : ""}</div>
            </div>
            {talking
              ? <button onClick={stop} className={`${btn} bg-slate-800 text-white`}>⏹ Stop</button>
              : <button onClick={() => listen(res)} className={`${btn} bg-violet-600 hover:bg-violet-500 text-white`}>🔊 Listen</button>}
          </div>

          {shown.question && res.answer && (
            <div className="rounded-lg border-2 border-violet-300 bg-violet-50 p-3 text-sm text-violet-950">
              <div className="text-xs font-bold uppercase text-violet-700">You asked: {shown.question}</div>
              <div className="mt-1 whitespace-pre-line">{res.answer}</div>
            </div>
          )}

          {res.summary && <div className="space-y-2 text-sm leading-relaxed text-slate-800 dark:text-slate-200">{res.summary.split(/\n{2,}|\n/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</div>}

          {res.job && Object.values(res.job).some(Boolean) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              {([["Client", res.job.client], ["Location", res.job.location], ["Date", res.job.date], ["Total", [res.job.total, res.job.currency].filter(Boolean).join(" ")]] as [string, string | undefined][])
                .filter(([, v]) => v).map(([k, v]) => <div key={k} className="rounded-lg bg-slate-50 dark:bg-white/[0.04] p-2"><div className="text-[10px] uppercase text-slate-500">{k}</div><div className="font-semibold text-slate-800 dark:text-slate-200">{v}</div></div>)}
            </div>
          )}

          {checks.length > 0 && (
            <div className="space-y-2">
              <div className="font-semibold text-slate-800 dark:text-slate-100">🔎 Things to check {nProb + nWarn > 0 && <span className="text-sm font-normal text-slate-500">({nProb} problem{nProb === 1 ? "" : "s"}, {nWarn} warning{nWarn === 1 ? "" : "s"})</span>}</div>
              {[...checks].sort((a, b) => ["problem", "warning", "info"].indexOf(a.level) - ["problem", "warning", "info"].indexOf(b.level)).map((c, i) => (
                <div key={i} className={`rounded-lg border px-3 py-2 text-sm ${colour(c.level)}`}>
                  <span className="font-bold">{c.level === "problem" ? "❗ " : c.level === "warning" ? "⚠️ " : "ℹ️ "}</span>{c.text}
                  {c.where && <div className="text-xs opacity-70 mt-0.5">{c.where}</div>}
                </div>
              ))}
            </div>
          )}

          {(res.key_facts?.length || 0) > 0 && (
            <div className="space-y-1">
              <div className="font-semibold text-slate-800 dark:text-slate-100">📏 Key facts</div>
              <div className="divide-y divide-slate-100 dark:divide-white/[0.05] rounded-lg border border-slate-200 dark:border-white/[0.08] text-sm">
                {res.key_facts!.map((k, i) => (
                  <div key={i} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                    <span className="text-slate-600 dark:text-slate-400">{k.label}</span>
                    <span className="text-right font-semibold text-slate-800 dark:text-slate-200">{k.value}{k.source && <span className="block text-[10px] font-normal text-slate-500">{k.source}</span>}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(res.scope?.length || 0) > 0 && (
            <div>
              <div className="font-semibold text-slate-800 dark:text-slate-100">🧱 The work, in order</div>
              <ol className="mt-1 list-decimal pl-5 text-sm text-slate-800 dark:text-slate-200 space-y-0.5">{res.scope!.map((s, i) => <li key={i}>{s}</li>)}</ol>
            </div>
          )}

          {(res.questions?.length || 0) > 0 && (
            <div>
              <div className="font-semibold text-slate-800 dark:text-slate-100">❓ Questions to ask the client / engineer</div>
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-800 dark:text-slate-200 space-y-0.5">{res.questions!.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}

          {(res.file_notes?.length || 0) > 0 && <div className="text-xs text-amber-700">{res.file_notes!.join(" ")}</div>}
        </div>
      )}

      {/* earlier readings */}
      {reads.length > 0 && (
        <div className={`${card} p-4 space-y-2`}>
          <div className="font-semibold text-slate-800 dark:text-slate-100">Earlier readings</div>
          {reads.map((r) => (
            <div key={r.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${shown?.id === r.id ? "bg-violet-50 dark:bg-violet-500/10" : "bg-slate-50 dark:bg-white/[0.03]"}`}>
              <button onClick={() => { stop(); setShown(r); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="min-w-0 flex-1 text-left">
                <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">{r.result?.title || "Reading"}{r.question ? ` · "${r.question}"` : ""}</div>
                <div className="text-xs text-slate-500">{when(r.created_at)}</div>
              </button>
              <button onClick={() => void remove(r)} className="text-xs font-semibold text-red-600 underline">Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
