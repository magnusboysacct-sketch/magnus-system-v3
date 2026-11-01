// src/lib/hq/reportError.ts — send app errors to Magnus HQ (log_app_error), grouped by a fingerprint.
// The same error from the same place always gets the same fingerprint, so HQ sees one line with a count.
// Quiet by design: never throws, never shows anything, and sends each fingerprint at most once a minute from one browser
// (the database also caps it: 30 an hour per error, 1000 an hour in total).

import { supabase } from "../supabase";

const sentAt = new Map<string, number>();
const VERSION: string = import.meta.env.VITE_APP_VERSION || "dev";

// Errors we can't do anything about.
const IGNORE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Loading chunk \d+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /AbortError/i,
  /Load failed$/i,
  /NetworkError when attempting to fetch/i,
  // Supabase sign-in: two tabs (or a tab Chrome put to sleep) waiting for the same saved-login lock. It retries by
  // itself and nobody is signed out, so it is noise, not a fault.
  /Navigator LockManager lock .*timed out/i,
];

function hash(s: string): string {
  // FNV-1a, two rounds -> 16 hex chars. Not for security, just a stable short id.
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/** The screen without ids, so /projects/123 and /projects/456 group together. */
export function screenName(path = window.location.pathname): string {
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:n")
    .replace(/\/(portal|shared|receipt|v|verify|client-portal\/session)\/[^/]+/g, "/$1/:token")
    .slice(0, 120) || "/";
}

function firstFrame(stack?: string): string {
  if (!stack) return "";
  const line = stack.split("\n").find((l) => /\.(t|j)sx?|assets\//.test(l)) ?? "";
  // Drop line/column numbers and build hashes so a rebuild doesn't split one error into many.
  return line.replace(/:\d+:\d+/g, "").replace(/-[A-Za-z0-9_]{8}\.js/g, ".js").trim().slice(0, 200);
}

export function reportError(error: unknown, where?: string): void {
  try {
    const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : JSON.stringify(error ?? "Unknown error"));
    const message = `${err.name && err.name !== "Error" ? err.name + ": " : ""}${err.message || "Unknown error"}`.slice(0, 500);
    if (IGNORE.some((r) => r.test(message))) return;

    const screen = where ? `${screenName()} · ${where}` : screenName();
    const fp = hash(`${message.replace(/\d+/g, "#")}|${firstFrame(err.stack)}|${screenName()}`);

    const now = Date.now();
    if ((sentAt.get(fp) ?? 0) > now - 60_000) return;
    sentAt.set(fp, now);

    void supabase.rpc("log_app_error", {
      p_fingerprint: fp,
      p_message: message,
      p_stack: (err.stack || "").slice(0, 4000),
      p_screen: screen,
      p_device: navigator.userAgent.slice(0, 300),
      p_version: VERSION,
    }).then(() => undefined, () => undefined);
  } catch {
    /* reporting must never break the app */
  }
}

let installed = false;

/** window.onerror + unhandled promise rejections -> Magnus HQ. Call once at start-up. */
export function installGlobalErrorReporting(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    if (e.error || e.message) reportError(e.error ?? e.message, "window.onerror");
  });
  window.addEventListener("unhandledrejection", (e) => reportError(e.reason, "unhandled promise"));
}
