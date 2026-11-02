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
| 3a | Books start date + invoices to the books (AR / revenue / GCT) + opening receivables | done (20260972) |
| 3b | Client payments: "Deposited to" + post (bank / AR), advances (bank / Client Advances) | done (20260973) |
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

## Step 3a notes
- Working company for testing: "Veron" (sandbox). The real Magnus Boy's company has Zoho-imported entries in the books;
  the rules below never reverse or duplicate entries they didn't make (they only manage client_invoices.gl_transaction_id).
- Migration `20260972000000_books_start_invoices_to_books.sql`:
  - company_settings.books_start_date / default_revenue_account_id; client_invoices.revenue_account_id /
    gl_transaction_id / ledger_note / ledger_signature.
  - `_gl_post(...)` (header -> lines -> posted) and `_gl_reverse(id, reason)` shared helpers.
  - BEFORE INSERT/UPDATE/DELETE trigger `invoice_to_books`: issued (sent/partial/paid/overdue) on/after the start date ->
    DR AR total / CR revenue (total - GCT) / CR GCT Payable; change of total/GCT/date/project/revenue account -> reverse +
    repost; draft/cancelled/deleted -> reverse. Errors never block the invoice: they go to ledger_note.
  - `set_books_start_date(date, revenue)` (director/admin): opening receivables per unpaid pre-start invoice
    (total - payments before the date) DR AR / CR Opening Balance Equity at the start date; changeable until invoices
    after it are in the books.
  - Fix: credit cards / lines of credit filed under the chart's credit card heading by name (standard chart: 2500),
    never 2400 "Client Advances and Deposits".
- UI: Bank Accounts -> "Books start date" card; Accounts Receivable list shows "In the books" or the note.

## Step 3b notes
- Migration `20260973000000_client_payments_to_books.sql`: client_payments.deposit_account_id / gl_transaction_id /
  ledger_note / ledger_signature; BEFORE INSERT/UPDATE/DELETE trigger `client_payment_to_books`:
  invoice payment DR deposit / CR AR; advance (project, no invoice) DR deposit / CR Client Advances; neither -> CR AR
  (payment on account). Applying an advance (invoice_id set) re-posts it as an invoice payment. Empty deposit ->
  primary bank account's chart account, else Undeposited Funds. Only manages its own entries; never blocks saving.
  set_books_start_date also locks on payments and touches payments after the date; companies with a start date
  already set get their payments brought in by the migration.
- UI: "Deposited to" on Record Payment and Record Advance (Accounts Receivable). EstimatesPage / BOQ invoice paths
  use the automatic default.

## Step 3c - apply an advance to an invoice (full or part)
- Migration `20260974000000_apply_advance_to_invoice.sql`: client_payments.applied_from_payment_id / applied_on;
  `apply_advance(advance, invoice, amount, date)` splits the advance: a new payment row on the invoice (advance's
  date / bank / method, applied_on = date), the advance's amount reduced. Books via the 3b payment rule: Client
  Advances down, AR down, bank unchanged; totals of money received never double count. Checks: same company & client,
  invoice issued, same project (or none), not above what is owed / left. AFTER DELETE trigger gives a deleted applied
  part back to its advance. fetchUnappliedAdvances skips advances at 0.
- UI: "Apply to invoice" on each unapplied advance (Accounts Receivable), with 10/20/25/50% of invoice shortcuts.
- Also: Record Payment saves once (button disabled while saving) and never above what is owed.

## Step 4a: bills into the books (done)

Migration `20260975000000_bills_to_books.sql`:
- A bill (supplier, subcontractor or workman) posts when it is **approved** (also partial / paid), dated on or after the books start date:
  DR each line's cost account, DR GCT Input Credit, CR Supplier Payables (bill total less retention), CR Retention Payable.
- Pending (waiting for approval) and disputed bills are out of the books.
- `create_bill(p_bill, p_lines, p_approve)` saves the bill and its lines in one step; refuses a duplicate bill number from the same supplier.
- `approve_bill(id)`, `dispute_bill(id, reason)`: director, admin or office user only. A bill with payments can't be disputed.
- Bills dated before the start date go in as opening payables (DR Opening Balance Equity / CR Supplier Payables) when the start date is set.
- Error-handler fix for invoices, client payments and bills: if a change can't be posted, the old entry stays in the books and the row says "Your last change is not in the books yet".

Screens: Payables has **New bill** (src/components/NewBillModal.tsx, src/lib/bills.ts), with lines charged to cost accounts, GCT (15% button) and retention %. The detail shows "In the books", the cost account per line, retention held, and Approve / Dispute.

Next: 4b Pay bill (Paid from, part payments, retention release), then 4c bill from a received Purchase Order.

## Step 4b: paying bills (done)

Migration `20260976000000_bill_payments_to_books.sql`:
- Paying a bill: DR Supplier Payables / CR the bank, cash or card it was paid from. Paying out retention: DR Retention Payable / CR bank.
- `pay_bill(bill, amount, date, paid_from, method, reference, retention)`: director, admin or office user; the bill must be approved;
  never more than is owed now (bill total less retention less what is paid), retention only up to what is still held;
  "Paid from" must be a money account; the same payment saved twice within 2 minutes is refused.
- `undo_bill_payment(id)`: deletes the payment; the entry is reversed and the amount goes back on the bill.
- The bill's amount paid, balance and status (approved / partial / paid) are kept by a database trigger.
- Payments dated before the books start date stay out; the start date also locks once bill payments are in the books.

Screens: the bill detail has **Pay bill** (src/components/PayBillModal.tsx), **Pay retention**, and a Payments list with Undo.
Partly paid bills with only retention left show "Retention held" in the list.

Next: 4c bill from a received Purchase Order.

## Step 4b-2: proof of payment (done)

Migration `20260977000000_bill_payment_proof.sql`:
- supplier_payments: received_by_name, signature_data (PNG signed on the phone), signed_at, proof_path (photo in private-files
  under <company>/finance/bill-payments/: full finance access or the uploader can open it).
- pay_bill() takes the proof in the same step (the old 7-argument version is dropped). add_bill_payment_proof() adds it later
  (director, admin, office user, supervisor).
- A cash payment with no signature and no photo shows "Not signed yet" (banner on Payables) until proof is added.
- A signed receipt can't be changed and a proof photo can't be swapped (trigger). A payment with proof can only be undone by a director or admin.

Screens: Pay bill has the proof section (name, sign box, photo). Each payment has Receipt (print / save as PDF, with the
signature), Photo, Sign / add photo. Shared sign box: src/components/SignBox.tsx.

Next: 4b-3 supplier advances, then 4c bill from a received Purchase Order.

## Parish dropdowns, workers on bills (done)

Migration `20260978000000_parish_and_worker_suppliers.sql`: workers.parish (with its column grant), suppliers.parish,
suppliers.worker_id, supplier_for_worker(). New bill's "From" lists suppliers and the Workers list.

## Scan a bill (done)

Migration `20260979000000_bill_scan.sql`: supplier_invoices.bill_file_path (must be in <company>/receipts/...),
suppliers.supplier_type (supplier / contractor), supplier_for_worker() marks contractors.

New bill → **Scan the bill** (camera or a picture): the existing magnus-ai "scan_invoice" reading (magnusAI.scanBill) fills
in who it is from (matched to suppliers, then the Workers list), the number, dates, lines (with a guessed cost account) and GCT.
A name not in the list gets "Add as a supplier / a contractor". If the paper total differs from the lines + GCT, it warns.
The picture is filed in the monthly receipts folder (receipts/<year>/<month of the bill date>/) and kept with the bill:
the bill detail has **View bill**, or **Attach bill picture** for bills entered without one.
If scanning is off for the company or the picture can't be read, the bill is typed in and the picture is still saved.

## Step 4b-3: advances to suppliers and contractors (done)

Migration `20260980000000_supplier_advances.sql`:
- Giving an advance: DR Advances to Suppliers and Subcontractors (asset, made under 1300 Prepaid Expenses the first time,
  code 1330+) / CR bank, cash or card. Not a cost until it is used on their bill.
- supplier_payments: is_advance, project_id, applied_from_payment_id, applied_on.
- pay_supplier_advance(): with proof (signature / photo) like a bill payment; double saves refused.
- apply_supplier_advance(advance, bill, amount, date): same supplier only, bill approved, never more than is left on the advance
  or owed on the bill (less retention). The advance is split: the part used becomes a payment on the bill (DR Payables / CR bank),
  the advance goes down (its entry re-posts) - net: Advances down, Payables down, bank unchanged.
- Unapply (undo on the bill) gives the amount back to the advance (trigger). An advance partly used must be unapplied before undo.

Screens: Payables header **Give advance**; an "Advances not used up yet" card (Receipt, Sign / add photo, Undo);
bill detail **Use advance** (when that supplier has an advance left); parts used show "From advance ADV-0001" with **Unapply**.

Next: 4c bill from a received Purchase Order.

## Step 4c: bill from a Purchase Order (done)

Migration `20260981000000_bill_from_purchase_order.sql`:
- po_lines_to_bill(po): each PO line - ordered, received (delivered_qty), already billed (not counting disputed bills),
  left to bill, PO price.
- create_bill_from_po(po, bill, lines, approve): links the bill to the PO and each line to its PO line; three-way match per line
  (price vs PO, quantity vs received and not billed yet, nothing received) into match_status / match_notes, and on the bill
  (three_way_match_status matched / discrepancy, po_matched, receiving_matched). A bill that doesn't match can't be approved in
  the same step: it is saved waiting for approval for a director to check (approve_bill as usual).
- The PO's supplier is used; a PO with only a typed supplier name links to (or adds) that supplier.
- The old automatic matcher triggers on supplier_invoice_line_items (20260315172743) are dropped: they checked PO statuses
  Magnus doesn't use, could approve bills by themselves and wrote values the table refuses. Nothing in the app called them.

Screens: Payables **From a PO** (src/components/BillFromPOModal.tsx), and **Enter supplier bill** on an issued /
delivered Purchase Order (opens /accounts-payable?po=<id>). Flags show on the bill's lines.

Next: Step 5 - bank statements and matching.
