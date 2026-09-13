// scripts/migrate-metric-formula-constants.ts
//
// One-time migration for 7 templates confirmed this session to have at least
// one imperial-denominated constant (blocks/sqft, tiles/sqft, gal/sqft paint
// coverage, a sheet's own area in sqft, a stale cement-coverage figure) baked
// directly into a formula that otherwise correctly assumes metric
// length/height/width — producing genuinely wrong quantities, not just a
// unit-labeling issue: block_wall, tiling, painting, roofing, rough_render,
// wall_tiling, drywall_painting.
//
// AssemblyWizard.tsx's generateComponents() has already been fixed in this
// commit to emit the corrected (metric) constants for any NEW assembly saved
// from now on. This script catches up assemblies saved BEFORE that fix —
// their assembly_components.notes still hold the old, imperially-tainted
// formula text.
//
// Matching strategy — EXACT OLD FORMULA TEXT, not sort_order position, same
// approach as migrate-assembly-sides-to-live-variable.ts and for the same
// reason: handleSave() only inserts rows for components the user matched or
// kept during the wizard's review step (skipped ones never got a row at
// all), so sort_order on saved rows is contiguous over a SUBSET of what
// generateComponents() originally returned — positional matching would
// silently misalign the moment any component was skipped. Text matching
// sidesteps this: for each assembly, recompute exactly what
// generateComponents() would have produced under the OLD (pre-fix) constants
// from that assembly's own stored metadata.wizard_values, then look for a
// saved row whose current formula text is an EXACT match. A skipped
// component simply produces no match (nothing to update). More than one
// saved row matching the same OLD text flags that assembly and leaves it
// completely untouched rather than guessing.
//
// Four of these seven templates (painting, rough_render, wall_tiling,
// drywall_painting) also went through the earlier "both sides" migration
// today — their formulas already use the bare variable `sides` rather than
// a baked digit. The OLD candidates below are written against that current
// (bare-sides, old-constant) shape, since that is what generateComponents()
// actually produced immediately before this fix. An assembly that somehow
// still has a pre-sides digit-baked formula (e.g. one the sides migration
// flagged and left untouched) will simply produce no match here either —
// same "no match, nothing to update" behavior, not an error. This script
// does not attempt to fix both issues in one pass.
//
// Does NOT touch metadata.configurable_options (unrelated to this fix — the
// sides toggle's config, not the constants themselves) and does NOT re-run
// cost_item_id matching — only assembly_components.notes (the formula text)
// is written. Hand-built assemblies (no metadata.wizard_type) are never
// touched. Unaffected components on these same 7 templates (mortar cement,
// sand, tile adhesive/grout, roofing screws, labor lines, etc. — anything
// whose constant was already correctly metric) are left alone; only the
// specific formula(s) identified as imperially tainted are regenerated.
//
// Re-run safe: once a row's formula text contains the corrected constant, it
// will never again exactly match an OLD candidate (which always contains the
// old, different constant), so running this twice is a no-op the second
// time.
//
// Dry-run by default; --confirm required to write.
//
// Usage:
//   npx tsx scripts/migrate-metric-formula-constants.ts            (dry run)
//   npx tsx scripts/migrate-metric-formula-constants.ts --confirm  (writes)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const COMPANY_ID = '813ffe22-b75c-49c5-b41e-3ab185e2724c';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const SQFT_TO_SQM = 0.09290304;
const FT_TO_M = 0.3048;

const WIZARD_TYPES = [
  'block_wall',
  'tiling',
  'painting',
  'roofing',
  'rough_render',
  'wall_tiling',
  'drywall_painting',
];

interface FormulaPair {
  item_name: string;
  old_formula: string;
  new_formula: string;
}

// One case per template, mirroring only the AFFECTED component(s) of its
// real generateComponents() case — old (pre-fix) constant vs new (corrected)
// constant, both computed from the assembly's own stored wizard_values so a
// live variable like paint_coverage or roof_sheet_length is respected
// exactly as it was for that assembly, not a default. Unaffected components
// on the same template are simply not listed here — nothing to regenerate
// for them.
function regenerateFormulaPairs(wizardType: string, v: Record<string, any>): FormulaPair[] {
  const pairs: FormulaPair[] = [];
  const push = (item_name: string, oldF: string, newF: string) => pairs.push({ item_name, old_formula: oldF, new_formula: newF });

  switch (wizardType) {
    case 'block_wall': {
      const oldRate = (1.125).toFixed(4);
      const newRate = (12.1094).toFixed(4);
      push(`Concrete Block ${v.block_size}`, `length * height * ${oldRate}`, `length * height * ${newRate}`);
      break;
    }
    case 'tiling': {
      // Old map was a flat 1.1 for every size — always "length * width * 1.1"
      // regardless of v.tile_size. New map is per-size, geometrically derived.
      const newSizes: Record<string, number> = { '12x12': 10.76, '18x18': 4.78, '24x24': 2.69, '12x24': 5.38 };
      const tilesPerSqM = newSizes[v.tile_size] || 10.76;
      push(`Ceramic Tile ${v.tile_size}`, `length * width * 1.1`, `length * width * ${tilesPerSqM}`);
      break;
    }
    case 'painting': {
      if (v.include_primer) {
        const oldPrimer = (1 / 350).toFixed(5);
        const newPrimer = (1 / (350 * SQFT_TO_SQM)).toFixed(5);
        push('Primer', `length * height * sides * ${oldPrimer}`, `length * height * sides * ${newPrimer}`);
      }
      const oldGallonsPerSqFt = 1 / v.paint_coverage;
      const newGallonsPerSqM = 1 / (v.paint_coverage * SQFT_TO_SQM);
      const oldPaint = (oldGallonsPerSqFt * v.paint_coats).toFixed(5);
      const newPaint = (newGallonsPerSqM * v.paint_coats).toFixed(5);
      push('Paint', `length * height * sides * ${oldPaint}`, `length * height * sides * ${newPaint}`);
      break;
    }
    case 'roofing': {
      const sheetLength = v.roof_sheet_length;
      const sheetWidthFt = 2.667;
      const oldSheetAreaSqFt = sheetLength * sheetWidthFt;
      const newSheetAreaSqM = (sheetLength * FT_TO_M) * (sheetWidthFt * FT_TO_M);
      push(
        `${v.roof_sheet_type === 'corrugated' ? 'Corrugated' : 'Standing Seam'} Zinc Sheet ${v.roof_sheet_length}ft`,
        `length * width * 1.1 / ${oldSheetAreaSqFt.toFixed(3)}`,
        `length * width * 1.1 / ${newSheetAreaSqM.toFixed(3)}`
      );
      if (v.include_purlins) {
        const purlinSp = v.purlin_spacing / 1000;
        const newSheetWidthM = sheetWidthFt * FT_TO_M;
        push(
          'Purlin 2×4',
          `(length * width / ${purlinSp.toFixed(3)}) / ${sheetWidthFt.toFixed(3)}`,
          `(length * width / ${purlinSp.toFixed(3)}) / ${newSheetWidthM.toFixed(3)}`
        );
      }
      break;
    }
    case 'rough_render': {
      const thicknessFactor = v.rough_render_thickness / 15;
      const mixFactor = v.rough_render_mix === '1:3' ? 1 : 0.8;
      const oldCement = (0.086 * thicknessFactor * mixFactor).toFixed(4);
      const newCement = (0.673 * thicknessFactor * mixFactor).toFixed(4);
      push('Portland Cement', `length * height * sides * ${oldCement}`, `length * height * sides * ${newCement}`);
      break;
    }
    case 'wall_tiling': {
      const oldSizes: Record<string, number> = { '4x4': 9, '6x6': 4, '8x10': 1.8, '12x24': 0.5 };
      const newSizes: Record<string, number> = { '4x4': 96.90, '6x6': 43.07, '8x10': 19.38, '12x24': 5.38 };
      const oldRate = oldSizes[v.wall_tile_size] || 1.8;
      const newRate = newSizes[v.wall_tile_size] || 19.38;
      const wasteMultiplier = 1 + v.wall_tile_waste / 100;
      push(
        `Ceramic Wall Tile ${v.wall_tile_size}"`,
        `length * height * sides * ${oldRate} * ${wasteMultiplier}`,
        `length * height * sides * ${newRate} * ${wasteMultiplier}`
      );
      break;
    }
    case 'drywall_painting': {
      if (v.include_pva_sealer) {
        const oldPva = (1 / 350).toFixed(5);
        const newPva = (1 / (350 * SQFT_TO_SQM)).toFixed(5);
        push('PVA Sealer', `length * height * sides * ${oldPva}`, `length * height * sides * ${newPva}`);
      }
      const oldPaint = ((1 / 400) * v.drywall_paint_coats).toFixed(5);
      const newPaint = ((1 / (400 * SQFT_TO_SQM)) * v.drywall_paint_coats).toFixed(5);
      push('Paint', `length * height * sides * ${oldPaint}`, `length * height * sides * ${newPaint}`);
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

async function loadCandidates(): Promise<{ updates: PlannedUpdate[]; flagged: Flagged[] }> {
  const { data: assemblies, error: aErr } = await supabase
    .from('assemblies')
    .select('id, name, metadata')
    .eq('company_id', COMPANY_ID);
  if (aErr) throw new Error(`Failed to fetch assemblies: ${aErr.message}`);

  const targets = (assemblies as AssemblyRow[]).filter(a => WIZARD_TYPES.includes(a.metadata?.wizard_type));

  console.log(`Found ${assemblies?.length ?? 0} total assemblies for company ${COMPANY_ID}.`);
  console.log(`Of those, ${targets.length} match one of the 7 metric-constant-fix wizard types.\n`);

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
        // Not an error — this component may have been skipped during the
        // original save's review step, this assembly may already carry the
        // corrected constant (nothing to do), or (for the 4 sides-aware
        // templates) it may still be on a pre-sides digit-baked formula that
        // this script deliberately does not attempt to also fix — see header.
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

  return { updates, flagged };
}

function printDryRun(updates: PlannedUpdate[], flagged: Flagged[]) {
  console.log('--- DRY RUN: COMPONENT FORMULA UPDATES ---\n');
  if (updates.length === 0) {
    console.log('(none)\n');
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
  console.log('To actually write, run: npx tsx scripts/migrate-metric-formula-constants.ts --confirm\n');
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

  const { updates, flagged } = await loadCandidates();

  if (!confirm) {
    printDryRun(updates, flagged);
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
