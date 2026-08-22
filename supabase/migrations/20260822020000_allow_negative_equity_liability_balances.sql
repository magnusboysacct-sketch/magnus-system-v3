/*
  Fix: chart_of_accounts_check / chart_of_accounts_check1 wrongly forbid
  negative equity/liability balances

  Both constraints (confirmed live via pg_get_constraintdef, by Veron
  directly against the running database, not assumed from the migration
  file):
    chart_of_accounts_check:  CHECK (opening_balance >= 0 OR type = ANY (ARRAY['asset','expense','revenue']))
    chart_of_accounts_check1: CHECK (current_balance >= 0 OR type = ANY (ARRAY['asset','expense','revenue']))

  Both apply the SAME flawed rule: any account whose type is NOT
  asset/expense/revenue — i.e. every equity or liability account — is
  required to hold a non-negative opening_balance/current_balance. This
  is wrong. Negative equity and negative liability balances are normal,
  real states in double-entry accounting: an accumulated deficit (owner
  draws exceeding capital contributed — exactly the case that blocked
  the 52 Fund Transfer transactions below), a contra-liability position,
  or simply a company that has drawn out more than it has put in. There
  is nothing invalid about any of these.

  Confirmed the real, concrete failure this caused: attempting to post
  gl_transaction 8b4c42a5-4862-43da-8be5-9495d923a36d (a Fund Transfer
  "Money Paid to User" draw of $150,000 to account 3440, Enron Williams,
  type=equity) failed with "new row for relation chart_of_accounts
  violates check constraint chart_of_accounts_check1" — the update would
  have moved current_balance from 0.00 to -150,000.00, a completely
  normal draw-exceeding-contributed-capital state that this constraint
  wrongly treated as invalid. This explains all 52 of the Fund Transfer
  transactions left in draft after the original import (see
  scripts/post-fund-transfers.ts and this session's investigation
  leading up to this fix) — every one of them touches one of the four
  owner-specific accounts (2580, 2590 Enron/Veron Reimbursement; 3440,
  3450 Enron/Veron Williams equity), and every one of those postings
  would have hit this exact constraint.

  Fix: drop both constraints outright, with no narrower replacement.
  asset/expense/revenue already have NO sign restriction at all under
  the current rule (the "OR type = ANY(...)" clause exempts them
  entirely) — removing the restriction for equity/liability too doesn't
  introduce new laxity into the schema, it just makes all five account
  types behave consistently with how three of them already do. A
  magnitude/sanity bound (e.g. flagging an implausibly large negative
  balance as probably-wrong) would be a materially different kind of
  protection, not currently applied to any account type today, and out
  of scope for this fix.
*/

ALTER TABLE chart_of_accounts DROP CONSTRAINT IF EXISTS chart_of_accounts_check;
ALTER TABLE chart_of_accounts DROP CONSTRAINT IF EXISTS chart_of_accounts_check1;
