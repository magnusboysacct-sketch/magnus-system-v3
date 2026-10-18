// src/pages/settings/settingsTabs.ts — the Settings tabs: id (the URL: /settings/<id>), name, who may use it, and which tabs share one form.
// `roles` is the same ceiling the old route guards had (every settings page was director-only); a tab is shown only to the roles listed. Change a tab's roles
// here, and in the route guard in App.tsx, if a different role should ever get a tab.
export interface SettingsTab {
  id: string;
  label: string;
  description: string;
  roles: readonly string[];
  group?: string;            // tabs with the same group share ONE form and ONE Save (changes stay when moving between them)
}

const DIRECTOR = ["director"] as const;

export const SETTINGS_TABS: readonly SettingsTab[] = [
  { id: "company",       label: "Company",                description: "Name, contact details, address and logo",                          roles: DIRECTOR, group: "company" },
  { id: "branding",      label: "Branding & ID Cards",    description: "ID card colours, presets, preview and the printing guide",         roles: DIRECTOR, group: "branding" },
  { id: "documents",     label: "Documents",              description: "Authorized signature and document watermark",                      roles: DIRECTOR, group: "company" },
  { id: "estimates",     label: "Estimates & Pricing",    description: "Markup, contingency, payment terms, overhead %, salary period",    roles: DIRECTOR, group: "estimates" },
  { id: "payroll-rates", label: "Payroll & Tax Rates",    description: "Jamaican statutory deduction rates",                               roles: DIRECTOR, group: "payroll-rates" },
  { id: "master-lists",  label: "Master Lists",           description: "Units, materials, labour and equipment lists",                     roles: DIRECTOR },
  { id: "users",         label: "Team & Access",          description: "Team members, roles, finance access and invites",                  roles: DIRECTOR },
  { id: "records",       label: "Records & IDs",          description: "Staff records, worker files and ID cards",                         roles: DIRECTOR },
  { id: "notifications", label: "Notifications & Portal", description: "Messages sent to clients",                                         roles: DIRECTOR, group: "company" },
  { id: "import",        label: "Import Data",            description: "Bring in data from another system",                                roles: DIRECTOR },
];

// Not a tab: a page of its own that Settings has always linked to.
export const BILLING_LINK: { label: string; to: string; roles: readonly string[] } = { label: "Billing & Plan", to: "/billing", roles: DIRECTOR };

export const tabsForRole = (role: string | null | undefined) => SETTINGS_TABS.filter((t) => !!role && t.roles.includes(role));
export const DEFAULT_TAB = "company";
export const settingsTabPath = (id: string) => `/settings/${id}`;
