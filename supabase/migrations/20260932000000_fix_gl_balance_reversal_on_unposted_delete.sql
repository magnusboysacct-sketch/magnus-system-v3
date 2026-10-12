-- Applied directly to the live database on 2026-10-11; this file version-controls it.
-- Fix: deleting the lines of a transaction that was never posted must not change any account balance.
--
-- update_account_balance() (20260820000000) gates its INSERT and UPDATE branches on the transaction being 'posted', but its DELETE
-- branch did not (this was flagged in that migration's notes as a known, separate issue). So deleting a DRAFT transaction, whose lines
-- go with it by ON DELETE CASCADE, subtracted amounts that were never added: e.g. deleting a never-posted 500.00 draft moved the debit
-- account to -500.00 and the credit account to +500.00.
--
-- The fix has two parts:
--   1. update_account_balance(): the DELETE branch now reverses a line only when its transaction is posted - or when the transaction row
--      is already gone, which is the cascade from deleting a POSTED transaction (unchanged behaviour: that still reverses). Everything else
--      in the function (INSERT / UPDATE branches, sign convention) is exactly as it was.
--   2. A BEFORE DELETE trigger on gl_transactions removes the lines of a draft or voided transaction while its header still exists,
--      so part 1 can see that it is not posted and skip the reversal. (A voided transaction never has its lines reversed on delete: a
--      draft that was voided was never applied, and a posted one is undone by its reversal entry, not by deleting it.)
-- Deleting a single line of a posted transaction, and deleting a posted transaction, behave exactly as before.
BEGIN;

CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
DECLARE
  old_account_type text;
  new_account_type text;
  old_signed numeric;
  new_signed numeric;
  net_change numeric;
  parent_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Reverse the line only if it was actually applied to the balance: i.e. its transaction is posted, or the transaction row is
    -- already gone because a POSTED transaction is being deleted (the delete_unposted_gl_transaction_lines trigger below removes the
    -- lines of draft/voided transactions while their header still exists, so those are skipped here).
    SELECT status INTO parent_status FROM gl_transactions WHERE id = OLD.transaction_id;
    IF parent_status IS NOT NULL AND parent_status <> 'posted' THEN
      RETURN OLD;
    END IF;
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

CREATE OR REPLACE FUNCTION delete_unposted_gl_transaction_lines()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'posted' THEN
    DELETE FROM gl_entries WHERE transaction_id = OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS delete_unposted_gl_transaction_lines ON gl_transactions;
CREATE TRIGGER delete_unposted_gl_transaction_lines
  BEFORE DELETE ON gl_transactions
  FOR EACH ROW
  EXECUTE FUNCTION delete_unposted_gl_transaction_lines();

COMMIT;
