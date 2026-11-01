// src/pages/hq/controlRoom.ts — Magnus HQ "control room" mode for a computer that stays open.
// Every minute it checks platform health. A NEW problem: 3 beeps, a voice reads it, and a browser notification.
// A new warning: 1 beep and a notification. Nothing repeats until the check changes again.

import { useEffect, useRef } from "react";
import { fetchHealth, type HQHealth, type Level } from "../../lib/hq/platformAdmin";

let audio: AudioContext | null = null;

function beep(times: number) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audio = audio ?? new Ctx();
    const ctx = audio;
    void ctx.resume();
    for (let i = 0; i < times; i++) {
      const start = ctx.currentTime + i * 0.35;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = times > 1 ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.27);
    }
  } catch { /* no sound available */ }
}

function speak(text: string) {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch { /* no voice available */ }
}

function notify(title: string, body: string, urgent: boolean) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    new Notification(title, { body, requireInteraction: urgent, tag: `magnus-hq-${title}` });
  } catch { /* not allowed */ }
}

export function alertLevel(level: Level, title: string, body: string) {
  if (level === "problem") {
    beep(3);
    speak(`Magnus alert. ${title}. ${body}`);
    notify(`Magnus HQ: ${title}`, body, true);
  } else if (level === "warn") {
    beep(1);
    notify(`Magnus HQ: ${title}`, body, false);
  }
}

export async function askNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "default") return Notification.requestPermission();
  return Notification.permission;
}

export function testAlert() {
  alertLevel("problem", "Test alert", "Control room sound, voice and notifications are working.");
}

/** Polls health every minute while enabled and alerts on changes. */
export function useControlRoom(enabled: boolean, onUpdate?: (h: HQHealth) => void) {
  const prev = useRef<Map<string, Level> | null>(null);
  const cb = useRef(onUpdate);
  useEffect(() => { cb.current = onUpdate; }, [onUpdate]);

  useEffect(() => {
    if (!enabled) { prev.current = null; return; }
    let alive = true;

    const tick = async () => {
      try {
        const h = await fetchHealth();
        if (!alive) return;
        cb.current?.(h);
        const before = prev.current;
        const now = new Map(h.checks.map((c) => [c.key, c.level] as const));
        if (before) {
          for (const c of h.checks) {
            const was = before.get(c.key) ?? "ok";
            if (c.level !== was && c.level !== "ok" && !(was === "problem" && c.level === "warn")) {
              alertLevel(c.level, c.label, c.text);
            }
          }
        }
        prev.current = now;
      } catch { /* try again next minute */ }
    };

    void tick();
    const t = window.setInterval(() => { void tick(); }, 60_000);
    return () => { alive = false; window.clearInterval(t); };
  }, [enabled]);
}
