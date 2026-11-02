# Banking and money flow - plan

Goal: work the standard way (QuickBooks / Xero / Sage / Viewpoint), not around how one company works.

## The standard model
1. A bank account IS an account in the Chart of Accounts (asset; credit cards / lines of credit are liabilities).
   The Bank Accounts page is the bank details + statements for those accounts.
2. Every money movement posts to the books automatically: client receipts (deposited to a bank), supplier payments
   and expenses (paid from a bank / cash / card), transfers between accounts.
3. Bank statements are uploaded against a bank account and each line is MATCHED to what is already in the books
   (reconciliation), never entered twice.
4. Cash held by a person (supervisor, foreman, partner) is a petty-cash account for that person.
5. Every cost is tagged to a project (job costing).

## Steps
| Step | What | Status |
|---|---|---|
| 1 | One list: bank_accounts.chart_account_id; new bank accounts create / link their chart account; page shows books balance | done (20260969) |
| 2 | Transfer money (from, to, amount, date, note, optional project) -> posted journal | done (20260970) |
| 3 | Client payments: "Deposited to" + post to the books (start date + opening balances decided here) | |
| 4 | Supplier payments: "Paid from" + post to the books | |
| 5 | Bank statements: fix posting (placeholder accounts today), match lines to the books | |
| 6 | Account history + reconcile (bank says X, books say Y) | |

## Step 1 notes
- Migration `20260969000000_bank_accounts_in_chart.sql`: column + unique index, BEFORE INSERT/UPDATE trigger
  `bank_account_chart_link` (creates on insert when none chosen; validates company / active / kind / not shared),
  `bank_account_create_chart_account(bank_id)` for the page button. New codes: 1001-1099 under 1000 (subtype bank);
  credit cards 2401-2409 under 2400, lines of credit 2411-2419 under 2410. Existing bank accounts linked only on an
  exact name match; the rest show "Create in chart" / "Link". Runs as the user (RLS applies), no security definer.
- `bank_accounts.current_balance` is now labelled "Bank statement" (the bank's figure, for reconciling in step 6);
  the books balance is `chart_of_accounts.current_balance`.

## Step 2 notes
- Migration `20260970000000_money_transfer.sql`: `money_transfer(from, to, amount, date, note, project)` saves header +
  2 lines + posts in one transaction (DEBIT to, CREDIT from; source_type 'fund_transfer', currency JMD, number
  GL-YYYY-MM-DD-NNNN under an advisory lock). `money_transfer_undo(id, reason)` posts a reversing 'adjustment' entry
  and marks the original voided (posted_at cleared). Allowed accounts: active assets, and liabilities linked to a bank
  account. Runs as the user (RLS + existing ledger triggers apply).
- UI: Bank Accounts page -> "Transfer money" button + "Recent transfers" (Zoho-imported transfers show too) with Undo.
  `src/lib/banking.ts`, `src/components/TransferMoneyModal.tsx`.

## Step 2b notes (from testing)
- Migration `20260971000000_money_accounts_opening_balances.sql`:
  - `_is_money_account(a)` (never NULL) / `money_accounts()`: active, non-header assets marked Bank (subtype 'bank'),
    linked to a bank account, or named petty cash / cash on hand / undeposited / job fund (receivable, inventory,
    prepaid etc. excluded); plus liabilities linked to a bank account. `money_transfer` uses the same rule.
  - `bank_account_set_opening_balance(bank, amount, date)`: one posted 'opening_balance' entry (source_id = bank id)
    against "Opening Balance Equity" (found by name, else created at 3900-3999 under 3000). Undo via
    `money_transfer_undo` (now accepts opening balances).
  - Chart accounts made from a bank account are named "Bank - Name ••1234"; step-1 ones renamed (only if unchanged).
- UI: Bank Accounts -> "Set opening balance" under each linked bank, "Cash, petty cash and fund accounts" section
  (add any asset from the chart = mark as Bank; remove = back to current asset).
