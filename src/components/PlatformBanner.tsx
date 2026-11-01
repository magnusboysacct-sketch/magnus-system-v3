// src/components/PlatformBanner.tsx — the "message to everyone" set in Magnus HQ.
// News / Heads up / Urgent. Each person can dismiss it once; a new message shows again.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Megaphone, TriangleAlert, X } from "lucide-react";
import { cn } from "../lib/theme";
import { usePlatformSettings } from "../lib/platformSettings";

const KEY = "magnus.banner.dismissed";

function dismissedId(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export default function PlatformBanner() {
  const { banner } = usePlatformSettings();
  const [hidden, setHidden] = useState<string | null>(dismissedId);
  if (!banner || banner.id === hidden) return null;

  const style = banner.kind === "urgent"
    ? "bg-red-600 text-white"
    : banner.kind === "heads_up"
      ? "bg-amber-50 text-amber-900 border-b border-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:border-amber-400/20"
      : "bg-sky-50 text-sky-900 border-b border-sky-200 dark:bg-sky-400/10 dark:text-sky-200 dark:border-sky-400/20";
  const label = banner.kind === "urgent" ? "Urgent" : banner.kind === "heads_up" ? "Heads up" : "News";

  return (
    <div className={cn("flex items-start gap-2 px-4 py-2 text-xs", style)} role="status">
      {banner.kind === "news" ? <Megaphone size={14} className="mt-0.5 shrink-0" /> : <TriangleAlert size={14} className="mt-0.5 shrink-0" />}
      <div className="flex-1">
        <b>{label}:</b> {banner.text}{" "}
        {banner.link && (banner.link.startsWith("/")
          ? <Link to={banner.link} className="underline font-semibold">More</Link>
          : <a href={banner.link} target="_blank" rel="noreferrer" className="underline font-semibold">More</a>)}
      </div>
      <button aria-label="Dismiss" className="opacity-70 hover:opacity-100"
        onClick={() => { try { localStorage.setItem(KEY, banner.id); } catch { /* ignore */ } setHidden(banner.id); }}>
        <X size={14} />
      </button>
    </div>
  );
}
