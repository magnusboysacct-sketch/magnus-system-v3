// src/components/IdCardColors.tsx — Settings → Company → "ID card colours": presets, "Suggest from my logo", custom pickers, live preview of the front and back,
// Save and Reset to default. Saved to company_settings.id_card_primary / id_card_accent (only a director or admin may write them; the database enforces it).
// Whatever is chosen, text on the card is automatically white or near-black for a readable contrast (idCardTheme.ts) and the QR stays dark on white.
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Card, CardHeader, Btn, Alert } from "./ui";
import { Palette, Wand2, RotateCcw, Save } from "lucide-react";
import { DEFAULT_THEME, THEME_PRESETS, contrast, isHex, isDefaultTheme, normalizeTheme, readableOn, resolvePalette, type IdCardTheme } from "../lib/idCardTheme";
import { extractDominantColors, logoPixels, suggestThemes } from "../lib/logoColors";
import { renderIdCardFace, type IdCardData } from "../lib/idCardRender";
import { invalidateCompanyCache, loadCompanyTheme, loadImage } from "../lib/idCardData";

interface Props { companyId: string | null; companyName: string; tagline?: string; logoUrl: string | null }

const SAMPLE: IdCardData = {
  kind: "staff", id: "sample", name: "Jane Sample", title: "Site Supervisor", initials: "JS", verifyCode: "0123456789ab", cardTitle: "STAFF IDENTIFICATION CARD",
  detail: { label: "Employee No", value: "EMP-001" }, bearer: [], issuedLabel: "Jan 2026", expiresLabel: "Jan 2028", expired: false, expiryColor: "#4ade80",
  statement: "This card certifies the bearer is an authorized staff member of the company. This card remains company property and must be surrendered upon termination.",
};

function cardUrl(face: "front" | "back", theme: IdCardTheme, name: string, tagline: string, logo: HTMLImageElement | null, ppm: number) {
  const r = renderIdCardFace(face, SAMPLE, { name, tagline, contactLines: ["Address line", "Parish, Country", "Tel: 000-000-0000"], theme }, { logo }, { ppm, bleedMm: 0 });
  return r.canvas.toDataURL("image/png");
}

function MiniCard({ theme, name, tagline, logo, width = 84 }: { theme: IdCardTheme; name: string; tagline: string; logo: HTMLImageElement | null; width?: number }) {
  const src = useMemo(() => cardUrl("front", theme, name, tagline, logo, 3), [theme, name, tagline, logo]);
  return <img src={src} alt="" style={{ width, height: "auto", display: "block", borderRadius: 3, boxShadow: "0 1px 4px rgba(0,0,0,0.35)" }} />;
}

const same = (a: IdCardTheme, b: IdCardTheme) => a.primary.toUpperCase() === b.primary.toUpperCase() && a.accent.toUpperCase() === b.accent.toUpperCase();

// Module level on purpose: a component defined inside another loses focus on every keystroke.
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [typed, setTyped] = useState<string | null>(null);     // what is being typed, until the box loses focus
  const text = typed ?? value;
  return (
    <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
      <span className="w-16">{label}</span>
      <input type="color" value={value} onChange={(e) => { setTyped(null); onChange(e.target.value.toUpperCase()); }} aria-label={label + " colour"} className="w-10 h-8 p-0 border border-slate-300 dark:border-white/[0.15] rounded cursor-pointer bg-transparent" />
      <input type="text" value={text} maxLength={7} spellCheck={false}
        onChange={(e) => { setTyped(e.target.value); if (isHex(e.target.value)) onChange(e.target.value.toUpperCase()); }}
          onBlur={() => setTyped(null)}
        aria-label={label + " hex code"}
        className={"w-24 px-2 py-1.5 rounded-lg border text-xs font-mono bg-white dark:bg-white/[0.04] " + (isHex(text) ? "border-slate-300 dark:border-white/[0.12]" : "border-red-400")} />
    </label>
  );
}


export default function IdCardColors({ companyId, companyName, tagline, logoUrl }: Props) {
  const name = companyName.trim() || "Your Company";
  const tag = tagline?.trim() || "Building With Integrity";
  const [saved, setSaved] = useState<IdCardTheme>({ ...DEFAULT_THEME });
  const [draft, setDraft] = useState<IdCardTheme>({ ...DEFAULT_THEME });
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [suggestions, setSuggestions] = useState<IdCardTheme[] | null>(null);
  const [suggestMsg, setSuggestMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    if (!companyId) return;
    loadCompanyTheme(companyId).then((t) => { if (alive) { setSaved(t); setDraft(t); } });
    return () => { alive = false; };
  }, [companyId]);

  useEffect(() => {
    let alive = true;
    setLogo(null); setSuggestions(null); setSuggestMsg("");
    if (logoUrl) loadImage(logoUrl).then((i) => { if (alive) setLogo(i); }).catch(() => undefined);
    return () => { alive = false; };
  }, [logoUrl]);

  const palette = useMemo(() => resolvePalette(draft), [draft]);
  const previews = useMemo(() => ({
    front: cardUrl("front", draft, name, tag, logo, 4), back: cardUrl("back", draft, name, tag, logo, 4),
  }), [draft, name, tag, logo]);
  const dirty = !same(draft, saved);
  const accentAdjusted = palette.accent.toUpperCase() !== draft.accent.toUpperCase();

  function suggest() {
    setSuggestMsg("");
    if (!logo) { setSuggestions([]); setSuggestMsg(logoUrl ? "The logo could not be read. Pick colours yourself below." : "Upload a logo first (Company Logo, above), then try again."); return; }
    const px = logoPixels(logo);
    if (!px) { setSuggestions([]); setSuggestMsg("The logo could not be read by the browser. Pick colours yourself below."); return; }
    const found = suggestThemes(extractDominantColors(px));
    setSuggestions(found);
    if (!found.length) setSuggestMsg("This logo has no colour to pick from (it is white, transparent or very pale). Pick colours yourself below.");
  }

  async function write(primary: string | null, accent: string | null, done: string) {
    if (!companyId) return;
    setBusy(true); setMsg(null);
    try {
      const { data, error } = await supabase.from("company_settings")
        .update({ id_card_primary: primary, id_card_accent: accent }).eq("company_id", companyId).select("company_id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("director or admin");          // row security hides the row from anyone else (or there is no settings row yet)
      invalidateCompanyCache();
      const next = normalizeTheme({ primary, accent });
      setSaved(next); setDraft(next);
      setMsg({ type: "success", text: done });
    } catch (e) {
      const m = e instanceof Error ? e.message : (e as { message?: string })?.message || "please try again.";
      setMsg({ type: "error", text: /director or admin/i.test(m) ? "The colours were not saved. Only a director or admin can change the ID card colours, and the company details must be saved first." : "Could not save: " + m });
    } finally {
      setBusy(false);
    }
  }
  const save = () => write(isDefaultTheme(draft) ? null : draft.primary.toUpperCase(), isDefaultTheme(draft) ? null : draft.accent.toUpperCase(), "ID card colours saved. New cards and downloads use them.");
  const reset = () => write(null, null, "ID card colours reset to Navy & Gold.");

  return (
    <Card>
      <CardHeader title="ID card colours" subtitle="The colours of your staff and worker ID cards: on screen, in print and in every download." />

      <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1.5"><Palette size={12} /> Presets</div>
      <div className="flex flex-wrap gap-3 mb-5">
        {THEME_PRESETS.map((p) => {
          const active = same(draft, p.theme);
          return (
            <button key={p.id} type="button" onClick={() => setDraft({ ...p.theme })} aria-pressed={active} aria-label={p.name}
              className={"flex flex-col items-center gap-1.5 p-2 rounded-xl border transition " + (active ? "border-cyan-500 bg-cyan-500/10" : "border-slate-200 dark:border-white/[0.08] hover:border-slate-400")}>
              <MiniCard theme={p.theme} name={name} tagline={tag} logo={logo} width={64} />
              <span className="text-[10px] text-slate-600 dark:text-slate-300 w-20 text-center leading-tight">{p.name}{p.id === "navy-gold" ? " (default)" : ""}</span>
            </button>
          );
        })}
      </div>

      <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1.5"><Wand2 size={12} /> From your logo</div>
      <div className="mb-5">
        <Btn onClick={suggest} disabled={!logoUrl} icon={<Wand2 size={13} />}>Suggest from my logo</Btn>
        {suggestMsg && <div className="text-xs text-slate-500 mt-2">{suggestMsg}</div>}
        {suggestions && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-3 mt-3">
            {suggestions.map((t, i) => (
              <button key={i} type="button" onClick={() => setDraft({ ...t })} aria-label={`Use suggestion ${i + 1}`}
                className={"flex flex-col items-center gap-1.5 p-2 rounded-xl border transition " + (same(draft, t) ? "border-cyan-500 bg-cyan-500/10" : "border-slate-200 dark:border-white/[0.08] hover:border-slate-400")}>
                <MiniCard theme={t} name={name} tagline={tag} logo={logo} width={72} />
                <span className="text-[10px] text-slate-600 dark:text-slate-300">Suggestion {i + 1}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-2">Custom colours</div>
      <div className="flex flex-wrap gap-x-8 gap-y-3 mb-2">
        <ColorField label="Primary" value={draft.primary} onChange={(v) => setDraft((d) => ({ ...d, primary: v }))} />
        <ColorField label="Accent" value={draft.accent} onChange={(v) => setDraft((d) => ({ ...d, accent: v }))} />
      </div>
      <div className="text-[11px] text-slate-500 mb-5">
        Text on the card will be {readableOn(draft.primary) === "#FFFFFF" ? "white" : "near-black"} (contrast {contrast(readableOn(draft.primary), draft.primary).toFixed(1)}:1).
        {accentAdjusted && " The accent was too close to the primary colour to read, so the card uses a lighter or darker shade of it."}
        {" "}The QR code is always dark on a white square, so it scans whatever you choose.
      </div>

      <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-2">Preview</div>
      <div className="flex flex-wrap gap-5 mb-5">
        <figure className="m-0"><img src={previews.front} alt="Card front preview" style={{ width: 216, maxWidth: "100%", height: "auto", display: "block", boxShadow: "0 4px 16px rgba(0,0,0,0.35)" }} /><figcaption className="text-[10px] text-slate-500 mt-1">Front</figcaption></figure>
        <figure className="m-0"><img src={previews.back} alt="Card back preview" style={{ width: 216, maxWidth: "100%", height: "auto", display: "block", boxShadow: "0 4px 16px rgba(0,0,0,0.35)" }} /><figcaption className="text-[10px] text-slate-500 mt-1">Back</figcaption></figure>
      </div>

      {msg && <Alert type={msg.type === "success" ? "success" : "error"} className="mb-3">{msg.text}</Alert>}
      <div className="flex items-center gap-3 flex-wrap">
        <Btn variant="primary" onClick={save} disabled={busy || !dirty} icon={<Save size={13} />}>{busy ? "Saving…" : "Save colours"}</Btn>
        <Btn onClick={reset} disabled={busy || isDefaultTheme(saved)} icon={<RotateCcw size={13} />}>Reset to default</Btn>
        {dirty && <span className="text-[11px] text-amber-500">Not saved yet</span>}
      </div>
    </Card>
  );
}
