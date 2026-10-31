// src/hooks/useIdleSignOut.ts — call onIdle once after `ms` with no mouse, key, touch or scroll.
// Checks on a timer and when the tab comes back, so a laptop that slept past the limit
// is signed out the moment it wakes.

import { useEffect, useRef } from "react";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"] as const;

export function useIdleSignOut(ms: number, onIdle: () => void, enabled = true) {
  const lastActive = useRef(0);
  const fired = useRef(false);
  const onIdleRef = useRef(onIdle);

  useEffect(() => { onIdleRef.current = onIdle; }, [onIdle]);

  useEffect(() => {
    if (!enabled) return;
    lastActive.current = Date.now();
    fired.current = false;

    const bump = () => { lastActive.current = Date.now(); };
    const check = () => {
      if (fired.current) return;
      if (Date.now() - lastActive.current >= ms) {
        fired.current = true;
        onIdleRef.current();
      }
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, 15_000);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(timer);
    };
  }, [ms, enabled]);
}
