// src/lib/hq/traffic.ts — anonymous traffic counts for Magnus HQ.
// Sends only the section of the app (the first part of the address, e.g. "projects") and whether this browser
// is new today. No names, no addresses, no ids. A browser counts once per day as a visitor.

import { supabase } from "../supabase";

const DAY_KEY = "magnus.visit.day";
let lastSection = "";

function jamaicaDay(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Jamaica" });
}

export function sectionOf(path: string): string {
  const first = path.split("/").filter(Boolean)[0] ?? "home";
  return /^[a-z0-9-]{1,30}$/i.test(first) ? first.toLowerCase() : "other";
}

export function recordVisit(path: string): void {
  const section = sectionOf(path);
  if (section === lastSection) return;        // count moving between sections, not every click inside one
  lastSection = section;

  let newVisitor = false;
  try {
    const today = jamaicaDay();
    if (localStorage.getItem(DAY_KEY) !== today) {
      localStorage.setItem(DAY_KEY, today);
      newVisitor = true;
    }
  } catch { /* storage blocked: don't count as a visitor */ }

  void supabase.rpc("log_visit", { p_section: section, p_new_visitor: newVisitor }).then(() => undefined, () => undefined);
}
