import React, { useState, useEffect, useRef } from "react";
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
        setAdding(false);
        setNewValue("");
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

      {/* Dropdown */}
      {isOpen && (
        // Width: decoupled from the trigger's own width (was w-full, i.e.
        // exactly as wide as whatever container this sits in — fine on
        // desktop, but on mobile some usages sit in narrow grid/flex cells
        // that squeeze the "Add new" row's input+button unusably tight).
        // min-w-full keeps existing desktop layouts unchanged when the
        // trigger is already wide enough; the 16rem floor guarantees a
        // usable minimum regardless of a narrow parent; the viewport-based
        // max-width stops it overflowing a narrow phone screen either way.
        //
        // Height: capped to a fraction of the viewport and laid out as a
        // column with only the options list scrolling/shrinking — Search
        // and Add New are flex-shrink-0 so they always render in full.
        // Two autoFocus inputs in this component (search, then the new-
        // option field) each pop the on-screen keyboard on mobile, which
        // can consume 40-50% of the viewport; without this, "Add new"
        // (last in the layout) is exactly what gets pushed below the
        // reachable area.
        <div className="absolute z-50 mt-1 min-w-full w-72 max-w-[calc(100vw-2rem)] max-h-[min(28rem,70vh)] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
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
      )}
    </div>
  );
}
