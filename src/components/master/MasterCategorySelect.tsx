import React, { useState, useEffect, useRef } from "react";
import { useMasterLists } from "../../hooks/useMasterLists";

interface MasterCategorySelectProps {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export default function MasterCategorySelect({
  value,
  onChange,
  disabled = false,
  placeholder = "Select category...",
  className = ""
}: MasterCategorySelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { categories, loading, error } = useMasterLists();

  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (categoryId: string | null) => {
    onChange(categoryId);
    setIsOpen(false);
    setSearch("");
  };

  const selectedCategory = categories.find(cat => cat.id === value);

  return (
    <div className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={selectedCategory?.name || ""}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-400 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          className="absolute right-2 top-1/2 text-slate-400 hover:text-slate-300 disabled:opacity-50"
        >
          ▼
        </button>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-lg max-h-60 overflow-auto"
        >
          {loading ? (
            <div className="px-3 py-2 text-sm text-slate-400">Loading...</div>
          ) : error ? (
            <div className="px-3 py-2 text-sm text-red-400">{error}</div>
          ) : (
            <>
              {/* Clear Option */}
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className="w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 text-left border-b border-slate-700"
              >
                Clear
              </button>
              
              {/* Filtered Categories */}
              {filteredCategories.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-400">No categories found</div>
              ) : (
                filteredCategories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => handleSelect(category.id)}
                    className="w-full px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 text-left"
                  >
                    {category.name}
                  </button>
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
