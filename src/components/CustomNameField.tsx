import { useEffect, useMemo, useState } from "react";
import EditableDropdown from "./common/EditableDropdown";
import { buildLabelOptions, CUSTOM_NAME_LABEL_MAX, CUSTOM_NAME_VALUE_MAX, fetchUsedCustomNameLabels } from "../lib/customName";

interface Props {
  label: string;
  value: string;
  onLabelChange: (label: string) => void;
  onValueChange: (value: string) => void;
  // Called when the value box loses focus - lets a page save the name straight away if it wants to.
  onCommit?: () => void;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
}

// A label picked from a list (presets + labels already used by this company) and the name that goes with it, e.g.
// "Beneficiary Name" / "Mary Johnson". The name box stays disabled until a label is chosen. Adding a new label here writes
// nothing: it just becomes the current label and is stored only when the BOQ or invoice itself is saved.
export default function CustomNameField({ label, value, onLabelChange, onValueChange, onCommit, disabled = false, className = "", inputClassName = "" }: Props) {
  const [used, setUsed] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    fetchUsedCustomNameLabels().then((labels) => { if (alive) setUsed(labels); });
    return () => { alive = false; };
  }, []);

  const options = useMemo(() => buildLabelOptions(used, label), [used, label]);
  const hasLabel = label.trim().length > 0;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <EditableDropdown
        value={label}
        onChange={(v) => onLabelChange(v.slice(0, CUSTOM_NAME_LABEL_MAX))}
        options={options}
        onAddOption={async () => { /* nothing is written here: the new label becomes the current value */ }}
        onDeleteOption={async () => { /* the delete buttons are hidden */ }}
        showDelete={false}
        placeholder="Name label…"
        disabled={disabled}
        className="w-44 flex-shrink-0"
      />
      <input
        type="text"
        value={value}
        maxLength={CUSTOM_NAME_VALUE_MAX}
        disabled={disabled || !hasLabel}
        onChange={(e) => onValueChange(e.target.value)}
        onBlur={() => onCommit?.()}
        placeholder={hasLabel ? "Name…" : "Choose a label first"}
        className={`flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 disabled:opacity-60 ${inputClassName}`}
      />
      {(hasLabel || value) && !disabled && (
        <button
          type="button"
          onClick={() => { onLabelChange(""); onValueChange(""); onCommit?.(); }}
          className="text-[11px] font-medium text-slate-400 hover:text-red-500 flex-shrink-0"
          title="Remove this name"
        >
          Clear
        </button>
      )}
    </div>
  );
}
