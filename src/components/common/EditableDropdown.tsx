import React, { useState, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Plus, X, ChevronDown } from "lucide-react";

interface EditableDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  onAddOption: (value: string) => Promise<void>;
  onDeleteOption: (value: string) => Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

// The open panel is portaled into document.body instead of rendering as a
// normal child here — a parent container (e.g. BOQPage.tsx's section card,
// `overflow-hidden` for its own rounded corners) would otherwise visually
// clip it the moment it needs to extend past that container's edge. A
// plain position:absolute/z-50 child escapes stacking order, but not an
// ancestor's overflow clipping — that's a separate mechanism entirely, and
// no amount of z-index fixes it. Position is computed from the trigger's
// own getBoundingClientRect() and kept in sync on scroll/resize below.
export default function EditableDropdown({
  value,
  onChange,
  options,
  onAddOption,
  onDeleteOption,
  placeholder = "Select or add...",
  disabled = false,
  className = "",
}: EditableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);       // wraps the trigger button only
  const panelRef = useRef<HTMLDivElement>(null);  // the portaled panel — now a SEPARATE subtree

  // Click-outside — must check both refs now. Before the portal, trigger
  // and panel were both children of `ref`'s own div, so ref.current.
  // contains(target) already covered clicks inside the panel (an option,
  // the search box, "Add new") for free. Portaled to document.body, the
  // panel is no longer a descendant of `ref` at all — checking only `ref`
  // would treat every click inside the open dropdown as an "outside"
  // click and close it instantly. Confirmed by tracing the DOM structure,
  // not assumed.
  useLayoutEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const insideTrigger = ref.current && ref.current.contains(target);
      const insidePanel = panelRef.current && panelRef.current.contains(target);
      if (!insideTrigger && !insidePanel) {
        setIsOpen(false);
        setAdding(false);
        setNewValue("");
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Position tracking, only while open. AppLayout.tsx's <main> is the
  // real scroll container in this app (overflow-y-auto) — the window
  // itself never scrolls, so window.scrollY-based math would be
  // consistently wrong here. getBoundingClientRect() is always
  // viewport-relative regardless of which ancestor scrolled to produce
  // that position, so a plain `top`/`left` from it is already correct —
  // the real requirement is RECOMPUTING it whenever anything scrolls,
  // since neither position:fixed nor position:absolute automatically
  // follows an unrelated ancestor's internal scroll once portaled out of
  // that ancestor's subtree. The scroll listener is attached with
  // capture:true specifically so it fires for scrolling on ANY nested
  // scrollable container on the page (not just window) — the standard
  // technique for this, and robust regardless of which element actually
  // scrolls. useLayoutEffect (not useEffect) so the first position is set
  // before paint, avoiding a one-frame flash at the wrong spot.
  useLayoutEffect(() => {
    if (!isOpen) return;
    function updatePosition() {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen]);

  const filtered = options.filter(o =>
    o.toLowerCase().includes(search.toLowerCase())
  );

  async function handleAdd() {
    const trimmed = newValue.trim();
    if (!trimmed || options.includes(trimmed)) return;
    await onAddOption(trimmed);
    onChange(trimmed);
    setNewValue("");
    setAdding(false);
    setIsOpen(false);
  }

  async function handleDelete(option: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete "${option}"?`)) return;
    await onDeleteOption(option);
    if (value === option) onChange("");
  }

  const panel = isOpen && position && (
    // Width: same intent as the old min-w-full/w-72/max-w — at least as
    // wide as the trigger (now via inline minWidth, since min-w-full had
    // nothing to be "full" relative to once portaled out of the trigger's
    // own wrapper), w-72 as the preferred width, capped so it can't
    // overflow a narrow viewport. Left-aligned to the trigger, same as
    // the original absolute positioning's default (no new "flip to avoid
    // right-edge overflow" logic added — preserving existing behavior
    // exactly, not building a fancier popover engine).
    //
    // Height: unchanged from before — capped to a fraction of the
    // viewport, column layout with only the options list scrolling so
    // Search and Add New always render in full.
    <div
      ref={panelRef}
      style={{ position: "fixed", top: position.top, left: position.left, minWidth: position.width }}
      className="z-50 w-72 max-w-[calc(100vw-2rem)] max-h-[min(28rem,70vh)] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden"
    >
      {/* Search */}
      <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search..."
          autoFocus
          className="w-full px-2 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Options — the only part that scrolls/shrinks, so Search and Add New below it are never pushed off */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {filtered.length === 0 && !adding && (
          <div className="px-3 py-2 text-xs text-slate-400 text-center">No options found</div>
        )}
        {filtered.map(option => (
          <div key={option}
            className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${value === option ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400" : "text-slate-700 dark:text-slate-200"}`}
          >
            <span className="text-sm flex-1" onClick={() => { onChange(option); setIsOpen(false); setSearch(""); }}>
              {option}
            </span>
            <button
              type="button"
              onClick={(e) => handleDelete(option, e)}
              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-500/20 text-slate-300 hover:text-red-500 transition-colors ml-2">
              <X size={12}/>
            </button>
          </div>
        ))}
      </div>

      {/* Add new */}
      <div className="p-2 border-t border-slate-100 dark:border-slate-800 flex-shrink-0">
        {adding ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAdding(false); setNewValue(""); } }}
              placeholder="Type new option..."
              autoFocus
              className="flex-1 min-w-0 px-2 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button type="button" onClick={handleAdd}
              className="flex-shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors">
              Add
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors">
            <Plus size={13}/> Add new option
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { if (!disabled) setIsOpen(v => !v); }}
        disabled={disabled}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 disabled:opacity-50 transition-colors hover:border-slate-300 dark:hover:border-slate-600"
      >
        <span className={value ? "" : "text-slate-400 dark:text-slate-500"}>
          {value || placeholder}
        </span>
        <ChevronDown size={14} className="text-slate-400 flex-shrink-0"/>
      </button>

      {panel && createPortal(panel, document.body)}
    </div>
  );
}
