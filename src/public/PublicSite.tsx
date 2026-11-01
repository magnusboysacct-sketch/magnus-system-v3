// src/public/PublicSite.tsx — the public website for Magnus Boy's System: "/" (signed out), /pricing, /privacy, /terms,
// /status and /feedback. A small separate bundle (see main.tsx), so it loads fast on a cheap phone.
// Light and dark: follows the visitor's saved app theme, or their phone's setting.

import { useEffect, useState } from "react";
import { Menu, MessageCircle, Moon, Sun, X } from "lucide-react";
import Landing from "./Landing";
import { LegalPage, StatusPage, FeedbackPage } from "./InfoPages";
import { fetchPublicSite, waDigits, type PublicSiteData } from "./publicApi";

type Route = "home" | "pricing" | "privacy" | "terms" | "status" | "feedback";

function routeOf(path: string): Route {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/pricing") return "pricing";
  if (p === "/privacy") return "privacy";
  if (p === "/terms") return "terms";
  if (p === "/status") return "status";
  if (p === "/feedback") return "feedback";
  return "home";
}

const META: Record<Route, { title: string; description: string }> = {
  home: { title: "Magnus Boy's System: run your construction company from your phone", description: "Projects, workers, Jamaican payroll, purchasing and clients in one place. Built in Jamaica for Caribbean contractors." },
  pricing: { title: "Pricing | Magnus Boy's System", description: "Simple monthly plans for Caribbean construction companies, with a free trial." },
  privacy: { title: "Privacy policy | Magnus Boy's System", description: "How Magnus Boy's System looks after your company's data." },
  terms: { title: "Terms | Magnus Boy's System", description: "The terms for using Magnus Boy's System." },
  status: { title: "Status | Magnus Boy's System", description: "Is Magnus Boy's System working right now?" },
  feedback: { title: "Ideas & feedback | Magnus Boy's System", description: "Tell the Magnus team what would make it better." },
};

function setMeta(route: Route) {
  document.title = META[route].title;
  document.querySelector('meta[name="description"]')?.setAttribute("content", META[route].description);
  let canon = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canon) { canon = document.createElement("link"); canon.rel = "canonical"; document.head.appendChild(canon); }
  canon.href = `https://app.magnusboys.com${route === "home" ? "/" : `/${route}`}`;
}

function initialDark(): boolean {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") return saved === "dark";
  } catch { /* ignore */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export default function PublicSite() {
  const [route, setRoute] = useState<Route>(() => routeOf(window.location.pathname));
  const [site, setSite] = useState<PublicSiteData | null>(null);
  const [dark, setDark] = useState(initialDark);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
    const bg = dark ? "#0b1020" : "#f8fafc";
    root.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
    document.getElementById("root")?.style.setProperty("background-color", bg);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#1b2a6b");
  }, [dark]);

  useEffect(() => { setMeta(route); }, [route]);

  useEffect(() => {
    let alive = true;
    void fetchPublicSite().then((s) => { if (alive) setSite(s); });
    const onPop = () => setRoute(routeOf(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => { alive = false; window.removeEventListener("popstate", onPop); };
  }, []);

  const wa = waDigits(site?.support_contact.whatsapp);
  const nav = [
    { href: "/#features", label: "Features" },
    { href: "/pricing", label: "Pricing" },
    { href: "/#faq", label: "Questions" },
    { href: "/#demo", label: "Book a demo" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0b1020] dark:text-slate-100 font-sans antialiased">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-slate-900">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-[#0b1020]/90">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 h-14">
          <a href="/" className="flex items-center gap-2 font-bold tracking-tight">
            <img src="/icon-96x96.png" alt="" width={28} height={28} className="rounded-md" />
            <span>Magnus Boy&apos;s System</span>
          </a>
          <nav className="ml-auto hidden md:flex items-center gap-5 text-sm text-slate-600 dark:text-slate-300">
            {nav.map((n) => <a key={n.href} href={n.href} className="hover:text-slate-900 dark:hover:text-white">{n.label}</a>)}
          </nav>
          <button onClick={() => setDark((d) => !d)} aria-label={dark ? "Light mode" : "Dark mode"} className="ml-auto md:ml-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <a href="/login" className="hidden sm:inline-flex rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-white/20">Sign in</a>
          <button className="md:hidden rounded-lg p-2 text-slate-600 dark:text-slate-300" onClick={() => setMenu((m) => !m)} aria-label="Menu" aria-expanded={menu}>
            {menu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {menu && (
          <nav className="md:hidden border-t border-slate-200 px-4 py-3 space-y-1 dark:border-white/10">
            {[...nav, { href: "/login", label: "Sign in" }].map((n) => (
              <a key={n.href} href={n.href} onClick={() => setMenu(false)} className="block rounded-lg px-2 py-2.5 text-sm font-medium hover:bg-slate-100 dark:hover:bg-white/5">{n.label}</a>
            ))}
          </nav>
        )}
      </header>

      <main id="main">
        {route === "privacy" || route === "terms" ? <LegalPage kind={route} />
          : route === "status" ? <StatusPage />
          : route === "feedback" ? <FeedbackPage />
          : site ? <Landing site={site} focus={route === "pricing" ? "pricing" : undefined} />
          : <div className="h-[70vh] bg-[#1b2a6b]" />}
      </main>

      <footer className="border-t border-slate-200 bg-white dark:border-white/10 dark:bg-[#0b1020]">
        <div className="mx-auto max-w-6xl px-4 py-10 grid gap-8 sm:grid-cols-3 text-sm">
          <div>
            <div className="font-bold">Magnus Boy&apos;s System</div>
            <p className="mt-2 text-slate-500 dark:text-slate-400">Construction management for Jamaica and the Caribbean.</p>
            <p className="mt-3 font-semibold">Made in Jamaica 🇯🇲</p>
          </div>
          <div className="space-y-2">
            <a href="/pricing" className="block hover:underline">Pricing</a>
            <a href="/status" className="block hover:underline">System status</a>
            <a href="/feedback" className="block hover:underline">Ideas & feedback</a>
            <a href="/privacy" className="block hover:underline">Privacy policy{site?.legal.privacy ? ` (v${site.legal.privacy})` : ""}</a>
            <a href="/terms" className="block hover:underline">Terms{site?.legal.terms ? ` (v${site.legal.terms})` : ""}</a>
          </div>
          <div className="space-y-2">
            <a href="/login" className="block hover:underline">Sign in</a>
            <a href="/worker" className="block hover:underline">Worker sign in</a>
            <a href="/client-login" className="block hover:underline">Client sign in</a>
            {wa && (
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                <MessageCircle size={15} /> WhatsApp support
              </a>
            )}
            {site?.support_contact.email && <a href={`mailto:${site.support_contact.email}`} className="block hover:underline">{site.support_contact.email}</a>}
          </div>
        </div>
        <div className="border-t border-slate-100 py-4 text-center text-xs text-slate-400 dark:border-white/5">© {new Date().getFullYear()} Magnus Boy&apos;s Construction Limited</div>
      </footer>
    </div>
  );
}
