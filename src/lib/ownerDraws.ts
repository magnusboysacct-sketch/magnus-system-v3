// Owner draws, year to date, for one company - the single source for the Owner Draws card AND the AI summary on the Director
// Dashboard, so the two can never disagree.
//
// There is no per-owner table in use: a draw is a posted Fund Transfer that DEBITS an equity account (e.g. "Money Paid to User"
// into the owner's own equity account, or into a single "Owner Draws" account). So this reads every ACTIVE equity-type account
// (not filtered by subtype: accounts imported from another system often have none) and totals, per account, what this year's posted
// Fund Transfers did to it. Equity is credit-normal and a draw is a net debit, so the figure is debit minus credit: a positive number
// is money taken out. Only accounts with a positive net are returned: accounts with no activity, and accounts with a net contribution
// (money put in, a negative figure), are left out because they are not draws. Each account is named by its
// own name, never by a hardcoded person.
import { supabase } from "./supabase";

export interface OwnerDrawYTD {
  accountCode: string;
  accountName: string;
  ytd: number;
}

const PAGE = 1000; // PostgREST returns at most 1000 rows per request
const ID_CHUNK = 150; // keeps the .in(...) filter comfortably inside URL limits

export async function fetchOwnerDrawsYTD(companyId: string, year: number = new Date().getFullYear()): Promise<OwnerDrawYTD[]> {
  // 1. The company's active equity accounts.
  const { data: accounts, error: acctErr } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name")
    .eq("company_id", companyId)
    .eq("type", "equity")
    .eq("is_active", true);
  if (acctErr) throw acctErr;
  if (!accounts || accounts.length === 0) return [];
  const accountById = new Map(accounts.map((a: any) => [a.id as string, a]));

  // 2. This year's posted Fund Transfer transactions (Jan 1 - Dec 31, the same YTD boundary used elsewhere in the app).
  const transactionIds: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data: page, error: txErr } = await supabase
      .from("gl_transactions")
      .select("id")
      .eq("company_id", companyId)
      .eq("source_type", "fund_transfer")
      .eq("status", "posted")
      .gte("transaction_date", `${year}-01-01`)
      .lte("transaction_date", `${year}-12-31`)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (txErr) throw txErr;
    for (const t of page || []) transactionIds.push((t as any).id);
    if (!page || page.length < PAGE) break;
  }
  if (transactionIds.length === 0) return [];

  // 3. Their entries on those equity accounts, summed per account.
  const accountIds = accounts.map((a: any) => a.id as string);
  const net = new Map<string, number>();
  for (let i = 0; i < transactionIds.length; i += ID_CHUNK) {
    const { data: entries, error: entErr } = await supabase
      .from("gl_entries")
      .select("account_id, debit, credit")
      .in("account_id", accountIds)
      .in("transaction_id", transactionIds.slice(i, i + ID_CHUNK));
    if (entErr) throw entErr;
    for (const e of entries || []) {
      const id = (e as any).account_id as string;
      net.set(id, (net.get(id) || 0) + ((Number((e as any).debit) || 0) - (Number((e as any).credit) || 0)));
    }
  }

  const rows: OwnerDrawYTD[] = [];
  for (const [id, total] of net) {
    const ytd = Math.round(total * 100) / 100;
    if (ytd <= 0) continue; // only real net draws: no bar for zero activity, and a net contribution (money put in) is not a draw
    const a: any = accountById.get(id);
    if (a) rows.push({ accountCode: String(a.code), accountName: String(a.name), ytd });
  }
  return rows.sort((x, y) => x.accountCode.localeCompare(y.accountCode, undefined, { numeric: true }));
}
