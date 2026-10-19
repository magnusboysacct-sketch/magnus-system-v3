// src/lib/workerPortalApi.ts — the worker portal (/worker) talks to the server only with a session token (like the client portal): the login edge function hands the
// token out, and every read is a database function that takes the token and returns only that worker's data (migration 20260952000000). A worker is not a Supabase
// Auth user. The token is kept in this browser for 30 days (localStorage), or until the worker logs out.
import { supabase } from "./supabase";

const KEY = "magnus_worker_session";

export function getWorkerToken(): string | null {
  try { return localStorage.getItem(KEY) || null; } catch { return null; }
}
export function setWorkerToken(token: string): void {
  try { localStorage.setItem(KEY, token); } catch { /* the portal still works until the page is closed */ }
}
export function clearWorkerToken(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// ── the edge functions ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<{ data: T | null; error: string | null; status: number }> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return { data: data as T, error: null, status: 200 };
  // a non-2xx answer: the function's own message is in the response body
  const res = (error as { context?: Response }).context;
  let message = "Something went wrong. Please try again.";
  let status = 500;
  try {
    if (res && typeof res.json === "function") { const j = await res.clone().json(); if (j?.error) message = String(j.error); status = res.status; }
  } catch { /* keep the generic message */ }
  return { data: null, error: message, status };
}

export interface LoginResult { ok: boolean; token?: string; mustChangePin?: boolean; error?: string }
export async function workerLogin(number: string, pin: string): Promise<LoginResult> {
  const r = await callFunction<{ ok: boolean; token: string; must_change_pin: boolean }>("worker-portal-login", { action: "login", number, pin });
  if (r.error || !r.data?.token) return { ok: false, error: r.error || "Employee number or PIN is wrong." };
  setWorkerToken(r.data.token);
  return { ok: true, token: r.data.token, mustChangePin: r.data.must_change_pin === true };
}

export async function workerChangePin(token: string, newPin: string, currentPin?: string): Promise<{ ok: boolean; error?: string; sessionEnded?: boolean }> {
  const r = await callFunction<{ ok: boolean }>("worker-portal-login", { action: "change_pin", token, new_pin: newPin, ...(currentPin ? { current_pin: currentPin } : {}) });
  if (r.error) return { ok: false, error: r.error, sessionEnded: r.status === 401 && /session/i.test(r.error) };
  return { ok: true };
}

export async function workerLogout(token: string): Promise<void> {
  try { await callFunction("worker-portal-login", { action: "logout", token }); } catch { /* the token is dropped below anyway */ }
  clearWorkerToken();
}

// A short-lived signed URL for the worker's own photo, or null.
export async function fetchWorkerPhotoUrl(token: string): Promise<string | null> {
  const r = await callFunction<{ url: string }>("worker-portal-files", { action: "photo", token });
  return r.data?.url ?? null;
}

// ── the reads (token-checked database functions) ────────────────────────────────────────────────────────────────────────────────────────────────────
export interface PortalHome {
  must_change_pin: boolean;
  first_name?: string;
  employee_id?: string;
  worker?: { first_name: string; last_name: string; employee_id: string; job_title: string | null; worker_type: string | null; phone: string | null; hire_date: string | null; id_expiry_date: string | null; verify_code: string | null; has_photo: boolean };
  company?: { name: string | null; tagline: string | null; logo_url: string | null; phone: string | null; email: string | null; id_card_primary: string | null; id_card_accent: string | null };
  totals?: { month: number; month_count: number; year: number; year_count: number; as_of: string };
}
export interface PortalPayment {
  id: string; work_date: string; created_at: string; project: string | null; description: string | null; payment_type: string | null;
  amount: number; advance_amount: number; receipt_number: string | null; status: string;
}
export interface PortalAdvance { project: string; advances_paid: number; deducted: number; balance: number }
export interface PortalNotice { id: string; title: string; body: string; pinned: boolean; created_at: string }

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message || "Could not load.");
  return data as T;
}
// null = the session is not valid any more (ended, expired, switched off): the page sends the worker back to sign in
export const fetchHome = (token: string) => rpc<PortalHome | null>("worker_portal_home", { p_token: token });
export const fetchPayments = (token: string, limit = 50, offset = 0) => rpc<PortalPayment[]>("worker_portal_payments", { p_token: token, p_limit: limit, p_offset: offset });
export const fetchAdvances = (token: string) => rpc<PortalAdvance[]>("worker_portal_advances", { p_token: token });
export const fetchNotices = (token: string) => rpc<PortalNotice[]>("worker_portal_notices", { p_token: token });
// the token of the public receipt page (/receipt/:token) for one of the worker's own payments
export const fetchReceiptLink = (token: string, paymentId: string) => rpc<string | null>("worker_portal_receipt_link", { p_token: token, p_payment_id: paymentId });

// ── small helpers for the screens ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function fmtJMD(n: number | string | null | undefined): string {
  return `JMD ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function fmtDay(d: string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d + "T12:00:00" : d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
export function paymentLabel(type: string | null | undefined): string {
  return type === "advance" ? "Advance" : type === "final" ? "Final payment" : "Payment";
}
