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
| 2 | Transfer money (from, to, amount, date, note, optional project) -> posted journal | |
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
