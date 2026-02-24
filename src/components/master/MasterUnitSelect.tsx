import React, { useState, useEffect, useRef } from "react";
import { useMasterLists } from "../../hooks/useMasterLists";

interface MasterUnitSelectProps {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  showTypeBadge?: boolean;
}

export default function MasterUnitSelect({
  value,
  onChange,
  disabled = false,
  placeholder = "Select unit...",
  className = "",
  showTypeBadge = true
}: MasterUnitSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { units, loading, error } = useMasterLists();

  const filteredUnits = units.filter(unit =>
    unit.name.toLowerCase().includes(search.toLowerCase())
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

  const handleSelect = (unitId: string | null) => {
    onChange(unitId);
    setIsOpen(false);
    setSearch("");
  };

  const selectedUnit = units.find(unit => unit.id === value);

  const getUnitTypeLabel = (unitType: string | null) => {
    const typeMap: Record<string, string> = {
      length: "Length",
      area: "Area",
      volume: "Volume",
      weight: "Weight",
      count: "Count",
      packaging: "Packaging",
      time: "Time",
      work: "Work",
      other: "Other"
    };
    return typeMap[unitType || "other"] || "Other";
  };

  return (
    <div className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={selectedUnit?.name || ""}
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
              
              {/* Filtered Units */}
              {filteredUnits.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-400">No units found</div>
              ) : (
                filteredUnits.map((unit) => (
                  <button
                    key={unit.id}
                    type="button"
                    onClick={() => handleSelect(unit.id)}
                    className="w-full px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 text-left flex items-center justify-between"
                  >
                    <span>{unit.name}</span>
                    {showTypeBadge && unit.unit_type && (
                      <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                        {getUnitTypeLabel(unit.unit_type)}
                      </span>
                    )}
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
