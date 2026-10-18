// src/pages/settings/CompanySettingsContext.tsx
// Provides the company settings form (companySettingsState.ts) to the Settings tabs that show parts of it, and reports its unsaved changes to the shell.
import React from "react";
import { useReportDirty } from "../../components/settingsEmbed";
import { CompanySettingsCtx, useCompanySettingsState } from "./companySettingsState";

export function CompanySettingsProvider({ children, resetToken = 0 }: { children: React.ReactNode; resetToken?: number }) {
  const value = useCompanySettingsState(resetToken);
  useReportDirty("company", value.dirty);              // the shell warns before the person leaves these tabs with unsaved changes
  return <CompanySettingsCtx.Provider value={value}>{children}</CompanySettingsCtx.Provider>;
}
