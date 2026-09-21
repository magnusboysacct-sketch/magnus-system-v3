// src/components/common/CollapsibleSection.tsx
//
// A card with a button header (icon, title, item count, optional trailing summary, chevron) that shows or
// hides its body. Styled like the cards in the Takeoff page's right panel. Use it uncontrolled (optionally
// remembering open/closed in localStorage via storageKey), or controlled with open + onToggle.
import React, { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  /** Item count shown next to the title. */
  count?: number;
  /** Small trailing node in the header, e.g. the currently selected item. Stays visible when closed. */
  summary?: React.ReactNode;
  /** Small icon before the title. */
  icon?: React.ReactNode;
  /** Uncontrolled initial state. Ignored when `open` is passed, or when storageKey holds a saved value. Default closed. */
  defaultOpen?: boolean;
  /** Controlled mode: pass both open and onToggle. */
  open?: boolean;
  onToggle?: (open: boolean) => void;
  /** Uncontrolled only: remember open/closed in localStorage under this key. Any storage failure falls back to defaultOpen. */
  storageKey?: string;
  children: React.ReactNode;
  className?: string;
}

function readStored(key: string | undefined): boolean | null {
  try {
    if (!key) return null;
    const v = window.localStorage.getItem(key);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

function writeStored(key: string | undefined, open: boolean) {
  try {
    if (key) window.localStorage.setItem(key, open ? "1" : "0");
  } catch {
    // remembering is a convenience only
  }
}

export default function CollapsibleSection({
  title,
  count,
  summary,
  icon,
  defaultOpen = false,
  open: controlledOpen,
  onToggle,
  storageKey,
  children,
  className = "",
}: CollapsibleSectionProps) {
  const [innerOpen, setInnerOpen] = useState<boolean>(() => readStored(storageKey) ?? defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? !!controlledOpen : innerOpen;
  const bodyId = useId();

  function toggle() {
    const next = !open;
    if (!isControlled) {
      setInnerOpen(next);
      writeStored(storageKey, next);
    }
    onToggle?.(next);
  }

  return (
    <div className={`rounded-xl border border-slate-200 dark:border-white/[0.07] overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className={`w-full flex items-center gap-1.5 px-3 py-2 bg-slate-50 dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/[0.04] transition text-left ${open ? "border-b border-slate-100 dark:border-white/[0.05]" : ""}`}
      >
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 truncate">{title}</span>
        {count !== undefined && (
          <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 flex-shrink-0">({count})</span>
        )}
        <span className="flex-1 min-w-0 flex justify-end">{summary}</span>
        <ChevronDown size={12} className={`flex-shrink-0 text-slate-400 dark:text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div id={bodyId} className="p-2 space-y-1.5">
          {children}
        </div>
      )}
    </div>
  );
}
