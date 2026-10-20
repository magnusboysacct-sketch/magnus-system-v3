// Keeping the worker portal one tap away: its own web manifest (so "Add to Home Screen" on /worker opens /worker, not the staff app), and the one-time
// "Add to your home screen" tip after signing in. Pure logic (plus a little storage) so it can be tested: scripts/tests/workerPortal.test.ts.

export interface ManifestIcon { src: string; sizes: string; type: string; purpose?: string }

// The app's own icons, used when the company has no usable logo (the static public/worker-manifest.json lists the same ones).
export const APP_ICON_PATHS: ManifestIcon[] = [
  { src: "/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

const cleanName = (s: string | null | undefined) => String(s ?? "").replace(/\s+/g, " ").trim();

// "<Company> Workers" when the company is known, else "Worker Portal". short_name is what is written under the icon.
export function workerAppNames(company?: string | null): { name: string; short_name: string } {
  const c = cleanName(company);
  if (!c) return { name: "Worker Portal", short_name: "Workers" };
  const name = c.length > 40 ? `${c.slice(0, 40).trim()} Workers` : `${c} Workers`;
  const first = c.split(" ")[0];
  const short = `${first} Workers`;
  return { name, short_name: short.length <= 20 ? short : "Workers" };
}

export function buildWorkerManifest(o: { origin: string; companyName?: string | null; icons?: ManifestIcon[] | null; themeColor?: string | null }) {
  const origin = o.origin.replace(/\/+$/, "");
  const abs = (i: ManifestIcon): ManifestIcon => ({ ...i, src: /^(data:|https?:)/.test(i.src) ? i.src : origin + i.src });
  const names = workerAppNames(o.companyName);
  return {
    id: `${origin}/worker`,
    name: names.name,
    short_name: names.short_name,
    description: "Your payments, advances and ID card.",
    start_url: `${origin}/worker`,
    scope: `${origin}/worker`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: /^#[0-9a-fA-F]{6}$/.test(o.themeColor || "") ? (o.themeColor as string) : "#15315A",
    icons: (o.icons && o.icons.length ? o.icons : APP_ICON_PATHS).map(abs),
  };
}

// ── the one-time "Add to your home screen" tip ──────────────────────────────────────────────────────────────────────────────────────────────────────
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const store = (kind: "local" | "session"): Store | null => { try { return kind === "local" ? localStorage : sessionStorage; } catch { return null; } };
const FRESH_KEY = "magnus_worker_fresh_login";
const NEVER_KEY = "magnus_worker_tip_never";

// set by the login page after a successful sign-in; read (and cleared) by the home page, so the tip shows after a sign-in and not on every reload
export function markFreshLogin(s: Store | null = store("session")): void { try { s?.setItem(FRESH_KEY, "1"); } catch { /* ignore */ } }
export function takeFreshLogin(s: Store | null = store("session")): boolean {
  try { if (s?.getItem(FRESH_KEY) !== "1") return false; s.removeItem(FRESH_KEY); return true; } catch { return false; }
}
export function neverShowTip(s: Store | null = store("local")): void { try { s?.setItem(NEVER_KEY, "1"); } catch { /* ignore */ } }
export function tipDismissedForever(s: Store | null = store("local")): boolean { try { return s?.getItem(NEVER_KEY) === "1"; } catch { return false; } }

// shown after a fresh sign-in, unless the worker said "Don't show again" or the portal is already running from the home screen
export function shouldShowHomeTip(o: { freshLogin: boolean; dismissedForever: boolean; standalone: boolean }): boolean {
  return o.freshLogin && !o.dismissedForever && !o.standalone;
}
export function isStandalone(): boolean {
  try { return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true; } catch { return false; }
}
export function isIPhoneLike(ua: string): boolean { return /iPhone|iPad|iPod/i.test(ua); }

export const TIP_STEPS = {
  android: ["Tap the menu (the three dots) at the top right of Chrome.", "Tap Add to Home screen (or Install app).", "Tap Add."],
  iphone: ["Open this page in Safari, then tap the Share button (the square with an arrow).", "Scroll down and tap Add to Home Screen.", "Tap Add."],
} as const;
