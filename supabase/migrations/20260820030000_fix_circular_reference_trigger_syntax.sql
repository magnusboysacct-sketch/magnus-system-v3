/*
  Fix: prevent_chart_of_accounts_circular_reference() has a bare SELECT
  with no destination

  Real, current function body (from 20260329190000_create_chart_of_accounts.sql,
  the original Chart of Accounts table creation — not something added this
  session):

    IF NEW.parent_id IS NOT NULL THEN
      WITH RECURSIVE parent_chain AS (
        SELECT parent_id, 1 as depth
        FROM chart_of_accounts
        WHERE id = NEW.id
        UNION ALL
        SELECT co.parent_id, pc.depth + 1
        FROM chart_of_accounts co
        JOIN parent_chain pc ON co.id = pc.parent_id
        WHERE pc.depth < 10
      )
      SELECT 1 FROM parent_chain WHERE parent_id = NEW.id;   -- <-- the bug

      IF FOUND THEN
        RAISE EXCEPTION 'Circular reference detected in account hierarchy';
      END IF;
    END IF;

  The recursive CTE's intent is clear and correct: walk up NEW's own
  ancestor chain (capped at depth 10, matching the table's own
  CHECK(level <= 10)), and check whether NEW.id ever reappears as
  someone's parent_id in that chain — i.e., would this account end up
  being its own ancestor. That's exactly right for cycle detection.

  The bug is the final SELECT: in a PL/pgSQL function body, a bare SELECT
  used as its own statement (not assigned via INTO, not a RETURN QUERY)
  has nowhere to put its result rows — hence Postgres's own error, "query
  has no destination for result data," with the exact hint Postgres gives:
  "If you want to discard the results of a SELECT, use PERFORM instead."

  A first attempt at this fix swapped SELECT for PERFORM in place and hit
  a second, different error: WITH can only prefix SELECT/INSERT/UPDATE/
  DELETE — PERFORM is a PL/pgSQL-only pseudo-statement, not one of those,
  so "WITH RECURSIVE parent_chain AS (...) PERFORM ..." is its own syntax
  error, independent of the first one.

  Real fix: SELECT EXISTS(...) INTO a boolean variable, with the entire
  WITH RECURSIVE ... SELECT construct living inside EXISTS()'s own
  parentheses rather than trying to prefix PERFORM directly. EXISTS()
  takes a subquery, and "WITH RECURSIVE ... SELECT ..." is itself a valid
  subquery wherever Postgres expects one — so this sidesteps both errors
  at once: it's a real SELECT with a real INTO destination (fixes the
  first error), and WITH is attached to a SELECT, not a PERFORM (fixes
  the second). No change to the actual cycle-detection logic itself —
  same recursive walk up NEW's ancestor chain, capped at depth 10.

  CONFIRMED IMPACT — this fires on BEFORE INSERT OR UPDATE ON
  chart_of_accounts, but the buggy branch only executes when
  NEW.parent_id IS NOT NULL, so it only ever fired for a non-root account.
  Checked every UPDATE call site against chart_of_accounts in the live
  app's src/ — there is exactly one: resolveSelfReferentialLinks in
  src/lib/import/entityConfigs.ts (Chart of Accounts import Pass 2, which
  sets parent_id + level after the main create/update pass, since every
  account is always inserted with parent_id=null in Pass 1). There is no
  separate Chart of Accounts edit UI anywhere in the app today, so no
  live "manual edit" flow has been silently broken by this — the only
  affected caller is that Pass 2 step.

  That UPDATE call's own error handling logs failures to the browser
  console and continues (deliberately, so one bad link doesn't abort
  linking for the rest of the batch) rather than surfacing them to the
  user — meaning every one of the 83 Chart of Accounts rows imported
  this session that has a real parent very likely silently failed to get
  its parent_id/level set at all, with no visible error at the time.
  Root-level accounts (no parent) were unaffected — their Pass 2 payload
  never includes parent_id, so they never entered the buggy branch, and
  did get level=1 set correctly. This needs its own follow-up repair
  once this fix is applied (re-running the Chart of Accounts import
  against the same source file is the safe path — verified in the report
  this migration accompanies, not asserted here) — flagged, not fixed in
  this migration, since it's a separate, connected data-repair step.
*/

CREATE OR REPLACE FUNCTION prevent_chart_of_accounts_circular_reference()
RETURNS TRIGGER AS $$
DECLARE
  is_circular boolean;
BEGIN
  -- Prevent self-reference
  IF NEW.id = NEW.parent_id THEN
    RAISE EXCEPTION 'Account cannot be its own parent';
  END IF;

  -- Prevent circular references by checking the parent chain
  IF NEW.parent_id IS NOT NULL THEN
    -- WITH RECURSIVE lives inside EXISTS()'s own subquery, not prefixed
    -- directly onto PERFORM (invalid — WITH can only attach to SELECT/
    -- INSERT/UPDATE/DELETE) — and SELECT EXISTS(...) INTO is_circular
    -- has a real destination for its result, unlike the original bare
    -- SELECT. Same recursive walk up NEW's own ancestor chain as before,
    -- capped at depth 10 to match the table's own CHECK(level <= 10).
    SELECT EXISTS (
      WITH RECURSIVE parent_chain AS (
        SELECT parent_id, 1 as depth
        FROM chart_of_accounts
        WHERE id = NEW.id

        UNION ALL

        SELECT co.parent_id, pc.depth + 1
        FROM chart_of_accounts co
        JOIN parent_chain pc ON co.id = pc.parent_id
        WHERE pc.depth < 10
      )
      SELECT 1 FROM parent_chain WHERE parent_id = NEW.id
    ) INTO is_circular;

    IF is_circular THEN
      RAISE EXCEPTION 'Circular reference detected in account hierarchy';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
