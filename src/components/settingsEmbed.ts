// src/components/settingsEmbed.tsx
// What a Settings page needs to know when it is shown as a tab inside the Settings shell (src/pages/settings/SettingsShell.tsx):
//   * `embedded`: the shell already has the page title, tabs and navigation, so a page's own "back" arrow is not shown (PageHeader checks this).
//   * `reportDirty(key, dirty)`: a page with a Save button says whether it has unsaved changes; the shell warns before the person switches tab or leaves.
// Outside the shell (any page that is not a settings tab) both are inert, so existing pages work unchanged.
import { createContext, useContext, useEffect } from "react";

interface Embed { embedded: boolean; reportDirty: (key: string, dirty: boolean) => void }
const noop = () => undefined;
export const SettingsEmbedContext = createContext<Embed>({ embedded: false, reportDirty: noop });

export const useSettingsEmbed = () => useContext(SettingsEmbedContext);

// A page (or section) with unsaved changes calls this on every render with its current state; the entry is removed when it goes away.
export function useReportDirty(key: string, dirty: boolean) {
  const { reportDirty } = useContext(SettingsEmbedContext);
  useEffect(() => { reportDirty(key, dirty); }, [reportDirty, key, dirty]);
  useEffect(() => () => reportDirty(key, false), [reportDirty, key]);
}
