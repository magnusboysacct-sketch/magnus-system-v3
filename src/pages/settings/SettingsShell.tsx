// src/pages/settings/SettingsShell.tsx — Settings as tabs (replaces the old hub of cards and the separate full pages).
//   * One URL per tab: /settings/company, /settings/branding, ... (the old page URLs are the same ids, /settings alone opens Company); refresh, back and links work.
//   * Only the tabs the signed-in role may use are shown (settingsTabs.ts: the same ceiling the old route guards had).
//   * Desktop: a tab list on the left (ten tabs). Phone / tablet: a drop-down, so nothing scrolls sideways at 320 px.
//   * A tab stays mounted once opened (hidden when another is shown), so nothing typed is lost to the back button; moving to another tab or leaving Settings with
//     unsaved changes asks first, and answering "leave" discards them. Every tab keeps its own Save exactly as it worked before.
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, UNSAFE_NavigationContext, useNavigate, useParams } from "react-router-dom";
import { PageHeader, cn } from "../../components/ui";
import { ArrowUpRight } from "lucide-react";
import { useProjectContext } from "../../context/ProjectContext";
import { SettingsEmbedContext } from "../../components/settingsEmbed";
import { BILLING_LINK, DEFAULT_TAB, SETTINGS_TABS, settingsTabPath, tabsForRole, type SettingsTab } from "./settingsTabs";
import { CompanySettingsProvider } from "./CompanySettingsContext";
import { installLeaveGuard, type RouterNavigator } from "./leaveGuard";
import { CompanyTab, DocumentsTab, NotificationsTab } from "./CompanyTabs";
import BrandingTab from "./BrandingTab";
import SettingsEstimatesPage from "../SettingsEstimatesPage";
import SettingsPayrollPage from "../SettingsPayrollPage";
import SettingsMasterListsPage from "../SettingsMasterListsPage";
import SettingsUsersPage from "../SettingsUsersPage";
import SettingsRecordsPage from "../SettingsRecordsPage";
import SettingsImportPage from "../SettingsImportPage";

const CONTENT: Record<string, React.ComponentType> = {
  company: CompanyTab, branding: BrandingTab, documents: DocumentsTab, notifications: NotificationsTab,
  estimates: SettingsEstimatesPage, "payroll-rates": SettingsPayrollPage, "master-lists": SettingsMasterListsPage,
  users: SettingsUsersPage, records: SettingsRecordsPage, import: SettingsImportPage,
};

const groupLabel = (group: string) => SETTINGS_TABS.filter((t) => t.group === group).map((t) => t.label).join(" / ");
const LEAVE_SETTINGS = "You have unsaved changes in Settings. If you leave now they will be lost. Leave without saving?";

export default function SettingsShell() {
  const { tab } = useParams<{ tab: string }>();
  const nav = useNavigate();
  const { userRole, loadingProjects } = useProjectContext();
  const allowed = useMemo(() => tabsForRole(userRole), [userRole]);
  const active: SettingsTab | undefined = allowed.find((t) => t.id === tab);

  // ── unsaved changes: each form reports whether it has some (by group); the shell warns and, on "leave", discards by remounting ───────────
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const reportDirty = useCallback((key: string, d: boolean) => setDirty((prev) => (!!prev[key] === d ? prev : { ...prev, [key]: d })), []);
  const [resets, setResets] = useState<Record<string, number>>({});
  const anyDirty = Object.values(dirty).some(Boolean);

  const [visited, setVisited] = useState<string[]>([]);
  if (active && !visited.includes(active.id)) setVisited([...visited, active.id]);        // (derived while rendering: a tab stays mounted once it has been opened)

  const go = (id: string) => {
    if (!active || id === active.id) return;
    const target = SETTINGS_TABS.find((t) => t.id === id);
    const leaving = active.group;
    if (leaving && dirty[leaving] && leaving !== target?.group) {
      if (!window.confirm(`You have unsaved changes (${groupLabel(leaving)}). If you switch tab they will be lost. Switch without saving?`)) return;
      setResets((r) => ({ ...r, [leaving]: (r[leaving] || 0) + 1 }));        // remount that form fresh: the unsaved edits are dropped
    }
    nav(settingsTabPath(id));
  };

  // leaving Settings (a sidebar link, a button, refresh, closing the tab) with something unsaved
  const { navigator } = useContext(UNSAFE_NavigationContext) as unknown as { navigator: RouterNavigator };
  useEffect(() => {
    if (!anyDirty) return;
    return installLeaveGuard(navigator, (path) => path.startsWith("/settings"), LEAVE_SETTINGS);
  }, [anyDirty, navigator]);

  const embed = useMemo(() => ({ embedded: true, reportDirty }), [reportDirty]);

  if (loadingProjects || !userRole) return <div className="p-8 text-sm text-slate-500">Loading settings...</div>;
  if (allowed.length === 0) {
    return <div className="min-h-screen flex items-center justify-center p-8 text-center text-sm text-slate-500">You do not have permission to access Settings.<br />Contact your administrator.</div>;
  }
  if (!active) return <Navigate to={settingsTabPath(allowed[0]?.id ?? DEFAULT_TAB)} replace />;

  const shown = Array.from(new Set([...visited, active.id])).filter((id) => allowed.some((t) => t.id === id));
  const unsaved = (t: SettingsTab) => !!t.group && !!dirty[t.group];

  return (
    <SettingsEmbedContext.Provider value={embed}>
      <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
        <PageHeader title="Settings" subtitle={active.label + (anyDirty ? " · unsaved changes" : "")} />

        {/* phone / tablet: a drop-down */}
        <div className="md:hidden px-4 pt-3">
          <label className="block text-[11px] font-semibold text-slate-500 mb-1" htmlFor="settings-tab-select">Settings section</label>
          <select id="settings-tab-select" value={active.id}
            onChange={(e) => { const v = e.target.value; if (v === "__billing") { if (!anyDirty || window.confirm(LEAVE_SETTINGS)) nav(BILLING_LINK.to); } else go(v); }}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-white/[0.12] bg-white dark:bg-[#0c1018] text-sm text-slate-800 dark:text-slate-100">
            {allowed.map((t) => <option key={t.id} value={t.id}>{t.label}{unsaved(t) ? "  •  unsaved" : ""}</option>)}
            {BILLING_LINK.roles.includes(userRole) && <option value="__billing">{BILLING_LINK.label} →</option>}
          </select>
        </div>

        <div className="md:flex md:items-start">
          {/* desktop: a list on the left */}
          <nav aria-label="Settings sections" className="hidden md:block w-60 flex-shrink-0 p-4 sticky top-0 self-start">
            <ul className="space-y-1">
              {allowed.map((t) => (
                <li key={t.id}>
                  <a href={settingsTabPath(t.id)} onClick={(e) => { e.preventDefault(); go(t.id); }} aria-current={t.id === active.id ? "page" : undefined} title={t.description}
                    className={cn("flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                      t.id === active.id ? "bg-cyan-600/10 text-cyan-700 dark:text-cyan-300 font-semibold" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.05]")}>
                    <span className="truncate">{t.label}</span>
                    {unsaved(t) && <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" aria-label="unsaved changes" />}
                  </a>
                </li>
              ))}
              {BILLING_LINK.roles.includes(userRole) && (
                <li className="pt-2 mt-2 border-t border-slate-200 dark:border-white/[0.06]">
                  <a href={BILLING_LINK.to} onClick={(e) => { e.preventDefault(); if (!anyDirty || window.confirm(LEAVE_SETTINGS)) nav(BILLING_LINK.to); }}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.05]">
                    <span>{BILLING_LINK.label}</span><ArrowUpRight size={13} />
                  </a>
                </li>
              )}
            </ul>
          </nav>

          {/* the tabs; one that was opened stays mounted (hidden) so its edits survive */}
          <div className="flex-1 min-w-0">
            <CompanySettingsProvider resetToken={resets.company || 0}>
              {shown.map((id) => {
                const Page = CONTENT[id];
                const t = SETTINGS_TABS.find((x) => x.id === id);
                const key = `${id}-${(t?.group && t.group !== "company" && resets[t.group]) || 0}`;      // (the company form is reloaded in place, see CompanySettingsProvider)
                return (
                  <div key={key} hidden={id !== active.id} role="tabpanel" aria-label={t?.label}
                    className="min-w-0 overflow-x-auto [&>*]:!min-h-0 [&>*]:!bg-transparent">
                    <Page />
                  </div>
                );
              })}
            </CompanySettingsProvider>
          </div>
        </div>
      </div>
    </SettingsEmbedContext.Provider>
  );
}
