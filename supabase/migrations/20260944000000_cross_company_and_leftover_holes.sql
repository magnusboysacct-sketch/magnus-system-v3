-- Security: cross-company holes and leftovers (run after 20260942000000 and 20260943000000).
--
--  1. 31 SECURITY DEFINER functions took a project / contract / procurement / BOQ / invoice / transaction ... id and worked on it for ANY signed-in user, whatever
--     company the record belongs to. Each now refuses ('Not allowed') unless the record's company is the caller's company (the service role and direct database
--     connections are still allowed). Same wrapper pattern as before: the original body is kept as <name>_unchecked, closed to clients, so every role check or
--     other logic the function already had still runs after the new check.
--  2. takeoff_measurement_tags had a PUBLIC "USING true" policy (anyone with the public key could read and write it). Now: staff of the owning company.
--  3. Policy sweep: "true" policies on takeoff_groups / takeoff_measurements / takeoff_sessions (they cancelled the company-scoped policies next to them),
--     takeoff_pages, change_orders (insert) and material_price_history are company-scoped now. Left on purpose (shared reference data): master_categories,
--     master_units, rate_update_batches (read), calc_items / calc_fields / calc_formulas (tied to cost_items, whose own policy decides).
--  4. user_profiles: (a) ANY signed-in user could update their own row freely, including role, company_id and finance_access_level (so they could make
--     themselves director, or move themselves into another company): a trigger now blocks that. (b) colleagues can no longer read each other's TRN,
--     employee number or ID card dates: column-level SELECT; the owner of the row and payroll staff (director / admin / secretary) read them through
--     get_staff_hr_fields().
--  5. workers: bank account number, bank routing number and SSN last 4 are no longer readable or writable by ordinary signed-in users (column privileges);
--     payroll staff (director / admin / secretary) use get_worker_payroll_fields() / set_worker_payroll_fields(). Every other worker column is unchanged.
--
--  6. Sign-up: handle_new_user (the trigger on auth.users) put a new account into ANY company when the sign-up form's user metadata named that company
--     (company_id + invited_role), so anyone could join a company as its director from the public /login page. It now links an invited user only when a pending,
--     unexpired invitation for that e-mail in that company exists (the admin-invite-user function writes it first), and takes the role from the invitation.
--  7. A company can never lose its last active director through the API (role change or disabling, including a director doing it to themselves).
--
-- Functions created here start with REVOKE ALL ... FROM PUBLIC, anon.  Read-only on data.

BEGIN;

-- ── 0. Record -> company lookups (owner-only helpers used by the wrappers; NULL when the record does not exist, which the check treats as "not allowed") ────
CREATE OR REPLACE FUNCTION public._company_of_project(p uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT company_id FROM projects WHERE id = p $$;
CREATE OR REPLACE FUNCTION public._company_of_procurement(p uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT pr.company_id FROM procurement_headers h JOIN projects pr ON pr.id = h.project_id WHERE h.id = p $$;
CREATE OR REPLACE FUNCTION public._company_of_procurement_item(p uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT pr.company_id FROM procurement_items i JOIN projects pr ON pr.id = i.project_id WHERE i.id = p $$;
CREATE OR REPLACE FUNCTION public._company_of_contract(p uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT company_id FROM client_contracts WHERE id = p $$;
CREATE OR REPLACE FUNCTION public._company_of_billing_item(p uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT company_id FROM contract_billing_items WHERE id = p $$;
CREATE OR REPLACE FUNCTION public._company_of_boq(p uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT company_id FROM boq_headers WHERE id = p $$;
CREATE OR REPLACE FUNCTION public._company_of_boq_legacy(p uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT pr.company_id FROM boqs b JOIN projects pr ON pr.id = b.project_id WHERE b.id = p $$;
CREATE OR REPLACE FUNCTION public._company_of_boq_section(p uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT company_id FROM boq_sections WHERE id = p $$;
CREATE OR REPLACE FUNCTION public._company_of_assembly(p uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT company_id FROM assemblies WHERE id = p $$;
CREATE OR REPLACE FUNCTION public._company_of_po(p uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT company_id FROM purchase_orders WHERE id = p $$;
CREATE OR REPLACE FUNCTION public._company_of_po_item(p uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT po.company_id FROM purchase_order_items i JOIN purchase_orders po ON po.id = i.purchase_order_id WHERE i.id = p $$;
CREATE OR REPLACE FUNCTION public._company_of_receiving(p uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT company_id FROM receiving_documents WHERE id = p $$;
CREATE OR REPLACE FUNCTION public._company_of_supplier_invoice(p uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT company_id FROM supplier_invoices WHERE id = p $$;
CREATE OR REPLACE FUNCTION public._company_of_credit_card_transaction(p uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT company_id FROM credit_card_transactions WHERE id = p $$;
CREATE OR REPLACE FUNCTION public._company_of_bank_transaction(p uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT company_id FROM bank_transactions WHERE id = p $$;
CREATE OR REPLACE FUNCTION public._company_of_user(p uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT company_id FROM user_profiles WHERE id = p $$;

-- Rate batches have no owner column: the rates in a batch belong to cost items. A batch whose rates are all on ONE company's items is that company's; a batch on the
-- shared catalogue items (no company, which is every batch today) can be undone by a director / admin only; a batch that mixes companies is refused.
CREATE OR REPLACE FUNCTION public._may_undo_rate_batch(p uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_n integer; v_company uuid;
BEGIN
  IF public._caller_may_use_company(NULL) THEN RETURN true; END IF;   -- service role / direct database connection
  IF NOT EXISTS (SELECT 1 FROM rate_update_batches WHERE id = p) THEN RETURN false; END IF;
  SELECT count(DISTINCT ci.company_id), (array_agg(DISTINCT ci.company_id))[1] INTO v_n, v_company
    FROM cost_item_rates r JOIN cost_items ci ON ci.id = r.cost_item_id WHERE r.batch_id = p AND ci.company_id IS NOT NULL;
  IF v_n = 0 THEN RETURN public._payroll_admin_company() IS NOT NULL; END IF;
  IF v_n = 1 THEN RETURN public._caller_may_use_company(v_company); END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public._company_of_project(uuid), public._company_of_procurement(uuid), public._company_of_procurement_item(uuid), public._company_of_contract(uuid),
  public._company_of_billing_item(uuid), public._company_of_boq(uuid), public._company_of_boq_legacy(uuid), public._company_of_boq_section(uuid), public._company_of_assembly(uuid),
  public._company_of_po(uuid), public._company_of_po_item(uuid), public._company_of_receiving(uuid), public._company_of_supplier_invoice(uuid),
  public._company_of_credit_card_transaction(uuid), public._company_of_bank_transaction(uuid), public._company_of_user(uuid), public._may_undo_rate_batch(uuid)
  FROM PUBLIC, anon, authenticated;

-- ── 1. The 31 functions ──────────────────────────────────────────────────────────────────────────────────────────────────────
-- [signature, check]: the check is a boolean expression over the function's own argument names. Generated from the catalog, so the signatures cannot drift;
-- stops (changes nothing) if one of them is missing or not SECURITY DEFINER any more.
DO $$
DECLARE
  v_rows text[] := ARRAY[
    'add_assembly_to_section(uuid, uuid, numeric)',            'public._caller_may_use_company(public._company_of_boq_section(p_section_id)) AND public._caller_may_use_company(public._company_of_assembly(p_assembly_id))',
    'approve_procurement(uuid, uuid, text)',                   'public._caller_may_use_company(public._company_of_procurement(procurement_id))',
    'calculate_contract_billing(uuid, date)',                  'public._caller_may_use_company(public._company_of_contract(p_contract_id))',
    'can_create_purchase_order(uuid)',                         'public._caller_may_use_company(public._company_of_procurement(procurement_id))',
    'can_user_approve_step(uuid, uuid)',                       'public._caller_may_use_company(public._company_of_procurement(p_document_id)) AND public._caller_may_use_company(public._company_of_user(p_user_id))',
    'create_receiving_from_procurement(uuid)',                 'public._caller_may_use_company(public._company_of_procurement(p_procurement_id))',
    'get_contract_billing_summary(uuid)',                      'public._caller_may_use_company(public._company_of_contract(p_contract_id))',
    'get_procurement_approval_info(uuid)',                     'public._caller_may_use_company(public._company_of_procurement(procurement_id))',
    'get_procurement_supplier_info(uuid)',                     'public._caller_may_use_company(public._company_of_procurement_item(procurement_item_id))',
    'get_project_costs_by_code(uuid)',                         'public._caller_may_use_company(public._company_of_project(p_project_id))',
    'get_project_finance_summary(uuid)',                       'public._caller_may_use_company(public._company_of_project(p_project_id))',
    'get_project_members(uuid)',                               'public._caller_may_use_company(public._company_of_project(p_project_id))',
    'get_receiving_history(uuid)',                             'public._caller_may_use_company(public._company_of_po(purchase_order_id))',
    'get_total_received_qty(uuid)',                            'public._caller_may_use_company(public._company_of_po_item(po_item_id))',
    'is_document_fully_approved(uuid)',                        'public._caller_may_use_company(public._company_of_procurement(p_document_id))',
    'perform_three_way_match(uuid)',                           'public._caller_may_use_company(public._company_of_supplier_invoice(p_supplier_invoice_id))',
    'reject_procurement(uuid, uuid, text)',                    'public._caller_may_use_company(public._company_of_procurement(procurement_id))',
    'save_boq(uuid, text, integer, jsonb, uuid)',              'public._caller_may_use_company(public._company_of_project(p_project_id)) AND (p_boq_id IS NULL OR public._caller_may_use_company(public._company_of_boq(p_boq_id)))',
    'submit_for_approval(uuid, uuid, text)',                   'public._caller_may_use_company(public._company_of_procurement(procurement_id))',
    'sync_boq_budget_to_cost_events(uuid)',                    'public._caller_may_use_company(public._company_of_boq(p_boq_id))',
    'sync_boq_budget_to_cost_events_old(uuid)',                'public._caller_may_use_company(public._company_of_boq_legacy(p_boq_id))',
    'sync_boq_to_billing_items(uuid)',                         'public._caller_may_use_company(public._company_of_contract(p_contract_id))',
    'sync_procurement_committed_to_cost_events(uuid)',         'public._caller_may_use_company(public._company_of_procurement(p_procurement_id))',
    'sync_receiving_delivered_to_cost_events(uuid)',           'public._caller_may_use_company(public._company_of_receiving(p_receiving_id))',
    'undo_rate_batch(uuid)',                                   'public._may_undo_rate_batch(p_batch_id)',
    'update_billing_item_after_invoice(uuid, numeric, numeric, numeric)', 'public._caller_may_use_company(public._company_of_billing_item(p_billing_item_id))',
    'upsert_project_member(uuid, uuid, text)',                 'public._caller_may_use_company(public._company_of_project(p_project_id)) AND public._caller_may_use_company(public._company_of_user(p_user_id))',
    'auto_approve_matched_invoice(uuid)',                      'public._caller_may_use_company(public._company_of_supplier_invoice(p_supplier_invoice_id))',
    'create_estimate_from_boq(uuid)',                          'public._caller_may_use_company(public._company_of_boq(p_boq_id))',
    'post_credit_card_liability(uuid, text, text)',            'public._caller_may_use_company(public._company_of_credit_card_transaction(p_transaction_id))',
    'update_transaction_match(uuid, text, text, uuid, numeric, text)', 'public._caller_may_use_company(public._company_of_bank_transaction(p_transaction_id))'];
  i       integer;
  s       text;
  v_check text;
  v_oid   oid;
  r       record;
  v_in    text;
  v_body  text;
  v_vol   text;
BEGIN
  FOR i IN 1 .. array_length(v_rows, 1) BY 2 LOOP
    s := v_rows[i]; v_check := v_rows[i + 1];
    v_oid := to_regprocedure('public.' || s);
    IF v_oid IS NULL THEN RAISE EXCEPTION 'Function public.% was not found. Nothing was changed.', s; END IF;

    SELECT p.proname, pg_get_function_arguments(p.oid) AS fa, pg_get_function_identity_arguments(p.oid) AS ia, pg_get_function_result(p.oid) AS res,
           (SELECT string_agg(u.t::regtype::text, ', ' ORDER BY u.o) FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY AS u(t, o)) AS ty,
           p.proretset, p.prorettype::regtype::text AS rt, p.provolatile, p.prosecdef
      INTO r FROM pg_proc p WHERE p.oid = v_oid;

    IF to_regprocedure(format('public.%I(%s)', r.proname || '_unchecked', r.ty)) IS NOT NULL THEN CONTINUE; END IF;   -- already wrapped (re-run)
    IF NOT r.prosecdef THEN RAISE EXCEPTION 'public.% is not SECURITY DEFINER any more. Nothing was changed.', s; END IF;

    SELECT string_agg(quote_ident(t.nm), ', ' ORDER BY t.ord) INTO v_in
      FROM pg_proc p,
           unnest(p.proargnames, coalesce(p.proargmodes, array_fill('i'::"char", ARRAY[cardinality(p.proargnames)]))) WITH ORDINALITY AS t(nm, md, ord)
     WHERE p.oid = v_oid AND t.md IN ('i', 'b', 'v');
    IF v_in IS NULL THEN RAISE EXCEPTION 'public.%: arguments have no names. Nothing was changed.', s; END IF;

    v_body := CASE
      WHEN r.rt = 'void'                          THEN format('PERFORM public.%I(%s);', r.proname || '_unchecked', v_in)
      WHEN r.proretset OR r.res LIKE 'TABLE(%'    THEN format('RETURN QUERY SELECT * FROM public.%I(%s);', r.proname || '_unchecked', v_in)
      ELSE                                             format('RETURN public.%I(%s);', r.proname || '_unchecked', v_in)
    END;
    v_vol := CASE r.provolatile WHEN 's' THEN 'STABLE' WHEN 'i' THEN 'IMMUTABLE' ELSE 'VOLATILE' END;

    EXECUTE format('ALTER FUNCTION public.%I(%s) RENAME TO %I', r.proname, r.ia, r.proname || '_unchecked');
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated, service_role', r.proname || '_unchecked', r.ia);
    EXECUTE format($f$CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql %s SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $b$
BEGIN
  IF coalesce(%s, false) IS NOT TRUE THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  %s
END;
$b$ $f$, r.proname, r.fa, r.res, v_vol, v_check, v_body);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.ia);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', r.proname, r.ia);
  END LOOP;
END $$;

-- ── 2. takeoff_measurement_tags: staff of the owning company only ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS company_members_takeoff_measurement_tags ON public.takeoff_measurement_tags;
DROP POLICY IF EXISTS takeoff_measurement_tags_company ON public.takeoff_measurement_tags;
CREATE POLICY takeoff_measurement_tags_company ON public.takeoff_measurement_tags FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.takeoff_measurements m WHERE m.id = takeoff_measurement_tags.measurement_id
                   AND m.company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.takeoff_measurements m WHERE m.id = takeoff_measurement_tags.measurement_id
                   AND m.company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid())));
REVOKE ALL ON public.takeoff_measurement_tags FROM PUBLIC, anon;

-- ── 3. Sweep ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- takeoff_groups / takeoff_measurements / takeoff_sessions each have four company-scoped policies ("... in their company") AND four "true" ones that cancelled them.
DROP POLICY IF EXISTS takeoff_groups_select ON public.takeoff_groups;       DROP POLICY IF EXISTS takeoff_groups_insert ON public.takeoff_groups;
DROP POLICY IF EXISTS takeoff_groups_update ON public.takeoff_groups;       DROP POLICY IF EXISTS takeoff_groups_delete ON public.takeoff_groups;
DROP POLICY IF EXISTS takeoff_measurements_select ON public.takeoff_measurements; DROP POLICY IF EXISTS takeoff_measurements_insert ON public.takeoff_measurements;
DROP POLICY IF EXISTS takeoff_measurements_update ON public.takeoff_measurements; DROP POLICY IF EXISTS takeoff_measurements_delete ON public.takeoff_measurements;
DROP POLICY IF EXISTS takeoff_sessions_select ON public.takeoff_sessions;   DROP POLICY IF EXISTS takeoff_sessions_insert ON public.takeoff_sessions;
DROP POLICY IF EXISTS takeoff_sessions_update ON public.takeoff_sessions;   DROP POLICY IF EXISTS takeoff_sessions_delete ON public.takeoff_sessions;

-- takeoff_pages has no company column of its own: it belongs to a takeoff session, which does.
DROP POLICY IF EXISTS takeoff_pages_select ON public.takeoff_pages;  DROP POLICY IF EXISTS takeoff_pages_insert ON public.takeoff_pages;
DROP POLICY IF EXISTS takeoff_pages_update ON public.takeoff_pages;  DROP POLICY IF EXISTS takeoff_pages_delete ON public.takeoff_pages;
DROP POLICY IF EXISTS takeoff_pages_company ON public.takeoff_pages;
CREATE POLICY takeoff_pages_company ON public.takeoff_pages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.takeoff_sessions s WHERE s.id = takeoff_pages.session_id
                   AND s.company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.takeoff_sessions s WHERE s.id = takeoff_pages.session_id
                   AND s.company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid())));

-- change_orders had one policy: any signed-in user could add a change order to ANY project. Now: to a project of their own company.
DROP POLICY IF EXISTS "Auth insert change orders" ON public.change_orders;
DROP POLICY IF EXISTS change_orders_insert_company ON public.change_orders;
CREATE POLICY change_orders_insert_company ON public.change_orders FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT p.id FROM public.projects p WHERE p.company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid())));

-- material_price_history: "ALL ... true"; it has a company column.
DROP POLICY IF EXISTS "Auth full access" ON public.material_price_history;
DROP POLICY IF EXISTS material_price_history_company ON public.material_price_history;
CREATE POLICY material_price_history_company ON public.material_price_history FOR ALL TO authenticated
  USING (company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid()))
  WITH CHECK (company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid()));

REVOKE ALL ON public.takeoff_groups, public.takeoff_measurements, public.takeoff_sessions, public.takeoff_pages, public.material_price_history FROM anon;

-- ── 4. user_profiles ─────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (a) Escalation guard. The UPDATE policies only say "it is your own row" (or "you are an admin"), and signed-in users have UPDATE on every column, so anyone could
--     set their own role / finance_access_level / company_id. Now: company and id never change through the API; role, status, finance access and the HR fields
--     (TRN, employee number, ID card dates) change only by a director or admin of that user's company; only a director may grant or take away the director role.
--     Everything else (name, photo, signature, job title) stays editable by its owner. The service role and direct database connections are unaffected.
CREATE OR REPLACE FUNCTION public._guard_user_profile_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_role text; v_company uuid;
BEGIN
  IF public._caller_may_use_company(NULL) THEN RETURN NEW; END IF;   -- service role / direct database connection
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Not allowed: a profile cannot change its id or company' USING ERRCODE = '42501';
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status OR NEW.finance_access_level IS DISTINCT FROM OLD.finance_access_level
     OR NEW.trn IS DISTINCT FROM OLD.trn OR NEW.employee_number IS DISTINCT FROM OLD.employee_number
     OR NEW.id_issued_date IS DISTINCT FROM OLD.id_issued_date OR NEW.id_expiry_date IS DISTINCT FROM OLD.id_expiry_date THEN
    SELECT up.role, up.company_id INTO v_role, v_company FROM user_profiles up WHERE up.id = auth.uid();
    IF v_role IS NULL OR v_role NOT IN ('director', 'admin') OR v_company IS DISTINCT FROM OLD.company_id THEN
      RAISE EXCEPTION 'Not allowed: only a director or admin of the company can change this' USING ERRCODE = '42501';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role AND (NEW.role = 'director' OR OLD.role = 'director') AND v_role <> 'director' THEN
      RAISE EXCEPTION 'Not allowed: only a director can grant or remove the director role' USING ERRCODE = '42501';
    END IF;
    -- the last active director of a company can be neither demoted nor disabled (by anyone, themselves included)
    IF coalesce(OLD.role, '') = 'director' AND coalesce(OLD.status, 'active') = 'active'
       AND (NEW.role IS DISTINCT FROM OLD.role OR coalesce(NEW.status, 'active') <> 'active') THEN
      IF NOT EXISTS (SELECT 1 FROM user_profiles o WHERE o.company_id = OLD.company_id AND o.id <> OLD.id AND o.role = 'director' AND coalesce(o.status, 'active') = 'active') THEN
        RAISE EXCEPTION 'Not allowed: a company must keep at least one active director' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._guard_user_profile_update() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS aa_guard_user_profile_update ON public.user_profiles;   -- "aa": runs before the other triggers on the table
CREATE TRIGGER aa_guard_user_profile_update BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public._guard_user_profile_update();

-- (b) Personal / tax fields: column privileges. Signed-in users keep SELECT on the columns the app shows for colleagues (name, role, e-mail, photo, job title,
--     signature, status, finance access level, company); trn, employee_number, id_issued_date and id_expiry_date are read through get_staff_hr_fields().
--     (A column added to user_profiles later needs its own GRANT SELECT.)
REVOKE SELECT ON public.user_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, company_id, full_name, email, role, status, job_title, avatar_url, signature_path, finance_access_level, created_at, updated_at)
  ON public.user_profiles TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.user_profiles FROM anon;

-- Own row: full. Director / admin / secretary (payroll staff): their company. Nobody else.
CREATE OR REPLACE FUNCTION public.get_staff_hr_fields(p_user_ids uuid[] DEFAULT NULL)
RETURNS TABLE(id uuid, trn text, employee_number text, id_issued_date date, id_expiry_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT up.id, up.trn, up.employee_number, up.id_issued_date, up.id_expiry_date
    FROM user_profiles up
   WHERE up.company_id = (SELECT me.company_id FROM user_profiles me WHERE me.id = auth.uid())
     AND (up.id = auth.uid() OR up.company_id = (SELECT public._payroll_staff_company()))
     AND (p_user_ids IS NULL OR up.id = ANY (p_user_ids));
$$;
REVOKE ALL ON FUNCTION public.get_staff_hr_fields(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_hr_fields(uuid[]) TO authenticated;

-- ── 5. workers: bank / SSN fields for payroll staff only ─────────────────────────────────────────────────────────────────────
-- Column privileges: every column except ssn_last_4, bank_account_number and bank_routing_number stays selectable / insertable / updatable exactly as before.
-- (The app never read or wrote these three; it only used select("*"), which it no longer does. A column added to workers later needs its own GRANT.)
DO $$
DECLARE v_cols text;
BEGIN
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_cols
    FROM pg_attribute a
   WHERE a.attrelid = 'public.workers'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname NOT IN ('ssn_last_4', 'bank_account_number', 'bank_routing_number');
  EXECUTE 'REVOKE SELECT, INSERT, UPDATE ON public.workers FROM PUBLIC, anon, authenticated';
  EXECUTE format('GRANT SELECT (%s), INSERT (%s), UPDATE (%s) ON public.workers TO authenticated', v_cols, v_cols, v_cols);
END $$;

CREATE OR REPLACE FUNCTION public.get_worker_payroll_fields(p_worker_ids uuid[] DEFAULT NULL)
RETURNS TABLE(id uuid, ssn_last_4 text, bank_account_number text, bank_routing_number text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT w.id, w.ssn_last_4, w.bank_account_number, w.bank_routing_number
    FROM workers w
   WHERE w.company_id = (SELECT public._payroll_staff_company())
     AND (p_worker_ids IS NULL OR w.id = ANY (p_worker_ids));
$$;

CREATE OR REPLACE FUNCTION public.set_worker_payroll_fields(p_worker_id uuid, p_ssn_last_4 text, p_bank_account_number text, p_bank_routing_number text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_n integer;
BEGIN
  IF (SELECT public._payroll_staff_company()) IS NULL THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  UPDATE workers SET ssn_last_4 = nullif(btrim(p_ssn_last_4), ''), bank_account_number = nullif(btrim(p_bank_account_number), ''),
                     bank_routing_number = nullif(btrim(p_bank_routing_number), ''), updated_at = now()
   WHERE id = p_worker_id AND company_id = (SELECT public._payroll_staff_company());
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.get_worker_payroll_fields(uuid[]), public.set_worker_payroll_fields(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_worker_payroll_fields(uuid[]), public.set_worker_payroll_fields(uuid, text, text, text) TO authenticated;

-- ── 5b. Sign-up (trigger on auth.users): user metadata can NAME a company but no longer decides it ─────────────────────────────────
-- Same function as before (same attributes, same new-company path) with one change: the "invited user" branch used raw_user_meta_data->>'company_id' and
-- ->>'invited_role' as typed by whoever called signUp. Now it needs a matching pending invitation, and the role comes from the invitation row.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_company_id    uuid;
  v_company_name  text;
  v_full_name     text;
  v_claimed_co_id uuid;
  v_inv_company   uuid;
  v_inv_role      text;
BEGIN
  v_full_name := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''), split_part(NEW.email, '@', 1));

  BEGIN v_claimed_co_id := (NEW.raw_user_meta_data->>'company_id')::uuid; EXCEPTION WHEN others THEN v_claimed_co_id := NULL; END;

  IF v_claimed_co_id IS NOT NULL THEN
    SELECT i.company_id, i.role INTO v_inv_company, v_inv_role
      FROM public.company_invitations i
     WHERE i.company_id = v_claimed_co_id
       AND lower(i.email) = lower(NEW.email)
       AND i.status = 'pending'
       AND (i.expires_at IS NULL OR i.expires_at > now())
     ORDER BY i.created_at DESC
     LIMIT 1;
  END IF;

  IF v_inv_company IS NOT NULL THEN
    -- ── INVITED USER: link to the inviting company with the invited role (from the invitation); do NOT create a new company.
    INSERT INTO public.user_profiles (id, company_id, email, full_name, role, finance_access_level, status)
    VALUES (NEW.id, v_inv_company, NEW.email, v_full_name, v_inv_role,
            CASE WHEN v_inv_role IN ('director', 'admin', 'accounts') THEN 'full' ELSE 'none' END, 'active')
    ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id, email = EXCLUDED.email, full_name = EXCLUDED.full_name,
                                   role = EXCLUDED.role, finance_access_level = EXCLUDED.finance_access_level;
    RETURN NEW;
  END IF;

  -- ── NEW SIGNUP (also: a sign-up that merely CLAIMS a company without an invitation): a new company, the person is its director.
  v_company_name := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'company_name'), ''), 'My Company');

  INSERT INTO public.companies (name) VALUES (v_company_name) RETURNING id INTO v_company_id;

  INSERT INTO public.user_profiles (id, company_id, email, full_name, role, finance_access_level, status)
  VALUES (NEW.id, v_company_id, NEW.email, v_full_name, 'director', 'full', 'active')
  ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id, email = EXCLUDED.email, full_name = EXCLUDED.full_name,
                                 role = EXCLUDED.role, finance_access_level = EXCLUDED.finance_access_level;

  INSERT INTO public.company_settings (company_id, company_name, trial_expires_at, subscription_status)
  VALUES (v_company_id, v_company_name, now() + interval '14 days', 'inactive')
  ON CONFLICT (company_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- ── 6. Safety checks: stop and change nothing if something unexpected is left ───────────────────────────────────────────────
-- (a) no "true" policy left on the tables fixed above; (b) the policy sets on them are exactly the expected ones
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.tablename, p.policyname FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND p.tablename IN ('takeoff_groups', 'takeoff_measurements', 'takeoff_sessions', 'takeoff_pages', 'takeoff_measurement_tags', 'change_orders', 'material_price_history')
       AND (coalesce(p.qual, '') ~ '^\(?true\)?$' OR coalesce(p.with_check, '') ~ '^\(?true\)?$')
  LOOP
    RAISE EXCEPTION 'Policy "%" on % is still "true". Nothing was changed.', r.policyname, r.tablename;
  END LOOP;

  FOR r IN
    SELECT p.tablename, p.policyname FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename IN ('takeoff_measurement_tags', 'takeoff_pages', 'change_orders', 'material_price_history')
       AND (p.tablename, p.policyname) NOT IN (
         ('takeoff_measurement_tags', 'takeoff_measurement_tags_company'), ('takeoff_pages', 'takeoff_pages_company'),
         ('change_orders', 'change_orders_insert_company'), ('material_price_history', 'material_price_history_company'))
  LOOP
    RAISE EXCEPTION 'Unexpected policy "%" on %. Nothing was changed.', r.policyname, r.tablename;
  END LOOP;

  -- the three takeoff tables must still have their company-scoped policies (so removing the "true" ones did not leave them without any)
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'takeoff_groups') < 4
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'takeoff_measurements') < 4
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'takeoff_sessions') < 4 THEN
    RAISE EXCEPTION 'takeoff_groups / takeoff_measurements / takeoff_sessions would be left without their company policies. Nothing was changed.';
  END IF;

  -- a policy for signed-out users (PUBLIC / anon, any schema) that calls a function anon cannot execute
  FOR r IN
    SELECT DISTINCT p.schemaname, p.tablename, p.policyname, f.proname
      FROM pg_policies p
      JOIN pg_proc f ON f.pronamespace = 'public'::regnamespace AND f.prokind = 'f' AND NOT has_function_privilege('anon', f.oid, 'EXECUTE')
     WHERE p.roles && ARRAY['public', 'anon']::name[]
       AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ~ ('(^|[^a-zA-Z0-9_])' || f.proname || '\s*\(')
  LOOP
    RAISE EXCEPTION 'Policy % on %.% (for signed-out users) calls %(), which anon cannot execute. Nothing was changed.', r.policyname, r.schemaname, r.tablename, r.proname;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
