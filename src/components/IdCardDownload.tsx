// src/components/IdCardDownload.tsx — "Download for printing": the four files (card PDF, print sheet PDF, PNG zip, print instructions) and the
// built-in "How to get these printed" guide. IdCardBatchDownload loads several people first (Workers page / staff list) and then opens the same dialog.
import React, { useEffect, useMemo, useState } from "react";
import { Download, FileText, Copy, Check, MessageCircle, X, Printer, Image as ImageIcon, ListChecks } from "lucide-react";
import { loadCards, type CardRef, type LoadedCard } from "../lib/idCardData";
import {
  buildCardPdf, buildInstructionsPdf, buildPngZip, buildSheetPdf, cardPdfName, pngZipName, sheetPdfName, type Paper,
} from "../lib/idCardExport";
import { BEFORE_YOU_GO, CARD_SPEC_LINES, GLOSSARY, WHEN_YOU_PICK_UP, WHICH_FILE, shopMessage } from "../lib/idCardGuide";
import { saveBlob } from "../lib/sharedPhotoZip";
import { copyToClipboard } from "../lib/receiptLinks";
import { buildWhatsAppUrl } from "../lib/portalShare";

type FileKey = "card" | "sheet" | "png" | "instructions";

export function IdCardDownloadDialog({ cards, onClose }: { cards: LoadedCard[]; onClose: () => void }) {
  const [paper, setPaper] = useState<Paper>("a4");
  const [busy, setBusy] = useState<FileKey | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const company = cards[0].company;
  const logo = cards[0].images.logo;
  const message = useMemo(() => shopMessage(company.name, cards.map((c) => c.data.kind)), [cards, company.name]);
  const n = cards.length;

  async function run(key: FileKey) {
    if (busy) return;
    setBusy(key); setProgress(0); setError("");
    try {
      if (key === "card") saveBlob(await buildCardPdf(cards, company, setProgress), cardPdfName(cards, company));
      else if (key === "sheet") saveBlob(await buildSheetPdf(cards, company, paper, setProgress), sheetPdfName(cards, company, paper));
      else if (key === "png") saveBlob(await buildPngZip(cards, company, setProgress), pngZipName(cards, company));
      else saveBlob(await buildInstructionsPdf(cards, company, logo), "PRINT INSTRUCTIONS.pdf");
    } catch (e) {
      console.error("ID card download failed:", e);
      setError("Could not make the file: " + (e instanceof Error && e.message ? e.message : "please try again."));
    } finally {
      setBusy(null);
    }
  }

  async function copyMessage() {
    if (await copyToClipboard(message)) { setCopied(true); setTimeout(() => setCopied(false), 2500); }
    else setError("Could not copy. Select the message and copy it by hand.");
  }

  const Option = ({ k, icon, title, text, extra }: { k: FileKey; icon: React.ReactNode; title: string; text: string; extra?: React.ReactNode }) => (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-blue-700 dark:text-blue-300">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-800 dark:text-white">{title}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{text}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {extra}
        <button onClick={() => run(k)} disabled={!!busy}
          className="ml-auto bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-2">
          <Download size={15} />
          {busy === k ? (k === "instructions" ? "Making…" : `Making… ${Math.round(progress * 100)}%`) : "Download"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[55] p-4 overflow-y-auto" role="dialog" aria-label="Download for printing">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-5 w-full max-w-2xl my-8">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white">Download for printing</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          {n === 1 ? `${cards[0].data.name}'s ID card` : `${n} ID cards`} · CR80 54 × 85.6 mm · 600 dpi · 3 mm bleed
        </p>

        <div className="grid gap-3">
          <Option k="card" icon={<Printer size={18} />} title="Card PDF — for a shop with a PVC card printer"
            text={`${n * 2} pages (front, back${n > 1 ? " for each person, in order" : ""}), each 60 × 91.6 mm: the 54 × 85.6 mm card plus 3 mm bleed on every side.`} />
          <Option k="sheet" icon={<FileText size={18} />} title="Print sheet PDF — paper or card stock, then laminate"
            text="Cards at true size with crop marks. Fronts on page 1, the matching backs on page 2 (mirrored, so a double-sided print lines up)."
            extra={
              <label className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-2">Paper
                <select value={paper} onChange={(e) => setPaper(e.target.value as Paper)} disabled={!!busy}
                  className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100">
                  <option value="a4">A4 (3 × 3 cards per page)</option>
                  <option value="letter">Letter (3 × 2 cards per page)</option>
                </select>
              </label>} />
          <Option k="png" icon={<ImageIcon size={18} />} title="PNG images (zip) — only if the shop asks for pictures"
            text="Front and back of everyone as 600 dpi pictures with bleed, plus PRINT INSTRUCTIONS.pdf." />
          <Option k="instructions" icon={<ListChecks size={18} />} title="Print instructions (1 page PDF)"
            text="Card size, number of cards and the list of names. Hand it to the shop with the files." />
        </div>
        {error && <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div>}

        <div className="mt-5 border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-2">How to get these printed</h3>

          <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">Which file to take</div>
          <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1 mb-3 list-disc pl-5">
            {WHICH_FILE.map(([name, text]) => <li key={name}><b>{name}</b> — {text}</li>)}
          </ul>

          <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">Message for the print shop</div>
          <textarea readOnly value={message} rows={5} onFocus={(e) => e.currentTarget.select()}
            className="w-full text-xs border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100" />
          <div className="flex gap-2 mt-2 flex-wrap">
            <button onClick={copyMessage} className="px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-lg flex items-center gap-2 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800">
              {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy message"}
            </button>
            <a href={buildWhatsAppUrl("", message)} target="_blank" rel="noopener noreferrer"
              className="px-3 py-2 text-sm font-medium rounded-lg flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white">
              <MessageCircle size={15} />Share on WhatsApp
            </a>
          </div>

          <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 mt-4 mb-1">Before you go</div>
          <ol className="text-xs text-gray-600 dark:text-gray-300 space-y-1 list-decimal pl-5">{BEFORE_YOU_GO.map((t) => <li key={t}>{t}</li>)}</ol>

          <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 mt-4 mb-1">When you pick them up</div>
          <ol className="text-xs text-gray-600 dark:text-gray-300 space-y-1 list-decimal pl-5">{WHEN_YOU_PICK_UP.map((t) => <li key={t}>{t}</li>)}</ol>

          <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 mt-4 mb-1">What the card needs</div>
          <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1 list-disc pl-5">{CARD_SPEC_LINES.map((t) => <li key={t}>{t}</li>)}</ul>

          <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 mt-4 mb-1">Words you may hear</div>
          <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1 list-disc pl-5">{GLOSSARY.map(([w, d]) => <li key={w}><b>{w}</b> = {d}</li>)}</ul>
        </div>

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Close</button>
        </div>
      </div>
    </div>
  );
}

// Several people (Workers page / staff list): load them, then the same dialog. Cards come out in the order of `refs`.
export function IdCardBatchDownload({ refs, onClose }: { refs: CardRef[]; onClose: () => void }) {
  const [cards, setCards] = useState<LoadedCard[] | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [done, setDone] = useState(0);

  useEffect(() => {
    let alive = true;
    loadCards(refs, (d) => alive && setDone(d)).then((r) => { if (alive) { setCards(r.cards); setFailed(r.failed); } });
    return () => { alive = false; };
  }, [refs]);

  if (!cards) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[55]">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 text-center text-sm text-gray-500">Getting {refs.length} ID card{refs.length === 1 ? "" : "s"} ready… {done}/{refs.length}</div>
      </div>
    );
  }
  if (cards.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[55] p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 text-center max-w-sm">
          <div className="text-sm text-gray-700 dark:text-gray-200 mb-4">Could not load any of the selected ID cards.</div>
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm">Close</button>
        </div>
      </div>
    );
  }
  return (
    <>
      {failed.length > 0 && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] bg-amber-100 text-amber-900 text-xs px-3 py-2 rounded-lg shadow">
          {failed.length} card{failed.length === 1 ? "" : "s"} could not be loaded and {failed.length === 1 ? "is" : "are"} left out.
        </div>
      )}
      <IdCardDownloadDialog cards={cards} onClose={onClose} />
    </>
  );
}
