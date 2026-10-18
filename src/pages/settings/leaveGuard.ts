// src/pages/settings/leaveGuard.ts — ask before leaving Settings with unsaved changes.
// The app uses a plain <BrowserRouter>, which has no "blocker" API, so while something is unsaved this wraps the router's own push / replace (every link click and
// navigate() goes through them): a move to a path outside Settings asks first. A refresh or closing the tab uses the browser's own "leave site?" prompt.
// Returns a function that puts everything back.
export interface RouterNavigator { push: (...a: unknown[]) => void; replace: (...a: unknown[]) => void }

export function installLeaveGuard(navigator: RouterNavigator, isInside: (path: string) => boolean, message: string): () => void {
  const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
  window.addEventListener("beforeunload", onBeforeUnload);
  const push = navigator.push, replace = navigator.replace;
  const guarded = (orig: (...a: unknown[]) => void) => (to: unknown, ...rest: unknown[]) => {
    const path = typeof to === "string" ? to : (to as { pathname?: string })?.pathname ?? "";
    if (!isInside(path) && !window.confirm(message)) return;
    return orig.call(navigator, to, ...rest);
  };
  navigator.push = guarded(push);
  navigator.replace = guarded(replace);
  return () => { window.removeEventListener("beforeunload", onBeforeUnload); navigator.push = push; navigator.replace = replace; };
}
