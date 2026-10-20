// src/hooks/useWorkerPortalManifest.ts
// While a worker portal page is open, the page's web manifest, theme colour and home-screen icon / title are the WORKER PORTAL's, so "Add to Home Screen" on /worker makes an icon
// that opens /worker (named "<Company> Workers", with the company's logo when it could be drawn). Everything is put back when the page is left, so the staff app keeps its own.
import { useEffect } from "react";
import { buildWorkerManifest, workerAppNames, type ManifestIcon } from "../lib/workerPortalInstall";

export function useWorkerPortalManifest(opts: { companyName?: string | null; icons?: ManifestIcon[] | null; themeColor?: string | null; touchIcon?: string | null }) {
  const { companyName, themeColor, touchIcon } = opts;
  const iconsKey = opts.icons ? opts.icons.map((i) => i.sizes).join(",") + (opts.icons[0]?.src.length ?? 0) : "";

  useEffect(() => {
    const head = document.head;
    const link = head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const theme = head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const appTitle = head.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const touch = head.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    const before = { link: link?.href, theme: theme?.content, title: appTitle?.content, touch: touch?.href };
    let blobUrl: string | null = null;

    // the static manifest (public/worker-manifest.json) until the company is known; then one with the company's name and logo
    if (link) {
      if (companyName || (opts.icons && opts.icons.length)) {
        try {
          blobUrl = URL.createObjectURL(new Blob([JSON.stringify(buildWorkerManifest({ origin: window.location.origin, companyName, icons: opts.icons, themeColor }))], { type: "application/manifest+json" }));
          link.href = blobUrl;
        } catch { link.href = "/worker-manifest.json"; }
      } else {
        link.href = "/worker-manifest.json";
      }
    }
    if (theme && themeColor) theme.content = themeColor;
    if (appTitle) appTitle.content = workerAppNames(companyName).short_name;
    if (touch && touchIcon) touch.href = touchIcon;

    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      if (link && before.link) link.href = before.link;
      if (theme && before.theme !== undefined) theme.content = before.theme;
      if (appTitle && before.title !== undefined) appTitle.content = before.title;
      if (touch && before.touch) touch.href = before.touch;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyName, themeColor, touchIcon, iconsKey]);
}
