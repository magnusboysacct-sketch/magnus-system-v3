// src/components/WorkerClock.tsx — the big Clock in / Clock out card at the top of the worker portal (migration 20260987000000).
// Made for workers who find reading hard: two big coloured buttons with pictures, the phone speaks every step, very few words.
// Clock in = selfie (camera) + where the phone is. While clocked in and this page is open, the phone checks every 10 minutes that the
// worker is still on site; leaving the site clocks them out (the server decides, after two off-site checks 3 minutes apart).
import { useCallback, useEffect, useRef, useState } from "react";
import {
  addMedia, blobToDataUrl, clockAnswer, clockCheck, clockIn, clockMissed, stampPhoto, stampWords, startRecording, uploadWorkFile, clockOut, clockState, distanceWords, getFix, hoursWords, setVoiceOn, shrinkPhoto, speak, timeWords, uploadClockPhoto, voiceOn,
  OfflineError, looksOffline, type ClockResult, type ClockShift, type ClockState, type Fix,
} from "../lib/attendance";
import { flushQueue, queueAdd, queueAll, tokTag, type QItem } from "../lib/clockQueue";
import { cancelAsk, isNativeApp, nativeRpc, openAppSettings, scheduleAsk, startSiteWatch, type NativeFix } from "../lib/nativeApp";

const NATIVE = isNativeApp();                  // inside the "Magnus Workers" Android app: checks keep running with the phone locked
const NATIVE_SEND_EVERY_MS = 3 * 60 * 1000;     // the app sends a site check at most every 3 minutes (when the phone moves)

// The last clock screen seen, so the clock still opens with no signal (step 4).
const STATE_KEY = "magnus_clock_state";
function saveState(s: ClockState) { try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch { /* fine */ } }
function loadState(): ClockState | null { try { const v = localStorage.getItem(STATE_KEY); return v ? JSON.parse(v) as ClockState : null; } catch { return null; } }
const isOffline = (e: unknown) => e instanceof OfflineError || looksOffline(e);
const KEPT = "No signal. It is saved on this phone and sends by itself when there is signal. Keep this page open.";

type Banner = { kind: "good" | "warn" | "bad"; icon: string; text: string } | null;
const CHECK_EVERY_MS = 10 * 60 * 1000;
// "Are you still on site?" a few times a day, at a random time 60 to 120 minutes apart; 15 minutes to answer.
const ASK_MIN_MS = 60 * 60 * 1000, ASK_SPREAD_MS = 60 * 60 * 1000, ANSWER_MS = 15 * 60 * 1000;
const nextAsk = () => Date.now() + ASK_MIN_MS + Math.floor(Math.random() * ASK_SPREAD_MS);
function buzz() { try { navigator.vibrate?.([400, 200, 400, 200, 400]); } catch { /* no buzz on this phone */ } }

function sayTime(iso: string) { return timeWords(iso).replace(":00", " o'clock"); }

export default function WorkerClock({ token, onSessionEnded }: { token: string; onSessionEnded: () => void }) {
  const [st, setSt] = useState<ClockState | null>(null);
  const [projectId, setProjectId] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [now, setNow] = useState(() => Date.now());
  const [voice, setVoice] = useState(voiceOn());
  const [askedCamera, setAskedCamera] = useState(false);
  const [outStep, setOutStep] = useState(false);                    // clocking out: "take a picture of your work" first
  const [thumbs, setThumbs] = useState<string[]>([]);               // pictures taken on this phone today (to show them back)
  const [recording, setRecording] = useState(false);
  const recRef = useRef<Awaited<ReturnType<typeof startRecording>> | null>(null);
  const recTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workRef = useRef<HTMLInputElement>(null);
  const [noGps, setNoGps] = useState(false);
  const [askSince, setAskSince] = useState<number | null>(null);     // when "Are you still on site?" went up
  const askAt = useRef<number>(nextAsk());
  const fileRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QItem[]>([]);                  // kept on the phone, waiting for signal
  const queueRef = useRef<QItem[]>([]);
  const [offline, setOffline] = useState(false);

  const reloadQueue = useCallback(async () => { const q = (await queueAll()).filter((x) => !x.tok || x.tok === tokTag(token)); queueRef.current = q; setQueue(q); return q; }, [token]);

  const refresh = useCallback(async () => {
    try {
      const s = await clockState(token);
      if (!s) { onSessionEnded(); return; }
      setSt(s); saveState(s); setOffline(false);
      setProjectId((p) => p || s.open?.project_id || s.last_project_id || (s.projects.length === 1 ? s.projects[0].id : ""));
    } catch (e) {
      if (isOffline(e)) {
        setOffline(true);
        const c = loadState();
        if (c) { setSt((cur) => cur || c); setProjectId((p) => p || c.open?.project_id || c.last_project_id || (c.projects.length === 1 ? c.projects[0].id : "")); }
        return;
      }
      setBanner({ kind: "bad", icon: "📶", text: e instanceof Error ? e.message : "No connection. Try again." });
    }
  }, [token, onSessionEnded]);

  // Send what was kept on the phone: now, when the signal comes back, and every minute.
  const flush = useCallback(async () => {
    if (!queueRef.current.length) return true;
    const r = await flushQueue(token);
    const left = await reloadQueue();
    if (r.refused.length) setBanner({ kind: "warn", icon: "⚠️", text: `Sent, but the office system said: ${r.refused.join(" · ")}` });
    else if (r.sent && !left.length) { setBanner({ kind: "good", icon: "📶", text: "Signal is back. Everything was sent." }); speak("Signal is back. Everything was sent."); }
    if (r.sent || r.refused.length) await refresh();
    setOffline(r.offline);
    return left.length === 0;
  }, [token, reloadQueue, refresh]);

  useEffect(() => { void reloadQueue().then(() => flush()).then(() => refresh()); }, [reloadQueue, flush, refresh]);
  useEffect(() => {
    const on = () => { void flush(); };
    window.addEventListener("online", on);
    const t = setInterval(on, 60000);
    return () => { window.removeEventListener("online", on); clearInterval(t); };
  }, [flush]);

  // Keep it on the phone (no signal).
  const keep = useCallback(async (item: QItem, quiet = false) => {
    await queueAdd({ ...item, tok: tokTag(token) }); await reloadQueue(); setOffline(true);
    if (!quiet) { setBanner({ kind: "warn", icon: "📶", text: KEPT }); speak("No signal. It is saved on the phone."); }
  }, [reloadQueue, token]);
  // Something new goes to the server only when nothing older is still waiting (the order matters).
  const canSendNow = useCallback(async () => queueRef.current.length === 0 || await flush(), [flush]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  // What the worker sees: the server's state, then what is still waiting on the phone, in order.
  let open: ClockShift | null = st?.open ?? null;
  for (const q of queue) {
    if (q.kind === "in") open = { id: "local", project_id: q.projectId || null, project: q.projectName || null, work_date: q.at.slice(0, 10), status: "open", clock_in_at: q.at,
      clock_out_at: null, out_method: null, in_distance_m: null, radius_m: null, minutes_worked: null, paid_until: null, last_on_site_at: null, off_site_since: null, flags: [], photos: 0, voices: 0 };
    else if (q.kind === "out") open = null;
    else if (open && q.kind === "photo") open = { ...open, photos: (open.photos || 0) + 1 };
    else if (open && q.kind === "voice") open = { ...open, voices: (open.voices || 0) + 1 };
  }
  const isOpen = open != null;

  // what a site check says
  const handleCheck = useCallback((r: ClockResult) => {
    if (r.status === "on_site") { setNoGps(false); setBanner({ kind: "good", icon: "✅", text: "You are on the site." }); }
    else if (r.status === "off_site") {
      setBanner({ kind: "warn", icon: "⚠️", text: `You are ${distanceWords(r.distance_m)} from the site. Go back to the site or you will be clocked out.` });
      speak("You are outside the site. Go back to the site, or you will be clocked out.");
    } else if (r.status === "clocked_out") {
      setBanner({ kind: "bad", icon: "🚶", text: "You left the site, so you were clocked out." });
      speak("You left the site. You are clocked out.");
      void refresh();
    } else if (r.status === "no_location") { setNoGps(true); }
    else if (r.status === "no_shift") { void refresh(); }
    else if (r.status === "no_session") { onSessionEnded(); }
  }, [refresh, onSessionEnded]);

  // the 10-minute site checks while this page is open
  useEffect(() => {
    if (!isOpen || NATIVE) return;               // the app watches the location itself (below)
    let stop = false;
    const run = async () => {
      if (document.visibilityState !== "visible") return;
      const fix = await getFix(15000);
      if (stop) return;
      const at = new Date().toISOString();
      try {
        if (!(await canSendNow())) { await keep({ kind: "check", at, fix }, true); return; }
        handleCheck(await clockCheck(token, fix));
      } catch (e) { if (isOffline(e)) await keep({ kind: "check", at, fix }, true); }
    };
    const t = setInterval(run, CHECK_EVERY_MS);
    const onVis = () => { if (document.visibilityState === "visible") void run(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [isOpen, token, handleCheck, canSendNow, keep]);

  // The Android app: watch the location also with the phone locked, and send a site check at most every 3 minutes.
  const [watchErr, setWatchErr] = useState<string | null>(null);
  const lastSent = useRef(0);
  useEffect(() => {
    if (!NATIVE || !isOpen) { if (NATIVE) void cancelAsk(); return; }
    void scheduleAsk(askAt.current);
    let stopWatch: (() => void) | null = null, gone = false;
    const send = async (f: NativeFix) => {
      const n = Date.now();
      if (n - lastSent.current < NATIVE_SEND_EVERY_MS) return;
      lastSent.current = n;
      const fix: Fix = { lat: f.lat, lng: f.lng, accuracy: f.accuracy };
      const at = new Date(f.time || n).toISOString();
      if (queueRef.current.length) { await keep({ kind: "check", at, fix }, true); void flush(); return; }
      try { handleCheck(await nativeRpc<ClockResult>("worker_clock_check", { p_token: token, p_lat: fix.lat, p_lng: fix.lng, p_accuracy: fix.accuracy })); setWatchErr(null); }
      catch (e) { if (e instanceof Error && e.message === "offline") await keep({ kind: "check", at, fix }, true); }
    };
    void startSiteWatch("You are clocked in", `${open?.project || "Site"}: the phone checks you are on the site.`, (f) => { void send(f); },
      (code) => setWatchErr(code === "NOT_AUTHORIZED" ? "perm" : "gps"))
      .then((stop) => { if (gone) stop?.(); else stopWatch = stop; });
    return () => { gone = true; stopWatch?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, token]);

  // "Are you still on site?": time to ask, and no answer in 15 minutes
  useEffect(() => {
    if (!isOpen) { setAskSince(null); return; }
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;     // asked when the page is looked at again
      const n = Date.now();
      if (askSince == null && n >= askAt.current) {
        setAskSince(n); buzz(); speak("Are you still on the site? Tap the yellow button.");
      } else if (askSince != null && n - askSince >= ANSWER_MS) {
        setAskSince(null); askAt.current = nextAsk(); if (NATIVE) void scheduleAsk(askAt.current);
        void clockMissed(token).catch((e) => { if (isOffline(e)) void keep({ kind: "missed", at: new Date().toISOString() }, true); });
        setBanner({ kind: "warn", icon: "❓", text: "You did not answer \"Are you on site?\". The office will see this." });
      } else if (askSince != null && (n - askSince) % (5 * 60 * 1000) < 30000) {
        buzz(); speak("Tap the yellow button.");                // remind every 5 minutes
      }
    }, 30000);
    return () => clearInterval(t);
  }, [isOpen, askSince, token, keep]);

  async function answerAsk() {
    setAskSince(null); askAt.current = nextAsk(); if (NATIVE) void scheduleAsk(askAt.current);
    setBusy("Checking where you are…");
    const at = new Date().toISOString();
    let fix: Fix | null = null;
    try {
      fix = await getFix(15000);
      if (!(await canSendNow())) { await keep({ kind: "answer", at, fix }); return; }
      handleCheck(await clockAnswer(token, fix)); if (fix) speak("Thank you.");
    } catch (e) {
      if (isOffline(e)) await keep({ kind: "answer", at, fix });
      else setBanner({ kind: "warn", icon: "📶", text: e instanceof Error ? e.message : "Your answer was not sent." });
    } finally { setBusy(null); }
  }

  function toggleVoice() { const v = !voice; setVoiceOn(v); setVoice(v); if (v) speak("Voice is on."); }

  // CLOCK IN: the tap opens the camera straight away (a phone only opens it from a tap)
  function pressClockIn() {
    if (!projectId) { speak("First, tap the site you are working on."); setBanner({ kind: "warn", icon: "👆", text: "First, tap the site you are working on." }); return; }
    setBanner(null);
    speak("Take a picture of your face.");
    setAskedCamera(true);
    fileRef.current?.click();
  }

  async function doClockIn(file: File | null) {
    const at = new Date().toISOString();
    let image: string | null = null, fix: Fix | null = null;
    const projectName = st?.projects.find((p) => p.id === projectId)?.name || "";
    const keepIn = async () => {
      await keep({ kind: "in", at, fix, projectId, projectName, image }, true);
      setBanner({ kind: "warn", icon: "📶", text: `You are clocked in. ${KEPT}` });
      speak(`You are clocked in at ${sayTime(at)}. There is no signal, so it is saved on the phone.`);
    };
    try {
      if (file) { setBusy("Saving your picture…"); image = await shrinkPhoto(file); }
      setBusy("Finding where you are…");
      fix = await getFix();
      setNoGps(!fix);
      setBusy("Clocking you in…");
      if (!(await canSendNow())) { await keepIn(); return; }
      const photo = image ? await uploadClockPhoto(token, image) : null;
      const r = await clockIn(token, projectId, fix, photo);
      const at = sayTime(new Date().toISOString());
      if (r.status === "on_site") {
        setBanner({ kind: "good", icon: "✅", text: "You are clocked in. You are on the site." });
        speak(`You are clocked in at ${at}. Have a good day.`);
      } else if (r.status === "off_site") {
        setBanner({ kind: "warn", icon: "⚠️", text: `You are clocked in, but you are ${distanceWords(r.distance_m)} from the site. The office will see this.` });
        speak(`You are clocked in, but you are not on the site. The office will see this.`);
      } else if (r.status === "no_location") {
        setBanner({ kind: "warn", icon: "📍", text: "You are clocked in, but the phone could not find where you are. Turn on Location." });
        speak("You are clocked in. Please turn on location on your phone.");
      } else {
        setBanner({ kind: "good", icon: "✅", text: "You are clocked in." });
        speak(`You are clocked in at ${at}.`);
      }
      if (!photo && file) setBanner({ kind: "warn", icon: "📷", text: "You are clocked in, but the picture did not save." });
      await refresh();
    } catch (e) {
      if (isOffline(e)) { await keepIn(); return; }
      const msg = e instanceof Error ? e.message : "Could not clock in. Try again.";
      setBanner({ kind: "bad", icon: "❌", text: msg });
      speak("That did not work. Try again.");
    } finally { setBusy(null); setAskedCamera(false); }
  }

  // CLOCK OUT: first "take a picture of what you did today", then finish
  function pressClockOut() {
    setOutStep(true);
    speak((open?.photos || 0) > 0 ? "Take another picture, or tap the red button to finish." : "Take a picture of what you did today.");
  }

  async function finishClockOut() {
    const at = new Date().toISOString();
    let fix: Fix | null = null;
    const keepOut = async () => {
      await keep({ kind: "out", at, fix }, true);
      setOutStep(false);
      setBanner({ kind: "warn", icon: "👋", text: `You are clocked out. ${KEPT}` });
      speak("You are clocked out. There is no signal, so it is saved on the phone. Keep this page open until it sends.");
    };
    try {
      setBusy("Finding where you are…");
      fix = await getFix();
      setBusy("Clocking you out…");
      if (!(await canSendNow())) { await keepOut(); return; }
      const s = await clockOut(token, fix, null);
      const worked = hoursWords(s.minutes_worked);
      if (s.flags.includes("out_far")) {
        setBanner({ kind: "warn", icon: "⚠️", text: `You are clocked out away from the site. Time counted: ${worked}.` });
        speak(`You are clocked out. You were not on the site, so the time stops when you left.`);
      } else {
        setBanner({ kind: "good", icon: "👋", text: `You are clocked out. You worked ${worked} today.` });
        speak(`You are clocked out. You worked ${worked.replace("hrs", "hours").replace("hr", "hour").replace("min", "minutes")}. Thank you.`);
      }
      setOutStep(false);
      await refresh();
    } catch (e) {
      if (isOffline(e)) { await keepOut(); return; }
      setBanner({ kind: "bad", icon: "❌", text: e instanceof Error ? e.message : "Could not clock out. Try again." });
      speak("That did not work. Try again.");
    } finally { setBusy(null); }
  }

  // A picture of the work: name, site and time are written on it
  function pressWorkPhoto() { speak("Take a picture of the work."); workRef.current?.click(); }
  async function saveWorkPhoto(file: File) {
    const at = new Date().toISOString();
    let data = "", fix: Fix | null = null;
    try {
      setBusy("Saving your picture…");
      const project = open?.project || st?.today[st.today.length - 1]?.project || "";
      data = await stampPhoto(file, [[st?.worker_name, project].filter(Boolean).join(" · "), stampWords()]);
      fix = await getFix(10000);
      if (!(await canSendNow())) { await keep({ kind: "photo", at, fix, image: data }); setThumbs((t) => [...t, data].slice(-6)); return; }
      const path = await uploadWorkFile(token, "photo", data);
      if (!path) throw new Error("The picture did not save. Try again.");
      const r = await addMedia(token, "photo", path, null, fix);
      setThumbs((t) => [...t, data].slice(-6));
      setBanner({ kind: "good", icon: "📷", text: `Picture saved. ${r.photos} today.` });
      speak(outStep ? "Picture saved. Take another one, or tap the red button to finish." : "Picture saved.");
      await refresh();
    } catch (e) {
      if (isOffline(e) && data) { await keep({ kind: "photo", at, fix, image: data }); setThumbs((t) => [...t, data].slice(-6)); return; }
      setBanner({ kind: "bad", icon: "📷", text: e instanceof Error ? e.message : "The picture did not save." });
      speak("The picture did not save. Try again.");
    } finally { setBusy(null); }
  }

  // Hold to talk: press and hold the microphone button, let go to save (at most 90 seconds)
  async function talkStart() {
    if (recording || busy) return;
    try {
      recRef.current = await startRecording();
      setRecording(true);
      try { navigator.vibrate?.(80); } catch { /* fine */ }
      recTimer.current = setTimeout(() => { void talkStop(); }, 90000);
    } catch {
      setBanner({ kind: "warn", icon: "🎤", text: "The phone did not let this page use the microphone. Allow it and try again." });
      speak("Please allow the microphone.");
    }
  }
  async function talkStop() {
    if (recTimer.current) { clearTimeout(recTimer.current); recTimer.current = null; }
    const r = recRef.current; recRef.current = null;
    if (!r) return;
    setRecording(false);
    const rec = await r.stop();
    if (!rec || rec.seconds < 1) { speak("Hold the button down while you talk."); setBanner({ kind: "warn", icon: "🎤", text: "Hold the button down while you talk, then let go." }); return; }
    const at = new Date().toISOString();
    let audio = "";
    try {
      setBusy("Saving your voice note…");
      audio = await blobToDataUrl(rec.blob);
      if (!(await canSendNow())) { await keep({ kind: "voice", at, audio, seconds: rec.seconds }); return; }
      const path = await uploadWorkFile(token, "voice", audio);
      if (!path) throw new Error("The voice note did not save. Try again.");
      const r2 = await addMedia(token, "voice", path, rec.seconds, null);
      setBanner({ kind: "good", icon: "🎤", text: `Voice note saved. ${r2.voices} today.` });
      speak("Voice note saved.");
      await refresh();
    } catch (e) {
      if (isOffline(e) && audio) { await keep({ kind: "voice", at, audio, seconds: rec.seconds }); return; }
      setBanner({ kind: "bad", icon: "🎤", text: e instanceof Error ? e.message : "The voice note did not save." });
    } finally { setBusy(null); }
  }
  useEffect(() => () => { recRef.current?.cancel(); if (recTimer.current) clearTimeout(recTimer.current); }, []);

  if (!st) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xl text-slate-500">{offline ? "📶❌ No signal. Open the clock once with signal, then it works without signal too." : "Loading the clock…"}</div>;

  const workedMin = open ? Math.max(0, Math.floor((now - new Date(open.clock_in_at).getTime()) / 60000)) : 0;
  const bannerStyle = banner?.kind === "good" ? "border-green-300 bg-green-50 text-green-900" : banner?.kind === "warn" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-red-300 bg-red-50 text-red-900";
  const doneToday = st.today.reduce((s, x) => s + (x.minutes_worked || 0), 0);

  return (
    <section className="rounded-3xl border-2 border-slate-200 bg-white p-4 space-y-4" aria-label="Clock in and out">
      <input ref={workRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0] || null; e.target.value = ""; if (f) void saveWorkPhoto(f); }} />
      <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0] || null; e.target.value = ""; if (f) void doClockIn(f); }} />

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">⏰ Clock</h2>
        <button onClick={toggleVoice} aria-label={voice ? "Turn voice off" : "Turn voice on"} className="min-h-[48px] min-w-[48px] rounded-xl border-2 border-slate-300 text-2xl">{voice ? "🔊" : "🔇"}</button>
      </div>

      {(offline || queue.length > 0) && (
        <div className="rounded-2xl border-2 border-slate-300 bg-slate-100 px-4 py-3 text-lg text-slate-800">
          📶❌ {offline ? "No signal." : "Sending…"}{queue.length > 0 && <> ⏳ <b>{queue.length}</b> saved on this phone, waiting to send.</>}
          {queue.length > 0 && !offline && <button onClick={() => void flush()} className="ml-2 underline">Send now</button>}
        </div>
      )}
      {banner && <div role="status" className={`rounded-2xl border-2 px-4 py-3 text-xl font-semibold ${bannerStyle}`}><span className="mr-2 text-2xl">{banner.icon}</span>{banner.text}</div>}
      {noGps && (
        <div className="rounded-2xl border-2 border-blue-300 bg-blue-50 px-4 py-3 text-lg text-blue-900">
          <div className="text-2xl">📍 ➜ ⚙️ ➜ 🟢</div>
          Turn on <b>Location</b> on your phone, and let this page use it.
        </div>
      )}
      {busy && <div className="rounded-2xl bg-slate-100 px-4 py-4 text-center text-xl font-semibold text-slate-700">⏳ {busy}</div>}

      {!open ? (<>
        {st.projects.length === 0 ? <p className="text-lg text-slate-600">There is no open site to clock in to. Ask the office.</p> : (
          <div className="space-y-2">
            <div className="text-lg font-semibold text-slate-700">👷 Where are you working?</div>
            {st.projects.map((p) => (
              <button key={p.id} onClick={() => { setProjectId(p.id); speak(p.name); }}
                className={`w-full min-h-[60px] rounded-2xl border-2 px-4 text-left text-xl font-semibold ${projectId === p.id ? "border-green-600 bg-green-50 text-green-900" : "border-slate-300 text-slate-800"}`}>
                {projectId === p.id ? "✅ " : "⬜ "}{p.name}
              </button>
            ))}
          </div>
        )}
        <button onClick={pressClockIn} disabled={!!busy || st.projects.length === 0}
          className="w-full min-h-[110px] rounded-3xl bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:opacity-50 text-white shadow-lg">
          <div className="text-5xl leading-none">▶️</div>
          <div className="mt-1 text-3xl font-extrabold tracking-wide">CLOCK IN</div>
          <div className="text-lg opacity-90">📷 picture of your face</div>
        </button>
        {askedCamera && !busy && (
          <button onClick={() => void doClockIn(null)} className="w-full min-h-[52px] rounded-2xl border-2 border-slate-300 text-lg text-slate-700">Camera not working? Clock in without a picture</button>
        )}
      </>) : (<>
        {askSince != null && (
          <button onClick={() => void answerAsk()} disabled={!!busy}
            className="w-full min-h-[120px] rounded-3xl bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 text-slate-900 shadow-lg animate-pulse">
            <div className="text-5xl leading-none">✋</div>
            <div className="mt-1 text-3xl font-extrabold">I'M HERE</div>
            <div className="text-lg">Are you still on the site? Tap here.</div>
          </button>
        )}
        <div className="rounded-3xl bg-green-50 border-2 border-green-300 p-5 text-center">
          <div className="text-lg font-semibold text-green-900">🟢 Working at {open.project || "the site"}</div>
          <div className="mt-1 text-5xl font-extrabold text-green-800 tabular-nums">{hoursWords(workedMin)}</div>
          <div className="text-lg text-green-900">since {timeWords(open.clock_in_at)}</div>
        </div>
        {NATIVE
          ? <p className="text-base text-slate-600">🔒 You can lock the phone. While you are clocked in, the phone checks that you are on the site. If you leave the site, you are clocked out. Sometimes the phone asks "Are you still on the site?": open the app and tap the yellow button.</p>
          : <p className="text-base text-slate-600">📱 Keep this page open while you work. The phone checks that you are on the site every 10 minutes. If you leave the site, you are clocked out. Sometimes the phone buzzes and asks "Are you still on site?": tap the yellow button.</p>}
        {NATIVE && watchErr && (
          <div className="rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-lg text-red-900">
            📍 {watchErr === "perm" ? "The app is not allowed to use your location. Allow it (\"Allow all the time\" or \"While using the app\")." : "Turn on Location (GPS) on the phone."}
            {watchErr === "perm" && <button onClick={openAppSettings} className="mt-2 block w-full min-h-[52px] rounded-xl bg-red-600 text-white text-lg font-bold">Open settings</button>}
          </div>
        )}
        {!outStep ? (<>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={pressWorkPhoto} disabled={!!busy} className="min-h-[90px] rounded-2xl border-2 border-blue-300 bg-blue-50 text-blue-900 disabled:opacity-50">
              <div className="text-4xl leading-none">📷</div><div className="mt-1 text-lg font-bold">Picture of work</div>
            </button>
            <TalkButton recording={recording} disabled={!!busy && !recording} onStart={() => void talkStart()} onStop={() => void talkStop()} />
          </div>
          {((open.photos || 0) > 0 || (open.voices || 0) > 0) && <div className="text-lg text-slate-700">Today: 📷 {open.photos || 0} · 🎤 {open.voices || 0}</div>}
          <button onClick={pressClockOut} disabled={!!busy}
            className="w-full min-h-[110px] rounded-3xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white shadow-lg disabled:opacity-50">
            <div className="text-5xl leading-none">⏹️</div>
            <div className="mt-1 text-3xl font-extrabold tracking-wide">CLOCK OUT</div>
          </button>
        </>) : (
          <div className="space-y-3 rounded-3xl border-2 border-red-300 bg-red-50 p-4">
            <div className="text-2xl font-bold text-red-900">📷 Show what you did today</div>
            <div className="text-lg text-red-900">Take a picture of your work. You can also hold 🎤 and talk.</div>
            {thumbs.length > 0 && <div className="flex gap-2 overflow-x-auto">{thumbs.map((t, i) => <img key={i} src={t} alt={`Work picture ${i + 1}`} className="h-20 w-20 shrink-0 rounded-xl object-cover" />)}</div>}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={pressWorkPhoto} disabled={!!busy} className="min-h-[100px] rounded-2xl bg-blue-600 text-white disabled:opacity-50">
                <div className="text-5xl leading-none">📷</div><div className="mt-1 text-xl font-bold">TAKE PICTURE</div>
              </button>
              <TalkButton recording={recording} disabled={!!busy && !recording} onStart={() => void talkStart()} onStop={() => void talkStop()} />
            </div>
            <div className="text-lg font-semibold text-slate-800">📷 {open.photos || 0} picture{open.photos === 1 ? "" : "s"} · 🎤 {open.voices || 0} voice note{open.voices === 1 ? "" : "s"}</div>
            {(open.photos || 0) === 0 && <div className="text-base text-amber-800">⚠️ No picture yet. The office will see that.</div>}
            <button onClick={() => void finishClockOut()} disabled={!!busy || recording}
              className="w-full min-h-[100px] rounded-3xl bg-red-600 hover:bg-red-500 text-white shadow-lg disabled:opacity-50">
              <div className="text-4xl leading-none">⏹️</div>
              <div className="mt-1 text-2xl font-extrabold">FINISH · CLOCK OUT</div>
            </button>
            <button onClick={() => { setOutStep(false); speak("Back to work."); }} className="w-full min-h-[52px] rounded-2xl border-2 border-slate-300 bg-white text-lg text-slate-700">⬅ Not yet, back to work</button>
          </div>
        )}
      </>)}

      {!open && st.today.length > 0 && st.today[st.today.length - 1].clock_out_at && Date.now() - new Date(st.today[st.today.length - 1].clock_out_at!).getTime() < 2 * 3600_000 && (
        <button onClick={pressWorkPhoto} disabled={!!busy} className="w-full min-h-[64px] rounded-2xl border-2 border-blue-300 bg-blue-50 text-xl font-bold text-blue-900 disabled:opacity-50">📷 Add a picture of today's work</button>
      )}
      {st.today.length > 0 && (
        <div className="rounded-2xl bg-slate-50 p-3">
          <div className="text-lg font-semibold text-slate-700">Today: {hoursWords(doneToday)}</div>
          {st.today.map((x) => (
            <div key={x.id} className="flex justify-between text-base text-slate-600">
              <span>{timeWords(x.clock_in_at)} – {timeWords(x.clock_out_at)} · {x.project}</span>
              <span>{x.out_method === "left_site" ? "🚶 left site" : hoursWords(x.minutes_worked)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Press and hold to record; let go to save.
function TalkButton({ recording, disabled, onStart, onStop }: { recording: boolean; disabled: boolean; onStart: () => void; onStop: () => void }) {
  return (
    <button type="button" disabled={disabled}
      onPointerDown={(e) => { e.preventDefault(); (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId); onStart(); }}
      onPointerUp={() => onStop()} onPointerCancel={() => onStop()} onContextMenu={(e) => e.preventDefault()}
      style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
      className={`min-h-[90px] rounded-2xl border-2 disabled:opacity-50 ${recording ? "border-red-500 bg-red-500 text-white animate-pulse" : "border-purple-300 bg-purple-50 text-purple-900"}`}>
      <div className="text-4xl leading-none">🎤</div>
      <div className="mt-1 text-lg font-bold">{recording ? "Talking… let go" : "Hold to talk"}</div>
    </button>
  );
}
