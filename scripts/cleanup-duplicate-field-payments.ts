// scripts/cleanup-duplicate-field-payments.ts
//
// One-time cleanup of duplicate field_payments rows (same worker_name,
// work_date, total_amount, notes — Zoho Bill.csv rows imported more than
// once before this session) and their matching gl_transactions (source_
// type='payroll', source_id=field_payments.id — an exact 1:1 link, not a
// count-based guess). Dry-run by default; --confirm required to write.
//
// Content as specified by Veron, with one confirmed fix applied:
// getAccount6120Balance() queried chart_of_accounts.account_code, which
// isn't a real column — chart_of_accounts' actual column is `code`
// (confirmed against 20260329190000_create_chart_of_accounts.sql:20 and
// every posting script this session, which all select "id, code, name,
// ..."). As originally written this call would have errored or silently
// returned null every time, disabling the script's own before/after
// balance sanity check without any visible failure. Fixed below to
// `.eq('code', '6120')`. No other logic changed.
//
// Depends on the get_duplicate_field_payments(p_company_id) SQL function
// (partitions by worker_name/work_date/total_amount/notes — notes added
// deliberately after an earlier pass without it produced 2 false-positive
// collisions between coincidentally-matching but genuinely different
// bills) — created separately in Supabase SQL Editor, not by this script.
//
// Usage:
//   npx tsx scripts/cleanup-duplicate-field-payments.ts            (dry run)
//   npx tsx scripts/cleanup-duplicate-field-payments.ts --confirm  (deletes)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const COMPANY_ID = '813ffe22-b75c-49c5-b41e-3ab185e2724c';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const EXPECTED_ROW_COUNT = 71;
const EXPECTED_TOTAL_AMOUNT = 4187190.00;

interface DuplicateRow {
  field_payment_id: string;
  worker_name: string;
  work_date: string;
  total_amount: number;
  notes: string;
  gl_transaction_id: string | null;
  gl_status: string | null;
  gl_amount: number | null;
}

async function getDuplicateList(): Promise<DuplicateRow[]> {
  const { data, error } = await supabase.rpc('get_duplicate_field_payments', {
    p_company_id: COMPANY_ID,
  });

  if (error) {
    throw new Error(`Failed to fetch duplicate list: ${error.message}`);
  }

  return data as DuplicateRow[];
}

function validate(rows: DuplicateRow[]): void {
  console.log(`\n--- VALIDATION ---`);
  console.log(`Rows returned: ${rows.length}`);

  if (rows.length !== EXPECTED_ROW_COUNT) {
    throw new Error(
      `STOP: Expected ${EXPECTED_ROW_COUNT} rows but got ${rows.length}. Data may have changed. Do not proceed.`
    );
  }

  const nullGl = rows.filter((r) => !r.gl_transaction_id);
  if (nullGl.length > 0) {
    console.error('Rows with NULL gl_transaction_id:', nullGl);
    throw new Error(`STOP: ${nullGl.length} rows have no matching gl_transaction. Do not proceed.`);
  }

  const notPosted = rows.filter((r) => r.gl_status !== 'posted');
  if (notPosted.length > 0) {
    console.error('Rows not in posted status:', notPosted);
    throw new Error(`STOP: ${notPosted.length} rows are not posted. Do not proceed.`);
  }

  const mismatch = rows.filter((r) => Number(r.gl_amount) !== Number(r.total_amount));
  if (mismatch.length > 0) {
    console.error('Rows with amount mismatch:', mismatch);
    throw new Error(`STOP: ${mismatch.length} rows have gl_amount != total_amount. Do not proceed.`);
  }

  const totalAmount = rows.reduce((sum, r) => sum + Number(r.total_amount), 0);
  console.log(`Total amount: ${totalAmount.toFixed(2)}`);
  if (Math.abs(totalAmount - EXPECTED_TOTAL_AMOUNT) > 0.01) {
    throw new Error(
      `STOP: Expected total ${EXPECTED_TOTAL_AMOUNT} but got ${totalAmount.toFixed(2)}. Do not proceed.`
    );
  }

  console.log('All validations passed.\n');
}

function printDryRun(rows: DuplicateRow[]): void {
  console.log('\n--- DRY RUN: ROWS THAT WOULD BE DELETED ---\n');
  console.table(
    rows.map((r) => ({
      field_payment_id: r.field_payment_id,
      worker_name: r.worker_name,
      work_date: r.work_date,
      total_amount: r.total_amount,
      notes: r.notes,
      gl_transaction_id: r.gl_transaction_id,
      gl_status: r.gl_status,
    }))
  );
  const total = rows.reduce((sum, r) => sum + Number(r.total_amount), 0);
  console.log(`\nTotal rows: ${rows.length}`);
  console.log(`Total amount: JMD ${total.toFixed(2)}`);
  console.log(`\nThis was a DRY RUN. No data was deleted.`);
  console.log(`To actually delete, run: npx tsx scripts/cleanup-duplicate-field-payments.ts --confirm\n`);
}

async function getAccount6120Balance(): Promise<number | null> {
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('current_balance')
    .eq('company_id', COMPANY_ID)
    .eq('code', '6120') // was 'account_code' — not a real column, fixed (see header)
    .maybeSingle();

  if (error || !data) {
    console.warn('Could not fetch account 6120 balance:', error?.message);
    return null;
  }
  return Number(data.current_balance);
}

async function performDelete(rows: DuplicateRow[]): Promise<void> {
  console.log('\n--- LIVE DELETE STARTING ---\n');

  const balanceBefore = await getAccount6120Balance();
  console.log(`Account 6120 balance BEFORE: ${balanceBefore}`);

  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const row of rows) {
    try {
      const { error: glError } = await supabase
        .from('gl_transactions')
        .delete()
        .eq('id', row.gl_transaction_id);

      if (glError) throw new Error(`gl_transactions delete failed: ${glError.message}`);

      const { error: fpError } = await supabase
        .from('field_payments')
        .delete()
        .eq('id', row.field_payment_id);

      if (fpError) throw new Error(`field_payments delete failed: ${fpError.message}`);

      succeeded.push(row.field_payment_id);
      console.log(`OK: ${row.worker_name} | ${row.work_date} | ${row.total_amount} | ${row.field_payment_id}`);
    } catch (err: any) {
      failed.push({ id: row.field_payment_id, error: err.message });
      console.error(`FAILED: ${row.worker_name} | ${row.field_payment_id} | ${err.message}`);
      console.error('\nSTOPPING due to failure. Do not re-run blindly.');
      console.error(`Succeeded so far (${succeeded.length}):`, succeeded);
      console.error(`Remaining/failed:`, rows.slice(succeeded.length).map((r) => r.field_payment_id));
      process.exit(1);
    }
  }

  console.log(`\nAll ${succeeded.length} rows processed successfully.`);

  const remaining = await getDuplicateList();
  console.log(`\nVerification: duplicate query now returns ${remaining.length} rows (expected 0).`);

  const balanceAfter = await getAccount6120Balance();
  console.log(`Account 6120 balance AFTER: ${balanceAfter}`);
  if (balanceBefore !== null && balanceAfter !== null) {
    console.log(`Change: ${(balanceAfter - balanceBefore).toFixed(2)}`);
  }
}

async function main() {
  const confirm = process.argv.includes('--confirm');

  const rows = await getDuplicateList();
  validate(rows);

  if (!confirm) {
    printDryRun(rows);
    return;
  }

  console.log('\n--confirm flag detected. Re-validating before delete...\n');
  const freshRows = await getDuplicateList();
  validate(freshRows);

  await performDelete(freshRows);
}

main().catch((err) => {
  console.error('\nSCRIPT ABORTED:', err.message);
  process.exit(1);
});
