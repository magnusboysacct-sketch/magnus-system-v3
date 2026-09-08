// scripts/migrate-assembly-sides-to-live-variable.ts
//
// One-time migration for the 9 "both sides" templates built earlier today
// (plastering, painting, drywall_partition, drywall_painting, rough_render,
// float_coat, skim_coat, waterproof_render, tyrolean, wall_tiling).
//
// AssemblyWizard.tsx's generateComponents() used to bake the sides toggle
// into a literal number at save time ("length * height * 2 * 0.06"); it now
// emits the bare variable name instead ("length * height * sides * 0.06"),
// resolved live in BOQPage.tsx's "Add From Assembly" modal via
// metadata.configurable_options. That code change only affects assemblies
// created AFTER it shipped — every one of the 9 templates' assemblies saved
// earlier today still has the old baked text in assembly_components.notes,
// and none of them have metadata.configurable_options at all. This script
// catches those up.
//
// Matching strategy — EXACT OLD FORMULA TEXT, not sort_order position:
// handleSave() only inserts assembly_components rows for components the user
// matched or kept (skipped ones during the review step never got a row at
// all), so sort_order on the saved rows is contiguous over a SUBSET of what
// generateComponents() originally returned, not the full set — positional
// matching would silently misalign the moment any component was skipped.
// Text matching sidesteps this: for a given assembly, we recompute exactly
// what generateComponents() would have produced (both the OLD baked formula
// and the NEW sides-variable formula) from that assembly's own stored
// metadata.wizard_values, then look for a saved row whose current formula
// text is an EXACT match for one of the OLD candidates. A skipped component
// simply produces no match (nothing to update — correct, since it was never
// saved). If more than one saved row could match the same OLD text, that
// assembly is flagged and left completely untouched rather than guessed at.
//
// Does NOT re-run Rate Library matching — cost_item_id on every row is left
// exactly as already saved; only assembly_components.notes (the formula
// text) and assemblies.metadata (adding configurable_options) are written.
// Hand-built assemblies (no metadata.wizard_type) are never touched.
//
// Re-run safe: a formula already containing the bare word "sides" will never
// exactly match an OLD candidate (which always contains a literal digit in
// that position), so running this twice is a no-op the second time.
//
// Dry-run by default; --confirm required to write.
//
// Usage:
//   npx tsx scripts/migrate-assembly-sides-to-live-variable.ts            (dry run)
//   npx tsx scripts/migrate-assembly-sides-to-live-variable.ts --confirm  (writes)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const COMPANY_ID = '813ffe22-b75c-49c5-b41e-3ab185e2724c';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Mirrors AssemblyWizard.tsx's BOTH_SIDES_OPTION exactly — field name + label
// per template. If either file changes, keep this in sync manually; this
// script is a one-time migration, not a shared module.
const BOTH_SIDES_OPTION: Record<string, { field: string; label: string }> = {
  plastering: { field: 'plastering_both_sides', label: 'Plaster both sides' },
  painting: { field: 'painting_both_sides', label: 'Paint both sides' },
  drywall_partition: { field: 'drywall_both_sides', label: 'Board on both sides' },
  drywall_painting: { field: 'drywall_painting_both_sides', label: 'Paint both sides' },
  rough_render: { field: 'rough_render_both_sides', label: 'Render both sides' },
  float_coat: { field: 'float_coat_both_sides', label: 'Float coat both sides' },
  skim_coat: { field: 'skim_coat_both_sides', label: 'Skim coat both sides' },
  waterproof_render: { field: 'waterproof_render_both_sides', label: 'Waterproof both sides' },
  tyrolean: { field: 'tyrolean_both_sides', label: 'Apply tyrolean both sides' },
  wall_tiling: { field: 'wall_tiling_both_sides', label: 'Tile both sides' },
};
const WIZARD_TYPES = Object.keys(BOTH_SIDES_OPTION);

interface FormulaPair {
  item_name: string;
  old_formula: string;
  new_formula: string;
}

// One case per template, mirroring its real (now-updated) generateComponents()
// case closely enough to reproduce the same conditional inclusion logic — a
// component whose include_X toggle was off is simply absent here too, same
// as the real generator. `v` is the assembly's own stored metadata.wizard_values.
function regenerateFormulaPairs(wizardType: string, v: Record<string, any>): FormulaPair[] {
  const opt = BOTH_SIDES_OPTION[wizardType];
  if (!opt) return [];
  const sidesOld = v[opt.field] ? 2 : 1;
  const pairs: FormulaPair[] = [];
  const push = (item_name: string, oldF: string, newF: string) => pairs.push({ item_name, old_formula: oldF, new_formula: newF });

  switch (wizardType) {
    case 'plastering': {
      if (v.include_scratch_coat) {
        push('Portland Cement', `length * height * ${sidesOld} * 0.06`, 'length * height * sides * 0.06');
        push('Sand', `length * height * ${sidesOld} * 0.015`, 'length * height * sides * 0.015');
      }
      const mainCement = (v.plaster_coats * 0.08).toFixed(3);
      const mainSand = (v.plaster_coats * 0.02).toFixed(3);
      push('Portland Cement', `length * height * ${sidesOld} * ${mainCement}`, `length * height * sides * ${mainCement}`);
      push('Sand', `length * height * ${sidesOld} * ${mainSand}`, `length * height * sides * ${mainSand}`);
      push('Labor - Plastering', `length * height * ${sidesOld} * 0.5`, 'length * height * sides * 0.5');
      break;
    }
    case 'painting': {
      if (v.include_primer) {
        const primer = (1 / 350).toFixed(5);
        push('Primer', `length * height * ${sidesOld} * ${primer}`, `length * height * sides * ${primer}`);
      }
      const gallonsPerSqFt = 1 / v.paint_coverage;
      const paint = (gallonsPerSqFt * v.paint_coats).toFixed(5);
      push('Paint', `length * height * ${sidesOld} * ${paint}`, `length * height * sides * ${paint}`);
      push('Labor - Painting', `length * height * ${sidesOld} * 0.2`, 'length * height * sides * 0.2');
      break;
    }
    case 'drywall_partition': {
      const layers = v.drywall_layers;
      push('Gypsum Board 4x8', `length * height * ${sidesOld} * ${layers} / 2.976`, `length * height * sides * ${layers} / 2.976`);
      push('Joint Compound', `length * height * ${sidesOld} * 0.02`, 'length * height * sides * 0.02');
      push('Paper Tape', `length * height * ${sidesOld} * 0.3`, 'length * height * sides * 0.3');
      push('Drywall Screw', `length * height * ${sidesOld} * 3`, 'length * height * sides * 3');
      // Metal Floor Track, Metal Stud, Insulation Batt, Labor - Drywall are
      // deliberately excluded: none of them were ever multiplied by sides.
      break;
    }
    case 'drywall_painting': {
      if (v.include_pva_sealer) {
        const pva = (1 / 350).toFixed(5);
        push('PVA Sealer', `length * height * ${sidesOld} * ${pva}`, `length * height * sides * ${pva}`);
      }
      const paint = ((1 / 400) * v.drywall_paint_coats).toFixed(5);
      push('Paint', `length * height * ${sidesOld} * ${paint}`, `length * height * sides * ${paint}`);
      push('Labor - Painting', `length * height * ${sidesOld} * 0.15`, 'length * height * sides * 0.15');
      break;
    }
    case 'rough_render': {
      const thicknessFactor = v.rough_render_thickness / 15;
      const mixFactor = v.rough_render_mix === '1:3' ? 1 : 0.8;
      const cement = (0.086 * thicknessFactor * mixFactor).toFixed(4);
      const sand = (0.028 * thicknessFactor).toFixed(4);
      push('Portland Cement', `length * height * ${sidesOld} * ${cement}`, `length * height * sides * ${cement}`);
      push('Sharp Sand', `length * height * ${sidesOld} * ${sand}`, `length * height * sides * ${sand}`);
      push('Labor - Rendering', `length * height * ${sidesOld} * 0.6`, 'length * height * sides * 0.6');
      break;
    }
    case 'float_coat': {
      const thicknessFactor = v.float_thickness / 10;
      const mixFactor = v.float_mix === '1:3' ? 1 : 0.8;
      const cement = (0.057 * thicknessFactor * mixFactor).toFixed(4);
      const sand = (0.019 * thicknessFactor).toFixed(4);
      push('Portland Cement', `length * height * ${sidesOld} * ${cement}`, `length * height * sides * ${cement}`);
      push('Fine Sand', `length * height * ${sidesOld} * ${sand}`, `length * height * sides * ${sand}`);
      push('Labor - Float Coat', `length * height * ${sidesOld} * 0.5`, 'length * height * sides * 0.5');
      break;
    }
    case 'skim_coat': {
      const isGypsum = v.skim_type === 'gypsum';
      if (isGypsum) {
        push('Gypsum Plaster', `length * height * ${sidesOld} * 0.008`, 'length * height * sides * 0.008');
      } else {
        push('Portland Cement', `length * height * ${sidesOld} * 0.025`, 'length * height * sides * 0.025');
        push('Hydrated Lime', `length * height * ${sidesOld} * 0.012`, 'length * height * sides * 0.012');
      }
      push('Labor - Skim Coat', `length * height * ${sidesOld} * 0.4`, 'length * height * sides * 0.4');
      break;
    }
    case 'waterproof_render': {
      const wpFactor = v.waterproof_coats * (v.waterproof_thickness / 6);
      const cement = (0.057 * wpFactor).toFixed(4);
      const sand = (0.019 * wpFactor).toFixed(4);
      const additive = (0.15 * v.waterproof_coats).toFixed(3);
      const labor = (0.5 * v.waterproof_coats).toFixed(2);
      push('Portland Cement', `length * height * ${sidesOld} * ${cement}`, `length * height * sides * ${cement}`);
      push('Fine Sand', `length * height * ${sidesOld} * ${sand}`, `length * height * sides * ${sand}`);
      push(`Waterproof Additive (${v.waterproof_additive})`, `length * height * ${sidesOld} * ${additive}`, `length * height * sides * ${additive}`);
      push('Labor - Waterproof Render', `length * height * ${sidesOld} * ${labor}`, `length * height * sides * ${labor}`);
      break;
    }
    case 'tyrolean': {
      const cement = (0.04 * v.tyrolean_coats).toFixed(3);
      const aggregate = (0.012 * v.tyrolean_coats).toFixed(4);
      push('Portland Cement', `length * height * ${sidesOld} * ${cement}`, `length * height * sides * ${cement}`);
      push('Fine Aggregate / Pea Gravel', `length * height * ${sidesOld} * ${aggregate}`, `length * height * sides * ${aggregate}`);
      if (v.tyrolean_type === 'machine') {
        push('Tyrolean Machine Hire', `length * height * ${sidesOld} * 0.05`, 'length * height * sides * 0.05');
      }
      const laborRate = v.tyrolean_type === 'machine' ? 0.3 : 0.6;
      push('Labor - Tyrolean', `length * height * ${sidesOld} * ${laborRate}`, `length * height * sides * ${laborRate}`);
      break;
    }
    case 'wall_tiling': {
      const tileSizeMap: Record<string, number> = { '4x4': 9, '6x6': 4, '8x10': 1.8, '12x24': 0.5 };
      const tilesPerSqFt = tileSizeMap[v.wall_tile_size] || 1.8;
      const wasteMultiplier = 1 + v.wall_tile_waste / 100;
      push(
        `Ceramic Wall Tile ${v.wall_tile_size}"`,
        `length * height * ${sidesOld} * ${tilesPerSqFt} * ${wasteMultiplier}`,
        `length * height * sides * ${tilesPerSqFt} * ${wasteMultiplier}`
      );
      if (v.wall_include_adhesive) push('Wall Tile Adhesive', `length * height * ${sidesOld} * 0.05`, 'length * height * sides * 0.05');
      if (v.wall_include_grout) push('Tile Grout', `length * height * ${sidesOld} * 0.012`, 'length * height * sides * 0.012');
      if (v.wall_include_trim) push('Edge Trim / Tile Bead', `(length + height) * 2 * 1.1 * ${sidesOld}`, '(length + height) * 2 * 1.1 * sides');
      push('Labor - Wall Tiling', `length * height * ${sidesOld} * 1.0`, 'length * height * sides * 1.0');
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
interface PlannedComponentUpdate {
  component_id: string;
  assembly_name: string;
  item_name: string;
  old_notes: string;
  new_notes: string;
}
interface PlannedMetadataUpdate {
  assembly_id: string;
  assembly_name: string;
  wizard_type: string;
  new_metadata: any;
}
interface Flagged {
  assembly_id: string;
  assembly_name: string;
  reason: string;
}

async function loadCandidates(): Promise<{
  componentUpdates: PlannedComponentUpdate[];
  metadataUpdates: PlannedMetadataUpdate[];
  flagged: Flagged[];
}> {
  const { data: assemblies, error: aErr } = await supabase
    .from('assemblies')
    .select('id, name, metadata')
    .eq('company_id', COMPANY_ID);
  if (aErr) throw new Error(`Failed to fetch assemblies: ${aErr.message}`);

  const targets = (assemblies as AssemblyRow[]).filter(a => WIZARD_TYPES.includes(a.metadata?.wizard_type));

  console.log(`Found ${assemblies?.length ?? 0} total assemblies for company ${COMPANY_ID}.`);
  console.log(`Of those, ${targets.length} match one of the 9 both-sides wizard types.\n`);

  const componentUpdates: PlannedComponentUpdate[] = [];
  const metadataUpdates: PlannedMetadataUpdate[] = [];
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

    for (const pair of pairs) {
      const matches = rows.filter(r => extractFormula(r.notes) === pair.old_formula);
      if (matches.length === 0) {
        // Not an error — this component may have been skipped by the user
        // during the original save's review step, or (for drywall_partition)
        // this row is simply outside the sides-bearing set entirely.
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
      componentUpdates.push({
        component_id: matches[0].id,
        assembly_name: asm.name,
        item_name: pair.item_name,
        old_notes: matches[0].notes || '',
        new_notes: `formula:${pair.new_formula}`,
      });
    }

    if (ambiguous) {
      // Remove any updates already queued for this assembly before the
      // ambiguity was hit — partial updates on a flagged assembly are worse
      // than none.
      for (let i = componentUpdates.length - 1; i >= 0; i--) {
        if (rows.some(r => r.id === componentUpdates[i].component_id)) componentUpdates.splice(i, 1);
      }
      continue;
    }

    const opt = BOTH_SIDES_OPTION[wizardType];
    metadataUpdates.push({
      assembly_id: asm.id,
      assembly_name: asm.name,
      wizard_type: wizardType,
      new_metadata: {
        ...asm.metadata,
        configurable_options: [
          {
            kind: 'formula_variable',
            key: 'sides',
            label: opt.label,
            type: 'boolean',
            default: !!wizardValues[opt.field],
            value_when_true: 2,
            value_when_false: 1,
          },
        ],
      },
    });
  }

  return { componentUpdates, metadataUpdates, flagged };
}

function printDryRun(componentUpdates: PlannedComponentUpdate[], metadataUpdates: PlannedMetadataUpdate[], flagged: Flagged[]) {
  console.log('--- DRY RUN: COMPONENT FORMULA UPDATES ---\n');
  if (componentUpdates.length === 0) {
    console.log('(none)\n');
  } else {
    console.table(
      componentUpdates.map(u => ({
        assembly: u.assembly_name,
        item: u.item_name,
        old: u.old_notes,
        new: u.new_notes,
      }))
    );
  }

  console.log('\n--- DRY RUN: ASSEMBLY metadata.configurable_options UPDATES ---\n');
  if (metadataUpdates.length === 0) {
    console.log('(none)\n');
  } else {
    console.table(
      metadataUpdates.map(u => ({
        assembly: u.assembly_name,
        wizard_type: u.wizard_type,
        configurable_options: JSON.stringify(u.new_metadata.configurable_options),
      }))
    );
  }

  if (flagged.length > 0) {
    console.log('\n--- FLAGGED — SKIPPED ENTIRELY, NEEDS MANUAL REVIEW ---\n');
    console.table(flagged);
  }

  console.log(`\nTotals: ${componentUpdates.length} component formula update(s), ${metadataUpdates.length} assembly metadata update(s), ${flagged.length} flagged/skipped.`);
  console.log('\nThis was a DRY RUN. No data was written.');
  console.log('To actually write, run: npx tsx scripts/migrate-assembly-sides-to-live-variable.ts --confirm\n');
}

async function performUpdates(componentUpdates: PlannedComponentUpdate[], metadataUpdates: PlannedMetadataUpdate[]) {
  console.log('\n--- LIVE UPDATE STARTING ---\n');

  // .update() alone (no .select()) returns { data: null, error: null } on a
  // genuine 0-row match — PostgREST replies 204 No Content whether the .eq()
  // filter matched one row or none, so error-only checking can't tell a real
  // success from a silent no-op. Chaining .select('id') forces PostgREST to
  // return the row(s) actually affected; data.length === 0 with no error is
  // therefore a real failure, not a fluke, and is treated exactly like a
  // thrown error — logged and stopped, never reported as "OK".
  const succeededComponents: string[] = [];
  for (const u of componentUpdates) {
    const { data, error } = await supabase.from('assembly_components').update({ notes: u.new_notes }).eq('id', u.component_id).select('id');
    if (error) {
      console.error(`FAILED (component): ${u.assembly_name} / ${u.item_name} / ${u.component_id} — ${error.message}`);
      console.error(`\nSTOPPING due to failure. Succeeded so far (${succeededComponents.length}):`, succeededComponents);
      process.exit(1);
    }
    if (!data || data.length === 0) {
      console.error(`FAILED (component): ${u.assembly_name} / ${u.item_name} / ${u.component_id} — update matched 0 rows (no error, but nothing was actually updated)`);
      console.error(`\nSTOPPING due to failure. Succeeded so far (${succeededComponents.length}):`, succeededComponents);
      process.exit(1);
    }
    succeededComponents.push(u.component_id);
    console.log(`OK (component): ${u.assembly_name} / ${u.item_name} → ${u.new_notes}`);
  }

  const succeededMetadata: string[] = [];
  for (const u of metadataUpdates) {
    const { data, error } = await supabase.from('assemblies').update({ metadata: u.new_metadata }).eq('id', u.assembly_id).select('id');
    if (error) {
      console.error(`FAILED (metadata): ${u.assembly_name} / ${u.assembly_id} — ${error.message}`);
      console.error(`\nSTOPPING due to failure. Succeeded so far (${succeededMetadata.length}):`, succeededMetadata);
      process.exit(1);
    }
    if (!data || data.length === 0) {
      console.error(`FAILED (metadata): ${u.assembly_name} / ${u.assembly_id} — update matched 0 rows (no error, but nothing was actually updated)`);
      console.error(`\nSTOPPING due to failure. Succeeded so far (${succeededMetadata.length}):`, succeededMetadata);
      process.exit(1);
    }
    succeededMetadata.push(u.assembly_id);
    console.log(`OK (metadata): ${u.assembly_name} — configurable_options added`);
  }

  console.log(`\nAll ${succeededComponents.length} component update(s) and ${succeededMetadata.length} metadata update(s) completed successfully.`);
}

async function main() {
  const confirm = process.argv.includes('--confirm');

  const { componentUpdates, metadataUpdates, flagged } = await loadCandidates();

  if (!confirm) {
    printDryRun(componentUpdates, metadataUpdates, flagged);
    return;
  }

  if (componentUpdates.length === 0 && metadataUpdates.length === 0) {
    console.log('Nothing to update. Exiting without writing.');
    return;
  }

  console.log('\n--confirm flag detected. Re-loading candidates fresh before writing...\n');
  const fresh = await loadCandidates();
  await performUpdates(fresh.componentUpdates, fresh.metadataUpdates);

  if (fresh.flagged.length > 0) {
    console.log(`\n${fresh.flagged.length} assembly(ies) were flagged and left untouched — review manually:`);
    console.table(fresh.flagged);
  }
}

main().catch(err => {
  console.error('\nSCRIPT ABORTED:', err.message);
  process.exit(1);
});
