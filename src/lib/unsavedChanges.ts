// Pages with edits that are not saved yet tell this list, so the project selector can ask before switching away (the page is rebuilt for the new project).
// A page calls  useUnsavedChanges(() => isDirty, "the BOQ", "note")  once; the function is asked only when someone switches project, and the page is removed again when it goes away.
import { useEffect, useRef } from "react";

interface Entry { label: string; note?: string; isDirty: () => boolean }
const entries = new Map<symbol, Entry>();

export function registerUnsaved(id: symbol, label: string, isDirty: () => boolean, note?: string): void { entries.set(id, { label, note, isDirty }); }
export const clearUnsaved = (id: symbol): void => { entries.delete(id); };

function dirtyEntries(): Entry[] {
  return [...entries.values()].filter((e) => { try { return e.isDirty(); } catch { return false; } });
}
export const hasUnsaved = (): boolean => dirtyEntries().length > 0;

// the question to ask before switching project, or null when nothing is unsaved
export function switchWarning(): string | null {
  const list = dirtyEntries();
  if (list.length === 0) return null;
  const labels = [...new Set(list.map((e) => e.label))].join(", ");
  const notes = [...new Set(list.map((e) => e.note).filter(Boolean))].join(" ");
  return `You have unsaved changes (${labels}).${notes ? " " + notes : " They will be lost if you switch project."}\n\nSwitch project anyway?`;
}

export function useUnsavedChanges(isDirty: () => boolean, label: string, note?: string): void {
  const latest = useRef(isDirty);
  latest.current = isDirty;
  useEffect(() => {
    const id = Symbol("unsaved");
    registerUnsaved(id, label, () => latest.current(), note);
    return () => clearUnsaved(id);
  }, [label, note]);
}
