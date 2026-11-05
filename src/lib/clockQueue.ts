// src/lib/clockQueue.ts — the clock with no signal (migration 20260990000000).
// When a clock in, site check, "I'm here", picture, voice note or clock out can't reach the server, it is kept on the phone
// (IndexedDB, so pictures fit) with the time it really happened, and sent in the same order when the signal comes back.
// The server accepts a time up to 12 hours back and flags a late clock in / out ("sent_late") for the supervisor.
import {
  addMedia, clockAnswer, clockCheck, clockIn, clockMissed, clockOut, looksOffline, OfflineError, uploadClockPhoto, uploadWorkFile, type Fix,
} from "./attendance";

export type QKind = "in" | "check" | "answer" | "missed" | "out" | "photo" | "voice";
export interface QItem {
  id?: number;
  kind: QKind;
  at: string;                       // ISO time it happened on the phone
  fix?: Fix | null;
  projectId?: string;               // in
  projectName?: string;             // in (to show it while waiting)
  image?: string | null;            // in: selfie; photo: the work picture (data URL)
  audio?: string;                   // voice (data URL)
  seconds?: number;                 // voice
  tok?: string;                     // the end of the session token it was kept under: never sent for another person signed in later
}
export const tokTag = (token: string) => token.slice(-12);

const DB = "magnus_clock", STORE = "queue";
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true }); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}
export async function queueAll(): Promise<QItem[]> {
  try { const all = await tx<QItem[]>("readonly", (s) => s.getAll() as IDBRequest<QItem[]>); return all.sort((a, b) => (a.id || 0) - (b.id || 0)); }
  catch { return []; }
}
export async function queueAdd(item: QItem): Promise<void> { await tx("readwrite", (s) => s.add(item)); }
async function queueDelete(id: number): Promise<void> { await tx("readwrite", (s) => s.delete(id)); }
export async function queueClear(): Promise<void> { try { await tx("readwrite", (s) => s.clear()); } catch { /* fine */ } }

// One item to the server. Throws OfflineError when there is still no signal.
async function sendOne(token: string, q: QItem): Promise<void> {
  switch (q.kind) {
    case "in": {
      const photo = q.image ? await uploadClockPhoto(token, q.image) : null;
      await clockIn(token, q.projectId || "", q.fix ?? null, photo, q.at); return;
    }
    case "check": await clockCheck(token, q.fix ?? null, q.at); return;
    case "answer": await clockAnswer(token, q.fix ?? null, q.at); return;
    case "missed": await clockMissed(token); return;
    case "out": await clockOut(token, q.fix ?? null, null, q.at); return;
    case "photo": case "voice": {
      const path = await uploadWorkFile(token, q.kind, (q.kind === "photo" ? q.image : q.audio) || "");
      if (!path) throw new Error(q.kind === "photo" ? "A picture could not be saved." : "A voice note could not be saved.");
      await addMedia(token, q.kind, path, q.seconds ?? null, q.fix ?? null, q.at); return;
    }
  }
}

let flushing = false;
// Send everything waiting, oldest first. Stops at the first "no signal". An item the server refuses is dropped and its
// reason returned, so one bad item can't block the rest.
export async function flushQueue(token: string): Promise<{ sent: number; refused: string[]; offline: boolean }> {
  const out = { sent: 0, refused: [] as string[], offline: false };
  if (flushing) return out;
  flushing = true;
  try {
    for (const q of await queueAll()) {
      if (q.tok && q.tok !== tokTag(token)) { if (q.id != null) await queueDelete(q.id); continue; }
      try { await sendOne(token, q); out.sent++; }
      catch (e) {
        if (e instanceof OfflineError || looksOffline(e)) { out.offline = true; break; }
        out.refused.push(e instanceof Error ? e.message : "Could not be sent.");
      }
      if (q.id != null) await queueDelete(q.id);
    }
  } finally { flushing = false; }
  return out;
}
