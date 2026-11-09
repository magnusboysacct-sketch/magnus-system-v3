// src/pages/AttendancePage.tsx — /attendance: who is clocked in today, where, their photo, hours and warnings (migration 20260987000000).
// Supervisors also clock in a crew from their own phone here and set each site's map point ("I am standing on the site").
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { todayLocal } from "../lib/jamaica";
import {
  FLAG_WORDS, distanceWords, fetchChecks, fetchShiftsForDay, getFix, hoursWords, mapLink, setRadius, setSite, shrinkPhoto, signedPhotoUrls,
  staffClockIn, staffClockOut, timeWords, uploadStaffClockPhoto, type StaffShift,
  fetchDiary, fetchMediaForShifts, staffAddWorkPhoto, stampPhoto, stampWords, type MediaRow,
  approveShifts, fetchShiftsToApprove, rejectShifts, unapproveShifts, workOutPay, type FromClock, type PayShift,
  deleteShift, editShift, jaHM, jaTime, manualShift,
} from "../lib/attendance";

type Proj = { id: string; name: string; status: string | null; site_lat: number | null; site_lng: number | null; site_radius_m: number | null };
type Wkr = { id: string; first_name: string | null; last_name: string | null; employee_id: string | null };
type Check = Awaited<ReturnType<typeof fetchChecks>>[number];
const RADII = [100, 200, 300, 500, 1000, 2000];
const ACT_ROLES = ["director", "admin", "supervisor", "site_user"];
const APPROVE_ROLES = ["director", "admin", "supervisor"];
const PAY_ROLES = ["director", "supervisor", "site_user"];        // who may open Field Payments (App.tsx)

const card = "rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03]";
const btn = "min-h-[40px] rounded-lg px-3 text-sm font-semibold transition disabled:opacity-50";
const input = "rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#111820] px-3 py-2 text-sm text-slate-800 dark:text-slate-200";
const wname = (w: { first_name: string | null; last_name: string | null } | null) => [w?.first_name, w?.last_name].filter(Boolean).join(" ") || "Worker";

export default function AttendancePage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [day, setDay] = useState(todayLocal());
  const [projectId, setProjectId] = useState<string>("all");
  const [projects, setProjects] = useState<Proj[]>([]);
  const [workers, setWorkers] = useState<Wkr[]>([]);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, Check[]>>({});
  const [modal, setModal] = useState<"crew" | "site" | "manual" | null>(null);
  const [editing, setEditing] = useState<StaffShift | null>(null);      // a supervisor changing a finished shift's times
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<"day" | "diary" | "approve">("day");
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [photoFor, setPhotoFor] = useState<StaffShift | null>(null);     // a supervisor adding a work picture for this person
  const workRef = useRef<HTMLInputElement>(null);
  const canAct = ACT_ROLES.includes(role);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: p } = await supabase.from("user_profiles").select("company_id, role").eq("id", user.id).maybeSingle();
      if (!alive || !p?.company_id) return;
      setCompanyId(p.company_id); setRole(p.role || "");
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!companyId) return;
    let alive = true;
    (async () => {
      const [{ data: pr }, { data: wk }] = await Promise.all([
        supabase.from("projects").select("id,name,status,site_lat,site_lng,site_radius_m").eq("company_id", companyId).order("name"),
        supabase.from("workers").select("id,first_name,last_name,employee_id").eq("company_id", companyId).eq("status", "active").order("first_name"),
      ]);
      if (!alive) return;
      setProjects((pr || []) as Proj[]); setWorkers((wk || []) as Wkr[]);
    })();
    return () => { alive = false; };
  }, [companyId, tick]);

  useEffect(() => {
    if (!companyId) return;
    let alive = true;
    (async () => {
      try {
        const rows = await fetchShiftsForDay(companyId, day, projectId);
        const med = await fetchMediaForShifts(rows.map((r) => r.id)).catch(() => [] as MediaRow[]);
        const urls = await signedPhotoUrls([...rows.flatMap((r) => [r.in_photo_path || "", r.out_photo_path || ""]), ...med.map((m) => m.path)]);
        if (!alive) return;
        setShifts(rows); setMedia(med); setPhotos(urls); setLoading(false);
      } catch (e) {
        if (!alive) return;
        setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not load." }); setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [companyId, day, projectId, tick]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  async function toggleRow(id: string) {
    if (openRow === id) { setOpenRow(null); return; }
    setOpenRow(id);
    if (!checks[id]) { const c = await fetchChecks(id).catch(() => []); setChecks((m) => ({ ...m, [id]: c })); }
  }

  async function saveStaffWorkPhoto(file: File) {
    const s = photoFor; setPhotoFor(null);
    if (!s || !companyId) return;
    try {
      const data = await stampPhoto(file, [[wname(s.workers), s.projects?.name].filter(Boolean).join(" · "), stampWords()]);
      await staffAddWorkPhoto(companyId, s.worker_id, data, await getFix(10000));
      setMsg({ ok: true, text: `Picture added for ${wname(s.workers)}.` }); reload();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save the picture." }); }
  }

  async function deleteRow(s: StaffShift) {
    const reason = window.prompt(`Delete ${wname(s.workers)}'s time on ${s.work_date} (${timeWords(s.clock_in_at)} – ${timeWords(s.clock_out_at)})?\n\nWhy? (for example: entered twice, wrong worker)`, "");
    if (!reason?.trim()) return;
    try { await deleteShift(s.id, reason.trim()); setMsg({ ok: true, text: "Deleted. A copy is kept with the reason." }); reload(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not delete." }); }
  }

  async function clockOutRow(s: StaffShift) {
    if (!window.confirm(`Clock out ${wname(s.workers)} now?`)) return;
    try {
      const fix = await getFix();
      await staffClockOut(s.id, fix, "Clocked out by supervisor");
      setMsg({ ok: true, text: `${wname(s.workers)} is clocked out.` }); reload();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not clock out." }); }
  }

  const minutesOf = (s: StaffShift) => s.status === "open" ? Math.max(0, Math.floor((now - new Date(s.clock_in_at).getTime()) / 60000)) : (s.minutes_worked || 0);
  const stats = useMemo(() => ({
    onSite: shifts.filter((s) => s.status === "open").length,
    people: new Set(shifts.map((s) => s.worker_id)).size,
    minutes: shifts.reduce((t, s) => t + minutesOf(s), 0),
    warnings: shifts.filter((s) => s.flags.length > 0).length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [shifts, now]);
  const noPin = projects.filter((p) => p.status !== "completed" && p.status !== "cancelled" && p.status !== "archived" && p.site_lat == null);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Clock In</h1>
          <p className="text-xs text-slate-500">Who is on site, where they clocked in, their photo and hours. Workers clock in from the worker portal on their phone.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAct && <button onClick={() => setModal("crew")} className={`${btn} bg-green-600 hover:bg-green-500 text-white`}>▶ Clock in crew</button>}
          {APPROVE_ROLES.includes(role) && <button onClick={() => setModal("manual")} className={`${btn} bg-slate-700 hover:bg-slate-600 text-white`}>✍️ Add time by hand</button>}
          {canAct && <button onClick={() => setModal("site")} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>📍 Set site location</button>}
          <button onClick={reload} className={`${btn} border border-slate-200 dark:border-white/[0.1] text-slate-600 dark:text-slate-300`}>Refresh</button>
        </div>
      </div>

      <input ref={workRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0] || null; e.target.value = ""; if (f) void saveStaffWorkPhoto(f); else setPhotoFor(null); }} />
      <div className="flex gap-2">
        {([["day", "⏰ Who is on site"], ["diary", "📷 Photo diary"], ...(APPROVE_ROLES.includes(role) ? [["approve", "✅ Approve & pay"]] as const : [])] as const).map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} className={`${btn} ${view === k ? "bg-cyan-600 text-white" : "border border-slate-200 dark:border-white/[0.1] text-slate-600 dark:text-slate-300"}`}>{l}</button>
        ))}
      </div>
      {view === "diary" && companyId ? <DiaryView companyId={companyId} projects={projects} />
        : view === "approve" && companyId ? <ApproveView companyId={companyId} />
        : (<>
      <div className="flex flex-wrap gap-2">
        <input type="date" value={day} max={todayLocal()} onChange={(e) => e.target.value && setDay(e.target.value)} className={input} />
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={input}>
          <option value="all">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {msg && <div className={`rounded-lg border px-4 py-2 text-sm ${msg.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-800"}`}>{msg.text}</div>}
      {canAct && noPin.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          📍 No site location yet for: {noPin.map((p) => p.name).join(", ")}. Until it is set, the phone can't tell if a worker is on that site. Tap "Set site location" while standing on the site.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["🟢 On site now", String(stats.onSite)],
          ["👷 People today", String(stats.people)],
          ["⏱ Hours today", hoursWords(stats.minutes)],
          ["⚠️ With warnings", String(stats.warnings)],
        ].map(([l, v]) => <div key={l} className={`${card} p-3`}><div className="text-xs text-slate-500">{l}</div><div className="text-lg font-bold text-slate-900 dark:text-slate-100">{v}</div></div>)}
      </div>

      {loading ? <div className="text-sm text-slate-500">Loading…</div> : shifts.length === 0 ? (
        <div className={`${card} p-6 text-center text-sm text-slate-500`}>Nobody clocked in on this day.</div>
      ) : (
        <div className="space-y-2">
          {shifts.map((s) => {
            const inMap = mapLink(s.in_lat, s.in_lng), outMap = mapLink(s.out_lat, s.out_lng);
            const far = s.flags.includes("in_far") || s.flags.includes("out_far") || s.flags.includes("left_site");
            return (
              <div key={s.id} className={`${card} p-3`}>
                <div className="flex gap-3">
                  {s.in_photo_path && photos[s.in_photo_path]
                    ? <a href={photos[s.in_photo_path]} target="_blank" rel="noreferrer"><img src={photos[s.in_photo_path]} alt={`${wname(s.workers)} at clock in`} className="h-16 w-16 rounded-lg object-cover" /></a>
                    : <div className="h-16 w-16 rounded-lg bg-slate-100 dark:bg-white/[0.05] flex items-center justify-center text-2xl">👷</div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100">{wname(s.workers)}</span>
                      {s.workers?.employee_id && <span className="font-mono text-xs text-slate-500">{s.workers.employee_id}</span>}
                      {s.status === "open"
                        ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">🟢 On the clock</span>
                        : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Done</span>}
                      {far && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">⚠️ Away from site</span>}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">{s.projects?.name || "No project"}</div>
                    <div className="text-sm text-slate-700 dark:text-slate-300">
                      In {timeWords(s.clock_in_at)}{s.in_distance_m != null && ` (${distanceWords(s.in_distance_m)} from site)`}
                      {" · "}{s.status === "open" ? "still working" : <>Out {timeWords(s.clock_out_at)}{s.out_distance_m != null && ` (${distanceWords(s.out_distance_m)} from site)`}</>}
                      {" · "}<b>{hoursWords(minutesOf(s))}</b>{s.status === "closed" && s.paid_until && s.clock_out_at && s.paid_until !== s.clock_out_at && <span className="text-amber-700"> (counted up to {timeWords(s.paid_until)})</span>}
                    </div>
                    {s.flags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{s.flags.map((f) => <span key={f} className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-xs text-amber-900">{FLAG_WORDS[f] || f}</span>)}</div>}
                    <ShiftMedia items={media.filter((m) => m.shift_id === s.id)} urls={photos} />
                    {s.status === "closed" && <div className="text-xs">{s.field_payment_id ? <span className="text-emerald-700">💵 Paid</span>
                      : s.approval === "approved" ? <span className="text-green-700">✅ Approved {hoursWords(s.approved_minutes)}</span>
                      : s.approval === "rejected" ? <span className="text-red-700">❌ Not paid{s.approval_note ? `: ${s.approval_note}` : ""}</span>
                      : <span className="text-slate-500">⏳ Waiting for approval</span>}</div>}
                    {s.clocked_in_by && <div className="text-xs text-slate-500">Clocked in by a supervisor</div>}
                    {s.note && <div className="text-xs text-slate-500">Note: {s.note}</div>}
                    {(s.edit_log || []).filter((x) => x.what === "changed").slice(-1).map((x, i) => (
                      <div key={i} className="text-xs text-amber-700 dark:text-amber-400">✏️ Changed {new Date(x.at).toLocaleDateString("en-US", { day: "numeric", month: "short" })}{x.from_in ? ` (was ${timeWords(x.from_in)} – ${timeWords(x.from_out)})` : ""}: {x.note}</div>
                    ))}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {inMap && <a href={inMap} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-600 underline">📍 Clock in on map</a>}
                      {outMap && <a href={outMap} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-600 underline">📍 Clock out on map</a>}
                      <button onClick={() => void toggleRow(s.id)} className="text-xs font-semibold text-slate-600 underline">{openRow === s.id ? "Hide site checks" : "Site checks"}</button>
                      {canAct && (s.status === "open" || (s.clock_out_at && now - new Date(s.clock_out_at).getTime() < 2 * 3600_000)) &&
                        <button onClick={() => { setPhotoFor(s); workRef.current?.click(); }} className="text-xs font-semibold text-blue-600 underline">📷 Add work picture</button>}
                      {canAct && s.status === "open" && <button onClick={() => void clockOutRow(s)} className="text-xs font-semibold text-red-600 underline">Clock out now</button>}
                      {APPROVE_ROLES.includes(role) && s.status === "closed" && !s.field_payment_id && (<>
                        <button onClick={() => setEditing(s)} className="text-xs font-semibold text-slate-700 dark:text-slate-300 underline">✏️ Change times</button>
                        <button onClick={() => void deleteRow(s)} className="text-xs font-semibold text-red-600 underline">🗑 Delete</button>
                      </>)}
                    </div>
                    {openRow === s.id && (
                      <div className="mt-2 rounded-lg bg-slate-50 dark:bg-white/[0.03] p-2 text-xs text-slate-700 dark:text-slate-300 space-y-0.5">
                        {(checks[s.id] || []).length === 0 ? "No checks." : (checks[s.id] || []).map((c, i) => (
                          <div key={i}>{timeWords(c.checked_at)} · {c.kind === "clock_in" ? "Clock in" : c.kind === "clock_out" ? "Clock out" : c.kind === "answer" ? "Answered ✋" : c.kind === "missed" ? "Asked \"on site?\"" : "Check"} · {
                            c.kind === "missed" ? "❌ no answer" : c.on_site === true ? "✅ on site" : c.on_site === false ? `⚠️ ${distanceWords(c.distance_m)} away` : c.lat == null ? "no location" : "not sure"}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      </>)}

      {(modal === "manual" || editing) && <TimeModal projects={projects} workers={workers} shift={editing} day={day}
        onClose={() => { setModal(null); setEditing(null); }}
        onSaved={(t) => { setModal(null); setEditing(null); setMsg({ ok: true, text: t }); reload(); }} />}
      {modal === "crew" && companyId && <CrewModal companyId={companyId} projects={projects} workers={workers} busyIds={shifts.filter((s) => s.status === "open").map((s) => s.worker_id)}
        onClose={() => { setModal(null); reload(); }} />}
      {modal === "site" && <SiteModal projects={projects} onClose={() => { setModal(null); reload(); }} />}
    </div>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white dark:bg-[#0f151c] p-4 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h2><button onClick={onClose} className="text-2xl text-slate-500" aria-label="Close">×</button></div>
        {children}
      </div>
    </div>
  );
}

// A supervisor clocks in workers who have no smartphone: one at a time, with a photo of each person.
function CrewModal({ companyId, projects, workers, busyIds, onClose }: { companyId: string; projects: Proj[]; workers: Wkr[]; busyIds: string[]; onClose: () => void }) {
  const open = projects.filter((p) => !["completed", "cancelled", "archived"].includes(p.status || ""));
  const [projectId, setProjectId] = useState(open.length === 1 ? open[0].id : "");
  const [workerId, setWorkerId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taken = new Set([...busyIds, ...done]);
  const left = workers.filter((w) => !taken.has(w.id));

  async function go(file: File | null) {
    if (!projectId || !workerId) { setErr("Pick the project and the worker."); return; }
    setErr(null);
    try {
      let photo: string | null = null;
      if (file) { setBusy("Saving the photo…"); photo = await uploadStaffClockPhoto(companyId, workerId, await shrinkPhoto(file)); }
      setBusy("Finding where you are…");
      const fix = await getFix();
      setBusy("Clocking in…");
      const r = await staffClockIn(workerId, projectId, fix, photo);
      setDone((d) => [...d, workerId]);
      const w = workers.find((x) => x.id === workerId);
      setErr(r.status === "off_site" ? `${wname(w || null)} is clocked in, but your phone is ${distanceWords(r.distance_m)} from the site.` : null);
      setWorkerId("");
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not clock in."); }
    finally { setBusy(null); }
  }

  return (
    <Shell title="Clock in crew" onClose={onClose}>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0] || null; e.target.value = ""; if (f) void go(f); }} />
      <p className="text-sm text-slate-600 dark:text-slate-400">For workers with no smartphone. Your phone's location is used, so stand on the site. Take a photo of each worker.</p>
      <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={`${input} w-full`}>
        <option value="">Pick the project…</option>
        {open.map((p) => <option key={p.id} value={p.id}>{p.name}{p.site_lat == null ? " (site location not set)" : ""}</option>)}
      </select>
      <select value={workerId} onChange={(e) => setWorkerId(e.target.value)} className={`${input} w-full`}>
        <option value="">Pick the worker…</option>
        {left.map((w) => <option key={w.id} value={w.id}>{wname(w)}{w.employee_id ? ` · ${w.employee_id}` : ""}</option>)}
      </select>
      {err && <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</div>}
      {busy ? <div className="rounded-lg bg-slate-100 px-3 py-3 text-center text-sm font-semibold">⏳ {busy}</div> : (<>
        <button onClick={() => { if (!projectId || !workerId) { setErr("Pick the project and the worker."); return; } fileRef.current?.click(); }}
          className={`${btn} w-full min-h-[56px] bg-green-600 hover:bg-green-500 text-white text-base`}>📷 Take their photo and clock in</button>
        <button onClick={() => void go(null)} className={`${btn} w-full border border-slate-300 text-slate-700 dark:text-slate-300`}>Clock in without a photo</button>
      </>)}
      {done.length > 0 && <div className="text-sm text-green-700">✅ Clocked in: {done.map((id) => wname(workers.find((w) => w.id === id) || null)).join(", ")}</div>}
      <button onClick={onClose} className={`${btn} w-full border border-slate-300 text-slate-700 dark:text-slate-300`}>Done</button>
    </Shell>
  );
}

function SiteModal({ projects, onClose }: { projects: Proj[]; onClose: () => void }) {
  const open = projects.filter((p) => !["completed", "cancelled", "archived"].includes(p.status || ""));
  const [projectId, setProjectId] = useState(open.length === 1 ? open[0].id : "");
  const p = open.find((x) => x.id === projectId);
  const [radius, setRad] = useState<number>(300);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  function pick(id: string) {
    setProjectId(id); setNote(null);
    const pr = open.find((x) => x.id === id);
    setRad(pr?.site_radius_m || 300);
  }
  async function saveHere() {
    if (!projectId) { setNote({ ok: false, text: "Pick the project." }); return; }
    setBusy(true); setNote(null);
    const fix = await getFix(30000);
    if (!fix) { setBusy(false); setNote({ ok: false, text: "The phone could not find where you are. Turn on Location and try again." }); return; }
    try {
      await setSite(projectId, fix, radius);
      setNote({ ok: true, text: fix.accuracy > 100
        ? `Saved, but the phone was only sure to ${fix.accuracy} m. For a better point, step outside, wait a minute and save again.`
        : `Saved. Workers within ${distanceWords(radius)} of this spot are "on site".` });
    } catch (e) { setNote({ ok: false, text: e instanceof Error ? e.message : "Could not save." }); }
    setBusy(false);
  }
  async function saveRadius() {
    if (!projectId) return;
    setBusy(true);
    try { await setRadius(projectId, radius); setNote({ ok: true, text: `Site distance is now ${distanceWords(radius)}.` }); }
    catch (e) { setNote({ ok: false, text: e instanceof Error ? e.message : "Could not save." }); }
    setBusy(false);
  }

  return (
    <Shell title="Set site location" onClose={onClose}>
      <p className="text-sm text-slate-600 dark:text-slate-400">Stand in the middle of the site with your phone, then tap the blue button.</p>
      <select value={projectId} onChange={(e) => pick(e.target.value)} className={`${input} w-full`}>
        <option value="">Pick the project…</option>
        {open.map((x) => <option key={x.id} value={x.id}>{x.name}{x.site_lat == null ? " (not set)" : " ✓"}</option>)}
      </select>
      {p && p.site_lat != null && <a href={mapLink(p.site_lat, p.site_lng) || "#"} target="_blank" rel="noreferrer" className="block text-sm text-blue-600 underline">See the saved site point on the map</a>}
      <label className="block text-sm text-slate-700 dark:text-slate-300">How far from that spot still counts as "on site"?
        <select value={radius} onChange={(e) => setRad(Number(e.target.value))} className={`${input} mt-1 w-full`}>
          {RADII.map((r) => <option key={r} value={r}>{distanceWords(r)}{r === 300 ? " (normal)" : r >= 1000 ? " (big site: farm, road)" : ""}</option>)}
        </select>
      </label>
      {note && <div className={`rounded-lg border px-3 py-2 text-sm ${note.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-800"}`}>{note.text}</div>}
      <button onClick={() => void saveHere()} disabled={busy} className={`${btn} w-full min-h-[56px] bg-blue-600 hover:bg-blue-500 text-white text-base`}>{busy ? "⏳ Finding where you are…" : "📍 I am on the site now. Save this spot"}</button>
      {p && p.site_lat != null && <button onClick={() => void saveRadius()} disabled={busy} className={`${btn} w-full border border-slate-300 text-slate-700 dark:text-slate-300`}>Only change the distance</button>}
      <button onClick={onClose} className={`${btn} w-full border border-slate-300 text-slate-700 dark:text-slate-300`}>Done</button>
    </Shell>
  );
}

// The pictures and voice notes of one shift.
function ShiftMedia({ items, urls }: { items: MediaRow[]; urls: Record<string, string> }) {
  if (!items.length) return null;
  const pics = items.filter((m) => m.kind === "photo"), voices = items.filter((m) => m.kind === "voice");
  return (
    <div className="mt-2 space-y-1">
      {pics.length > 0 && <div className="flex flex-wrap gap-1.5">{pics.map((m) => urls[m.path]
        ? <a key={m.id} href={urls[m.path]} target="_blank" rel="noreferrer"><img src={urls[m.path]} alt={`Work at ${timeWords(m.created_at)}`} className="h-20 w-20 rounded-lg object-cover" /></a>
        : <div key={m.id} className="h-20 w-20 rounded-lg bg-slate-100" />)}</div>}
      {voices.map((m) => urls[m.path] && (
        <div key={m.id} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">🎤 {timeWords(m.created_at)}{m.seconds ? ` · ${m.seconds}s` : ""}
          <audio controls preload="none" src={urls[m.path]} className="h-8 max-w-[240px]" /></div>
      ))}
    </div>
  );
}

// The photo diary: day by day, every picture and voice note from a project, newest first.
function DiaryView({ companyId, projects }: { companyId: string; projects: Proj[] }) {
  const [projectId, setProjectId] = useState<string>(projects.length === 1 ? projects[0].id : "all");
  const [days, setDays] = useState(14);
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const to = todayLocal();
        const d = new Date(to + "T12:00:00"); d.setDate(d.getDate() - (days - 1));
        const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const r = await fetchDiary(companyId, projectId, from, to);
        const u = await signedPhotoUrls(r.map((m) => m.path));
        if (!alive) return;
        setRows(r); setUrls(u);
      } catch (e) { if (alive) setErr(e instanceof Error ? e.message : "Could not load."); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [companyId, projectId, days]);

  const byDay = useMemo(() => {
    const m = new Map<string, MediaRow[]>();
    rows.forEach((r) => { const k = r.work_date; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); });
    return Array.from(m.entries());
  }, [rows]);
  const projName = (id: string | null) => projects.find((p) => p.id === id)?.name || "";
  const dayWords = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={input}>
          <option value="all">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={input}>
          <option value={7}>Last 7 days</option><option value={14}>Last 14 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
        </select>
      </div>
      {err && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">{err}</div>}
      {loading ? <div className="text-sm text-slate-500">Loading…</div> : byDay.length === 0 ? (
        <div className={`${card} p-6 text-center text-sm text-slate-500`}>No pictures or voice notes yet. Workers add them from the clock on their phone.</div>
      ) : byDay.map(([d, items]) => (
        <div key={d} className={`${card} p-3 space-y-2`}>
          <div className="font-bold text-slate-900 dark:text-slate-100">{dayWords(d)} <span className="text-xs font-normal text-slate-500">· 📷 {items.filter((i) => i.kind === "photo").length} · 🎤 {items.filter((i) => i.kind === "voice").length}</span></div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {items.filter((i) => i.kind === "photo").map((m) => (
              <a key={m.id} href={urls[m.path]} target="_blank" rel="noreferrer" className="block">
                {urls[m.path] ? <img src={urls[m.path]} alt={`${wname(m.workers || null)} ${timeWords(m.created_at)}`} className="aspect-square w-full rounded-lg object-cover" /> : <div className="aspect-square w-full rounded-lg bg-slate-100" />}
                <div className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-400">{wname(m.workers || null)} · {timeWords(m.created_at)}{projectId === "all" ? ` · ${projName(m.project_id)}` : ""}</div>
              </a>
            ))}
          </div>
          {items.filter((i) => i.kind === "voice").map((m) => urls[m.path] && (
            <div key={m.id} className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">🎤 {wname(m.workers || null)} · {timeWords(m.created_at)}{m.seconds ? ` · ${m.seconds}s` : ""}{projectId === "all" ? ` · ${projName(m.project_id)}` : ""}
              <audio controls preload="none" src={urls[m.path]} className="h-8 max-w-[260px]" /></div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Approve the time worked, then pay it: one card per worker and project, the time waiting first.
function ApproveView({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  const [role, setRole] = useState("");
  const [days, setDays] = useState(31);
  const [rows, setRows] = useState<PayShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from("user_profiles").select("role").eq("id", user.id).maybeSingle();
      setRole(data?.role || "");
    });
  }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const d = new Date(todayLocal() + "T12:00:00"); d.setDate(d.getDate() - days);
        const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const r = await fetchShiftsToApprove(companyId, from);
        if (alive) setRows(r);
      } catch (e) { if (alive) setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not load." }); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [companyId, days, tick]);

  const groups = useMemo(() => {
    const m = new Map<string, PayShift[]>();
    rows.forEach((r) => { const k = `${r.worker_id}|${r.project_id || ""}`; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); });
    return Array.from(m.values());
  }, [rows]);

  async function act(fn: () => Promise<unknown>, okText: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: okText }); setTick((t) => t + 1); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "That did not work." }); }
    setBusy(false);
  }
  function changeTime(s: PayShift) {
    const cur = ((s.approved_minutes ?? s.minutes_worked ?? 0) / 60).toFixed(2);
    const v = window.prompt(`Hours to pay for ${wname(s.workers)} on ${s.work_date} (for example 7.5):`, cur);
    if (v == null) return;
    const h = Number(v);
    if (!isFinite(h) || h < 0 || h > 24) { setMsg({ ok: false, text: "Type hours between 0 and 24." }); return; }
    const note = window.prompt("Why was the time changed? (optional)", "") || null;
    void act(() => approveShifts([s.id], Math.round(h * 60), note), "Time changed and approved.");
  }
  function reject(s: PayShift) {
    const note = window.prompt(`Why is ${wname(s.workers)}'s time on ${s.work_date} not paid?`, "");
    if (!note?.trim()) return;
    void act(() => rejectShifts([s.id], note.trim()), "Marked as not paid.");
  }
  function pay(g: PayShift[]) {
    const ok = g.filter((s) => s.approval === "approved");
    const w = ok[0].workers;
    const p = workOutPay(ok, w?.pay_type ?? null, w?.pay_rate ?? null);
    const fromClock: FromClock = {
      shift_ids: ok.map((s) => s.id), project_id: ok[0].project_id, rate_type: p.rateType,
      hours_worked: p.hours, days_worked: p.days, rate: p.rate,
      notes: `Clocked time ${p.dates[0]}${p.dates.length > 1 ? ` to ${p.dates[p.dates.length - 1]}` : ""}: ${p.rateType === "day" ? `${p.days} day${p.days === 1 ? "" : "s"}` : `${p.hours} hours`}`,
      worker: { id: ok[0].worker_id, name: wname(w), id_number: w?.id_number || "", phone: w?.phone || "" },
    };
    navigate("/field-payments", { state: { fromClock } });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={input}>
          <option value={7}>Last 7 days</option><option value={14}>Last 14 days</option><option value={31}>Last 31 days</option><option value={90}>Last 90 days</option>
        </select>
        <span className="text-xs text-slate-500">Daily-rate workers: 5 hours or more on a day = a full day, less = a half day.</span>
      </div>
      {msg && <div className={`rounded-lg border px-4 py-2 text-sm ${msg.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-800"}`}>{msg.text}</div>}
      {loading ? <div className="text-sm text-slate-500">Loading…</div> : groups.length === 0 ? (
        <div className={`${card} p-6 text-center text-sm text-slate-500`}>Nothing waiting. Finished shifts show up here to approve and pay.</div>
      ) : groups.map((g) => {
        const w = g[0].workers;
        const waiting = g.filter((s) => s.approval === "pending");
        const approved = g.filter((s) => s.approval === "approved");
        const p = workOutPay(approved, w?.pay_type ?? null, w?.pay_rate ?? null);
        const cleanWaiting = waiting.filter((s) => s.flags.length === 0);
        return (
          <div key={`${g[0].worker_id}|${g[0].project_id}`} className={`${card} p-3 space-y-2`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-bold text-slate-900 dark:text-slate-100">{wname(w)} <span className="font-mono text-xs text-slate-500">{w?.employee_id}</span></div>
                <div className="text-sm text-slate-600 dark:text-slate-400">{g[0].projects?.name || "No project"} · {w?.pay_type === "daily" ? `JMD ${Number(w?.pay_rate || 0).toLocaleString()} / day` : w?.pay_type === "hourly" ? `JMD ${Number(w?.pay_rate || 0).toLocaleString()} / hour` : "No hourly or daily rate on the worker"}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {cleanWaiting.length > 0 && <button disabled={busy} onClick={() => void act(() => approveShifts(cleanWaiting.map((s) => s.id)), `${cleanWaiting.length} approved.`)}
                  className={`${btn} bg-green-600 hover:bg-green-500 text-white`}>✅ Approve {cleanWaiting.length} with no warnings</button>}
                {approved.length > 0 && PAY_ROLES.includes(role) && <button disabled={busy} onClick={() => pay(g)} className={`${btn} bg-emerald-700 hover:bg-emerald-600 text-white`}>
                  💵 Pay {p.rateType === "day" ? `${p.days} day${p.days === 1 ? "" : "s"}` : `${p.hours} hrs`}{p.total > 0 ? ` · JMD ${p.total.toLocaleString()}` : ""}</button>}
              </div>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-white/[0.05]">
              {g.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{new Date(s.work_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })}</span>
                    <span className="text-slate-600 dark:text-slate-400"> · {timeWords(s.clock_in_at)}–{timeWords(s.clock_out_at)} · counted {hoursWords(s.minutes_worked)}</span>
                    {s.approval === "approved" && <span className="text-green-700"> · ✅ {hoursWords(s.approved_minutes)}{s.approval_note ? ` (${s.approval_note})` : ""}</span>}
                    {s.flags.length > 0 && <div className="flex flex-wrap gap-1 mt-0.5">{s.flags.map((f) => <span key={f} className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-xs text-amber-900">{FLAG_WORDS[f] || f}</span>)}</div>}
                  </div>
                  <div className="flex gap-2 text-xs font-semibold">
                    {s.approval === "pending" ? (<>
                      <button disabled={busy} onClick={() => void act(() => approveShifts([s.id]), "Approved.")} className="text-green-700 underline">Approve</button>
                      <button disabled={busy} onClick={() => changeTime(s)} className="text-blue-700 underline">Change time</button>
                      <button disabled={busy} onClick={() => reject(s)} className="text-red-700 underline">Don't pay</button>
                    </>) : <button disabled={busy} onClick={() => void act(() => unapproveShifts([s.id]), "Back to waiting.")} className="text-slate-600 underline">Undo</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// A supervisor puts in time by hand (any past day), or changes a finished shift. Workers' own clock always uses the real time.
function TimeModal({ projects, workers, shift, day, onClose, onSaved }: {
  projects: Proj[]; workers: Wkr[]; shift: StaffShift | null; day: string; onClose: () => void; onSaved: (t: string) => void;
}) {
  const [workerId, setWorkerId] = useState(shift?.worker_id || "");
  const [projectId, setProjectId] = useState(shift?.project_id || (projects.length === 1 ? projects[0].id : ""));
  const [date, setDate] = useState(shift?.work_date || day);
  const [tin, setTin] = useState(shift ? jaHM(shift.clock_in_at) : "07:00");
  const [tout, setTout] = useState(shift ? jaHM(shift.clock_out_at) : "16:00");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mins = (() => { const [a, b] = tin.split(":").map(Number), [c, d] = tout.split(":").map(Number); return (c * 60 + d) - (a * 60 + b); })();
  async function save() {
    setErr(null);
    if (!workerId || !projectId || !date || !tin || !tout) { setErr("Pick the worker, the project, the day and both times."); return; }
    if (mins <= 0) { setErr("The time out must be after the time in (same day)."); return; }
    if (!note.trim()) { setErr(shift ? "Say why the time is changed." : "Say why the time is entered by hand (for example: forgot to clock in)."); return; }
    setBusy(true);
    try {
      if (shift) await editShift(shift.id, projectId, jaTime(date, tin), jaTime(date, tout), note.trim());
      else await manualShift(workerId, projectId, jaTime(date, tin), jaTime(date, tout), note.trim());
      onSaved(shift ? "Times changed. It waits for approval again if it was approved." : "Time added. It waits for approval like any other day.");
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not save."); setBusy(false); }
  }
  return (
    <Shell title={shift ? `Change times: ${wname(shift.workers)}` : "Add time by hand"} onClose={onClose}>
      <p className="text-sm text-slate-600 dark:text-slate-400">{shift ? "Fix the day, the times or the project. The reason is kept with the shift." : "For a day the worker did not clock in (today or any day before). It is marked \"entered by hand\"."}</p>
      {!shift && (
        <select value={workerId} onChange={(e) => setWorkerId(e.target.value)} className={`${input} w-full`}>
          <option value="">Pick the worker…</option>
          {workers.map((w) => <option key={w.id} value={w.id}>{wname(w)}{w.employee_id ? ` · ${w.employee_id}` : ""}</option>)}
        </select>
      )}
      <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={`${input} w-full`}>
        <option value="">Pick the project…</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-slate-500">Day<input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} className={`${input} mt-1 w-full`} /></label>
        <label className="text-xs text-slate-500">Time in<input type="time" value={tin} onChange={(e) => setTin(e.target.value)} className={`${input} mt-1 w-full`} /></label>
        <label className="text-xs text-slate-500">Time out<input type="time" value={tout} onChange={(e) => setTout(e.target.value)} className={`${input} mt-1 w-full`} /></label>
      </div>
      {mins > 0 && <div className="text-sm text-slate-700 dark:text-slate-300">= <b>{hoursWords(mins)}</b></div>}
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={shift ? "Why? e.g. clocked out late by mistake" : "Why? e.g. forgot to clock in, no phone"} className={`${input} w-full`} />
      {err && <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}
      <button onClick={() => void save()} disabled={busy} className={`${btn} w-full min-h-[48px] bg-green-600 hover:bg-green-500 text-white`}>{busy ? "Saving…" : shift ? "Save the change" : "Add the time"}</button>
      <button onClick={onClose} className={`${btn} w-full border border-slate-300 text-slate-700 dark:text-slate-300`}>Cancel</button>
    </Shell>
  );
}
