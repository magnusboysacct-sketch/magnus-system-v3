// src/pages/hq/HQManualTab.tsx — the HQ Manual (docs/HQ_MANUAL.md), shown inside HQ only so it never hints to
// ordinary users that HQ exists. Same look and read-aloud player as the Help Center.
import { useMemo, useState } from "react";
import { Card } from "../../components/ui";
import { cn } from "../../lib/theme";
import { renderMarkdown, SpeechPlayer } from "../../components/help/HelpMarkdown";
import HQ_MANUAL from "../../../docs/HQ_MANUAL.md?raw";

type Section = { title: string; body: string };

/** Splits the manual at its "## " headings so each part can be opened (and read aloud) on its own. */
function sections(md: string): { intro: string; parts: Section[] } {
  const chunks = md.split(/\n(?=## )/);
  const intro = chunks.shift() ?? "";
  return { intro, parts: chunks.map((c) => ({ title: c.split("\n")[0].replace(/^##\s+/, ""), body: c })) };
}

export default function HQManualTab() {
  const { intro, parts } = useMemo(() => sections(HQ_MANUAL), []);
  const [open, setOpen] = useState(0);
  const part = parts[open];

  return (
    <div className="space-y-4 max-w-4xl">
      <Card>{renderMarkdown(intro)}</Card>
      <div className="flex flex-wrap gap-2">
        {parts.map((p, i) => (
          <button key={p.title} type="button" onClick={() => setOpen(i)}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
              i === open ? "bg-cyan-600 text-white border-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-200 dark:border-cyan-500/30"
                : "border-slate-300 dark:border-white/[0.08] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.06]")}>
            {p.title}
          </button>
        ))}
      </div>
      {part && (
        <Card>
          <SpeechPlayer key={part.title} text={part.body} />
          <div className="mt-4">{renderMarkdown(part.body)}</div>
        </Card>
      )}
    </div>
  );
}
