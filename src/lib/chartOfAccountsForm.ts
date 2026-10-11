// Rules for the "Add Account" form on the Chart of Accounts tab: which codes and subtypes suit which account type, what the next free
// code is, how deep an account sits under its parent, and what makes the form invalid. Pure functions only (no database access) so the
// modal and its tests share one definition. The allowed values mirror the CHECK constraints on chart_of_accounts
// (supabase/migrations/20260329190000_create_chart_of_accounts.sql); the database stays the real authority.
import type { AccountSubtype, AccountType } from "./accounting";

export const ACCOUNT_TYPES: Array<{ value: AccountType; label: string }> = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "revenue", label: "Revenue" },
  { value: "expense", label: "Expense" },
];

export const SUBTYPES_BY_TYPE: Record<AccountType, AccountSubtype[]> = {
  asset: ["current_asset", "fixed_asset", "bank", "accounts_receivable", "inventory", "prepaid_expense"],
  liability: ["current_liability", "long_term_liability", "accounts_payable", "accrued_expense", "deferred_revenue"],
  equity: ["owner_equity", "retained_earnings", "common_stock", "additional_paid_in_capital"],
  revenue: ["service_revenue", "product_revenue", "other_revenue"],
  expense: ["operating_expense", "cost_of_goods_sold", "selling_expense", "administrative_expense", "payroll_expense", "other_expense"],
};

// "accounts_receivable" -> "Accounts receivable"
export function subtypeLabel(subtype: string): string {
  const text = subtype.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The usual 4-digit ranges: 1xxx assets, 2xxx liabilities, 3xxx equity, 4xxx revenue, 5xxx-6xxx expenses (cost of construction, then
// operating). A code outside its type's range is only a warning - the database enforces nothing but uniqueness.
export const CODE_RANGES: Record<AccountType, { min: number; max: number }> = {
  asset: { min: 1000, max: 1999 },
  liability: { min: 2000, max: 2999 },
  equity: { min: 3000, max: 3999 },
  revenue: { min: 4000, max: 4999 },
  expense: { min: 5000, max: 6999 },
};

export const CODE_MIN_LENGTH = 3;
export const CODE_MAX_LENGTH = 10;
export const NAME_MAX_LENGTH = 120;
export const MAX_ACCOUNT_LEVEL = 10;

export interface AccountLike {
  id: string;
  code: string;
  name: string;
  type: string;
  level?: number | null;
  is_active?: boolean | null;
}

const numericCode = (code: string): number | null => (/^\d+$/.test(code) ? Number(code) : null);

// The next unused code for a new account. Under a parent it is the parent's next free child (6200 -> 6210, 6210 -> 6211); otherwise
// the next unused hundred in the type's range (1000..1500 used -> 1600), then the next unused ten, then the next unused number.
// Returns "" if the range is completely full.
export function suggestNextCode(type: AccountType, existingCodes: string[], parentCode?: string | null): string {
  const used = new Set(existingCodes.map((c) => String(c).trim()));
  const free = (n: number) => !used.has(String(n));
  const parent = parentCode ? numericCode(parentCode) : null;
  if (parent !== null) {
    const step = parent % 100 === 0 ? 10 : 1;
    const limit = parent % 100 === 0 ? parent + 99 : parent % 10 === 0 ? parent + 9 : parent;
    for (let c = parent + step; c <= limit; c += step) if (free(c)) return String(c);
  }
  const { min, max } = CODE_RANGES[type];
  for (const step of [100, 10, 1]) {
    for (let c = min; c <= max; c += step) if (free(c)) return String(c);
  }
  return "";
}

// New account's level: one below its parent (a parent with no level counts as level 1), or 1 with no parent.
export function computeLevel(parent: { level?: number | null } | null | undefined): number {
  return parent ? (parent.level ?? 1) + 1 : 1;
}

// Parents a new account may sit under: active accounts of the SAME type that still leave room (child level <= MAX_ACCOUNT_LEVEL).
export function eligibleParents<T extends AccountLike>(accounts: T[], type: AccountType | ""): T[] {
  if (!type) return [];
  return accounts
    .filter((a) => a.type === type && a.is_active !== false && computeLevel(a) <= MAX_ACCOUNT_LEVEL)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}

export interface AccountFormValues {
  type: AccountType | "";
  code: string;
  name: string;
  subtype: string;
  parentId: string;
  isProjectLinkable: boolean;
  openingBalance: string;
  description: string;
}

export const blankAccountForm: AccountFormValues = {
  type: "", code: "", name: "", subtype: "", parentId: "", isProjectLinkable: false, openingBalance: "", description: "",
};

// Parses the opening balance box: blank = 0, anything that isn't a plain number = null (invalid).
export function parseOpeningBalance(text: string): number | null {
  const t = text.trim();
  if (t === "") return 0;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export interface AccountFormCheck {
  errors: string[]; // block saving
  warnings: string[]; // shown, never block
  level: number;
  parent: AccountLike | null;
}

// Validates the form against the accounts the page already has. A code that is only used by an INACTIVE account is not in `accounts`,
// so the modal also asks the database before saving (and the unique constraint is the final word).
export function checkAccountForm(values: AccountFormValues, accounts: AccountLike[]): AccountFormCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const code = values.code.trim();
  const name = values.name.trim();

  if (!values.type) errors.push("Choose an account type.");

  if (!code) errors.push("Enter an account code.");
  else if (!/^\d+$/.test(code)) errors.push("The code can only contain digits.");
  else if (code.length < CODE_MIN_LENGTH || code.length > CODE_MAX_LENGTH) errors.push(`The code must be ${CODE_MIN_LENGTH} to ${CODE_MAX_LENGTH} digits long.`);
  else {
    const clash = accounts.find((a) => String(a.code).trim() === code);
    if (clash) errors.push(`Code ${code} is already used by "${clash.name}". Choose a different code.`);
    else if (values.type) {
      const range = CODE_RANGES[values.type];
      const n = Number(code);
      if (code.length === 4 && (n < range.min || n > range.max)) {
        warnings.push(`Codes for ${values.type} accounts are usually ${range.min} to ${range.max}. You can still use ${code}.`);
      }
    }
  }

  if (!name) errors.push("Enter an account name.");
  else if (name.length > NAME_MAX_LENGTH) errors.push(`The name can be at most ${NAME_MAX_LENGTH} characters.`);
  else if (accounts.some((a) => a.name.trim().toLowerCase() === name.toLowerCase())) warnings.push(`Another account is already named "${name}".`);

  if (values.subtype && values.type && !SUBTYPES_BY_TYPE[values.type].includes(values.subtype as AccountSubtype)) {
    errors.push("That subtype doesn't belong to the chosen account type.");
  }

  const parent = values.parentId ? accounts.find((a) => a.id === values.parentId) ?? null : null;
  if (values.parentId && !parent) errors.push("The parent account could not be found. Reload the page and try again.");
  if (parent && values.type && parent.type !== values.type) errors.push("A parent account must be the same type as the new account.");
  const level = computeLevel(parent);
  if (level > MAX_ACCOUNT_LEVEL) errors.push(`Accounts can be at most ${MAX_ACCOUNT_LEVEL} levels deep. Choose a parent higher up.`);

  if (parseOpeningBalance(values.openingBalance) === null) errors.push("The opening balance must be a number.");

  return { errors, warnings, level, parent };
}
