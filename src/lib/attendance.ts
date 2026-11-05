// src/lib/attendance.ts — clock in / clock out (migration 20260987000000).
// Workers use the worker portal (session token, no login); the office and supervisors use their normal login.
import { supabase } from "./supabase";

export interface Fix { lat: number; lng: number; accuracy: number }
export interface ClockShift {
  id: string; project_id: string | null; project: string | null; work_date: string; status: "open" | "closed";
  clock_in_at: string; clock_out_at: string | null; out_method: string | null; in_distance_m: number | null; radius_m: number | null;
  minutes_worked: number | null; paid_until: string | null; last_on_site_at: string | null; off_site_since: string | null; flags: string[];
  photos?: number; voices?: number;        // pictures of the work / voice notes (step 2)
}
export interface ClockState {
  server_time: string; worker_name?: string; open: ClockShift | null; projects: { id: string; name: string; site_set: boolean }[];
  last_project_id: string | null; today: ClockShift[];
}
export interface ClockResult { status: "on_site" | "off_site" | "unsure" | "no_location" | "clocked_out" | "no_shift" | "too_soon" | "no_session"; distance_m?: number | null; radius_m?: number | null; site_set?: boolean }

// ── the phone ──────────────────────────────────────────────────────────────────────────────────────────────
// Where the phone is now, or null (location off, refused, or no answer in 20 seconds).
export function getFix(timeoutMs = 20000): Promise<Fix | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy || 0) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
    );
  });
}

// A camera photo made small (longest side 800 px, JPEG) as a data URL.
export function shrinkPhoto(file: File, maxSide = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const ctx = c.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("no canvas")); return; }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read the photo")); };
    img.src = url;
  });
}

// A picture of the work: bigger (longest side 1280 px) with a dark strip at the bottom that says who, where and when.
export function stampPhoto(file: File, lines: string[], maxSide = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("no canvas")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const fs = Math.max(14, Math.round(w / 40)), pad = Math.round(fs * 0.5), barH = lines.length * (fs + pad) + pad;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, h - barH, w, barH);
      ctx.fillStyle = "#fff"; ctx.font = `600 ${fs}px sans-serif`; ctx.textBaseline = "top";
      lines.forEach((t, i) => ctx.fillText(t, pad, h - barH + pad + i * (fs + pad), w - 2 * pad));
      resolve(c.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read the photo")); };
    img.src = url;
  });
}
export function stampWords(): string {
  return new Date().toLocaleString("en-US", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// Hold-to-talk voice note. start() asks for the microphone; stop() gives the recording (webm on Android, mp4 on iPhone).
export interface Recording { blob: Blob; seconds: number; mime: string }
export async function startRecording(): Promise<{ stop: () => Promise<Recording | null>; cancel: () => void }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const pick = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t));
  const rec = new MediaRecorder(stream, pick ? { mimeType: pick, audioBitsPerSecond: 32000 } : undefined);
  const parts: Blob[] = [];
  const started = Date.now();
  rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  rec.start();
  const end = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: () => new Promise((resolve) => {
      rec.onstop = () => {
        end();
        const mime = (rec.mimeType || pick || "audio/webm").split(";")[0];
        const blob = new Blob(parts, { type: mime });
        resolve(blob.size > 500 ? { blob, seconds: Math.round((Date.now() - started) / 1000), mime } : null);
      };
      try { rec.stop(); } catch { end(); resolve(null); }
    }),
    cancel: () => { try { rec.stop(); } catch { /* fine */ } end(); },
  };
}
export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(b); });
}

const VOICE_KEY = "magnus_clock_voice";
export function voiceOn(): boolean { try { return localStorage.getItem(VOICE_KEY) !== "off"; } catch { return true; } }
export function setVoiceOn(on: boolean): void { try { localStorage.setItem(VOICE_KEY, on ? "on" : "off"); } catch { /* fine */ } }
// Say it out loud (the phone's own voice), for workers who find reading hard.
export function speak(text: string): void {
  try {
    if (!voiceOn() || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch { /* no voice on this phone */ }
}

// ── small words ────────────────────────────────────────────────────────────────────────────────────────────
export function distanceWords(m: number | null | undefined): string {
  if (m == null) return "";
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}
export function hoursWords(minutes: number | null | undefined): string {
  const m = Math.max(0, Math.round(minutes || 0));
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h} hr${h === 1 ? "" : "s"} ${r} min` : `${r} min`;
}
export function timeWords(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
export const FLAG_WORDS: Record<string, string> = {
  in_far: "Clocked in away from the site",
  in_no_location: "No location at clock in",
  in_no_photo: "No photo at clock in",
  no_site_point: "Site location not set for this project",
  out_far: "Clocked out away from the site",
  out_no_location: "No location at clock out",
  left_site: "Left the site (clocked out by the phone)",
  forgot_clock_out: "Forgot to clock out",
  long_gap: "More than 3 hours with no site check",
  no_work_photo: "No picture of the work",
  missed_check: "Did not answer an \"Are you on site?\" check",
};
export function mapLink(lat: number | null | undefined, lng: number | null | undefined): string | null {
  return lat == null || lng == null ? null : `https://www.google.com/maps?q=${lat},${lng}`;
}

// ── worker (portal token) ──────────────────────────────────────────────────────────────────────────────────
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message || "Something went wrong. Try again.");
  return data as T;
}
export const clockState = (token: string) => rpc<ClockState | null>("worker_clock_state", { p_token: token });
export const clockIn = (token: string, projectId: string, fix: Fix | null, photoPath: string | null) =>
  rpc<ClockResult>("worker_clock_in", { p_token: token, p_project: projectId, p_lat: fix?.lat ?? null, p_lng: fix?.lng ?? null, p_accuracy: fix?.accuracy ?? null, p_photo_path: photoPath });
export const clockCheck = (token: string, fix: Fix | null) =>
  rpc<ClockResult>("worker_clock_check", { p_token: token, p_lat: fix?.lat ?? null, p_lng: fix?.lng ?? null, p_accuracy: fix?.accuracy ?? null });
export const clockAnswer = (token: string, fix: Fix | null) =>
  rpc<ClockResult>("worker_clock_answer", { p_token: token, p_lat: fix?.lat ?? null, p_lng: fix?.lng ?? null, p_accuracy: fix?.accuracy ?? null });
export const clockMissed = (token: string) => rpc<{ status: string }>("worker_clock_missed", { p_token: token });
export const clockOut = (token: string, fix: Fix | null, photoPath: string | null) =>
  rpc<ClockShift>("worker_clock_out", { p_token: token, p_lat: fix?.lat ?? null, p_lng: fix?.lng ?? null, p_accuracy: fix?.accuracy ?? null, p_photo_path: photoPath });

// The selfie goes through the worker-portal-files server function (a worker has no login to upload with). null = not saved.
export async function uploadClockPhoto(token: string, dataUrl: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("worker-portal-files", { body: { action: "clock_photo", token, image: dataUrl } });
    if (error) return null;
    return typeof data?.path === "string" ? data.path : null;
  } catch { return null; }
}

// Pictures of the work and voice notes: saved by the server function, then added to today's shift.
export async function uploadWorkFile(token: string, kind: "photo" | "voice", dataUrl: string): Promise<string | null> {
  try {
    const body = kind === "photo" ? { action: "work_photo", token, image: dataUrl } : { action: "voice", token, audio: dataUrl };
    const { data, error } = await supabase.functions.invoke("worker-portal-files", { body });
    if (error) return null;
    return typeof data?.path === "string" ? data.path : null;
  } catch { return null; }
}
export const addMedia = (token: string, kind: "photo" | "voice", path: string, seconds: number | null, fix: Fix | null) =>
  rpc<{ shift_id: string; photos: number; voices: number }>("worker_clock_add_media", { p_token: token, p_kind: kind, p_path: path, p_seconds: seconds, p_lat: fix?.lat ?? null, p_lng: fix?.lng ?? null });

// ── office / supervisor ────────────────────────────────────────────────────────────────────────────────────
export interface StaffShift {
  id: string; worker_id: string; project_id: string | null; work_date: string; status: "open" | "closed";
  clock_in_at: string; clock_out_at: string | null; out_method: string | null;
  in_lat: number | null; in_lng: number | null; in_accuracy_m: number | null; in_distance_m: number | null; in_photo_path: string | null;
  out_lat: number | null; out_lng: number | null; out_distance_m: number | null; out_photo_path: string | null;
  site_radius_m: number | null; last_on_site_at: string | null; last_check_at: string | null; first_off_site_at: string | null;
  paid_until: string | null; minutes_worked: number | null; flags: string[]; clocked_in_by: string | null; clocked_out_by: string | null; note: string | null;
  workers: { first_name: string | null; last_name: string | null; employee_id: string | null } | null;
  projects: { name: string | null } | null;
}
export async function fetchShiftsForDay(companyId: string, day: string, projectId: string | "all"): Promise<StaffShift[]> {
  await supabase.rpc("attendance_close_stale");
  let q = supabase.from("attendance_shifts")
    .select("*, workers(first_name,last_name,employee_id), projects(name)")
    .eq("company_id", companyId).eq("work_date", day).order("clock_in_at", { ascending: true });
  if (projectId !== "all") q = q.eq("project_id", projectId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as unknown as StaffShift[];
}
export async function fetchChecks(shiftId: string): Promise<{ checked_at: string; kind: string; distance_m: number | null; on_site: boolean | null; lat: number | null; lng: number | null }[]> {
  const { data, error } = await supabase.from("attendance_checks").select("checked_at,kind,distance_m,on_site,lat,lng").eq("shift_id", shiftId).order("checked_at");
  if (error) throw new Error(error.message);
  return data || [];
}
export async function signedPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  const list = Array.from(new Set(paths.filter(Boolean)));
  if (!list.length) return {};
  const { data } = await supabase.storage.from("private-files").createSignedUrls(list, 900);
  const out: Record<string, string> = {};
  (data || []).forEach((d) => { if (d.path && d.signedUrl) out[d.path] = d.signedUrl; });
  return out;
}
// A supervisor's own photo of a crew member, into the company's attendance folder.
export async function uploadStaffClockPhoto(companyId: string, workerId: string, dataUrl: string): Promise<string | null> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const month = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 7);
    const path = `${companyId}/attendance/${month}/${workerId}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from("private-files").upload(path, blob, { contentType: "image/jpeg", upsert: false });
    return error ? null : path;
  } catch { return null; }
}
export async function setSite(projectId: string, fix: Fix, radius?: number): Promise<void> {
  const { error } = await supabase.rpc("attendance_set_site", { p_project: projectId, p_lat: fix.lat, p_lng: fix.lng, p_radius: radius ?? null });
  if (error) throw new Error(error.message);
}
export async function setRadius(projectId: string, radius: number): Promise<void> {
  const { error } = await supabase.rpc("attendance_set_radius", { p_project: projectId, p_radius: radius });
  if (error) throw new Error(error.message);
}
export async function staffClockIn(workerId: string, projectId: string, fix: Fix | null, photoPath: string | null): Promise<ClockResult> {
  const { data, error } = await supabase.rpc("attendance_staff_clock_in", { p_worker: workerId, p_project: projectId, p_lat: fix?.lat ?? null, p_lng: fix?.lng ?? null, p_accuracy: fix?.accuracy ?? null, p_photo_path: photoPath });
  if (error) throw new Error(error.message);
  return data as ClockResult;
}
export async function staffClockOut(shiftId: string, fix: Fix | null, note?: string): Promise<void> {
  const { error } = await supabase.rpc("attendance_staff_clock_out", { p_shift: shiftId, p_lat: fix?.lat ?? null, p_lng: fix?.lng ?? null, p_accuracy: fix?.accuracy ?? null, p_photo_path: null, p_note: note ?? null });
  if (error) throw new Error(error.message);
}

// ── pictures of the work / voice notes (step 2) ────────────────────────────────────────────────────────────
export interface MediaRow {
  id: string; shift_id: string; worker_id: string; project_id: string | null; work_date: string; kind: "photo" | "voice"; path: string;
  seconds: number | null; lat: number | null; lng: number | null; added_by: string | null; created_at: string;
  workers?: { first_name: string | null; last_name: string | null } | null;
}
export async function fetchMediaForShifts(shiftIds: string[]): Promise<MediaRow[]> {
  if (!shiftIds.length) return [];
  const { data, error } = await supabase.from("attendance_media").select("*").in("shift_id", shiftIds).order("created_at");
  if (error) throw new Error(error.message);
  return (data || []) as MediaRow[];
}
// The photo diary: a project's pictures and voice notes, newest day first.
export async function fetchDiary(companyId: string, projectId: string | "all", fromDay: string, toDay: string): Promise<MediaRow[]> {
  let q = supabase.from("attendance_media").select("*, workers(first_name,last_name)")
    .eq("company_id", companyId).gte("work_date", fromDay).lte("work_date", toDay)
    .order("work_date", { ascending: false }).order("created_at", { ascending: true }).limit(300);
  if (projectId !== "all") q = q.eq("project_id", projectId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as unknown as MediaRow[];
}
// A supervisor's picture of a crew member's work.
export async function staffAddWorkPhoto(companyId: string, workerId: string, dataUrl: string, fix: Fix | null): Promise<void> {
  const blob = await (await fetch(dataUrl)).blob();
  const month = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 7);
  const path = `${companyId}/attendance/${month}/${workerId}/work/${crypto.randomUUID()}.jpg`;
  const { error: upErr } = await supabase.storage.from("private-files").upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (upErr) throw new Error("Could not save the picture.");
  const { error } = await supabase.rpc("attendance_staff_add_media", { p_worker: workerId, p_kind: "photo", p_path: path, p_seconds: null, p_lat: fix?.lat ?? null, p_lng: fix?.lng ?? null });
  if (error) throw new Error(error.message);
}
