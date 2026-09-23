// src/components/UpdateBanner.tsx
//
// Detects a new deploy while the app is already open and prompts a refresh, instead of the "reinstall to
// update" workaround this exists to replace. No new dependency: it periodically fetches "/" (also on window
// focus and tab visibility) and compares the hashed <script>/<link> asset filenames in that fresh HTML
// against the ones the currently-running page loaded with. vercel.json now sends Cache-Control: no-cache on
// "/", so that fetch reflects the real latest deploy; cache: "no-store" here is a second, independent guard
// against any browser or intermediate cache. Mounted once near the app root (see App.tsx) so it covers every
// route in this single bundle, including the client portal — there is no separate portal build to also cover.
import { useEffect, useRef, useState } from "react";

const CHECK_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes, within the 2-5 minute window asked for

// The hashed build filenames a page references (e.g. /assets/index-Cx7yT9kP.js, /assets/index-Cx7yT9kP.css),
// sorted so tag order can't cause a false mismatch. In dev (an unhashed /src/main.tsx entry) this still runs
// safely — the signature just always matches itself, so the banner never fires locally.
function assetSignature(html: string): string {
  const matches = Array.from(html.matchAll(/<(?:script|link)[^>]+?(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/gi));
  return matches.map((m) => m[1]).sort().join("|");
}

export default function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const initialSignature = useRef<string | null>(null);
  const checking = useRef(false);

  useEffect(() => {
    try {
      initialSignature.current = assetSignature(document.documentElement.outerHTML);
    } catch {
      initialSignature.current = null; // never surfaces to the user — check() below is a no-op without it
    }

    async function check() {
      if (checking.current || !initialSignature.current) return;
      checking.current = true;
      try {
        const res = await fetch(`${window.location.origin}/?_=${Date.now()}`, { cache: "no-store" });
        if (res.ok) {
          const html = await res.text();
          const latest = assetSignature(html);
          if (latest && latest !== initialSignature.current) {
            setUpdateAvailable(true);
            setDismissed(false); // a still-stale re-check should nag again even if the user dismissed it before
          }
        }
      } catch {
        // offline or a transient network error — try again on the next tick, never surface this to the user
      } finally {
        checking.current = false;
      }
    }

    const interval = setInterval(check, CHECK_INTERVAL_MS);
    const onVisibilityChange = () => { if (document.visibilityState === "visible") check(); };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  if (!updateAvailable || dismissed) return null;

  return (
    <div role="status" className="fixed inset-x-0 bottom-0 z-[99999] flex items-center justify-center gap-3 px-4 py-3 bg-slate-900 text-white text-sm shadow-[0_-4px_16px_rgba(0,0,0,0.3)]">
      <span>A new version is available.</span>
      <button onClick={() => window.location.reload()}
        className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition">
        Refresh
      </button>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss"
        className="ml-1 text-slate-400 hover:text-white text-xs px-1">
        ✕
      </button>
    </div>
  );
}
