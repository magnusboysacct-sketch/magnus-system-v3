/*
  Backfill gl_transactions.currency USD -> JMD, and fix the column default

  Root cause confirmed directly in the tracked migration
  (20260329190001_create_general_ledger.sql:43): the column has
  `currency text DEFAULT 'USD'`. None of the 7 posting scripts run this
  session (post-expenses.ts through post-field-payments.ts) ever set
  currency explicitly on insert, so every one of the 2287 transactions
  they created auto-filled 'USD' — even though this is a Jamaican company
  where JMD is correct for virtually everything. Confirmed live via the
  General Ledger tab showing "USD" across the board.

  ── The 3 excluded rows ──────────────────────────────────────────────────
  Investigated via a dry-run classification query (matching gl_entries.
  account_id against every chart_of_accounts row with "USD" in its name,
  not just assuming code 1700 was the only one) and confirmed by Veron via
  a direct follow-up query: exactly 3 gl_transactions rows genuinely touch
  Savings Account USD (code 1700) — all real Fund Transfer transactions
  posted earlier this session at their real USD face value:
    - FT-1787322214696-jv5grm  $200.00   (55613081-9bba-4080-acee-fafb39b33fee)
    - FT-1787322210638-illmbr  $107.87   (cfd70341-ee8d-4409-a42d-9b0f8b066853)
    - FT-1787322212317-15l9eh  $159.95   (e9e154c8-6807-4b4c-9c11-59cafa574b30)
  These 3 are excluded by explicit id, not by any broader account-matching
  logic re-run inside this migration — precise and auditable against the
  dry-run's own findings, not a live re-derivation that could disagree
  with what was actually reviewed and approved.

  The remaining 2284 rows (confirmed total $116,944,246.79) are backfilled
  to currency='JMD'. This is a plain UPDATE, not a constraint change — no
  NOT VALID/dynamic-constraint-name pattern needed here, unlike the
  earlier company_invitations_role_check fix this session.

  Scope: gl_transactions.currency only, this company only
  (813ffe22-b75c-49c5-b41e-3ab185e2724c). No other table or file touched.
*/

-- 1. Fix the default so every future insert lands on the real company
--    currency, not the schema's original placeholder.
ALTER TABLE gl_transactions
  ALTER COLUMN currency SET DEFAULT 'JMD';

-- 2. Backfill existing rows — explicit id exclusion for the 3 confirmed
--    real USD transactions, scoped to this company only.
UPDATE gl_transactions
SET currency = 'JMD'
WHERE company_id = '813ffe22-b75c-49c5-b41e-3ab185e2724c'
  AND currency = 'USD'
  AND id NOT IN (
    '55613081-9bba-4080-acee-fafb39b33fee', -- FT-1787322214696-jv5grm, $200.00
    'cfd70341-ee8d-4409-a42d-9b0f8b066853', -- FT-1787322210638-illmbr, $107.87
    'e9e154c8-6807-4b4c-9c11-59cafa574b30'  -- FT-1787322212317-15l9eh, $159.95
  );
