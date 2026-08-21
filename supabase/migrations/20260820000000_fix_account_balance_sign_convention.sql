/*
  Fix: update_account_balance() sign-convention bug

  chart_of_accounts enforces (see 20260329190000_create_chart_of_accounts.sql):
    CHECK(current_balance >= 0 OR type IN ('asset', 'expense', 'revenue'))
  i.e. liability and equity accounts must always hold a non-negative,
  normal-balance-signed current_balance (credit-positive).

  But the trigger that maintains current_balance applied the SAME formula
  (debit - credit) to every account type, with no branch by type. That's
  correct for debit-normal accounts (asset, expense) but backwards for
  credit-normal accounts (liability, equity, revenue): a completely normal
  credit-heavy liability balance (e.g. Accounts Payable after a bill is
  received) computes as NEGATIVE under that formula, which either violates
  the CHECK constraint above outright (liability/equity - insert rejected)
  or silently posts an inverted-sign balance (revenue, which the CHECK
  exempts from the >=0 requirement, so it doesn't hard-fail, just reads
  backwards everywhere current_balance is summed, e.g.
  FinanceDashboardPage.tsx's per-type totals).

  This fixes update_account_balance() to branch by the account's own type,
  exactly matching the already-correct reference implementation in
  JournalEntryPage.tsx's manual posting flow:
    const change = ["asset","expense"].includes(acct.type)
      ? debit - credit
      : credit - debit;

  This is the authoritative, trigger-level fix — every insert path (the
  postingEngine.ts functions, JournalEntryPage.tsx's manual entries, and
  the upcoming retroactive posting) goes through this same trigger, so
  fixing it here fixes it everywhere at once, rather than requiring every
  caller to separately patch around it (which is what JournalEntryPage.tsx
  had been doing with its own follow-up UPDATE).

  Deliberately narrow in scope, matching what was reviewed and approved:
  ONLY the sign-convention arithmetic is changed. The original control
  flow (which branch runs for INSERT/UPDATE/DELETE, and the "same
  transaction_id" grouping condition for UPDATE) is preserved exactly as
  it was. Two additional, separate pre-existing issues were found while
  reading this function closely but are NOT touched here, since they
  change behavior beyond the sign fix that was approved — flagged
  separately for review, not silently folded in:
    1. The DELETE branch never checked whether the transaction being
       deleted from was actually 'posted' (unlike INSERT/UPDATE, which
       both gate on it) - so deleting an entry that belonged to a DRAFT
       transaction would incorrectly decrement a balance that was never
       incremented for it in the first place. Preserved as-is here.
    2. The UPDATE "same transaction" branch nets NEW vs OLD purely by
       transaction_id match, without checking account_id also stayed the
       same - if a line were ever reassigned to a different account
       within the same transaction, the original logic (and this fix)
       would net the change onto NEW.account_id only, not correctly
       debit the old account and credit the new one. Preserved as-is here.
*/

CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
DECLARE
  old_account_type text;
  new_account_type text;
  old_signed numeric;
  new_signed numeric;
  net_change numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT type INTO old_account_type FROM chart_of_accounts WHERE id = OLD.account_id;
    -- Signed so that a positive value always means "more of this
    -- account's own normal balance" - debit-normal for asset/expense,
    -- credit-normal for liability/equity/revenue.
    old_signed := CASE WHEN old_account_type IN ('asset', 'expense')
                    THEN OLD.debit - OLD.credit
                    ELSE OLD.credit - OLD.debit
                  END;
    UPDATE chart_of_accounts
    SET current_balance = current_balance - old_signed
    WHERE id = OLD.account_id;

  ELSIF TG_OP = 'INSERT' THEN
    SELECT type INTO new_account_type FROM chart_of_accounts WHERE id = NEW.account_id;
    new_signed := CASE WHEN new_account_type IN ('asset', 'expense')
                    THEN NEW.debit - NEW.credit
                    ELSE NEW.credit - NEW.debit
                  END;
    -- Only update if the transaction is posted (unchanged from original).
    UPDATE chart_of_accounts
    SET current_balance = current_balance + new_signed
    WHERE id = NEW.account_id
    AND EXISTS (
      SELECT 1 FROM gl_transactions
      WHERE id = NEW.transaction_id
      AND status = 'posted'
    );

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.transaction_id = NEW.transaction_id THEN
      -- Same transaction, update difference. Type-branched net_change
      -- replaces the original unconditional (NEW.debit-NEW.credit) -
      -- (OLD.debit-OLD.credit) formula.
      SELECT type INTO new_account_type FROM chart_of_accounts WHERE id = NEW.account_id;
      net_change := CASE WHEN new_account_type IN ('asset', 'expense')
                      THEN (NEW.debit - NEW.credit) - (OLD.debit - OLD.credit)
                      ELSE (NEW.credit - NEW.debit) - (OLD.credit - OLD.debit)
                    END;
      UPDATE chart_of_accounts
      SET current_balance = current_balance + net_change
      WHERE id = NEW.account_id
      AND EXISTS (
        SELECT 1 FROM gl_transactions
        WHERE id = NEW.transaction_id
        AND status = 'posted'
      );
    ELSE
      -- Transaction changed, remove old and add new.
      SELECT type INTO old_account_type FROM chart_of_accounts WHERE id = OLD.account_id;
      old_signed := CASE WHEN old_account_type IN ('asset', 'expense')
                      THEN OLD.debit - OLD.credit
                      ELSE OLD.credit - OLD.debit
                    END;
      UPDATE chart_of_accounts
      SET current_balance = current_balance - old_signed
      WHERE id = OLD.account_id
      AND EXISTS (
        SELECT 1 FROM gl_transactions
        WHERE id = OLD.transaction_id
        AND status = 'posted'
      );

      SELECT type INTO new_account_type FROM chart_of_accounts WHERE id = NEW.account_id;
      new_signed := CASE WHEN new_account_type IN ('asset', 'expense')
                      THEN NEW.debit - NEW.credit
                      ELSE NEW.credit - NEW.debit
                    END;
      UPDATE chart_of_accounts
      SET current_balance = current_balance + new_signed
      WHERE id = NEW.account_id
      AND EXISTS (
        SELECT 1 FROM gl_transactions
        WHERE id = NEW.transaction_id
        AND status = 'posted'
      );
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
