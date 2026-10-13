// src/hooks/useForceLightPage.ts
//
// The pages a client or field officer opens from a link (login, reset password, the invite/setup screen and the portal itself) are
// always LIGHT, whatever the staff app's theme or the phone's dark-mode setting, so a company logo (often dark) is never put on a dark
// background. Two things darken a page:
//   1. The staff app's theme: <html class="dark"> (the default theme) turns on the global dark rules in index.css (dark page colour and a
//      light default text colour). This hook takes that class off for as long as the page is shown.
//   2. The device/browser: Android Chrome / Samsung Internet "auto dark mode" recolours pages that don't say they are light-only. The
//      color-scheme declaration below (CSS property + meta tag) opts the page out.
// Everything is put back when the page is left, so the staff app keeps its own theme.
import { useEffect } from "react";

const LIGHT_BG = "#f8fafc";

export function useForceLightPage() {
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const hadDark = root.classList.contains("dark");
    const prev = {
      scheme: root.style.colorScheme,
      rootBg: root.style.backgroundColor,
      bodyBg: body.style.backgroundColor,
      bodyColor: body.style.color,
    };
    const themeColor = document.querySelector('meta[name="theme-color"]');
    const prevThemeColor = themeColor?.getAttribute("content") ?? null;

    const meta = document.createElement("meta");
    meta.setAttribute("name", "color-scheme");
    meta.setAttribute("content", "only light");
    meta.setAttribute("data-forced-light", "1");
    document.head.appendChild(meta);

    root.classList.remove("dark");
    root.style.colorScheme = "only light";
    root.style.backgroundColor = LIGHT_BG;
    body.style.backgroundColor = LIGHT_BG;
    body.style.color = "#0f172a";
    themeColor?.setAttribute("content", LIGHT_BG);

    return () => {
      meta.remove();
      if (hadDark) root.classList.add("dark");
      root.style.colorScheme = prev.scheme;
      root.style.backgroundColor = prev.rootBg;
      body.style.backgroundColor = prev.bodyBg;
      body.style.color = prev.bodyColor;
      if (themeColor && prevThemeColor !== null) themeColor.setAttribute("content", prevThemeColor);
    };
  }, []);
}
