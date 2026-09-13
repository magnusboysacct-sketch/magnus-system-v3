// scripts/migrate-float-waterproof-cement-estimate.ts
//
// One-time migration for float_coat and waterproof_render's Portland Cement
// constant. Both templates shared the exact same suspect constant (0.057),
// which cross-checked as implausible against rough_render's now-corrected,
// same-family cement rate (rough_render's sand tracked float_coat/waterproof
// render's sand almost exactly; cement was ~7.9x too low) — the same shape
// of anomaly that originally exposed rough_render's bug. waterproof_render's
// formula was evidently copy-pasted from float_coat's, since it carried the
// identical digit.
//
// IMPORTANT — this is an ESTIMATE, not a confirmed trade rate: the user does
// not have a real-world coverage figure for these two coats, so the
// replacement constant is scaled proportionally from rough_render's
// user-confirmed real rate (16 sqft/bag at 15mm = 0.673 bags/m²), assuming
// roughly linear cement usage per mm thickness:
//   float_coat        (10mm reference): 0.673 / 15 * 10 = 0.4487 bags/m²
//   waterproof_render  (6mm reference): 0.673 / 15 * 6  = 0.2692 bags/m²
// If a real trade rate for either coat becomes available later, both the
// AssemblyWizard.tsx constant and this script's OLD/NEW pair (for any
// further catch-up) should be revisited.
//
// Sand is NOT touched — already confirmed clean in both templates (its rate
// tracked rough_render's corrected sand rate to within ~2%) — only the
// Portland Cement line's formula text is a candidate for update.
//
// Matching strategy — EXACT OLD FORMULA TEXT, not sort_order position, same
// reason as every prior migration this session: handleSave() only inserts
// rows for components matched/kept during the wizard's review step (skipped
// ones never got a row), so sort_order is contiguous over a SUBSET of the
// full generated set, not the whole thing — positional matching would
// silently misalign the moment a component was skipped. A saved row whose
// formula text doesn't exactly match an OLD candidate produces no match
// (nothing to update, not an error — it may already be corrected, may have
// been skipped, or may use dims this script doesn't know how to recompute).
// More than one saved row matching the same OLD text flags that assembly and
// leaves it completely untouched rather than guessing.
//
// Does NOT touch metadata.configurable_options, sand/aggregate formulas, or
// cost_item_id — only the Portland Cement row's notes (formula text) on
// these 2 templates. Hand-built assemblies (no metadata.wizard_type) are
// never touched.
//
// Re-run safe: once a row's formula text contains the new constant
// (0.4487/0.2692), it will never again exactly match an OLD candidate
// (which always contains 0.057), so running this twice is a no-op the
// second time.
//
// Dry-run by default; --confirm required to write. The dry run itself is
// also the answer to "do any live assemblies even use these templates" —
// if the "Of those, N match" count below is 0, there is nothing to migrate
// and --confirm would be a no-op.
//
// Usage:
//   npx tsx scripts/migrate-float-waterproof-cement-estimate.ts            (dry run)
//   npx tsx scripts/migrate-float-waterproof-cement-estimate.ts --confirm  (writes)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const COMPANY_ID = '813ffe22-b75c-49c5-b41e-3ab185e2724c';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const WIZARD_TYPES = ['float_coat', 'waterproof_render'];

interface FormulaPair {
  item_name: string;
  old_formula: string;
  new_formula: string;
}

function regenerateFormulaPairs(wizardType: string, v: Record<string, any>): FormulaPair[] {
  const pairs: FormulaPair[] = [];
  const push = (item_name: string, oldF: string, newF: string) => pairs.push({ item_name, old_formula: oldF, new_formula: newF });

  switch (wizardType) {
    case 'float_coat': {
      const thicknessFactor = v.float_thickness / 10;
      const mixFactor = v.float_mix === '1:3' ? 1 : 0.8;
      const oldCement = (0.057 * thicknessFactor * mixFactor).toFixed(4);
      const newCement = (0.4487 * thicknessFactor * mixFactor).toFixed(4);
      push('Portland Cement', `length * height * sides * ${oldCement}`, `length * height * sides * ${newCement}`);
      break;
    }
    case 'waterproof_render': {
      const wpFactor = v.waterproof_coats * (v.waterproof_thickness / 6);
      const oldCement = (0.057 * wpFactor).toFixed(4);
      const newCement = (0.2692 * wpFactor).toFixed(4);
      push('Portland Cement', `length * height * sides * ${oldCement}`, `length * height * sides * ${newCement}`);
      break;
    }
  }
  return pairs;
}

function extractFormula(notes: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/formula:\s*(.+)/i);
  return m ? m[1].trim() : null;
}

interface AssemblyRow {
  id: string;
  name: string;
  metadata: any;
}
interface ComponentRow {
  id: string;
  assembly_id: string;
  cost_item_id: string;
  notes: string | null;
}
interface PlannedUpdate {
  component_id: string;
  assembly_name: string;
  wizard_type: string;
  item_name: string;
  old_notes: string;
  new_notes: string;
}
interface Flagged {
  assembly_id: string;
  assembly_name: string;
  reason: string;
}

async function loadCandidates(): Promise<{ updates: PlannedUpdate[]; flagged: Flagged[]; matchedAssemblyCount: number }> {
  const { data: assemblies, error: aErr } = await supabase
    .from('assemblies')
    .select('id, name, metadata')
    .eq('company_id', COMPANY_ID);
  if (aErr) throw new Error(`Failed to fetch assemblies: ${aErr.message}`);

  const targets = (assemblies as AssemblyRow[]).filter(a => WIZARD_TYPES.includes(a.metadata?.wizard_type));

  console.log(`Found ${assemblies?.length ?? 0} total assemblies for company ${COMPANY_ID}.`);
  console.log(`Of those, ${targets.length} match float_coat or waterproof_render.\n`);

  const updates: PlannedUpdate[] = [];
  const flagged: Flagged[] = [];

  for (const asm of targets) {
    const wizardType = asm.metadata.wizard_type as string;
    const wizardValues = asm.metadata.wizard_values;
    if (!wizardValues || typeof wizardValues !== 'object') {
      flagged.push({ assembly_id: asm.id, assembly_name: asm.name, reason: 'metadata.wizard_values missing — cannot regenerate, skipped entirely' });
      continue;
    }

    const pairs = regenerateFormulaPairs(wizardType, wizardValues);

    const { data: comps, error: cErr } = await supabase
      .from('assembly_components')
      .select('id, assembly_id, cost_item_id, notes')
      .eq('assembly_id', asm.id);
    if (cErr) throw new Error(`Failed to fetch components for assembly ${asm.id}: ${cErr.message}`);

    const rows = (comps as ComponentRow[]) || [];
    let ambiguous = false;
    const asmUpdates: PlannedUpdate[] = [];

    for (const pair of pairs) {
      const matches = rows.filter(r => extractFormula(r.notes) === pair.old_formula);
      if (matches.length === 0) {
        // Not an error — may have been skipped during the original save's
        // review step, or already carries the corrected constant.
        continue;
      }
      if (matches.length > 1) {
        ambiguous = true;
        flagged.push({
          assembly_id: asm.id,
          assembly_name: asm.name,
          reason: `${matches.length} saved rows share the identical old formula text "${pair.old_formula}" (item: ${pair.item_name}) — cannot safely tell which is which. Whole assembly skipped.`,
        });
        break;
      }
      asmUpdates.push({
        component_id: matches[0].id,
        assembly_name: asm.name,
        wizard_type: wizardType,
        item_name: pair.item_name,
        old_notes: matches[0].notes || '',
        new_notes: `formula:${pair.new_formula}`,
      });
    }

    if (!ambiguous) updates.push(...asmUpdates);
  }

  return { updates, flagged, matchedAssemblyCount: targets.length };
}

function printDryRun(updates: PlannedUpdate[], flagged: Flagged[], matchedAssemblyCount: number) {
  if (matchedAssemblyCount === 0) {
    console.log('No live assemblies use float_coat or waterproof_render for this company. Nothing to migrate.\n');
    return;
  }

  console.log('--- DRY RUN: COMPONENT FORMULA UPDATES ---\n');
  if (updates.length === 0) {
    console.log('(none — matched assemblies exist, but none had a saved row still on the old 0.057 constant)\n');
  } else {
    console.table(
      updates.map(u => ({
        assembly: u.assembly_name,
        wizard_type: u.wizard_type,
        item: u.item_name,
        old: u.old_notes,
        new: u.new_notes,
      }))
    );
  }

  if (flagged.length > 0) {
    console.log('\n--- FLAGGED — SKIPPED ENTIRELY, NEEDS MANUAL REVIEW ---\n');
    console.table(flagged);
  }

  console.log(`\nTotals: ${updates.length} component formula update(s), ${flagged.length} flagged/skipped.`);
  console.log('\nThis was a DRY RUN. No data was written.');
  console.log('To actually write, run: npx tsx scripts/migrate-float-waterproof-cement-estimate.ts --confirm\n');
}

async function performUpdates(updates: PlannedUpdate[]) {
  console.log('\n--- LIVE UPDATE STARTING ---\n');

  // .update() alone (no .select()) returns { data: null, error: null } on a
  // genuine 0-row match — PostgREST replies 204 No Content whether the .eq()
  // filter matched one row or none, so error-only checking can't tell a real
  // success from a silent no-op. Chaining .select('id') forces PostgREST to
  // return the row(s) actually affected; data.length === 0 with no error is
  // therefore a real failure, not a fluke, and is treated exactly like a
  // thrown error — logged and stopped, never reported as "OK".
  const succeeded: string[] = [];
  for (const u of updates) {
    const { data, error } = await supabase.from('assembly_components').update({ notes: u.new_notes }).eq('id', u.component_id).select('id');
    if (error) {
      console.error(`FAILED: ${u.assembly_name} / ${u.item_name} / ${u.component_id} — ${error.message}`);
      console.error(`\nSTOPPING due to failure. Succeeded so far (${succeeded.length}):`, succeeded);
      process.exit(1);
    }
    if (!data || data.length === 0) {
      console.error(`FAILED: ${u.assembly_name} / ${u.item_name} / ${u.component_id} — update matched 0 rows (no error, but nothing was actually updated)`);
      console.error(`\nSTOPPING due to failure. Succeeded so far (${succeeded.length}):`, succeeded);
      process.exit(1);
    }
    succeeded.push(u.component_id);
    console.log(`OK: ${u.assembly_name} / ${u.item_name} → ${u.new_notes}`);
  }

  console.log(`\nAll ${succeeded.length} update(s) completed successfully.`);
}

async function main() {
  const confirm = process.argv.includes('--confirm');

  const { updates, flagged, matchedAssemblyCount } = await loadCandidates();

  if (!confirm) {
    printDryRun(updates, flagged, matchedAssemblyCount);
    return;
  }

  if (updates.length === 0) {
    console.log('Nothing to update. Exiting without writing.');
    if (flagged.length > 0) {
      console.log(`\n${flagged.length} assembly(ies) were flagged — review manually:`);
      console.table(flagged);
    }
    return;
  }

  console.log('\n--confirm flag detected. Re-loading candidates fresh before writing...\n');
  const fresh = await loadCandidates();
  await performUpdates(fresh.updates);

  if (fresh.flagged.length > 0) {
    console.log(`\n${fresh.flagged.length} assembly(ies) were flagged and left untouched — review manually:`);
    console.table(fresh.flagged);
  }
}

main().catch(err => {
  console.error('\nSCRIPT ABORTED:', err.message);
  process.exit(1);
});
