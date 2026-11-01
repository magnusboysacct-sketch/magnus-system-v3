// src/public/Landing.tsx — the Magnus Boy's System front page for signed-out visitors.
// Only claims what the app really does. Prices come from the database (Magnus HQ → Money); with Charging off it says
// "Free during launch". Hero text and FAQ come from HQ too (editable in Step 11).

import { useEffect } from "react";
import {
  ArrowRight, BookOpen, Building2, ClipboardList, LogIn, FileCheck2, HardHat, Landmark, MessageCircle,
  ReceiptText, ScanLine, ShoppingCart, Smartphone, Users, Wallet,
} from "lucide-react";
import { DemoForm, FeedbackForm } from "./Forms";
import { jmd, waDigits, type PublicSiteData } from "./publicApi";

const FEATURES = [
  { icon: ClipboardList, title: "Projects, estimates & BOQ", text: "Take-offs from your drawings, bills of quantities from a 600+ item Jamaican rate library, estimates and contracts." },
  { icon: Wallet, title: "Payroll with Jamaican deductions", text: "NIS, NHT, Education Tax, HEART and PAYE at the current official rates, payslips and monthly remittance totals." },
  { icon: ShoppingCart, title: "Purchasing that checks itself", text: "Purchase orders, receiving on site and three-way matching against the supplier's invoice before you pay." },
  { icon: BookOpen, title: "Proper double-entry books", text: "A Jamaican chart of accounts, expenses that post themselves, receivables, payables and cash flow." },
  { icon: Building2, title: "Client & field-officer portals", text: "Clients see their projects, photos and invoices. Each field officer can get a login for only their own sites." },
  { icon: HardHat, title: "Worker portal & payslips", text: "Workers sign in with a number and PIN to see their pay, ID card and notices. No email needed." },
  { icon: ReceiptText, title: "Receipts by WhatsApp link", text: "Field payment and client payment receipts as a link that opens on any phone, with your logo." },
  { icon: ScanLine, title: "Receipt scanning (beta)", text: "Snap a supplier receipt and Magnus fills in the details for you to check." },
];

const WHO = [
  { icon: Building2, title: "Contractors", text: "Run every job, crew and dollar from one place, on your phone or at the office." },
  { icon: Landmark, title: "NGO & programme officers", text: "See progress, photos and change orders for the sites you oversee, without chasing anyone." },
  { icon: HardHat, title: "Site supervisors", text: "Daily logs, photos, receiving and field payments from site, even on a cheap phone." },
  { icon: Users, title: "Workers", text: "Payslips, receipts and your worker ID card in your pocket." },
];

const STEPS = [
  { title: "Sign up", text: "Create your company in two minutes. Your rate library and chart of accounts are ready." },
  { title: "Add your team and first project", text: "Invite staff, add workers and clients, and price your first job." },
  { title: "Run it from your phone", text: "Pay workers, order materials, invoice clients and share progress, all from site." },
];

const FEATURE_NAMES: Record<string, string> = {
  payroll: "Payroll", client_portal: "Client portals", worker_portal: "Worker portal", ocr: "Receipt scanning",
  public_receipts: "WhatsApp receipts", ai: "AI assistant",
};

export default function Landing({ site, focus }: { site: PublicSiteData; focus?: "pricing" }) {
  useEffect(() => {
    const id = focus ?? window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [focus]);

  const hero = site.website.hero_title || "Run your construction company from your phone";
  const sub = site.website.hero_sub || "Projects, workers, payroll, purchasing and clients in one place. Built in Jamaica for Caribbean contractors.";
  const faq = site.website.faq ?? [];
  const wa = waDigits(site.support_contact.whatsapp);
  const plans = site.pricing.prices.filter((p) => p.key.startsWith("plan."));
  const signup = site.signups_open ? "/login?mode=signup" : "#demo";

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#1b2a6b] text-white">
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(90deg, #fff 1px, transparent 1px), linear-gradient(#fff 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:py-20 grid gap-10 lg:grid-cols-[1.2fr_1fr] items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff4d5e]" /> Made in Jamaica for Caribbean contractors
            </p>
            <h1 className="mt-4 text-3xl sm:text-5xl font-extrabold leading-[1.08] tracking-tight">{hero}</h1>
            <p className="mt-4 max-w-xl text-base sm:text-lg text-blue-100">{sub}</p>
            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              <a href={signup} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#c8102e] px-6 py-3.5 text-sm font-semibold hover:bg-[#a50d26]">
                {site.signups_open ? "Start free trial" : "Ask for an invite"} <ArrowRight size={16} />
              </a>
              <a href="#demo" className="inline-flex items-center justify-center rounded-lg border border-white/30 px-6 py-3.5 text-sm font-semibold hover:bg-white/10">
                Book a demo
              </a>
            </div>
            <p className="mt-3 text-xs text-blue-200">
              {site.pricing.charging_on ? `${site.pricing.trial_days}-day free trial. No card needed.` : "Free during launch. No card needed."}
            </p>
          </div>
          {/* A phone-sized summary of what you see every day */}
          <div className="mx-auto w-full max-w-[300px] rounded-[2rem] border-[6px] border-white/15 bg-white p-4 text-slate-900 shadow-2xl">
            <div className="flex items-center justify-between text-[11px] text-slate-500"><span>Today</span><span>Kingston site</span></div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[["Workers on site", "18"], ["Pay due Friday", "J$412,600"], ["POs to receive", "3"], ["Invoices unpaid", "J$1.2M"]].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] text-slate-500">{k}</div><div className="text-base font-bold">{v}</div></div>
              ))}
            </div>
            <div className="mt-3 space-y-2 text-xs">
              {["Receipt sent to Marlon by WhatsApp", "Block delivery checked against PO 1042", "Client approved change order #7"].map((t) => (
                <div key={t} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-2"><FileCheck2 size={13} className="text-emerald-600 shrink-0" />{t}</div>
              ))}
            </div>
            <p className="mt-3 text-center text-[9px] text-slate-400">Example figures</p>
          </div>
        </div>
      </section>

      {/* What it does */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Everything a construction company runs on</h2>
        <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400">One system from the first estimate to the last payslip, instead of spreadsheets, receipt books and WhatsApp threads.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
              <Icon size={22} className="text-[#c8102e]" />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Who it's for */}
      <section className="bg-slate-100 dark:bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Who it&apos;s for</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WHO.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl bg-white p-5 dark:bg-white/[0.04]">
                <div className="inline-flex rounded-xl bg-[#1b2a6b]/10 p-2.5 dark:bg-white/10"><Icon size={20} className="text-[#1b2a6b] dark:text-white" /></div>
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">How it works</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-slate-200 p-5 dark:border-white/10">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#c8102e] text-sm font-bold text-white">{i + 1}</span>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-[#0f1838] text-white scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Pricing</h2>
          {!site.pricing.charging_on ? (
            <div className="mt-8 max-w-xl rounded-2xl bg-white/[0.06] p-6 ring-1 ring-white/10">
              <div className="text-3xl font-extrabold">Free during launch</div>
              <p className="mt-2 text-blue-100">Every feature, for every company, while we launch. You&apos;ll be told well before that changes, and nothing you add is lost.</p>
              <a href={signup} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#c8102e] px-5 py-3 text-sm font-semibold hover:bg-[#a50d26]">
                {site.signups_open ? "Start free" : "Ask for an invite"} <ArrowRight size={15} />
              </a>
            </div>
          ) : (
            <>
              <p className="mt-2 text-blue-100">Every plan starts with a {site.pricing.trial_days}-day free trial. Prices are per company, per month, in Jamaican dollars.</p>
              <div className="mt-8 grid gap-4 md:grid-cols-3">
                {plans.map((p, i) => (
                  <div key={p.key} className={`rounded-2xl p-6 ${i === 1 ? "bg-white text-slate-900" : "bg-white/[0.06] ring-1 ring-white/10"}`}>
                    <div className="text-sm font-semibold">{p.label}</div>
                    <div className="mt-2 text-3xl font-extrabold">{jmd(p.amount_jmd)}{p.amount_jmd != null && <span className="text-sm font-normal opacity-70"> / month</span>}</div>
                    {p.included_seats != null && <div className="mt-1 text-xs opacity-70">{p.included_seats} users included</div>}
                    {p.description && <p className="mt-3 text-sm opacity-80">{p.description}</p>}
                    {p.features.length > 0 && (
                      <ul className="mt-3 space-y-1 text-sm">{p.features.map((f) => <li key={f}>✓ {FEATURE_NAMES[f] ?? f}</li>)}</ul>
                    )}
                    <a href={p.amount_jmd == null ? "#demo" : signup} className={`mt-5 inline-flex w-full justify-center rounded-lg px-4 py-2.5 text-sm font-semibold ${i === 1 ? "bg-[#c8102e] text-white" : "bg-white text-slate-900"}`}>
                      {p.amount_jmd == null ? "Talk to us" : "Start free trial"}
                    </a>
                  </div>
                ))}
              </div>
              {site.pricing.prices.filter((p) => p.key.startsWith("extra.") && p.amount_jmd).map((p) => (
                <p key={p.key} className="mt-3 text-sm text-blue-100">{p.label}: {jmd(p.amount_jmd)} a month{p.description ? ` (${p.description})` : ""}</p>
              ))}
            </>
          )}
        </div>
      </section>

      {/* FAQ */}
      {faq.length > 0 && (
        <section id="faq" className="mx-auto max-w-3xl px-4 py-14 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Questions</h2>
          <div className="mt-6 divide-y divide-slate-200 dark:divide-white/10 border-y border-slate-200 dark:border-white/10">
            {faq.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}<span className="text-slate-400 transition group-open:rotate-45 text-xl leading-none">+</span>
                </summary>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* Demo + feedback */}
      <section id="demo" className="bg-slate-100 dark:bg-white/[0.02] scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20 grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Book a demo</h2>
            <p className="mt-2 text-slate-600 dark:text-slate-400">We&apos;ll show you Magnus with your own kind of jobs, on your phone or at your office.</p>
            {wa && (
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                <MessageCircle size={16} /> Or WhatsApp us now
              </a>
            )}
            <div className="mt-6"><DemoForm /></div>
          </div>
          <div id="feedback" className="scroll-mt-16">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Ideas & feedback</h2>
            <p className="mt-2 text-slate-600 dark:text-slate-400">Tell us what would make Magnus better for you, or what isn&apos;t working. Using Magnus or not.</p>
            <div className="mt-6"><FeedbackForm compact /></div>
          </div>
        </div>
      </section>

      {/* Closing */}
      <section className="mx-auto max-w-6xl px-4 py-14 text-center">
        <Smartphone size={28} className="mx-auto text-[#c8102e]" />
        <h2 className="mt-3 text-2xl font-bold">Your whole company, in your pocket</h2>
        <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
          <a href={signup} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#c8102e] px-6 py-3 text-sm font-semibold text-white hover:bg-[#a50d26]">
            {site.signups_open ? "Start free trial" : "Ask for an invite"} <ArrowRight size={15} />
          </a>
          <a href="/login" className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-6 py-3 text-sm font-semibold dark:border-white/20">
            <LogIn size={15} /> Sign in
          </a>
        </div>
      </section>
    </>
  );
}
