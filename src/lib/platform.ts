// src/lib/platform.ts — small browser-platform checks.

// iPhone, iPod, iPad — including iPadOS, whose Safari reports itself as a Mac but has a touch screen.
export function isIOSLike(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  return navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1;
}
