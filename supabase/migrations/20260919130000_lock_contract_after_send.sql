-- Block edits to a contract's key terms once it has been sent to, or signed by, the client.
BEGIN;

CREATE OR REPLACE FUNCTION public.client_contracts_lock_after_send()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- Not sent and not signed: edit freely
  IF OLD.shared_at IS NULL AND OLD.client_signed_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF ROW(NEW.contract_number, NEW.contract_name, NEW.contract_date, NEW.start_date,
         NEW.completion_date, NEW.contract_amount, NEW.retention_percent, NEW.payment_terms,
         NEW.billing_schedule, NEW.scope_of_work, NEW.terms_and_conditions,
         NEW.warranty_period_months, NEW.penalty_clause, NEW.insurance_details,
         NEW.governing_law, NEW.client_id, NEW.project_id, NEW.estimate_id)
     IS DISTINCT FROM
     ROW(OLD.contract_number, OLD.contract_name, OLD.contract_date, OLD.start_date,
         OLD.completion_date, OLD.contract_amount, OLD.retention_percent, OLD.payment_terms,
         OLD.billing_schedule, OLD.scope_of_work, OLD.terms_and_conditions,
         OLD.warranty_period_months, OLD.penalty_clause, OLD.insurance_details,
         OLD.governing_law, OLD.client_id, OLD.project_id, OLD.estimate_id)
  THEN
    IF OLD.client_signed_at IS NOT NULL THEN
      RAISE EXCEPTION 'This contract has been signed by the client and can no longer be edited';
    ELSE
      RAISE EXCEPTION 'This contract has been sent to the client. Withdraw it before editing';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_contracts_lock ON public.client_contracts;
CREATE TRIGGER trg_client_contracts_lock
  BEFORE UPDATE ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.client_contracts_lock_after_send();

COMMIT;
