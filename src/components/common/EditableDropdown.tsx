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
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-800">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              autoFocus
              className="w-full px-2 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Options */}
          <div className="max-h-48 overflow-y-auto">
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
          <div className="p-2 border-t border-slate-100 dark:border-slate-800">
            {adding ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newValue}
                  onChange={e => setNewValue(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAdding(false); setNewValue(""); } }}
                  placeholder="Type new option..."
                  autoFocus
                  className="flex-1 px-2 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button type="button" onClick={handleAdd}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors">
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
