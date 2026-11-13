// src/pages/ProjectReaderPage.tsx — /projects/:projectId/reader: 🤖 Project Reader (step 1).
// Pick the project's drawings / BOQ / contract (folders "Drawings & contract" and "Client BOQ"), optionally ask a question,
// and Claude explains the job in plain words, checks the documents against each other and lists questions for the client.
// 🔊 Listen reads it out with the phone's own voice. Every reading is saved with the project (open it again for free).
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { todayLocal } from "../lib/jamaica";
import { addProjectFile, fileProblem, listProjectFiles, type FileFolder, type ProjectFile } from "../lib/projectFiles";
import { askProject, createBoqFromDraft, createMilestones, deleteRead, draftBoq, isBoqDraft, isPlan, listReads, matchBoq, planMilestones, readProjectFiles, speechText, type BoqDraft, type DraftItem, type MilestonePlan, type ReadResult, type SavedRead } from "../lib/projectReader";

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
        setShown((s) => s ?? rd.find((r) => !isPlan(r) && !isBoqDraft(r)) ?? null);
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

          {shown.id && !shown.id.startsWith("tmp") && <AskBox key={shown.id} read={shown} />}

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

          {shown.id && !shown.id.startsWith("tmp") && (
            <MilestonePlanner read={shown} projectId={projectId} companyId={project?.company_id || null}
              plan={reads.find((r) => isPlan(r) && (r.result as unknown as MilestonePlan).from_read === shown.id)}
              onPlanned={(p) => setReads((rs) => [p, ...rs])} />
          )}
          {shown.id && !shown.id.startsWith("tmp") && (
            <BoqDraftPanel read={shown} projectId={projectId} companyId={project?.company_id || null}
              draft={reads.find((r) => isBoqDraft(r) && (r.result as unknown as BoqDraft).from_read === shown.id)}
              onDraft={(d) => setReads((rs) => [d, ...rs.filter((x) => x.id !== d.id)])} />
          )}
        </div>
      )}

      {/* earlier readings */}
      {reads.some((r) => !isPlan(r) && !isBoqDraft(r)) && (
        <div className={`${card} p-4 space-y-2`}>
          <div className="font-semibold text-slate-800 dark:text-slate-100">Earlier readings</div>
          {reads.filter((r) => !isPlan(r) && !isBoqDraft(r)).map((r) => (
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

// ── 🗓 Step 2: milestones from this reading ───────────────────────────────────────────────────────────────────────────
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const money = (n: number, cur = "JMD") => `${cur} ${Math.round(n).toLocaleString()}`;

function MilestonePlanner({ read, plan, projectId, companyId, onPlanned }: {
  read: SavedRead; plan: SavedRead | undefined; projectId: string; companyId: string | null; onPlanned: (p: SavedRead) => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function suggest() {
    setBusy(true); setErr(null);
    try {
      const r = await planMilestones(read.id, note);
      onPlanned({ id: r.id || `tmp${Date.now()}`, created_at: r.created_at || new Date().toISOString(), file_names: [], question: "Milestone plan", result: r.plan as unknown as ReadResult });
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not make the plan."); }
    setBusy(false);
  }
  return (
    <div className="rounded-xl border-2 border-indigo-200 dark:border-indigo-500/30 p-3 space-y-3">
      <div className="font-semibold text-slate-800 dark:text-slate-100">🗓 Milestones from this reading</div>
      {!plan && <p className="text-sm text-slate-600 dark:text-slate-400">Claude groups the work into milestones in building order, with the time each takes and the money from the BOQ. You check it, change anything, then create them.</p>}
      <div className="flex flex-wrap gap-2">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional: e.g. crew of 6, start 1 December, finish in 8 weeks" className={`${input} min-w-0 flex-1`} />
        <button onClick={() => void suggest()} disabled={busy} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>
          {busy ? "Planning… (up to a minute)" : plan ? "↻ Plan again" : "🗓 Suggest milestones"}
        </button>
      </div>
      {err && <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}
      {plan && <PlanEditor key={plan.id} plan={plan.result as unknown as MilestonePlan} projectId={projectId} companyId={companyId} />}
    </div>
  );
}

function PlanEditor({ plan, projectId, companyId }: { plan: MilestonePlan; projectId: string; companyId: string | null }) {
  const cur = plan.currency || "JMD";
  const [rows, setRows] = useState(() => (plan.milestones || []).map((m) => ({
    on: true, name: m.name || "", description: [m.description, m.boq_sections ? `BOQ: ${m.boq_sections}` : ""].filter(Boolean).join(" "),
    weeks: String(m.weeks ?? 1), material: String(Math.round(Number(m.material) || 0)), labour: String(Math.round(Number(m.labour) || 0)),
    payment: String(Math.round(Number(m.payment) || ((Number(m.material) || 0) + (Number(m.labour) || 0)))), note: m.money_note || "",
  })));
  const [start, setStart] = useState(todayLocal);
  const [have, setHave] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    void supabase.from("project_milestones").select("id", { count: "exact", head: true }).eq("project_id", projectId).then(({ count }) => setHave(count ?? 0));
  }, [projectId]);
  const set = (i: number, k: string, v: string | boolean) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  // dates one after the other, from the start date, for the ticked ones
  const dated = rows.reduce<{ list: { start: string | null; end: string | null }[]; next: string }>((acc, r) => {
    if (!r.on || !acc.next) return { list: [...acc.list, { start: null, end: null }], next: acc.next };
    const days = Math.max(1, Math.round((Number(r.weeks) || 0) * 7));
    return { list: [...acc.list, { start: acc.next, end: addDays(acc.next, days - 1) }], next: addDays(acc.next, days) };
  }, { list: [], next: start }).list;
  const ticked = rows.filter((r) => r.on);
  const sumPay = ticked.reduce((t, r) => t + (Number(r.payment) || 0), 0);
  const sumCost = ticked.reduce((t, r) => t + (Number(r.material) || 0) + (Number(r.labour) || 0), 0);
  const boq = Number(plan.boq_total) || 0;

  async function create() {
    if (!companyId) { setMsg({ ok: false, text: "The project is still loading. Try again." }); return; }
    const list = rows.map((r, i) => ({ r, d: dated[i] })).filter(({ r }) => r.on);
    if (list.length === 0) { setMsg({ ok: false, text: "Tick at least one milestone." }); return; }
    if (list.some(({ r }) => !r.name.trim())) { setMsg({ ok: false, text: "Every milestone needs a name." }); return; }
    if (have && !window.confirm(`This project already has ${have} milestone${have === 1 ? "" : "s"}. Add these ${list.length} after them?`)) return;
    setBusy(true); setMsg(null);
    try {
      const n = await createMilestones(projectId, companyId, list.map(({ r, d }) => ({
        name: r.name, description: r.description, start: d.start, end: d.end,
        material: Number(r.material) || 0, labour: Number(r.labour) || 0, payment: Number(r.payment) || 0,
      })));
      setHave((h) => (h || 0) + n);
      setMsg({ ok: true, text: `✅ ${n} milestone${n === 1 ? "" : "s"} created. See them on the project page.` });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not create them." }); }
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="text-xs text-slate-500">Start date<input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={`${input} mt-1 block`} /></label>
        <div className="text-xs text-slate-600 dark:text-slate-400 pb-2">
          {ticked.length} milestones · about {Math.round(ticked.reduce((t, r) => t + (Number(r.weeks) || 0), 0) * 10) / 10} weeks · cost {money(sumCost, cur)} · payments {money(sumPay, cur)}
          {boq > 0 && <span className={Math.abs(sumCost - boq) > Math.max(1, boq * 0.005) ? " font-bold text-amber-700" : " text-green-700"}> · BOQ total {money(boq, cur)}{Math.abs(sumCost - boq) > Math.max(1, boq * 0.005) ? ` (differs by ${money(Math.abs(sumCost - boq), cur)})` : " ✓"}</span>}
        </div>
      </div>
      {rows.map((r, i) => (
        <div key={i} className={`rounded-lg border border-slate-200 dark:border-white/[0.08] p-2 space-y-1.5 ${r.on ? "" : "opacity-50"}`}>
          <div className="flex items-center gap-2">
            <input type="checkbox" className="h-5 w-5" checked={r.on} onChange={(e) => set(i, "on", e.target.checked)} />
            <span className="text-xs text-slate-400 w-5">{i + 1}</span>
            <input value={r.name} onChange={(e) => set(i, "name", e.target.value)} className={`${input} min-w-0 flex-1 font-semibold`} />
          </div>
          <textarea value={r.description} onChange={(e) => set(i, "description", e.target.value)} rows={2} className={`${input} w-full text-xs`} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="text-[10px] text-slate-500">Weeks<input type="number" inputMode="decimal" step="0.5" value={r.weeks} onChange={(e) => set(i, "weeks", e.target.value)} className={`${input} w-full`} /></label>
            <label className="text-[10px] text-slate-500">Material ({cur})<input type="number" inputMode="decimal" value={r.material} onChange={(e) => set(i, "material", e.target.value)} className={`${input} w-full`} /></label>
            <label className="text-[10px] text-slate-500">Labour ({cur})<input type="number" inputMode="decimal" value={r.labour} onChange={(e) => set(i, "labour", e.target.value)} className={`${input} w-full`} /></label>
            <label className="text-[10px] text-slate-500">Payment to claim ({cur})<input type="number" inputMode="decimal" value={r.payment} onChange={(e) => set(i, "payment", e.target.value)} className={`${input} w-full`} /></label>
          </div>
          <div className="text-[11px] text-slate-500">{dated[i].start ? `${dated[i].start} → ${dated[i].end}` : "Not included"}{r.note ? ` · ${r.note}` : ""}</div>
        </div>
      ))}
      {(plan.notes?.length || 0) > 0 && <ul className="list-disc pl-5 text-xs text-slate-600 dark:text-slate-400">{plan.notes!.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      {msg && <div className={`rounded-lg border px-3 py-2 text-sm ${msg.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-800"}`}>{msg.text}</div>}
      <button onClick={() => void create()} disabled={busy} className={`${btn} w-full min-h-[48px] bg-green-600 hover:bg-green-500 text-white`}>
        {busy ? "Creating…" : `✅ Create ${ticked.length} milestone${ticked.length === 1 ? "" : "s"}`}
      </button>
      <p className="text-[11px] text-slate-500">Money comes from the BOQ as Claude grouped it: check it against the BOQ before you rely on it. The dates follow each other from the start date; change them later on the project page.</p>
    </div>
  );
}

// ── 📋 Step 3: draft BOQ from this reading ────────────────────────────────────────────────────────────────────────────
function BoqDraftPanel({ read, draft, projectId, companyId, onDraft }: {
  read: SavedRead; draft: SavedRead | undefined; projectId: string; companyId: string | null; onDraft: (d: SavedRead) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const asSaved = (id: string | null, created: string | null, d: BoqDraft): SavedRead =>
    ({ id: id || `tmp${Date.now()}`, created_at: created || new Date().toISOString(), file_names: [], question: "Draft BOQ", result: d as unknown as ReadResult });
  async function make() {
    setErr(null);
    try {
      setBusy("Copying the BOQ… (up to 2 minutes)");
      const r = await draftBoq(read.id);
      onDraft(asSaved(r.id, r.created_at, r.draft));
      if (r.id) {
        setBusy("Matching the items to your Rate Library… (up to a minute)");
        const m = await matchBoq(r.id);
        onDraft(asSaved(m.id, r.created_at, m.draft));
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not make the BOQ."); }
    setBusy(null);
  }
  async function rematch() {
    if (!draft) return;
    setErr(null); setBusy("Matching the items to your Rate Library… (up to a minute)");
    try { const m = await matchBoq(draft.id); onDraft(asSaved(m.id, draft.created_at, m.draft)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not match."); }
    setBusy(null);
  }
  return (
    <div className="rounded-xl border-2 border-teal-200 dark:border-teal-500/30 p-3 space-y-3">
      <div className="font-semibold text-slate-800 dark:text-slate-100">📋 Draft BOQ from this reading</div>
      {!draft && <p className="text-sm text-slate-600 dark:text-slate-400">The client's BOQ is copied into a BOQ in this app (sections, items, quantities, units and rates, exactly), and each item is matched to your Rate Library so you can compare their rate with yours. With only a drawing, a first BOQ is built from it (quantities to check, rates to fill in).</p>}
      {busy ? (
        <div className="flex items-center justify-center gap-3 rounded-lg border-2 border-teal-400 bg-teal-50 px-3 py-3 text-sm font-bold text-teal-900">
          <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-teal-300 border-t-teal-700" />{busy}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void make()} className={`${btn} bg-teal-600 hover:bg-teal-500 text-white`}>{draft ? "↻ Make it again" : "📋 Make a draft BOQ"}</button>
          {draft && <button onClick={() => void rematch()} className={`${btn} border border-teal-500 text-teal-700 dark:text-teal-400`}>↻ Match to my Rate Library again</button>}
        </div>
      )}
      {err && <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}
      {draft && <DraftEditor key={`${draft.id}:${(draft.result as unknown as BoqDraft).matched ?? "-"}`} draft={draft.result as unknown as BoqDraft} projectId={projectId} companyId={companyId} />}
    </div>
  );
}

function DraftEditor({ draft, projectId, companyId }: { draft: BoqDraft; projectId: string; companyId: string | null }) {
  const nav = useNavigate();
  const cur = draft.currency || "JMD";
  const [rates, setRates] = useState<"client" | "library">("client");
  const [skipZero, setSkipZero] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const all = draft.sections.flatMap((s) => s.items);
  const clientRate = (it: DraftItem) => (Number(it.material_rate) || 0) + (Number(it.labour_rate) || 0);
  const total = all.reduce((t, it) => t + (Number(it.qty) || 0) * clientRate(it), 0);
  const libTotal = all.reduce((t, it) => t + (Number(it.qty) || 0) * (rates === "library" && it.library?.rate != null ? Number(it.library.rate) : clientRate(it)), 0);
  const zero = all.filter((it) => !(Number(it.qty) > 0)).length;
  const matched = all.filter((it) => it.library).length;
  const check = Number(draft.total_check) || 0;
  const off = check > 0 && Math.abs(total - check) > Math.max(1, check * 0.002);

  async function save() {
    if (!companyId) { setMsg({ ok: false, text: "The project is still loading. Try again." }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await createBoqFromDraft(projectId, companyId, draft, rates, skipZero);
      setMsg({ ok: true, text: `✅ Saved as a draft BOQ, version ${r.version} (${r.items} items). Open it to check, change anything and approve it.` });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save the BOQ." }); }
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <div className="rounded-lg bg-slate-50 dark:bg-white/[0.04] p-2"><div className="text-[10px] uppercase text-slate-500">Sections · items</div><div className="font-semibold">{draft.sections.length} · {all.length}</div></div>
        <div className="rounded-lg bg-slate-50 dark:bg-white/[0.04] p-2"><div className="text-[10px] uppercase text-slate-500">Total (client rates)</div><div className="font-semibold">{money(total, cur)}</div></div>
        <div className={`rounded-lg p-2 ${off ? "bg-amber-50 text-amber-900" : "bg-slate-50 dark:bg-white/[0.04]"}`}><div className="text-[10px] uppercase text-slate-500">BOQ says</div><div className="font-semibold">{check ? money(check, cur) : "—"} {check > 0 && (off ? `(off by ${money(Math.abs(total - check), cur)})` : "✓")}</div></div>
        <div className="rounded-lg bg-slate-50 dark:bg-white/[0.04] p-2"><div className="text-[10px] uppercase text-slate-500">Matched to your library</div><div className="font-semibold">{matched} of {all.length}{draft.library_size === 0 ? " (library empty)" : ""}</div></div>
      </div>
      {draft.sections.map((s, i) => (
        <details key={i} className="rounded-lg border border-slate-200 dark:border-white/[0.08]" open={i === 0}>
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-200">{s.title} <span className="font-normal text-slate-500">· {s.items.length} items · {money(s.items.reduce((t, it) => t + (Number(it.qty) || 0) * clientRate(it), 0), cur)}</span></summary>
          <div className="divide-y divide-slate-100 dark:divide-white/[0.05]">
            {s.items.map((it, j) => {
              const c = clientRate(it), l = it.library?.rate != null ? Number(it.library.rate) : null;
              const diff = l != null && c > 0 ? Math.round(((l - c) / c) * 100) : null;
              return (
                <div key={j} className={`px-3 py-1.5 text-xs ${Number(it.qty) > 0 ? "" : "opacity-60"}`}>
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{it.ref ? `${it.ref}. ` : ""}{it.name}</span>
                    <span className="text-slate-700 dark:text-slate-300">{Number(it.qty) || 0} {it.unit || ""} × {money(c, cur)} = <b>{money((Number(it.qty) || 0) * c, cur)}</b></span>
                  </div>
                  {it.library ? (
                    <div className="text-teal-700 dark:text-teal-400">Your library: {it.library.name} · {l != null ? money(l, cur) : "no rate"}{it.library.unit ? ` / ${it.library.unit}` : ""}
                      {diff != null && <span className={diff > 10 ? " text-red-600 font-bold" : diff < -10 ? " text-green-700 font-bold" : ""}> ({diff > 0 ? "+" : ""}{diff}% vs client)</span>}</div>
                  ) : <div className="text-slate-400">Not in your library</div>}
                  {!(Number(it.qty) > 0) && <div className="text-amber-700">No quantity</div>}
                </div>
              );
            })}
          </div>
        </details>
      ))}
      {(draft.notes?.length || 0) > 0 && <ul className="list-disc pl-5 text-xs text-slate-600 dark:text-slate-400">{draft.notes!.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      <div className="rounded-lg bg-slate-50 dark:bg-white/[0.04] p-3 space-y-2 text-sm">
        <div className="font-semibold text-slate-800 dark:text-slate-200">Rates to use</div>
        <label className="flex items-center gap-2"><input type="radio" checked={rates === "client"} onChange={() => setRates("client")} /> The client's rates (material + labour), as in their BOQ</label>
        <label className="flex items-center gap-2"><input type="radio" checked={rates === "library"} onChange={() => setRates("library")} disabled={matched === 0} /> My Rate Library rate where an item is matched (the client's rate for the rest)</label>
        {zero > 0 && <label className="flex items-center gap-2"><input type="checkbox" checked={skipZero} onChange={(e) => setSkipZero(e.target.checked)} /> Leave out the {zero} line{zero === 1 ? "" : "s"} with no quantity</label>}
        <div className="text-xs text-slate-500">BOQ total with these rates: <b>{money(libTotal, cur)}</b></div>
      </div>
      {msg && <div className={`rounded-lg border px-3 py-2 text-sm ${msg.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-800"}`}>{msg.text}
        {msg.ok && <button onClick={() => nav(`/projects/${projectId}/boq`)} className="ml-2 font-bold underline">Open the BOQ →</button>}</div>}
      <button onClick={() => void save()} disabled={busy} className={`${btn} w-full min-h-[48px] bg-green-600 hover:bg-green-500 text-white`}>{busy ? "Saving…" : "✅ Save as a new draft BOQ"}</button>
      <p className="text-[11px] text-slate-500">It is saved as a NEW draft version: your existing BOQ is not changed. Check it on the BOQ page before you approve it.</p>
    </div>
  );
}

// ── 🎙️ Talk to your project: ask by voice or typing; the answer is shown and read out ─────────────────────────────────
type Recog = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
function makeRecognizer(): Recog | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recog; webkitSpeechRecognition?: new () => Recog };
  const C = w.SpeechRecognition || w.webkitSpeechRecognition;
  return C ? new C() : null;
}

function AskBox({ read }: { read: SavedRead }) {
  const [text, setText] = useState("");
  const [chat, setChat] = useState<{ q: string; a: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speakOn, setSpeakOn] = useState(true);
  const recRef = useRef<Recog | null>(null);
  const heard = useRef("");
  const canMic = typeof window !== "undefined" && !!((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition);

  async function send(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true); setErr(null); setText("");
    try { window.speechSynthesis?.cancel(); } catch { /* fine */ }
    try {
      const a = await askProject(read.id, question, chat);
      setChat((c) => [...c, { q: question, a }]);
      if (speakOn) speakAll(a, () => { /* done */ });
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not answer."); setText(question); }
    setBusy(false);
  }
  function mic() {
    if (listening) { recRef.current?.stop(); return; }
    const r = makeRecognizer();
    if (!r) { setErr("This browser can't listen. Type the question instead (Chrome on Android listens best)."); return; }
    try { window.speechSynthesis?.cancel(); } catch { /* fine */ }
    r.lang = "en-US"; r.interimResults = true; r.continuous = false;
    heard.current = "";
    r.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      heard.current = t; setText(t);
    };
    r.onerror = (e) => { setErr(e.error === "not-allowed" ? "Allow the microphone for this site (🔒 by the web address), then try again." : e.error === "no-speech" ? "I didn't hear anything. Tap 🎙️ and speak." : `The microphone stopped (${e.error}).`); };
    r.onend = () => { setListening(false); recRef.current = null; if (heard.current.trim()) void send(heard.current); };
    recRef.current = r; setErr(null); setListening(true);
    try { r.start(); } catch { setListening(false); }
  }

  return (
    <div className="rounded-xl border-2 border-fuchsia-200 dark:border-fuchsia-500/30 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold text-slate-800 dark:text-slate-100">🎙️ Ask about this job</div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400"><input type="checkbox" checked={speakOn} onChange={(e) => setSpeakOn(e.target.checked)} /> Read answers out loud</label>
      </div>
      {chat.length === 0 && <p className="text-xs text-slate-500">Tap 🎙️ and ask out loud, or type. For example: "How many bags of cement for the slab?", "What is the total for the roof?", "What size bars in the footing?"</p>}
      {chat.map((c, i) => (
        <div key={i} className="space-y-1 text-sm">
          <div className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-sm bg-fuchsia-600 px-3 py-2 text-white">{c.q}</div>
          <div className="w-fit max-w-[95%] rounded-2xl rounded-bl-sm bg-slate-100 dark:bg-white/[0.06] px-3 py-2 text-slate-800 dark:text-slate-200 whitespace-pre-line">
            {c.a}
            <button onClick={() => speakAll(c.a, () => { /* done */ })} className="ml-2 text-xs underline text-fuchsia-700 dark:text-fuchsia-300">🔊</button>
          </div>
        </div>
      ))}
      {busy && <div className="flex items-center gap-2 text-sm text-fuchsia-800 dark:text-fuchsia-300"><span className="h-4 w-4 animate-spin rounded-full border-2 border-fuchsia-300 border-t-fuchsia-700" />Thinking…</div>}
      {err && <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}
      <div className="flex gap-2">
        {canMic && (
          <button onClick={mic} disabled={busy} title={listening ? "Stop listening" : "Ask out loud"}
            className={`${btn} min-w-[52px] text-lg ${listening ? "bg-red-600 text-white animate-pulse" : "bg-fuchsia-600 hover:bg-fuchsia-500 text-white"}`}>{listening ? "⏹" : "🎙️"}</button>
        )}
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void send(text); }}
          placeholder={listening ? "Listening… speak now" : "Type a question…"} className={`${input} min-w-0 flex-1`} />
        <button onClick={() => void send(text)} disabled={busy || !text.trim()} className={`${btn} bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900`}>Ask</button>
      </div>
      <p className="text-[11px] text-slate-500">Answers come from this reading and the BOQ. For something only the drawing shows, do a new reading with your question (step 2 above).</p>
    </div>
  );
}
