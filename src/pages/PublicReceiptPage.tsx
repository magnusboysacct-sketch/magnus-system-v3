import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer, FileDown } from "lucide-react";
import { useForceLightPage } from "../hooks/useForceLightPage";
import { showPrintPreview } from "../lib/printPreview";
import { getPublicReceipt, RECEIPT_LINK_INVALID } from "../lib/receiptLinks";
import { buildPublicReceiptDocument, buildPublicReceiptHtml, type PublicReceipt } from "../lib/receiptHtml";

// Public page: opened from a receipt link, no login. get_public_receipt returns only what the printed receipt shows (the person's name, never an ID
// number, phone or signature). An unknown or revoked link shows the same message as any bad link.

type Result = { kind: "invalid" } | { kind: "error" } | { kind: "ok"; receipt: PublicReceipt };
type LoadState = { kind: "loading" } | Result;

export default function PublicReceiptPage() {
  useForceLightPage();
  const { token } = useParams<{ token: string }>();
  const [attempt, setAttempt] = useState(0);
  const key = `${token}:${attempt}`;
  const [loaded, setLoaded] = useState<{ key: string; result: Result } | null>(null);
  // Loading until the result for the current token / attempt has arrived.
  const state: LoadState = loaded && loaded.key === key ? loaded.result : { kind: "loading" };

  // Keep receipts out of search engines.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let result: Result;
      try {
        const receipt = token ? await getPublicReceipt(token) : null;
        result = receipt ? { kind: "ok", receipt } : { kind: "invalid" };
      } catch {
        result = { kind: "error" };
      }
      if (!cancelled) setLoaded({ key, result });
    })();
    return () => { cancelled = true; };
  }, [token, key]);

  const receipt = state.kind === "ok" ? state.receipt : null;
  const html = useMemo(() => (receipt ? buildPublicReceiptHtml(receipt) : ""), [receipt]);
  const title = receipt ? `Receipt ${receipt.receipt_number || ""}`.trim() : "Receipt";

  useEffect(() => {
    const prev = document.title;
    document.title = receipt ? `${title} – ${receipt.company.name}` : "Payment receipt";
    return () => { document.title = prev; };
  }, [receipt, title]);

  // Print and Save as PDF both go through the in-app print preview (its Print button opens the browser's print dialog, which also saves as PDF).
  const openPreview = () => { if (receipt) showPrintPreview(buildPublicReceiptDocument(receipt), { title }); };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 px-4 py-6">
      <div className="mx-auto max-w-[640px]">
        {state.kind === "loading" && <p className="py-20 text-center text-sm text-slate-500">Loading receipt…</p>}

        {state.kind === "invalid" && (
          <div className="py-20 text-center">
            <p className="text-base font-semibold text-slate-800">{RECEIPT_LINK_INVALID}</p>
            <p className="mt-2 text-sm text-slate-500">Please ask the sender for a new link.</p>
          </div>
        )}

        {state.kind === "error" && (
          <div className="py-20 text-center">
            <p className="text-base font-semibold text-slate-800">We couldn't load this receipt.</p>
            <p className="mt-2 text-sm text-slate-500">Please check your connection and try again.</p>
            <button onClick={() => setAttempt((n) => n + 1)} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Try again</button>
          </div>
        )}

        {receipt && (
          <>
            <div className="mb-4 flex justify-end gap-2 print:hidden">
              <button onClick={openPreview} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm">
                <Printer size={16} /> Print
              </button>
              <button onClick={openPreview} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm">
                <FileDown size={16} /> Save as PDF
              </button>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" dangerouslySetInnerHTML={{ __html: html }} />
          </>
        )}
      </div>
    </div>
  );
}
