// src/pages/WorkerHomePage.tsx — /worker/home: what a worker sees after signing in (read-only, mobile first, large text). Everything comes from token-checked
// database functions that return only this worker's rows (lib/workerPortalApi.ts); the worker is not a Supabase Auth user.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForceLightPage } from "../hooks/useForceLightPage";
import {
  clearWorkerToken, fetchAdvances, fetchHome, fetchNotices, fetchPayments, fetchReceiptLink, fetchWorkerPhotoUrl, fmtDay, fmtJMD, getWorkerToken, paymentLabel,
  workerChangePin, workerLogout, type PortalAdvance, type PortalHome, type PortalNotice, type PortalPayment,
} from "../lib/workerPortalApi";
import { portalCardData, portalCardImages } from "../lib/workerPortalCard";
import { SCREEN_PPM, renderIdCardFace, renderQrCanvas, verifyUrl, type IdCardCompany, type IdCardData, type IdCardImages } from "../lib/idCardRender";
import { buildWhatsAppUrl } from "../lib/portalShare";
import { weakPinReason, isPinShape } from "../../supabase/functions/_shared/workerPortal";

type Tab = "home" | "payments" | "card" | "notices" | "me";
const NAVY = "#15315A";
const PAGE = 50;

// ── choosing a PIN (the first sign-in, and "Change PIN") ────────────────────────────────────────────────────────────────────────────────────────────────
function PinForm({ token, requireCurrent, onDone, onSessionEnded }: { token: string; requireCurrent: boolean; onDone: () => void; onSessionEnded: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);
  const field = "w-full min-h-[56px] rounded-xl border-2 border-slate-300 bg-white px-4 text-2xl tracking-[0.4em] text-slate-900 outline-none focus:border-blue-600";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (requireCurrent && !isPinShape(current)) { setErr("Enter your current 6-digit PIN."); return; }
    if (!isPinShape(next)) { setErr("Your new PIN must be exactly 6 digits."); return; }
    const weak = weakPinReason(next);
    if (weak) { setErr(weak); return; }
    if (next !== again) { setErr("The two new PINs are not the same."); return; }
    setBusy(true);
    const r = await workerChangePin(token, next, requireCurrent ? current : undefined);
    setBusy(false);
    if (!r.ok) { if (r.sessionEnded) { onSessionEnded(); return; } setErr(r.error || "Could not change the PIN."); return; }
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {requireCurrent && (
        <label className="block"><span className="block text-base font-semibold text-slate-700 mb-1.5">Current PIN</span>
          <input value={current} onChange={(e) => setCurrent(digits(e.target.value))} type="password" inputMode="numeric" maxLength={6} autoComplete="current-password" className={field} /></label>
      )}
      <label className="block"><span className="block text-base font-semibold text-slate-700 mb-1.5">New PIN (6 digits)</span>
        <input value={next} onChange={(e) => setNext(digits(e.target.value))} type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" className={field} /></label>
      <label className="block"><span className="block text-base font-semibold text-slate-700 mb-1.5">New PIN again</span>
        <input value={again} onChange={(e) => setAgain(digits(e.target.value))} type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" className={field} /></label>
      <p className="text-base text-slate-500">Not an easy one: not 123456, not the same digit, not a straight run or a repeated pattern.</p>
      {err && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700">{err}</div>}
      <button type="submit" disabled={busy} className="w-full min-h-[56px] rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white text-xl font-semibold">{busy ? "Saving…" : "Save my PIN"}</button>
    </form>
  );
}

// ── the QR alone, white, as large as the screen allows ──────────────────────────────────────────────────────────────────────────────────────────────────
function BigQr({ code, name, number, onClose }: { code: string; name: string; number: string; onClose: () => void }) {
  const src = useMemo(() => {
    const side = Math.max(240, Math.min(window.innerWidth, window.innerHeight) * 0.8);
    const c = renderQrCanvas(verifyUrl(code), Math.max(4, Math.floor(side / 37)));
    return { url: c.toDataURL("image/png"), px: c.width };
  }, [code]);
  return (
    <div onClick={onClose} role="dialog" aria-label="QR code" className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white p-4 text-center" style={{ cursor: "pointer" }}>
      <img src={src.url} alt={`QR code for ${name}`} style={{ width: src.px, maxWidth: "100%", height: "auto", imageRendering: "pixelated" }} />
      <div className="mt-4 text-2xl font-bold text-slate-900">{name}</div>
      <div className="text-xl font-mono text-slate-700">{number}</div>
      <div className="mt-4 text-lg text-slate-500">Tap anywhere to close</div>
    </div>
  );
}

export default function WorkerHomePage() {
  useForceLightPage();
  const nav = useNavigate();
  const token = useRef<string | null>(getWorkerToken());
  const [home, setHome] = useState<PortalHome | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [payments, setPayments] = useState<PortalPayment[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [advances, setAdvances] = useState<PortalAdvance[]>([]);
  const [notices, setNotices] = useState<PortalNotice[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [images, setImages] = useState<IdCardImages | null>(null);
  const [face, setFace] = useState<"front" | "back">("front");
  const [bigQr, setBigQr] = useState(false);
  const [receiptMsg, setReceiptMsg] = useState<string | null>(null);
  const [pinDone, setPinDone] = useState(false);

  const endSession = useCallback(() => { clearWorkerToken(); nav("/worker", { replace: true, state: { ended: true } }); }, [nav]);

  const load = useCallback(async () => {
    const t = token.current;
    if (!t) { nav("/worker", { replace: true }); return; }
    setLoading(true); setLoadErr(null);
    try {
      const h = await fetchHome(t);
      if (!h) { endSession(); return; }
      setHome(h);
      if (h.must_change_pin) return;
      const [p, a, n] = await Promise.all([fetchPayments(t, PAGE, 0), fetchAdvances(t), fetchNotices(t)]);
      setPayments(p); setHasMore(p.length === PAGE); setAdvances(a); setNotices(n);
      const photo = h.worker?.has_photo ? await fetchWorkerPhotoUrl(t) : null;
      setPhotoUrl(photo);
      setImages(await portalCardImages(h, photo));
    } catch (e) {
      setLoadErr(e instanceof Error && e.message ? e.message : "Could not load. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [nav, endSession]);

  useEffect(() => { void load(); }, [load]);

  async function more() {
    const t = token.current; if (!t) return;
    setLoadingMore(true);
    try {
      const p = await fetchPayments(t, PAGE, payments.length);
      setPayments((cur) => [...cur, ...p]); setHasMore(p.length === PAGE);
    } catch { /* the button stays */ } finally { setLoadingMore(false); }
  }

  async function openReceipt(id: string) {
    const t = token.current; if (!t) return;
    setReceiptMsg(null);
    try {
      const r = await fetchReceiptLink(t, id);
      if (r) window.location.assign(`/receipt/${r}`); else setReceiptMsg("This receipt is not available. Ask the office.");
    } catch { setReceiptMsg("Could not open the receipt. Please try again."); }
  }

  async function logOut() {
    const t = token.current;
    if (t) await workerLogout(t);
    clearWorkerToken();
    nav("/worker", { replace: true });
  }

  const card = useMemo(() => (home && !home.must_change_pin ? portalCardData(home) : null), [home]);
  const cardSrc = useMemo(() => {
    if (!card || !images) return null;
    try { return renderIdCardFace(face, card.data as IdCardData, card.company as IdCardCompany, images, { ppm: SCREEN_PPM * 1.6, bleedMm: 0 }).canvas.toDataURL("image/png"); } catch { return null; }
  }, [card, images, face]);

  const primary = home?.company?.id_card_primary || NAVY;
  const accent = home?.company?.id_card_accent || "#C9A84C";

  // ── before anything: loading, the first-PIN screen, errors ─────────────────────────────────────────────────────────────────────────────────────────
  if (loading && !home) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600 text-xl">Loading…</div>;
  if (loadErr && !home) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50"><div className="max-w-md w-full rounded-2xl bg-white border border-slate-200 p-6 text-center">
        <p className="text-lg text-slate-700">{loadErr}</p>
        <button onClick={() => void load()} className="mt-4 w-full min-h-[56px] rounded-xl bg-blue-700 text-white text-xl font-semibold">Try again</button>
        <button onClick={endSession} className="mt-3 w-full min-h-[48px] text-lg text-slate-600 underline">Sign in again</button>
      </div></div>
    );
  }
  if (home?.must_change_pin && !pinDone) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 to-blue-50"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Choose your own PIN</h1>
        <p className="mt-2 text-lg text-slate-600">Hello {home.first_name || ""}. The PIN the office gave you was only for the first sign-in. Choose a PIN that only you know.</p>
        <div className="mt-5"><PinForm token={token.current!} requireCurrent={false} onSessionEnded={endSession} onDone={() => { setPinDone(true); void load(); }} /></div>
      </div></div>
    );
  }
  if (!home || !home.worker) return null;

  const w = home.worker;
  const name = `${w.first_name} ${w.last_name}`.trim();
  const co = home.company;
  const officePhone = co?.phone || null;
  const stats = home.totals;
  const Tile = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-base text-slate-500">{label}</div><div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>{sub && <div className="text-base text-slate-500">{sub}</div>}</div>
  );
  const PaymentRow = ({ p }: { p: PortalPayment }) => (
    <button onClick={() => void openReceipt(p.id)} className="w-full text-left rounded-2xl border border-slate-200 bg-white p-4 min-h-[72px] active:bg-slate-50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-semibold text-slate-900">{paymentLabel(p.payment_type)}{p.receipt_number ? <span className="ml-2 text-base font-normal text-slate-500">{p.receipt_number}</span> : null}</div>
          <div className="text-base text-slate-600">{fmtDay(p.work_date)}{p.project ? ` · ${p.project}` : ""}</div>
          {p.description && <div className="text-base text-slate-500 truncate">{p.description}</div>}
        </div>
        <div className="text-right shrink-0"><div className="text-xl font-bold text-slate-900">{fmtJMD(p.amount)}</div><div className="text-base text-blue-700">Receipt ›</div></div>
      </div>
    </button>
  );

  const tabs: Array<[Tab, string]> = [["home", "Home"], ["payments", "Payments"], ["card", "My ID"], ["notices", "Notices"], ["me", "Me"]];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-28">
      <header className="px-4 py-4 text-white" style={{ background: primary }}>
        <div className="mx-auto max-w-md flex items-center gap-3">
          {co?.logo_url ? <span className="shrink-0 rounded-lg bg-white p-1.5"><img src={co.logo_url} alt={co.name || "Company"} style={{ display: "block", width: "auto", height: "auto", maxHeight: 40, maxWidth: 110 }} /></span> : null}
          <div className="min-w-0"><div className="text-lg font-bold truncate">{co?.name || "Worker portal"}</div><div className="text-base opacity-90 truncate">{name} · <span className="font-mono">{w.employee_id}</span></div></div>
        </div>
        <div className="mx-auto max-w-md mt-3 h-1 rounded" style={{ background: accent }} />
      </header>

      <main className="mx-auto max-w-md px-4 py-5 space-y-4">
        {loadErr && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700">{loadErr}</div>}
        {receiptMsg && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-900">{receiptMsg}</div>}

        {tab === "home" && (<>
          <h1 className="text-2xl font-bold text-slate-900">Hello {w.first_name}</h1>
          <div className="grid grid-cols-2 gap-3">
            <Tile label="Paid this month" value={fmtJMD(stats?.month)} sub={`${stats?.month_count ?? 0} payment${stats?.month_count === 1 ? "" : "s"}`} />
            <Tile label="Paid this year" value={fmtJMD(stats?.year)} sub={`${stats?.year_count ?? 0} payment${stats?.year_count === 1 ? "" : "s"}`} />
          </div>
          <p className="text-base text-slate-500">Totals include advances.</p>

          <h2 className="pt-2 text-xl font-bold text-slate-900">Advances</h2>
          {advances.length === 0 ? <p className="text-lg text-slate-600">You have no advances.</p> : advances.map((a) => (
            <div key={a.project} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-lg font-semibold text-slate-900">{a.project}</div>
              <div className="mt-1 flex justify-between text-base text-slate-600"><span>Advances paid</span><span>{fmtJMD(a.advances_paid)}</span></div>
              {Number(a.deducted) > 0 && <div className="flex justify-between text-base text-slate-600"><span>Already taken off a final payment</span><span>{fmtJMD(a.deducted)}</span></div>}
              <div className="mt-1 flex justify-between text-xl font-bold" style={{ color: Number(a.balance) > 0 ? "#B45309" : "#15803D" }}><span>Still to be taken off</span><span>{fmtJMD(a.balance)}</span></div>
            </div>
          ))}

          <h2 className="pt-2 text-xl font-bold text-slate-900">Latest payments</h2>
          {payments.length === 0 ? <p className="text-lg text-slate-600">No payments yet.</p> : payments.slice(0, 3).map((p) => <PaymentRow key={p.id} p={p} />)}
          {payments.length > 3 && <button onClick={() => setTab("payments")} className="w-full min-h-[56px] rounded-xl border-2 border-blue-700 text-blue-700 text-xl font-semibold">See all payments</button>}
        </>)}

        {tab === "payments" && (<>
          <h1 className="text-2xl font-bold text-slate-900">My payments</h1>
          {payments.length === 0 ? <p className="text-lg text-slate-600">No payments yet.</p> : payments.map((p) => <PaymentRow key={p.id} p={p} />)}
          {hasMore && <button onClick={() => void more()} disabled={loadingMore} className="w-full min-h-[56px] rounded-xl border-2 border-blue-700 text-blue-700 text-xl font-semibold disabled:opacity-60">{loadingMore ? "Loading…" : "Show more"}</button>}
          <p className="text-base text-slate-500">Tap a payment to see its receipt.</p>
        </>)}

        {tab === "card" && (<>
          <h1 className="text-2xl font-bold text-slate-900">My ID card</h1>
          {cardSrc ? <img src={cardSrc} alt={`ID card of ${name}, ${face}`} className="mx-auto w-full max-w-[320px] rounded-2xl shadow-lg" /> : <p className="text-lg text-slate-600">{card ? "Preparing your card…" : "Your ID card is not ready. Ask the office."}</p>}
          {card && (<div className="space-y-3">
            <button onClick={() => setBigQr(true)} className="w-full min-h-[56px] rounded-xl bg-blue-700 text-white text-xl font-semibold">Show my QR code</button>
            <button onClick={() => setFace((f) => (f === "front" ? "back" : "front"))} className="w-full min-h-[56px] rounded-xl border-2 border-slate-300 text-slate-700 text-xl font-semibold">{face === "front" ? "Show the back" : "Show the front"}</button>
          </div>)}
        </>)}

        {tab === "notices" && (<>
          <h1 className="text-2xl font-bold text-slate-900">Notices</h1>
          {notices.length === 0 ? <p className="text-lg text-slate-600">No notices.</p> : notices.map((n) => (
            <article key={n.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2"><h2 className="text-lg font-bold text-slate-900">{n.title}</h2>{n.pinned && <span className="text-base text-amber-700">Pinned</span>}</div>
              <p className="mt-1 whitespace-pre-wrap text-lg text-slate-700">{n.body}</p>
              <div className="mt-2 text-base text-slate-500">{fmtDay(n.created_at)}</div>
            </article>
          ))}
        </>)}

        {tab === "me" && (<>
          <h1 className="text-2xl font-bold text-slate-900">My details</h1>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-4">
            {photoUrl ? <img src={photoUrl} alt={name} className="h-20 w-20 rounded-full object-cover" /> : <div className="h-20 w-20 rounded-full bg-slate-200 text-slate-600 text-2xl font-bold flex items-center justify-center">{(w.first_name[0] || "") + (w.last_name[0] || "")}</div>}
            <div className="min-w-0"><div className="text-xl font-bold text-slate-900">{name}</div><div className="text-lg font-mono text-slate-700">{w.employee_id}</div></div>
          </div>
          <dl className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {([["Trade / role", w.job_title || (w.worker_type ? w.worker_type.replace("_", " ") : "")], ["Phone", w.phone || ""]] as Array<[string, string]>).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 p-4 text-lg"><dt className="text-slate-500">{k}</dt><dd className="font-semibold text-slate-900 text-right">{v || "—"}</dd></div>
            ))}
          </dl>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-xl font-bold text-slate-900">Something wrong?</h2>
            <p className="mt-1 text-lg text-slate-600">Tell the office{officePhone ? ":" : ". Ask your supervisor for the office number."}</p>
            {officePhone && (<div className="mt-3 space-y-3">
              <a href={`tel:${officePhone.replace(/[^\d+]/g, "")}`} className="flex min-h-[56px] items-center justify-center rounded-xl border-2 border-slate-300 text-slate-800 text-xl font-semibold">Call {officePhone}</a>
              <a href={buildWhatsAppUrl(officePhone, `Hello, this is ${name}, worker ${w.employee_id}. `)} target="_blank" rel="noopener noreferrer" className="flex min-h-[56px] items-center justify-center rounded-xl bg-green-600 text-white text-xl font-semibold">WhatsApp the office</a>
            </div>)}
          </div>

          <PinSection token={token.current!} onSessionEnded={endSession} />
          <button onClick={() => void logOut()} className="w-full min-h-[56px] rounded-xl border-2 border-red-300 text-red-700 text-xl font-semibold">Log out</button>
        </>)}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 bg-white" aria-label="Portal sections">
        <div className="mx-auto max-w-md grid grid-cols-5">
          {tabs.map(([id, label]) => (
            <button key={id} onClick={() => { setTab(id); setReceiptMsg(null); window.scrollTo(0, 0); }} aria-current={tab === id ? "page" : undefined}
              className="min-h-[64px] px-1 text-base font-semibold" style={{ color: tab === id ? primary : "#64748b", borderTop: tab === id ? `3px solid ${accent}` : "3px solid transparent" }}>{label}</button>
          ))}
        </div>
      </nav>

      {bigQr && card && <BigQr code={card.data.verifyCode} name={card.data.name} number={w.employee_id} onClose={() => setBigQr(false)} />}
    </div>
  );
}

function PinSection({ token, onSessionEnded }: { token: string; onSessionEnded: () => void }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-xl font-bold text-slate-900">Change my PIN</h2>
      {saved && <div role="status" className="mt-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-lg text-green-800">Your PIN was changed.</div>}
      {!open ? <button onClick={() => { setOpen(true); setSaved(false); }} className="mt-3 w-full min-h-[56px] rounded-xl border-2 border-slate-300 text-slate-800 text-xl font-semibold">Change PIN</button>
        : <div className="mt-3"><PinForm token={token} requireCurrent onSessionEnded={onSessionEnded} onDone={() => { setOpen(false); setSaved(true); }} /></div>}
    </div>
  );
}
