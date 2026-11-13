// src/lib/netStatus.ts — tell people plainly when there is no internet, everywhere in the app.
// installNetworkWatch() (main.tsx, once) wraps window.fetch: when a request fails because the network is down, the error
// message becomes NO_INTERNET (so every "Could not load / save: …" message in the app says it plainly instead of
// "TypeError: Failed to fetch"), and the red banner (NetBanner) shows. The phone's own online / offline signal also counts.
// The first request that gets through again hides the banner. Cancelled requests (AbortError) are left alone.
export const NO_INTERNET = "No internet connection. Please connect to Wi-Fi or mobile data and try again.";

type State = { offline: boolean; reason: "device" | "unreachable" | null };
let state: State = { offline: typeof navigator !== "undefined" && navigator.onLine === false, reason: null };
if (state.offline) state.reason = "device";
const listeners = new Set<(s: State) => void>();
function set(next: State) {
  if (next.offline === state.offline && next.reason === state.reason) return;
  state = next;
  listeners.forEach((l) => l(state));
}
export const getNetState = () => state;
export function onNetChange(l: (s: State) => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; }

let installed = false;
export function installNetworkWatch(): void {
  if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;
  window.addEventListener("offline", () => set({ offline: true, reason: "device" }));
  window.addEventListener("online", () => set({ offline: false, reason: null }));
  const original = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    try {
      const res = await original(...args);
      if (state.offline) set({ offline: false, reason: null });
      return res;
    } catch (e) {
      const name = (e as { name?: string })?.name;
      const msg = String((e as { message?: string })?.message || "");
      if (name !== "AbortError" && (navigator.onLine === false || /failed to fetch|networkerror|load failed|network request failed|err_internet|err_network/i.test(msg))) {
        set({ offline: true, reason: navigator.onLine === false ? "device" : "unreachable" });
        throw new TypeError(NO_INTERNET);
      }
      throw e;
    }
  };
}
