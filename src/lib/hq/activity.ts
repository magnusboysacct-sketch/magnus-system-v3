// src/lib/hq/activity.ts — tell Magnus HQ "this user used the app today" (once per user per day).
// Stores only user, company and date: no pages, no content. Feeds HQ's "active users" numbers.
// Never throws and never blocks the app; a database without the HQ migration just ignores it.

import { supabase } from "../supabase";

const KEY = "magnus.activity.day";

function jamaicaDay(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Jamaica" });
}

export async function recordDailyActivity(userId: string): Promise<void> {
  const stamp = `${userId}:${jamaicaDay()}`;
  try {
    if (localStorage.getItem(KEY) === stamp) return;
  } catch { /* storage blocked: still record */ }
  try {
    const { error } = await supabase.rpc("record_activity");
    if (!error) {
      try { localStorage.setItem(KEY, stamp); } catch { /* ignore */ }
    }
  } catch { /* offline or not migrated yet: try again next load */ }
}
