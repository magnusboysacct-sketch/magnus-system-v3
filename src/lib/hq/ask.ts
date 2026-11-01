// src/lib/hq/ask.ts — "Ask HQ" assistant (Step 12). The question goes to /api/hq-ask with the admin's own login;
// the server checks 2-step login, the on/off switch and the monthly US$ cap before anything is sent to Anthropic.
// The assistant only SUGGESTS. confirmSuggestion() does the change through the normal hq_setting_save() checks.

import { supabase } from "../supabase";
import { saveSetting } from "./platformAdmin";
import { FEATURE_NAMES } from "../platformSettings";

export type AskMessage = { role: "user" | "assistant"; content: string };

export type Suggestion =
  | { type: "suggest_banner"; input: { kind: "news" | "heads_up" | "urgent"; text: string; why?: string } }
  | { type: "suggest_maintenance"; input: { on: boolean; message?: string; why?: string } }
  | { type: "suggest_feature"; input: { feature: string; on: boolean; why?: string } }
  | { type: "open_tab"; input: { tab: string; why?: string } };

export type AskReply = {
  text?: string;
  suggestions?: Suggestion[];
  problem?: string;
  cost_usd?: number | null;
  spent_usd?: number | null;
  cap_usd?: number | null;
};

export type AssistantStatus = {
  on: boolean; cap_usd: number; model: string; price_in: number; price_out: number;
  spent_usd: number; questions_this_month: number;
};

export async function askHQ(messages: AskMessage[]): Promise<AskReply> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { problem: "You're signed out. Sign in again." };
  let res: Response;
  try {
    res = await fetch("/api/hq-ask", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
  } catch {
    return { problem: "No internet connection, or the server didn't answer." };
  }
  if (res.status === 404) return { problem: "Ask HQ only works on the live site, signed in with 2-step login." };
  try { return (await res.json()) as AskReply; } catch { return { problem: `Ask HQ failed (${res.status}). Try again.` }; }
}

export async function fetchAssistantStatus(): Promise<AssistantStatus> {
  const { data, error } = await supabase.rpc("hq_assistant_status");
  if (error) throw new Error(error.message);
  return data as AssistantStatus;
}

export async function saveAssistant(s: { on: boolean; cap_usd: number; model: string; price_in: number; price_out: number }, reason: string): Promise<void> {
  const { error } = await supabase.rpc("hq_assistant_save", {
    p_on: s.on, p_cap_usd: s.cap_usd, p_model: s.model, p_price_in: s.price_in, p_price_out: s.price_out, p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

const FEATURE_WORDS: Record<string, string> = FEATURE_NAMES;

/** What a suggestion will do, in plain words (shown on the Confirm card). */
export function describe(s: Suggestion): string {
  switch (s.type) {
    case "suggest_banner": return `Show a ${s.input.kind === "heads_up" ? "heads-up" : s.input.kind} message to everyone: "${s.input.text}"`;
    case "suggest_maintenance": return s.input.on ? `Switch maintenance mode ON. Everyone except HQ sees: "${s.input.message || "Back soon."}"` : "Switch maintenance mode OFF.";
    case "suggest_feature": return `Switch ${FEATURE_WORDS[s.input.feature] ?? s.input.feature} ${s.input.on ? "ON" : "OFF"} for everyone.`;
    case "open_tab": return `Open the ${s.input.tab} tab.`;
  }
}

/** Does the change through hq_setting_save (admin + 2-step + reason + activity log). open_tab is handled by the screen. */
export async function confirmSuggestion(s: Suggestion, reason: string): Promise<void> {
  const r = `Ask HQ suggestion: ${reason}`;
  if (s.type === "suggest_banner") await saveSetting("banner", { kind: s.input.kind, text: s.input.text, link: null, on: true }, r);
  else if (s.type === "suggest_maintenance") await saveSetting("maintenance", { on: s.input.on, message: s.input.message ?? "" }, r);
  else if (s.type === "suggest_feature") await saveSetting("features", { [s.input.feature]: s.input.on }, r);
}

export const usd = (n: number | null | undefined, d = 2) => (n == null ? "-" : `US$${Number(n).toFixed(d)}`);
