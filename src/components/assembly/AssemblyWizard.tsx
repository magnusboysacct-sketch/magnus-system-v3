import React, { useState, useMemo } from "react";
import { X, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { supabase } from "../../lib/supabase";

// ─── Bar size table ────────────────────────────────────────────────────────
const BAR_SIZES = [
  { label: "#3 (3/8\")", key: "#3", weight: 0.560 },
  { label: "#4 (1/2\")", key: "#4", weight: 0.994 },
  { label: "#5 (5/8\")", key: "#5", weight: 1.552 },
  { label: "#6 (3/4\")", key: "#6", weight: 2.235 },
  { label: "#8 (1\")",   key: "#8", weight: 3.973 },
  { label: "#10 (1-1/4\")", key: "#10", weight: 6.310 },
];

function barWeight(key: string): number {
  return BAR_SIZES.find(b => b.key === key)?.weight ?? 0.994;
}

// ─── Element type definitions ──────────────────────────────────────────────
const ELEMENT_TYPES = [
  // Structural
  { key: "column_square", label: "Square Column",    icon: "🏛️", group: "Structural",  category: "Reinforcement (Steel)" },
  { key: "column_rect",   label: "Rect. Column",     icon: "🏗️", group: "Structural",  category: "Reinforcement (Steel)" },
  { key: "ground_beam",   label: "Ground Beam",      icon: "🔲", group: "Structural",  category: "Reinforcement (Steel)" },
  { key: "ring_beam",     label: "Ring Beam",        icon: "🔄", group: "Structural",  category: "Reinforcement (Steel)" },
  { key: "tie_beam",      label: "Tie Beam",         icon: "➖", group: "Structural",  category: "Reinforcement (Steel)" },
  { key: "lintel",        label: "Lintel",           icon: "🪟", group: "Structural",  category: "Reinforcement (Steel)" },
  { key: "slab",          label: "Slab",             icon: "📐", group: "Structural",  category: "Reinforcement (Steel)" },
  { key: "pad_footing",   label: "Pad Footing",      icon: "⬛", group: "Structural",  category: "Reinforcement (Steel)" },
  { key: "strip_footing", label: "Strip Footing",    icon: "📏", group: "Structural",  category: "Reinforcement (Steel)" },
  { key: "blinding",      label: "Blinding",         icon: "🪨", group: "Structural",  category: "Concrete Works" },
  { key: "retaining_wall",label: "Retaining Wall",   icon: "🧱", group: "Structural",  category: "Reinforcement (Steel)" },
  { key: "staircase",     label: "Staircase",        icon: "🪜", group: "Structural",  category: "Reinforcement (Steel)" },
  // Masonry
  { key: "block_wall",    label: "Block Wall",       icon: "🧱", group: "Masonry",     category: "Masonry" },
  // Finishes
  { key: "plastering",    label: "Plastering",       icon: "🪣", group: "Finishes",    category: "Plastering" },
  { key: "tiling",        label: "Tiling",           icon: "⬜", group: "Finishes",    category: "Tiling & Flooring" },
  { key: "painting",      label: "Painting",         icon: "🎨", group: "Finishes",    category: "Painting" },
  { key: "ceiling",       label: "Ceiling",          icon: "⬆️", group: "Finishes",    category: "Ceiling" },
  { key: "roofing",       label: "Roofing",          icon: "🏠", group: "Finishes",    category: "Roofing" },
  { key: "ground_slab",   label: "Ground Floor Slab",icon: "⬜", group: "Structural",  category: "Concrete Works" },
  // Partitions
  { key: "drywall_partition", label: "Drywall Partition", icon: "🏢", group: "Partitions", category: "Drywall & Plastering" },
  { key: "drywall_painting",  label: "Drywall Painting",  icon: "🖌️", group: "Partitions", category: "Painting" },
  // External
  { key: "chain_link",        label: "Chain Link Fence",  icon: "🔗", group: "External",   category: "Fencing" },
  { key: "septic_tank",       label: "Septic Tank",       icon: "🪣", group: "External",   category: "Drainage" },
  { key: "drain_gutter",      label: "Drain / Gutter",    icon: "💧", group: "External",   category: "Drainage" },
];

// ─── Types ─────────────────────────────────────────────────────────────────
interface WizardValues {
  name: string;
  col_width: number;
  col_depth: number;
  num_bars: number;
  main_bar: string;
  link_bar: string;
  spacing: number;
  hook_allowance: number;
  beam_width: number;
  beam_depth: number;
  top_bars: number;
  top_bar_size: string;
  bottom_bars: number;
  bottom_bar_size: string;
  link_spacing: number;
  slab_thickness: number;
  bar_spacing_x: number;
  bar_spacing_y: number;
  slab_bar: string;
  block_size: string;
  include_mortar: boolean;
  num_stairs: number;
  going: number;
  riser: number;
  stair_width: number;
  stair_bar: string;
  stair_bar_spacing: number;
  include_concrete: boolean;
  concrete_grade: string;
  include_formwork: boolean;
  include_labor: boolean;
  footing_width: number;
  footing_depth: number;
  footing_thickness: number;
  footing_bar: string;
  footing_spacing: number;

  // Horizontal bars (block wall)
  include_horiz_bars: boolean;
  horiz_bar_size: string;
  horiz_bar_spacing: number; // mm, vertical spacing between horizontal bars

  // Lintel
  lintel_width: number;
  lintel_depth: number;
  lintel_span: number;
  lintel_top_bars: number;
  lintel_top_bar: string;
  lintel_bottom_bars: number;
  lintel_bottom_bar: string;
  lintel_link_bar: string;
  lintel_link_spacing: number;

  // Tie beam (same as ring beam shape)
  tie_width: number;
  tie_depth: number;
  tie_top_bars: number;
  tie_top_bar: string;
  tie_bottom_bars: number;
  tie_bottom_bar: string;
  tie_link_bar: string;
  tie_link_spacing: number;

  // Retaining wall
  ret_height: number;
  ret_thickness: number;
  ret_vert_bar: string;
  ret_vert_spacing: number;
  ret_horiz_bar: string;
  ret_horiz_spacing: number;
  ret_include_base: boolean;
  ret_base_width: number;
  ret_base_bar: string;
  ret_base_spacing: number;

  // Plastering
  plaster_coats: number;
  plaster_thickness: number; // mm
  include_scratch_coat: boolean;

  // Tiling
  tile_size: string; // "12x12", "24x24", etc
  tile_waste: number; // % waste
  include_adhesive: boolean;
  include_grout: boolean;

  // Painting
  paint_coats: number;
  include_primer: boolean;
  paint_coverage: number; // sf per gallon

  // Ceiling
  ceiling_type: string; // "t-bar", "gyp-board", "wood"
  ceiling_tile_size: string;

  // Roofing
  roof_sheet_type: string; // "corrugated", "standing-seam"
  roof_sheet_length: number; // ft
  roof_pitch: number; // degrees
  include_purlins: boolean;
  purlin_spacing: number; // mm
  include_ridge: boolean;

  // Strip footing
  strip_width: number;
  strip_depth: number;
  strip_long_bars: number;
  strip_long_bar: string;
  strip_link_bar: string;
  strip_link_spacing: number;
  include_blinding: boolean;
  blinding_thickness: number;

  // Blinding
  blinding_only_thickness: number;
  blinding_grade: string;

  // Drywall partition
  stud_spacing: number;       // mm — 400 or 600
  stud_size: string;          // "3-5/8\"" or "2-1/2\""
  drywall_layers: number;     // 1 or 2 per side
  drywall_both_sides: boolean;
  include_insulation: boolean;

  // Drywall painting
  drywall_paint_coats: number;
  include_pva_sealer: boolean;

  // Chain link fencing
  fence_height: number;       // mm
  fence_post_spacing: number; // mm
  chain_link_gauge: string;   // "9 gauge" "11 gauge"
  include_top_rail: boolean;
  include_concrete_posts: boolean;

  // Ground floor slab
  ground_slab_thickness: number; // mm
  ground_slab_bar: string;
  ground_slab_bar_spacing: number; // mm
  include_sand_fill: boolean;
  sand_fill_depth: number; // mm
  include_dpc: boolean; // damp proof course
  include_mesh: boolean; // BRC mesh instead of bars
  mesh_type: string;

  // Septic tank
  septic_length: number;   // mm
  septic_width: number;    // mm
  septic_depth: number;    // mm
  septic_wall_thickness: number; // mm
  septic_bar: string;
  septic_bar_spacing: number; // mm
  include_cover_slab: boolean;

  // Drain / gutter
  drain_width: number;   // mm
  drain_depth: number;   // mm
  drain_thickness: number; // mm wall thickness
  drain_bar: string;
  include_drain_cover: boolean;
}

const DEFAULT_VALUES: WizardValues = {
  name: "",
  col_width: 300, col_depth: 300,
  num_bars: 4, main_bar: "#4", link_bar: "#3",
  spacing: 150, hook_allowance: 200,
  beam_width: 300, beam_depth: 450,
  top_bars: 3, top_bar_size: "#4",
  bottom_bars: 3, bottom_bar_size: "#5",
  link_spacing: 150,
  slab_thickness: 150, bar_spacing_x: 200, bar_spacing_y: 200, slab_bar: "#4",
  block_size: "6\"", include_mortar: true,
  num_stairs: 12, going: 250, riser: 175, stair_width: 1200,
  stair_bar: "#4", stair_bar_spacing: 150,
  include_concrete: true, concrete_grade: "3000 PSI",
  include_formwork: true, include_labor: false,
  footing_width: 600, footing_depth: 600, footing_thickness: 300,
  footing_bar: "#4", footing_spacing: 150,
  include_horiz_bars: true,
  horiz_bar_size: "#3",
  horiz_bar_spacing: 600,
  lintel_width: 200, lintel_depth: 200, lintel_span: 1200,
  lintel_top_bars: 2, lintel_top_bar: "#4",
  lintel_bottom_bars: 2, lintel_bottom_bar: "#4",
  lintel_link_bar: "#3", lintel_link_spacing: 150,
  tie_width: 225, tie_depth: 150,
  tie_top_bars: 2, tie_top_bar: "#4",
  tie_bottom_bars: 2, tie_bottom_bar: "#4",
  tie_link_bar: "#3", tie_link_spacing: 200,
  ret_height: 1800, ret_thickness: 200,
  ret_vert_bar: "#4", ret_vert_spacing: 200,
  ret_horiz_bar: "#3", ret_horiz_spacing: 300,
  ret_include_base: true, ret_base_width: 600,
  ret_base_bar: "#4", ret_base_spacing: 200,
  plaster_coats: 2, plaster_thickness: 15,
  include_scratch_coat: true,
  tile_size: "12x12", tile_waste: 10,
  include_adhesive: true, include_grout: true,
  paint_coats: 2, include_primer: true, paint_coverage: 400,
  ceiling_type: "t-bar", ceiling_tile_size: "2x2",
  roof_sheet_type: "corrugated", roof_sheet_length: 10,
  roof_pitch: 15, include_purlins: true,
  purlin_spacing: 600, include_ridge: true,
  strip_width: 450,
  strip_depth: 225,
  strip_long_bars: 3,
  strip_long_bar: "#4",
  strip_link_bar: "#3",
  strip_link_spacing: 300,
  include_blinding: true,
  blinding_thickness: 75,
  blinding_only_thickness: 75,
  blinding_grade: "2000 PSI",
  stud_spacing: 400,
  stud_size: "3-5/8\"",
  drywall_layers: 1,
  drywall_both_sides: true,
  include_insulation: false,
  drywall_paint_coats: 2,
  include_pva_sealer: true,
  fence_height: 1800,
  fence_post_spacing: 3000,
  chain_link_gauge: "9 gauge",
  include_top_rail: true,
  include_concrete_posts: true,
  ground_slab_thickness: 150,
  ground_slab_bar: "#4",
  ground_slab_bar_spacing: 200,
  include_sand_fill: true,
  sand_fill_depth: 150,
  include_dpc: true,
  include_mesh: false,
  mesh_type: "BRC 4x4 W4",
  septic_length: 3000,
  septic_width: 1500,
  septic_depth: 2000,
  septic_wall_thickness: 200,
  septic_bar: "#4",
  septic_bar_spacing: 200,
  include_cover_slab: true,
  drain_width: 300,
  drain_depth: 300,
  drain_thickness: 100,
  drain_bar: "#3",
  include_drain_cover: false,
};

// ─── Component generator ───────────────────────────────────────────────────
// NOTE: The live BOQ "Add From Assembly" formula evaluator only recognizes the
// variables `length`, `height`, and `width` (see evalAssemblyFormula in
// BOQPage.tsx). Every formula below is written to use only those three so it
// will actually compute correctly wherever it's applied — everything else
// (bar weights, spacings, dimensions the wizard collects) is baked in as a
// literal number, the same way the original column/beam formulas already do.
interface GeneratedComponent {
  item_name: string;
  type: string;
  formula: string;
  waste_percent: number;
  description: string;
}

function generateComponents(elementType: string, v: WizardValues): GeneratedComponent[] {
  const w = v.col_width / 1000;
  const d = v.col_depth / 1000;
  const sp = v.spacing / 1000;
  const hook = v.hook_allowance / 1000;
  const mw = barWeight(v.main_bar);
  const lw = barWeight(v.link_bar);

  switch (elementType) {
    case "column_square":
    case "column_rect": {
      const comps: GeneratedComponent[] = [
        {
          item_name: `Rebar ${v.main_bar}`,
          type: "material",
          formula: `${v.num_bars} * length * ${mw}`,
          waste_percent: 5,
          description: `${v.num_bars} vertical bars of ${v.main_bar} rebar`,
        },
        {
          item_name: `Rebar ${v.link_bar}`,
          type: "material",
          formula: `(length / ${sp}) * ((${w} + ${d}) * 2 + ${hook}) * ${lw}`,
          waste_percent: 10,
          description: `${v.link_bar} stirrups at ${v.spacing}mm centres`,
        },
      ];
      if (v.include_concrete) comps.push({
        item_name: "Ready Mix Concrete",
        type: "material",
        formula: `${w} * ${d} * length`,
        waste_percent: 5,
        description: `Concrete ${v.concrete_grade}`,
      });
      if (v.include_formwork) comps.push({
        item_name: "Formwork",
        type: "material",
        formula: `(${w} + ${d}) * 2 * length`,
        waste_percent: 10,
        description: "Plywood formwork",
      });
      if (v.include_labor) {
        comps.push({ item_name: "Labor - Steel Fixing", type: "labor", formula: `${v.num_bars} * length * 0.25`, waste_percent: 0, description: "Steel fixing labor" });
        comps.push({ item_name: "Labor - Concrete Pour", type: "labor", formula: `${w} * ${d} * length * 8`, waste_percent: 0, description: "Concrete pour labor" });
      }
      return comps;
    }

    case "ground_beam":
    case "ring_beam": {
      const bw = v.beam_width / 1000;
      const bd = v.beam_depth / 1000;
      const lsp = v.link_spacing / 1000;
      const tw = barWeight(v.top_bar_size);
      const btw = barWeight(v.bottom_bar_size);
      const blw = barWeight(v.link_bar);
      const comps: GeneratedComponent[] = [
        {
          item_name: `Rebar ${v.top_bar_size}`,
          type: "material",
          formula: `${v.top_bars} * length * ${tw}`,
          waste_percent: 5,
          description: `${v.top_bars} top bars ${v.top_bar_size}`,
        },
        {
          item_name: `Rebar ${v.bottom_bar_size}`,
          type: "material",
          formula: `${v.bottom_bars} * length * ${btw}`,
          waste_percent: 5,
          description: `${v.bottom_bars} bottom bars ${v.bottom_bar_size}`,
        },
        {
          item_name: `Rebar ${v.link_bar}`,
          type: "material",
          formula: `(length / ${lsp}) * ((${bw} + ${bd}) * 2 + ${hook}) * ${blw}`,
          waste_percent: 10,
          description: `Links at ${v.link_spacing}mm centres`,
        },
      ];
      if (v.include_concrete) comps.push({ item_name: "Ready Mix Concrete", type: "material", formula: `${bw} * ${bd} * length`, waste_percent: 5, description: `Concrete ${v.concrete_grade}` });
      if (v.include_formwork) comps.push({ item_name: "Formwork", type: "material", formula: `(${bw} + ${bd}) * 2 * length`, waste_percent: 10, description: "Formwork" });
      return comps;
    }

    case "slab": {
      // area isn't a recognized variable in the live BOQ evaluator — expressed
      // as length * width (a slab's length/width dimensions) instead.
      const st = v.slab_thickness / 1000;
      const sx = v.bar_spacing_x / 1000;
      const sy = v.bar_spacing_y / 1000;
      const sw = barWeight(v.slab_bar);
      return [
        { item_name: `Rebar ${v.slab_bar}`, type: "material", formula: `(length / ${sx}) * width * ${sw}`, waste_percent: 10, description: `Bars in X direction at ${v.bar_spacing_x}mm` },
        { item_name: `Rebar ${v.slab_bar}`, type: "material", formula: `(width / ${sy}) * length * ${sw}`, waste_percent: 10, description: `Bars in Y direction at ${v.bar_spacing_y}mm` },
        ...(v.include_concrete ? [{ item_name: "Ready Mix Concrete", type: "material", formula: `length * width * ${st}`, waste_percent: 5, description: `Slab concrete ${v.slab_thickness}mm thick` }] : []),
        ...(v.include_formwork ? [{ item_name: "Formwork", type: "material", formula: "length * width", waste_percent: 10, description: "Soffit formwork" }] : []),
      ];
    }

    case "block_wall": {
      // area isn't a recognized variable — a wall's area is length * height.
      const blocksPerSqFt = 1.125;
      const comps: GeneratedComponent[] = [
        { item_name: `Concrete Block ${v.block_size}`, type: "material", formula: `length * height * ${blocksPerSqFt.toFixed(4)}`, waste_percent: 5, description: `${v.block_size} hollow blocks` },
        ...(v.include_mortar ? [{ item_name: "Portland Cement", type: "material", formula: "length * height * 0.08", waste_percent: 10, description: "Mortar cement (bags)" }] : []),
        { item_name: "Sand", type: "material", formula: "length * height * 0.025", waste_percent: 10, description: "Mortar sand (m³)" },
      ];
      if (v.include_horiz_bars) {
        const hbw = barWeight(v.horiz_bar_size);
        const hsp = v.horiz_bar_spacing / 1000;
        comps.push({
          item_name: `Rebar ${v.horiz_bar_size}`,
          type: "material",
          formula: `(height / ${hsp}) * length * ${hbw}`,
          waste_percent: 10,
          description: `Horizontal wall bars ${v.horiz_bar_size} @ ${v.horiz_bar_spacing}mm`,
        });
      }
      return comps;
    }

    case "lintel": {
      const lw = v.lintel_width / 1000;
      const ld = v.lintel_depth / 1000;
      const ltw = barWeight(v.lintel_top_bar);
      const lbw = barWeight(v.lintel_bottom_bar);
      const llw = barWeight(v.lintel_link_bar);
      const lsp = v.lintel_link_spacing / 1000;
      return [
        {
          item_name: `Rebar ${v.lintel_top_bar}`,
          type: "material",
          formula: `${v.lintel_top_bars} * (length + 0.5) * ${ltw}`,
          waste_percent: 5,
          description: `${v.lintel_top_bars} top bars + 250mm bearing each end`,
        },
        {
          item_name: `Rebar ${v.lintel_bottom_bar}`,
          type: "material",
          formula: `${v.lintel_bottom_bars} * (length + 0.5) * ${lbw}`,
          waste_percent: 5,
          description: `${v.lintel_bottom_bars} bottom bars + 250mm bearing each end`,
        },
        {
          item_name: `Rebar ${v.lintel_link_bar}`,
          type: "material",
          formula: `(length / ${lsp}) * ((${lw} + ${ld}) * 2 + 0.2) * ${llw}`,
          waste_percent: 10,
          description: `Links @ ${v.lintel_link_spacing}mm`,
        },
        ...(v.include_concrete ? [{
          item_name: "Ready Mix Concrete",
          type: "material",
          formula: `${lw} * ${ld} * (length + 0.5)`,
          waste_percent: 5,
          description: `Lintel concrete ${v.concrete_grade}`,
        }] : []),
        ...(v.include_formwork ? [{
          item_name: "Formwork",
          type: "material",
          formula: `(${lw} + ${ld} * 2) * (length + 0.5)`,
          waste_percent: 10,
          description: "Lintel formwork",
        }] : []),
      ];
    }

    case "tie_beam": {
      const tbw2 = v.tie_width / 1000;
      const tbd = v.tie_depth / 1000;
      const tlsp = v.tie_link_spacing / 1000;
      const ttw = barWeight(v.tie_top_bar);
      const tbw = barWeight(v.tie_bottom_bar);
      const tlw = barWeight(v.tie_link_bar);
      return [
        { item_name: `Rebar ${v.tie_top_bar}`, type: "material", formula: `${v.tie_top_bars} * length * ${ttw}`, waste_percent: 5, description: `${v.tie_top_bars} top bars` },
        { item_name: `Rebar ${v.tie_bottom_bar}`, type: "material", formula: `${v.tie_bottom_bars} * length * ${tbw}`, waste_percent: 5, description: `${v.tie_bottom_bars} bottom bars` },
        { item_name: `Rebar ${v.tie_link_bar}`, type: "material", formula: `(length / ${tlsp}) * ((${tbw2} + ${tbd}) * 2 + 0.2) * ${tlw}`, waste_percent: 10, description: `Links @ ${v.tie_link_spacing}mm` },
        ...(v.include_concrete ? [{ item_name: "Ready Mix Concrete", type: "material", formula: `${tbw2} * ${tbd} * length`, waste_percent: 5, description: "Tie beam concrete" }] : []),
        ...(v.include_formwork ? [{ item_name: "Formwork", type: "material", formula: `(${tbw2} + ${tbd} * 2) * length`, waste_percent: 10, description: "Formwork" }] : []),
      ];
    }

    case "retaining_wall": {
      const rh = v.ret_height / 1000;
      const rt = v.ret_thickness / 1000;
      const rvsp = v.ret_vert_spacing / 1000;
      const rhsp = v.ret_horiz_spacing / 1000;
      const rvw = barWeight(v.ret_vert_bar);
      const rhw = barWeight(v.ret_horiz_bar);
      const rbw = barWeight(v.ret_base_bar);
      const rbsp = v.ret_base_spacing / 1000;
      const rbw2 = v.ret_base_width / 1000;
      const comps: GeneratedComponent[] = [
        { item_name: `Rebar ${v.ret_vert_bar}`, type: "material", formula: `(length / ${rvsp}) * ${rh} * ${rvw}`, waste_percent: 10, description: `Vertical bars @ ${v.ret_vert_spacing}mm` },
        { item_name: `Rebar ${v.ret_horiz_bar}`, type: "material", formula: `(${rh} / ${rhsp}) * length * ${rhw}`, waste_percent: 10, description: `Horizontal bars @ ${v.ret_horiz_spacing}mm` },
        ...(v.include_concrete ? [{ item_name: "Ready Mix Concrete", type: "material", formula: `${rt} * ${rh} * length`, waste_percent: 5, description: "Wall concrete" }] : []),
        ...(v.include_formwork ? [{ item_name: "Formwork", type: "material", formula: `${rh} * length * 2`, waste_percent: 10, description: "Both faces formwork" }] : []),
      ];
      if (v.ret_include_base) {
        comps.push({ item_name: `Rebar ${v.ret_base_bar}`, type: "material", formula: `(length / ${rbsp}) * ${rbw2} * ${rbw} * 2`, waste_percent: 10, description: "Base slab bars both ways" });
        if (v.include_concrete) comps.push({ item_name: "Ready Mix Concrete", type: "material", formula: `${rbw2} * 0.3 * length`, waste_percent: 5, description: "Base slab concrete" });
      }
      return comps;
    }

    case "plastering": {
      // area isn't a recognized variable — plastering is assumed on a wall
      // face, so area is expressed as length * height.
      const comps: GeneratedComponent[] = [];
      if (v.include_scratch_coat) {
        comps.push({ item_name: "Portland Cement", type: "material", formula: "length * height * 0.06", waste_percent: 10, description: "Scratch coat cement (bags)" });
        comps.push({ item_name: "Sand", type: "material", formula: "length * height * 0.015", waste_percent: 10, description: "Scratch coat sand (m³)" });
      }
      comps.push({ item_name: "Portland Cement", type: "material", formula: `length * height * ${(v.plaster_coats * 0.08).toFixed(3)}`, waste_percent: 10, description: `${v.plaster_coats} coat plaster cement (bags)` });
      comps.push({ item_name: "Sand", type: "material", formula: `length * height * ${(v.plaster_coats * 0.02).toFixed(3)}`, waste_percent: 10, description: `${v.plaster_coats} coat plaster sand (m³)` });
      comps.push({ item_name: "Labor - Plastering", type: "labor", formula: "length * height * 0.5", waste_percent: 0, description: "Plastering labor (man-hours)" });
      return comps;
    }

    case "tiling": {
      // area isn't a recognized variable — tiling is assumed on a floor
      // plan, so area is expressed as length * width.
      const tileSizes: Record<string, number> = {
        "12x12": 1.1, "18x18": 1.1, "24x24": 1.1, "12x24": 1.1
      };
      const tilesPerSqFt = tileSizes[v.tile_size] || 1.1;
      const comps: GeneratedComponent[] = [
        { item_name: `Ceramic Tile ${v.tile_size}`, type: "material", formula: `length * width * ${tilesPerSqFt}`, waste_percent: v.tile_waste, description: `${v.tile_size} tiles with ${v.tile_waste}% waste` },
      ];
      if (v.include_adhesive) comps.push({ item_name: "Tile Adhesive", type: "material", formula: "length * width * 0.04", waste_percent: 5, description: "Tile adhesive (bags)" });
      if (v.include_grout) comps.push({ item_name: "Tile Grout", type: "material", formula: "length * width * 0.01", waste_percent: 5, description: "Tile grout (bags)" });
      comps.push({ item_name: "Labor - Tiling", type: "labor", formula: "length * width * 0.75", waste_percent: 0, description: "Tiling labor (man-hours)" });
      return comps;
    }

    case "painting": {
      // area isn't a recognized variable — painting is assumed on a wall
      // face, so area is expressed as length * height.
      const gallonsPerSqFt = 1 / v.paint_coverage;
      const comps: GeneratedComponent[] = [];
      if (v.include_primer) comps.push({ item_name: "Primer", type: "material", formula: `length * height * ${(1/350).toFixed(5)}`, waste_percent: 5, description: "Primer (1 gal / 350 sf)" });
      comps.push({ item_name: "Paint", type: "material", formula: `length * height * ${(gallonsPerSqFt * v.paint_coats).toFixed(5)}`, waste_percent: 5, description: `${v.paint_coats} coats paint (gallons)` });
      comps.push({ item_name: "Labor - Painting", type: "labor", formula: "length * height * 0.2", waste_percent: 0, description: "Painting labor (man-hours)" });
      return comps;
    }

    case "ceiling": {
      // area isn't a recognized variable — ceiling area is the floor plan
      // footprint, expressed as length * width.
      const comps: GeneratedComponent[] = [];
      if (v.ceiling_type === "t-bar") {
        comps.push({ item_name: "T-Bar Grid Main Runner", type: "material", formula: "length * width / 1.2 * 0.6", waste_percent: 10, description: "Main T-bar runners" });
        comps.push({ item_name: "T-Bar Grid Cross Tee", type: "material", formula: "length * width / 0.6", waste_percent: 10, description: "Cross tees" });
        comps.push({ item_name: `Ceiling Tile ${v.ceiling_tile_size}`, type: "material", formula: "length * width * 1.1", waste_percent: 10, description: `${v.ceiling_tile_size} ceiling tiles` });
        comps.push({ item_name: "Hanger Wire", type: "material", formula: "length * width * 0.5", waste_percent: 10, description: "Hanger wire (m)" });
      } else if (v.ceiling_type === "gyp-board") {
        comps.push({ item_name: "Gypsum Board 4x8", type: "material", formula: "length * width / 2.976", waste_percent: 10, description: "4×8 gyp board sheets" });
        comps.push({ item_name: "Metal Furring Channel", type: "material", formula: "length * width * 1.2", waste_percent: 10, description: "Furring channels (lf)" });
        comps.push({ item_name: "Joint Compound", type: "material", formula: "length * width * 0.02", waste_percent: 5, description: "Joint compound (bags)" });
      }
      comps.push({ item_name: "Labor - Ceiling", type: "labor", formula: "length * width * 0.6", waste_percent: 0, description: "Ceiling installation labor" });
      return comps;
    }

    case "roofing": {
      // area isn't a recognized variable — roof area is the plan footprint,
      // expressed as length * width.
      const sheetLength = v.roof_sheet_length; // ft
      const sheetWidthFt = 2.667; // standard 32" = 2.667ft
      const sheetAreaSqFt = sheetLength * sheetWidthFt;
      const purlinSp = v.purlin_spacing / 1000; // m
      const comps: GeneratedComponent[] = [
        {
          item_name: `${v.roof_sheet_type === "corrugated" ? "Corrugated" : "Standing Seam"} Zinc Sheet ${v.roof_sheet_length}ft`,
          type: "material",
          formula: `length * width * 1.1 / ${sheetAreaSqFt.toFixed(3)}`,
          waste_percent: 5,
          description: `${v.roof_sheet_length}ft sheets with 10% overlap`,
        },
      ];
      if (v.include_purlins) {
        comps.push({ item_name: "Purlin 2×4", type: "material", formula: `(length * width / ${purlinSp.toFixed(3)}) / ${sheetWidthFt.toFixed(3)}`, waste_percent: 10, description: `Purlins @ ${v.purlin_spacing}mm centres` });
      }
      if (v.include_ridge) {
        comps.push({ item_name: "Ridge Cap", type: "material", formula: "width * 1.1", waste_percent: 5, description: "Ridge capping" });
      }
      comps.push({ item_name: "Roofing Screw", type: "material", formula: "length * width * 4", waste_percent: 10, description: "Roofing screws (each)" });
      comps.push({ item_name: "Labor - Roofing", type: "labor", formula: "length * width * 0.3", waste_percent: 0, description: "Roofing labor (man-hours)" });
      return comps;
    }

    case "staircase": {
      const sw2 = v.stair_width / 1000;
      const go = v.going / 1000;
      const ri = v.riser / 1000;
      const ssp = v.stair_bar_spacing / 1000;
      const ssw = barWeight(v.stair_bar);
      return [
        { item_name: `Rebar ${v.stair_bar}`, type: "material", formula: `${v.num_stairs} * (${go} + ${ri}) * (${sw2} / ${ssp}) * ${ssw}`, waste_percent: 10, description: "Main stair reinforcement" },
        { item_name: `Rebar ${v.stair_bar}`, type: "material", formula: `${v.num_stairs} * ${sw2} * ((${go} + ${ri}) / ${ssp}) * ${ssw}`, waste_percent: 10, description: "Distribution bars" },
        ...(v.include_concrete ? [{ item_name: "Ready Mix Concrete", type: "material", formula: `${v.num_stairs} * ${go} * ${ri} * ${sw2} * 0.5`, waste_percent: 5, description: "Stair concrete" }] : []),
      ];
    }

    case "pad_footing": {
      const fw = v.footing_width / 1000;
      const fd = v.footing_depth / 1000;
      const ft = v.footing_thickness / 1000;
      const fsp = v.footing_spacing / 1000;
      const fsw = barWeight(v.footing_bar);
      return [
        { item_name: `Rebar ${v.footing_bar}`, type: "material", formula: `(${fw} / ${fsp}) * ${fd} * ${fsw} * 2`, waste_percent: 10, description: "Footing bars both ways" },
        ...(v.include_concrete ? [{ item_name: "Ready Mix Concrete", type: "material", formula: `${fw} * ${fd} * ${ft}`, waste_percent: 5, description: `${v.concrete_grade} footing concrete` }] : []),
      ];
    }

    case "strip_footing": {
      const sw = v.strip_width / 1000;
      const sd = v.strip_depth / 1000;
      const slsp = v.strip_link_spacing / 1000;
      const slw = barWeight(v.strip_long_bar);
      const slkw = barWeight(v.strip_link_bar);
      const comps: GeneratedComponent[] = [
        {
          item_name: `Rebar ${v.strip_long_bar}`,
          type: "material",
          formula: `${v.strip_long_bars} * length * ${slw}`,
          waste_percent: 5,
          description: `${v.strip_long_bars} longitudinal bars running along footing`,
        },
        {
          item_name: `Rebar ${v.strip_link_bar}`,
          type: "material",
          formula: `(length / ${slsp}) * (${sw} * 2 + ${sd} * 2 + 0.2) * ${slkw}`,
          waste_percent: 10,
          description: `Cross bars/links @ ${v.strip_link_spacing}mm spacing`,
        },
      ];
      if (v.include_concrete) comps.push({
        item_name: "Ready Mix Concrete",
        type: "material",
        formula: `${sw} * ${sd} * length`,
        waste_percent: 5,
        description: `Strip footing concrete ${v.concrete_grade}`,
      });
      if (v.include_formwork) comps.push({
        item_name: "Formwork",
        type: "material",
        formula: `${sd} * 2 * length`,
        waste_percent: 10,
        description: "Both sides formwork",
      });
      if (v.include_blinding) comps.push({
        item_name: "Blinding Concrete",
        type: "material",
        formula: `${sw + 0.1} * ${v.blinding_thickness / 1000} * length`,
        waste_percent: 5,
        description: `${v.blinding_thickness}mm blinding (50mm wider each side)`,
      });
      return comps;
    }

    case "blinding": {
      const bt = v.blinding_only_thickness / 1000;
      return [
        {
          item_name: "Blinding Concrete",
          type: "material",
          formula: `length * width * ${bt}`,
          waste_percent: 5,
          description: `${v.blinding_only_thickness}mm lean mix blinding ${v.blinding_grade}`,
        },
        {
          item_name: "Sand Blinding",
          type: "material",
          formula: `length * width * 0.05`,
          waste_percent: 10,
          description: "50mm sand blinding bed",
        },
      ];
    }

    case "drywall_partition": {
      const studSp = v.stud_spacing / 1000;
      const sides = v.drywall_both_sides ? 2 : 1;
      const layers = v.drywall_layers;
      const comps: GeneratedComponent[] = [
        {
          item_name: "Metal Floor Track",
          type: "material",
          formula: "length * 2",
          waste_percent: 5,
          description: "Floor + ceiling track (lf)",
        },
        {
          item_name: `Metal Stud ${v.stud_size}`,
          type: "material",
          formula: `(length / ${studSp}) * height`,
          waste_percent: 10,
          description: `Studs @ ${v.stud_spacing}mm centres`,
        },
        {
          item_name: "Gypsum Board 4x8",
          type: "material",
          formula: `length * height * ${sides} * ${layers} / 2.976`,
          waste_percent: 10,
          description: `${layers} layer${layers > 1 ? "s" : ""} each side — 4×8 sheets`,
        },
        {
          item_name: "Joint Compound",
          type: "material",
          formula: `length * height * ${sides} * 0.02`,
          waste_percent: 10,
          description: "Joint compound (bags)",
        },
        {
          item_name: "Paper Tape",
          type: "material",
          formula: `length * height * ${sides} * 0.3`,
          waste_percent: 10,
          description: "Paper tape (lf)",
        },
        {
          item_name: "Drywall Screw",
          type: "material",
          formula: `length * height * ${sides} * 3`,
          waste_percent: 5,
          description: "Screws (each)",
        },
      ];
      if (v.include_insulation) comps.push({
        item_name: "Insulation Batt",
        type: "material",
        formula: "length * height",
        waste_percent: 5,
        description: "Wall insulation",
      });
      comps.push({
        item_name: "Labor - Drywall",
        type: "labor",
        formula: "length * height * 0.8",
        waste_percent: 0,
        description: "Drywall installation labor (man-hours)",
      });
      return comps;
    }

    case "drywall_painting": {
      const comps: GeneratedComponent[] = [];
      if (v.include_pva_sealer) comps.push({
        item_name: "PVA Sealer",
        type: "material",
        formula: `length * height * ${(1/350).toFixed(5)}`,
        waste_percent: 5,
        description: "PVA sealer coat (1 gal / 350 sf)",
      });
      comps.push({
        item_name: "Paint",
        type: "material",
        formula: `length * height * ${((1/400) * v.drywall_paint_coats).toFixed(5)}`,
        waste_percent: 5,
        description: `${v.drywall_paint_coats} coats paint (gallons)`,
      });
      comps.push({
        item_name: "Labor - Painting",
        type: "labor",
        formula: "length * height * 0.15",
        waste_percent: 0,
        description: "Drywall painting labor (man-hours)",
      });
      return comps;
    }

    case "chain_link": {
      const fps = v.fence_post_spacing / 1000;
      const comps: GeneratedComponent[] = [
        {
          item_name: `Chain Link ${v.chain_link_gauge} ${v.fence_height}mm`,
          type: "material",
          formula: "length * 1.05",
          waste_percent: 5,
          description: "Chain link fabric (lf with 5% overlap)",
        },
        {
          item_name: "Fence Post",
          type: "material",
          formula: `(length / ${fps}) + 1`,
          waste_percent: 0,
          description: `Posts @ ${v.fence_post_spacing}mm centres`,
        },
      ];
      if (v.include_top_rail) comps.push({
        item_name: "Top Rail",
        type: "material",
        formula: "length * 1.05",
        waste_percent: 5,
        description: "Top rail (lf)",
      });
      if (v.include_concrete_posts) comps.push({
        item_name: "Ready Mix Concrete",
        type: "material",
        formula: `(length / ${fps} + 1) * 0.05`,
        waste_percent: 10,
        description: "Concrete for post holes (m³)",
      });
      comps.push({
        item_name: "Labor - Fencing",
        type: "labor",
        formula: "length * 0.5",
        waste_percent: 0,
        description: "Fencing labor (man-hours)",
      });
      return comps;
    }

    case "ground_slab": {
      const gst = v.ground_slab_thickness / 1000;
      const gssp = v.ground_slab_bar_spacing / 1000;
      const gsbw = barWeight(v.ground_slab_bar);
      const sfd = v.sand_fill_depth / 1000;
      const comps: GeneratedComponent[] = [];
      if (v.include_sand_fill) comps.push({
        item_name: "Sand Fill",
        type: "material",
        formula: `length * width * ${sfd}`,
        waste_percent: 10,
        description: `${v.sand_fill_depth}mm compacted sand fill (m³)`,
      });
      if (v.include_dpc) comps.push({
        item_name: "DPC Membrane",
        type: "material",
        formula: "length * width * 1.1",
        waste_percent: 10,
        description: "Damp proof membrane (m²)",
      });
      if (v.include_mesh) {
        comps.push({
          item_name: `BRC Mesh ${v.mesh_type}`,
          type: "material",
          formula: "length * width * 1.1 / 14.4",
          waste_percent: 10,
          description: "BRC mesh sheets (2.4×6m each)",
        });
      } else {
        comps.push({
          item_name: `Rebar ${v.ground_slab_bar}`,
          type: "material",
          formula: `length * width / ${gssp} * ${gsbw} * 2`,
          waste_percent: 10,
          description: `${v.ground_slab_bar} bars both ways @ ${v.ground_slab_bar_spacing}mm`,
        });
      }
      comps.push({
        item_name: "Ready Mix Concrete",
        type: "material",
        formula: `length * width * ${gst}`,
        waste_percent: 5,
        description: `${v.ground_slab_thickness}mm ground slab concrete`,
      });
      comps.push({
        item_name: "Labor - Concrete",
        type: "labor",
        formula: "length * width * 0.5",
        waste_percent: 0,
        description: "Concrete labor (man-hours)",
      });
      return comps;
    }

    case "septic_tank": {
      const sl = v.septic_length / 1000;
      const sw2 = v.septic_width / 1000;
      const sd = v.septic_depth / 1000;
      const st = v.septic_wall_thickness / 1000;
      const sbw = barWeight(v.septic_bar);
      const sbsp = v.septic_bar_spacing / 1000;
      const totalWallArea = (sl * sd * 2) + (sw2 * sd * 2) + (sl * sw2);
      const comps: GeneratedComponent[] = [
        {
          item_name: `Rebar ${v.septic_bar}`,
          type: "material",
          formula: `${(totalWallArea / sbsp * sbw * 2).toFixed(3)}`,
          waste_percent: 10,
          description: "Reinforcement for walls + base both ways",
        },
        {
          item_name: "Ready Mix Concrete",
          type: "material",
          formula: `${(totalWallArea * st).toFixed(3)}`,
          waste_percent: 5,
          description: "Concrete for walls + base",
        },
        {
          item_name: "Formwork",
          type: "material",
          formula: `${(totalWallArea * 2).toFixed(3)}`,
          waste_percent: 10,
          description: "Both faces of all walls",
        },
      ];
      if (v.include_cover_slab) {
        comps.push({
          item_name: `Rebar ${v.septic_bar}`,
          type: "material",
          formula: `${((sl * sw2) / sbsp * sbw * 2).toFixed(3)}`,
          waste_percent: 10,
          description: "Cover slab reinforcement",
        });
        comps.push({
          item_name: "Ready Mix Concrete",
          type: "material",
          formula: `${(sl * sw2 * 0.15).toFixed(3)}`,
          waste_percent: 5,
          description: "Cover slab concrete (150mm)",
        });
      }
      return comps;
    }

    case "drain_gutter": {
      const dw = v.drain_width / 1000;
      const dd = v.drain_depth / 1000;
      const dt = v.drain_thickness / 1000;
      const dbw = barWeight(v.drain_bar);
      const perim = (dw + dd * 2);
      const comps: GeneratedComponent[] = [
        {
          item_name: `Rebar ${v.drain_bar}`,
          type: "material",
          formula: `length * ${perim} * ${dbw} * 2`,
          waste_percent: 10,
          description: "U-shaped drain reinforcement",
        },
        {
          item_name: "Ready Mix Concrete",
          type: "material",
          formula: `length * ${perim} * ${dt}`,
          waste_percent: 5,
          description: "Drain concrete",
        },
        {
          item_name: "Formwork",
          type: "material",
          formula: `length * ${perim}`,
          waste_percent: 10,
          description: "Drain formwork",
        },
      ];
      if (v.include_drain_cover) comps.push({
        item_name: "Drain Cover Grating",
        type: "material",
        formula: "length",
        waste_percent: 5,
        description: "Galvanized steel grating cover (lf)",
      });
      comps.push({
        item_name: "Labor - Drain",
        type: "labor",
        formula: "length * 0.4",
        waste_percent: 0,
        description: "Drain construction labor (man-hours)",
      });
      return comps;
    }

    default:
      return [];
  }
}

// ─── Preview calculator ────────────────────────────────────────────────────
function calcPreview(formula: string, vars: Record<string, number>): number {
  try {
    let expr = formula;
    Object.entries(vars).forEach(([k, val]) => {
      expr = expr.replace(new RegExp(`\\b${k}\\b`, "g"), String(val));
    });
    if (!/^[\d\s\+\-\*\/\.\(\)]+$/.test(expr)) return 0;
    // eslint-disable-next-line no-new-func
    return Function(`"use strict"; return (${expr})`)() as number;
  } catch { return 0; }
}

// ─── Bar picker ────────────────────────────────────────────────────────────
function BarPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
        {BAR_SIZES.map(b => (
          <option key={b.key} value={b.key}>{b.label} — {b.weight} kg/m</option>
        ))}
      </select>
    </div>
  );
}

// ─── Number input ──────────────────────────────────────────────────────────
function NumInput({ label, value, onChange, unit, hint }: {
  label: string; value: number; onChange: (v: number) => void;
  unit?: string; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
        {label} {unit && <span className="text-slate-400">({unit})</span>}
      </label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value) || 0)}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      />
      {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

// ─── Toggle ────────────────────────────────────────────────────────────────
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer py-2">
      <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 relative ${value ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-6" : "translate-x-1"}`}/>
      </button>
    </label>
  );
}

// ─── Main Wizard ───────────────────────────────────────────────────────────
export default function AssemblyWizard({
  onClose,
  onCreated,
  onUseBlankForm,
  companyId,
}: {
  onClose: () => void;
  onCreated: () => void;
  onUseBlankForm: () => void;
  companyId: string | null;
}) {
  const [step, setStep] = useState<"pick_type" | "configure" | "preview">("pick_type");
  const [elementType, setElementType] = useState<string | null>(null);
  const [values, setValues] = useState<WizardValues>(DEFAULT_VALUES);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof WizardValues>(key: K, val: WizardValues[K]) {
    setValues(prev => ({ ...prev, [key]: val }));
  }

  const selectedElement = ELEMENT_TYPES.find(e => e.key === elementType);

  const components = useMemo(() => {
    if (!elementType) return [];
    return generateComponents(elementType, values);
  }, [elementType, values]);

  // Preview vars — a 3m x 3m x 3m element, matching the only variables the
  // live formula evaluator (and every generated formula) actually uses.
  const previewVars = { length: 3, width: 3, height: 3 };

  function buildConstants(type: string, v: WizardValues): Record<string, number> {
    const c: Record<string, number> = {};
    if (type.startsWith("column")) {
      c.col_width = v.col_width / 1000;
      c.col_depth = v.col_depth / 1000;
      c.num_bars = v.num_bars;
      c.spacing = v.spacing / 1000;
      c.hook_allowance = v.hook_allowance / 1000;
      c.main_bar_weight = barWeight(v.main_bar);
      c.link_bar_weight = barWeight(v.link_bar);
    } else if (type === "ground_beam" || type === "ring_beam" || type === "tie_beam") {
      c.beam_width = v.beam_width / 1000;
      c.beam_depth = v.beam_depth / 1000;
    } else if (type === "slab") {
      c.slab_thickness = v.slab_thickness / 1000;
      c.bar_spacing = v.bar_spacing_x / 1000;
    } else if (type === "block_wall") {
      c.blocks_per_sqft = 1.125;
      c.horiz_spacing = v.horiz_bar_spacing / 1000;
    } else if (type === "retaining_wall") {
      c.wall_height = v.ret_height / 1000;
      c.wall_thickness = v.ret_thickness / 1000;
    } else if (type === "strip_footing") {
      c.strip_width = v.strip_width / 1000;
      c.strip_depth = v.strip_depth / 1000;
      c.strip_long_bars = v.strip_long_bars;
      c.link_spacing = v.strip_link_spacing / 1000;
    } else if (type === "blinding") {
      c.thickness = v.blinding_only_thickness / 1000;
    }
    // Add more element types as needed
    return c;
  }

  async function handleSave() {
    if (!elementType || !values.name.trim()) return;
    setSaving(true);
    try {
      // Explicit per-type mapping (not substring matching) since "wall" now
      // matches both block_wall (area-shaped formulas) and retaining_wall
      // (length-shaped formulas) — those need different measure types.
      const AREA_TYPES = new Set(["slab", "block_wall", "plastering", "tiling", "painting", "ceiling", "roofing", "blinding", "ground_slab", "drywall_partition", "drywall_painting"]);
      const COUNT_TYPES = new Set(["staircase", "septic_tank"]);
      const measureType = AREA_TYPES.has(elementType) ? "area"
        : COUNT_TYPES.has(elementType) ? "count"
        : "linear";

      // Create assembly — measure_type/constants live inside metadata (jsonb),
      // there is no top-level measure_type column on the assemblies table.
      const { data: asm, error: asmErr } = await supabase
        .from("assemblies")
        .insert({
          name: values.name.trim(),
          category: selectedElement?.category || "General",
          default_waste_percent: 5,
          is_active: true,
          company_id: companyId,
          metadata: {
            measure_type: measureType,
            constants: buildConstants(elementType, values),
            wizard_type: elementType,
            wizard_values: values,
          },
        })
        .select("id")
        .single();

      if (asmErr || !asm) { alert(asmErr?.message || "Failed to create assembly"); return; }

      // Find a matching rate library item per component and add it — the
      // assembly_components table stores the formula inside `notes` (prefixed
      // "formula:") and has no item_name/component_type columns of its own.
      const unmatched: string[] = [];
      let sortOrder = 0;
      for (const comp of components) {
        const { data: items } = await supabase
          .from("cost_items")
          .select("id")
          .eq("company_id", companyId)
          .ilike("item_name", `%${comp.item_name}%`)
          .limit(1);

        const costItemId = items?.[0]?.id;
        if (!costItemId) { unmatched.push(comp.item_name); continue; }

        await supabase.from("assembly_components").insert({
          assembly_id: asm.id,
          cost_item_id: costItemId,
          line_type: comp.type,
          quantity_factor: 1,
          waste_percent: comp.waste_percent,
          sort_order: sortOrder++,
          notes: `formula:${comp.formula}`,
        });
      }

      if (unmatched.length > 0) {
        alert(
          `Assembly created, but ${unmatched.length} of ${components.length} components couldn't be matched to a Rate Library item and were skipped:\n\n` +
          unmatched.map(n => `• ${n}`).join("\n") +
          `\n\nAdd these to your Rate Library, then add them to the assembly manually.`
        );
      }

      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {step === "pick_type" ? "What are you building?" :
               step === "configure" ? `Configure ${selectedElement?.label}` :
               "Review & Save"}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {step === "pick_type" ? "Pick a structural element to get started" :
               step === "configure" ? "Fill in the details — we handle the formulas" :
               "Check the components before saving"}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
            <X size={18}/>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* STEP 1 — Pick type */}
          {step === "pick_type" && (
            <div className="space-y-5">
              {["Structural", "Masonry", "Finishes", "Partitions", "External"].map(group => (
                <div key={group}>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{group}</p>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {ELEMENT_TYPES.filter(e => e.group === group).map(el => (
                      <button key={el.key}
                        onClick={() => { setElementType(el.key); setValues(v => ({ ...v, name: el.label })); setStep("configure"); }}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all group">
                        <span className="text-2xl">{el.icon}</span>
                        <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 text-center leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          {el.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={onUseBlankForm}
                  className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1">
                  Or create a blank assembly manually →
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 — Configure */}
          {step === "configure" && elementType && (
            <div className="space-y-5">
              {/* Assembly name */}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Assembly Name</label>
                <input
                  value={values.name}
                  onChange={e => set("name", e.target.value)}
                  placeholder="e.g. Square Column 300×300"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              {/* Column fields */}
              {(elementType === "column_square" || elementType === "column_rect") && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Width" value={values.col_width} onChange={v => set("col_width", v)} unit="mm" hint="e.g. 300mm = 12 inches"/>
                    {elementType === "column_rect"
                      ? <NumInput label="Depth" value={values.col_depth} onChange={v => set("col_depth", v)} unit="mm"/>
                      : <NumInput label="Depth" value={values.col_width} onChange={v => { set("col_depth", v); set("col_width", v); }} unit="mm" hint="Same as width (square)"/>
                    }
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Number of vertical bars" value={values.num_bars} onChange={v => set("num_bars", v)} hint="Typically 4, 6, or 8"/>
                    <BarPicker label="Vertical bar size" value={values.main_bar} onChange={v => set("main_bar", v)}/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <BarPicker label="Stirrup (link) bar size" value={values.link_bar} onChange={v => set("link_bar", v)}/>
                    <NumInput label="Stirrup spacing" value={values.spacing} onChange={v => set("spacing", v)} unit="mm" hint="Typically 150mm"/>
                  </div>
                </>
              )}

              {/* Beam fields */}
              {(elementType === "ground_beam" || elementType === "ring_beam") && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Beam width" value={values.beam_width} onChange={v => set("beam_width", v)} unit="mm"/>
                    <NumInput label="Beam depth" value={values.beam_depth} onChange={v => set("beam_depth", v)} unit="mm"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Top bars" value={values.top_bars} onChange={v => set("top_bars", v)}/>
                    <BarPicker label="Top bar size" value={values.top_bar_size} onChange={v => set("top_bar_size", v)}/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Bottom bars" value={values.bottom_bars} onChange={v => set("bottom_bars", v)}/>
                    <BarPicker label="Bottom bar size" value={values.bottom_bar_size} onChange={v => set("bottom_bar_size", v)}/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <BarPicker label="Link bar size" value={values.link_bar} onChange={v => set("link_bar", v)}/>
                    <NumInput label="Link spacing" value={values.link_spacing} onChange={v => set("link_spacing", v)} unit="mm"/>
                  </div>
                </>
              )}

              {/* Slab fields */}
              {elementType === "slab" && (
                <>
                  <NumInput label="Slab thickness" value={values.slab_thickness} onChange={v => set("slab_thickness", v)} unit="mm" hint="e.g. 150mm"/>
                  <div className="grid grid-cols-2 gap-3">
                    <BarPicker label="Bar size" value={values.slab_bar} onChange={v => set("slab_bar", v)}/>
                    <NumInput label="Bar spacing (both ways)" value={values.bar_spacing_x} onChange={v => { set("bar_spacing_x", v); set("bar_spacing_y", v); }} unit="mm"/>
                  </div>
                </>
              )}

              {/* Block wall fields */}
              {elementType === "block_wall" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Block size</label>
                    <div className="flex gap-2">
                      {['4"', '6"', '8"'].map(s => (
                        <button key={s} type="button"
                          onClick={() => set("block_size", s)}
                          className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${values.block_size === s ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Toggle label="Include mortar" value={values.include_mortar} onChange={v => set("include_mortar", v)}/>
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                    <Toggle label="Include horizontal reinforcement bars" value={values.include_horiz_bars} onChange={v => set("include_horiz_bars", v)}/>
                    {values.include_horiz_bars && (
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <BarPicker label="Horizontal bar size" value={values.horiz_bar_size} onChange={v => set("horiz_bar_size", v)}/>
                        <NumInput label="Vertical spacing" value={values.horiz_bar_spacing} onChange={v => set("horiz_bar_spacing", v)} unit="mm" hint="Every 2-3 courses (600mm typical)"/>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Lintel fields */}
              {elementType === "lintel" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Width" value={values.lintel_width} onChange={v => set("lintel_width", v)} unit="mm"/>
                    <NumInput label="Depth" value={values.lintel_depth} onChange={v => set("lintel_depth", v)} unit="mm"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Top bars" value={values.lintel_top_bars} onChange={v => set("lintel_top_bars", v)}/>
                    <BarPicker label="Top bar size" value={values.lintel_top_bar} onChange={v => set("lintel_top_bar", v)}/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Bottom bars" value={values.lintel_bottom_bars} onChange={v => set("lintel_bottom_bars", v)}/>
                    <BarPicker label="Bottom bar size" value={values.lintel_bottom_bar} onChange={v => set("lintel_bottom_bar", v)}/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <BarPicker label="Link bar size" value={values.lintel_link_bar} onChange={v => set("lintel_link_bar", v)}/>
                    <NumInput label="Link spacing" value={values.lintel_link_spacing} onChange={v => set("lintel_link_spacing", v)} unit="mm"/>
                  </div>
                </>
              )}

              {/* Tie beam fields */}
              {elementType === "tie_beam" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Beam width" value={values.tie_width} onChange={v => set("tie_width", v)} unit="mm"/>
                    <NumInput label="Beam depth" value={values.tie_depth} onChange={v => set("tie_depth", v)} unit="mm" hint="Typically same as block width"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Top bars" value={values.tie_top_bars} onChange={v => set("tie_top_bars", v)}/>
                    <BarPicker label="Top bar size" value={values.tie_top_bar} onChange={v => set("tie_top_bar", v)}/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Bottom bars" value={values.tie_bottom_bars} onChange={v => set("tie_bottom_bars", v)}/>
                    <BarPicker label="Bottom bar size" value={values.tie_bottom_bar} onChange={v => set("tie_bottom_bar", v)}/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <BarPicker label="Link bar" value={values.tie_link_bar} onChange={v => set("tie_link_bar", v)}/>
                    <NumInput label="Link spacing" value={values.tie_link_spacing} onChange={v => set("tie_link_spacing", v)} unit="mm"/>
                  </div>
                </>
              )}

              {/* Retaining wall fields */}
              {elementType === "retaining_wall" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Wall height" value={values.ret_height} onChange={v => set("ret_height", v)} unit="mm"/>
                    <NumInput label="Wall thickness" value={values.ret_thickness} onChange={v => set("ret_thickness", v)} unit="mm"/>
                  </div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Vertical bars</p>
                  <div className="grid grid-cols-2 gap-3">
                    <BarPicker label="Vertical bar size" value={values.ret_vert_bar} onChange={v => set("ret_vert_bar", v)}/>
                    <NumInput label="Vertical spacing" value={values.ret_vert_spacing} onChange={v => set("ret_vert_spacing", v)} unit="mm"/>
                  </div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Horizontal bars</p>
                  <div className="grid grid-cols-2 gap-3">
                    <BarPicker label="Horizontal bar size" value={values.ret_horiz_bar} onChange={v => set("ret_horiz_bar", v)}/>
                    <NumInput label="Horizontal spacing" value={values.ret_horiz_spacing} onChange={v => set("ret_horiz_spacing", v)} unit="mm"/>
                  </div>
                  <Toggle label="Include base slab" value={values.ret_include_base} onChange={v => set("ret_include_base", v)}/>
                  {values.ret_include_base && (
                    <div className="grid grid-cols-2 gap-3">
                      <NumInput label="Base width" value={values.ret_base_width} onChange={v => set("ret_base_width", v)} unit="mm"/>
                      <BarPicker label="Base bar size" value={values.ret_base_bar} onChange={v => set("ret_base_bar", v)}/>
                    </div>
                  )}
                </>
              )}

              {/* Plastering fields */}
              {elementType === "plastering" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Number of coats" value={values.plaster_coats} onChange={v => set("plaster_coats", v)} hint="Typically 2 coats"/>
                    <NumInput label="Thickness per coat" value={values.plaster_thickness} onChange={v => set("plaster_thickness", v)} unit="mm"/>
                  </div>
                  <Toggle label="Include scratch coat" value={values.include_scratch_coat} onChange={v => set("include_scratch_coat", v)}/>
                </>
              )}

              {/* Tiling fields */}
              {elementType === "tiling" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Tile size</label>
                    <div className="grid grid-cols-4 gap-2">
                      {["12x12", "18x18", "24x24", "12x24"].map(s => (
                        <button key={s} type="button"
                          onClick={() => set("tile_size", s)}
                          className={`py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${values.tile_size === s ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {s}"
                        </button>
                      ))}
                    </div>
                  </div>
                  <NumInput label="Waste %" value={values.tile_waste} onChange={v => set("tile_waste", v)} hint="10% for straight lay, 15% for diagonal"/>
                  <Toggle label="Include adhesive" value={values.include_adhesive} onChange={v => set("include_adhesive", v)}/>
                  <Toggle label="Include grout" value={values.include_grout} onChange={v => set("include_grout", v)}/>
                </>
              )}

              {/* Painting fields */}
              {elementType === "painting" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Number of coats" value={values.paint_coats} onChange={v => set("paint_coats", v)} hint="Typically 2 coats"/>
                    <NumInput label="Coverage" value={values.paint_coverage} onChange={v => set("paint_coverage", v)} unit="sf/gal" hint="350-400 sf per gallon"/>
                  </div>
                  <Toggle label="Include primer coat" value={values.include_primer} onChange={v => set("include_primer", v)}/>
                </>
              )}

              {/* Ceiling fields */}
              {elementType === "ceiling" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Ceiling type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[["t-bar", "T-Bar Grid"], ["gyp-board", "Gypsum Board"]].map(([key, label]) => (
                        <button key={key} type="button"
                          onClick={() => set("ceiling_type", key)}
                          className={`py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${values.ceiling_type === key ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {values.ceiling_type === "t-bar" && (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Tile size</label>
                      <div className="flex gap-2">
                        {["2x2", "2x4"].map(s => (
                          <button key={s} type="button"
                            onClick={() => set("ceiling_tile_size", s)}
                            className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${values.ceiling_tile_size === s ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                            {s}ft
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Roofing fields */}
              {elementType === "roofing" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Sheet type</label>
                    <div className="flex gap-2">
                      {[["corrugated", "Corrugated Zinc"], ["standing-seam", "Standing Seam"]].map(([key, label]) => (
                        <button key={key} type="button"
                          onClick={() => set("roof_sheet_type", key)}
                          className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${values.roof_sheet_type === key ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Sheet length" value={values.roof_sheet_length} onChange={v => set("roof_sheet_length", v)} unit="ft" hint="8ft, 10ft, 12ft"/>
                    <NumInput label="Roof pitch" value={values.roof_pitch} onChange={v => set("roof_pitch", v)} unit="°" hint="Angle in degrees"/>
                  </div>
                  <Toggle label="Include purlins" value={values.include_purlins} onChange={v => set("include_purlins", v)}/>
                  {values.include_purlins && (
                    <NumInput label="Purlin spacing" value={values.purlin_spacing} onChange={v => set("purlin_spacing", v)} unit="mm" hint="Typically 600mm"/>
                  )}
                  <Toggle label="Include ridge cap" value={values.include_ridge} onChange={v => set("include_ridge", v)}/>
                </>
              )}

              {/* Drywall Partition */}
              {elementType === "drywall_partition" && (
                <>
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
                    💡 Enter wall <strong>length × height</strong> in the BOQ. System calculates all framing, boards, and screws automatically.
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Stud size</label>
                    <div className="flex gap-2">
                      {['2-1/2"', '3-5/8"', '6"'].map(s => (
                        <button key={s} type="button"
                          onClick={() => set("stud_size", s)}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${values.stud_size === s ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Stud spacing" value={values.stud_spacing} onChange={v => set("stud_spacing", v)} unit="mm" hint="400mm or 600mm"/>
                    <NumInput label="Gypsum layers per side" value={values.drywall_layers} onChange={v => set("drywall_layers", v)} hint="1 standard, 2 for fire rating"/>
                  </div>
                  <Toggle label="Board on both sides" value={values.drywall_both_sides} onChange={v => set("drywall_both_sides", v)}/>
                  <Toggle label="Include insulation" value={values.include_insulation} onChange={v => set("include_insulation", v)}/>
                </>
              )}

              {/* Drywall Painting */}
              {elementType === "drywall_painting" && (
                <>
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
                    💡 Drywall needs PVA sealer before painting to seal the surface. Enter wall <strong>length × height</strong> in BOQ.
                  </div>
                  <NumInput label="Number of paint coats" value={values.drywall_paint_coats} onChange={v => set("drywall_paint_coats", v)} hint="Typically 2 coats"/>
                  <Toggle label="Include PVA sealer coat" value={values.include_pva_sealer} onChange={v => set("include_pva_sealer", v)}/>
                </>
              )}

              {/* Chain Link */}
              {elementType === "chain_link" && (
                <>
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
                    💡 Enter total <strong>fence length</strong> in the BOQ.
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Fence height" value={values.fence_height} onChange={v => set("fence_height", v)} unit="mm" hint="1800mm typical"/>
                    <NumInput label="Post spacing" value={values.fence_post_spacing} onChange={v => set("fence_post_spacing", v)} unit="mm" hint="3000mm typical"/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Chain link gauge</label>
                    <div className="flex gap-2">
                      {["9 gauge", "11 gauge"].map(g => (
                        <button key={g} type="button"
                          onClick={() => set("chain_link_gauge", g)}
                          className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${values.chain_link_gauge === g ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Toggle label="Include top rail" value={values.include_top_rail} onChange={v => set("include_top_rail", v)}/>
                  <Toggle label="Concrete in post holes" value={values.include_concrete_posts} onChange={v => set("include_concrete_posts", v)}/>
                </>
              )}

              {/* Ground Floor Slab */}
              {elementType === "ground_slab" && (
                <>
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
                    💡 Enter slab <strong>length × width</strong> in the BOQ.
                  </div>
                  <NumInput label="Slab thickness" value={values.ground_slab_thickness} onChange={v => set("ground_slab_thickness", v)} unit="mm" hint="Typically 100-150mm"/>
                  <Toggle label="Use BRC mesh instead of bars" value={values.include_mesh} onChange={v => set("include_mesh", v)}/>
                  {values.include_mesh ? (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Mesh type</label>
                      <div className="flex gap-2">
                        {["BRC 4x4 W4", "BRC 6x6 W2.9"].map(m => (
                          <button key={m} type="button"
                            onClick={() => set("mesh_type", m)}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${values.mesh_type === m ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <BarPicker label="Bar size" value={values.ground_slab_bar} onChange={v => set("ground_slab_bar", v)}/>
                      <NumInput label="Bar spacing (both ways)" value={values.ground_slab_bar_spacing} onChange={v => set("ground_slab_bar_spacing", v)} unit="mm"/>
                    </div>
                  )}
                  <Toggle label="Include sand fill" value={values.include_sand_fill} onChange={v => set("include_sand_fill", v)}/>
                  {values.include_sand_fill && (
                    <NumInput label="Sand fill depth" value={values.sand_fill_depth} onChange={v => set("sand_fill_depth", v)} unit="mm" hint="Typically 150mm compacted"/>
                  )}
                  <Toggle label="Include DPC membrane" value={values.include_dpc} onChange={v => set("include_dpc", v)}/>
                </>
              )}

              {/* Septic Tank */}
              {elementType === "septic_tank" && (
                <>
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
                    💡 All quantities are calculated from the tank dimensions below — no BOQ measurement needed. Just enter <strong>count = 1</strong>.
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <NumInput label="Length" value={values.septic_length} onChange={v => set("septic_length", v)} unit="mm"/>
                    <NumInput label="Width" value={values.septic_width} onChange={v => set("septic_width", v)} unit="mm"/>
                    <NumInput label="Depth" value={values.septic_depth} onChange={v => set("septic_depth", v)} unit="mm"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Wall thickness" value={values.septic_wall_thickness} onChange={v => set("septic_wall_thickness", v)} unit="mm"/>
                    <BarPicker label="Bar size" value={values.septic_bar} onChange={v => set("septic_bar", v)}/>
                  </div>
                  <NumInput label="Bar spacing" value={values.septic_bar_spacing} onChange={v => set("septic_bar_spacing", v)} unit="mm"/>
                  <Toggle label="Include cover slab" value={values.include_cover_slab} onChange={v => set("include_cover_slab", v)}/>
                </>
              )}

              {/* Drain / Gutter */}
              {elementType === "drain_gutter" && (
                <>
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
                    💡 Enter total drain <strong>length</strong> in BOQ.
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <NumInput label="Width" value={values.drain_width} onChange={v => set("drain_width", v)} unit="mm"/>
                    <NumInput label="Depth" value={values.drain_depth} onChange={v => set("drain_depth", v)} unit="mm"/>
                    <NumInput label="Wall thickness" value={values.drain_thickness} onChange={v => set("drain_thickness", v)} unit="mm"/>
                  </div>
                  <BarPicker label="Bar size" value={values.drain_bar} onChange={v => set("drain_bar", v)}/>
                  <Toggle label="Include grating cover" value={values.include_drain_cover} onChange={v => set("include_drain_cover", v)}/>
                </>
              )}

              {/* Staircase fields */}
              {elementType === "staircase" && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <NumInput label="Number of stairs" value={values.num_stairs} onChange={v => set("num_stairs", v)}/>
                    <NumInput label="Going (tread)" value={values.going} onChange={v => set("going", v)} unit="mm"/>
                    <NumInput label="Riser (height)" value={values.riser} onChange={v => set("riser", v)} unit="mm"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Stair width" value={values.stair_width} onChange={v => set("stair_width", v)} unit="mm"/>
                    <BarPicker label="Bar size" value={values.stair_bar} onChange={v => set("stair_bar", v)}/>
                  </div>
                  <NumInput label="Bar spacing" value={values.stair_bar_spacing} onChange={v => set("stair_bar_spacing", v)} unit="mm"/>
                </>
              )}

              {/* Pad footing fields */}
              {elementType === "pad_footing" && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <NumInput label="Width" value={values.footing_width} onChange={v => set("footing_width", v)} unit="mm"/>
                    <NumInput label="Length" value={values.footing_depth} onChange={v => set("footing_depth", v)} unit="mm"/>
                    <NumInput label="Thickness" value={values.footing_thickness} onChange={v => set("footing_thickness", v)} unit="mm"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <BarPicker label="Bar size (both ways)" value={values.footing_bar} onChange={v => set("footing_bar", v)}/>
                    <NumInput label="Bar spacing" value={values.footing_spacing} onChange={v => set("footing_spacing", v)} unit="mm"/>
                  </div>
                </>
              )}

              {/* Strip Footing */}
              {elementType === "strip_footing" && (
                <>
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
                    💡 Strip footing runs continuously along the base of all walls. Enter the <strong>total perimeter length</strong> in the BOQ.
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Footing width" value={values.strip_width} onChange={v => set("strip_width", v)} unit="mm" hint="Typically 450mm"/>
                    <NumInput label="Footing depth" value={values.strip_depth} onChange={v => set("strip_depth", v)} unit="mm" hint="Typically 225mm"/>
                  </div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Longitudinal bars (run along length)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Number of bars" value={values.strip_long_bars} onChange={v => set("strip_long_bars", v)} hint="Typically 2 or 3"/>
                    <BarPicker label="Bar size" value={values.strip_long_bar} onChange={v => set("strip_long_bar", v)}/>
                  </div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cross bars (links across width)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <BarPicker label="Cross bar size" value={values.strip_link_bar} onChange={v => set("strip_link_bar", v)}/>
                    <NumInput label="Spacing" value={values.strip_link_spacing} onChange={v => set("strip_link_spacing", v)} unit="mm" hint="Typically 300mm"/>
                  </div>
                  <Toggle label="Include blinding concrete under footing" value={values.include_blinding} onChange={v => set("include_blinding", v)}/>
                  {values.include_blinding && (
                    <NumInput label="Blinding thickness" value={values.blinding_thickness} onChange={v => set("blinding_thickness", v)} unit="mm" hint="Typically 75mm lean mix"/>
                  )}
                </>
              )}

              {/* Blinding */}
              {elementType === "blinding" && (
                <>
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
                    💡 Blinding is a thin layer of lean mix concrete laid on the ground before the main foundation. Enter <strong>length × width</strong> of the area in the BOQ.
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Thickness" value={values.blinding_only_thickness} onChange={v => set("blinding_only_thickness", v)} unit="mm" hint="Typically 75mm"/>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Concrete grade</label>
                      <div className="flex gap-2">
                        {["2000 PSI", "2500 PSI", "3000 PSI"].map(g => (
                          <button key={g} type="button"
                            onClick={() => set("blinding_grade", g)}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${values.blinding_grade === g ? "border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Common options — only structural types actually consume these;
                  block_wall and the finish trades don't reference them at all. */}
              {!["block_wall", "plastering", "tiling", "painting", "ceiling", "roofing", "blinding", "ground_slab", "drywall_partition", "drywall_painting", "chain_link", "septic_tank", "drain_gutter"].includes(elementType) && (
                <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Include in Assembly</p>
                  <Toggle label="Ready Mix Concrete" value={values.include_concrete} onChange={v => set("include_concrete", v)}/>
                  <Toggle label="Formwork" value={values.include_formwork} onChange={v => set("include_formwork", v)}/>
                  <Toggle label="Labor" value={values.include_labor} onChange={v => set("include_labor", v)}/>
                </div>
              )}
            </div>
          )}

          {/* STEP 3 — Preview */}
          {step === "preview" && (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-500/10 rounded-xl p-4">
                <p className="text-sm font-bold text-blue-700 dark:text-blue-300 mb-1">{values.name}</p>
                <p className="text-xs text-blue-500">Preview based on 3m × 3m × 3m</p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left px-4 py-2 text-slate-500 font-semibold">Component</th>
                      <th className="text-left px-4 py-2 text-slate-500 font-semibold hidden sm:table-cell">Formula</th>
                      <th className="text-right px-4 py-2 text-slate-500 font-semibold">Preview Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {components.map((c, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-700 dark:text-slate-200">{c.item_name}</div>
                          <div className="text-slate-400 text-[10px]">{c.description}</div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <code className="text-purple-600 dark:text-purple-400 text-[10px] font-mono">{c.formula}</code>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-bold text-cyan-600 dark:text-cyan-400">
                            {calcPreview(c.formula, previewVars).toFixed(3)}
                          </span>
                          <span className="text-slate-400 ml-1">+{c.waste_percent}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-slate-400 text-center">
                These components will be added to your assembly. You can edit formulas afterwards in the Assembly Builder.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={() => {
              if (step === "configure") setStep("pick_type");
              else if (step === "preview") setStep("configure");
              else onClose();
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <ChevronLeft size={16}/>
            {step === "pick_type" ? "Cancel" : "Back"}
          </button>

          {step !== "pick_type" && (
            <div className="flex items-center gap-2">
              {/* Step indicators */}
              {["configure", "preview"].map((s, i) => (
                <div key={s} className={`w-2 h-2 rounded-full transition-colors ${step === s ? "bg-blue-500" : i < ["configure", "preview"].indexOf(step) ? "bg-blue-300" : "bg-slate-200 dark:bg-slate-700"}`}/>
              ))}
            </div>
          )}

          {step === "configure" && (
            <button
              onClick={() => setStep("preview")}
              disabled={!values.name.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
              Preview
              <ChevronRight size={16}/>
            </button>
          )}

          {step === "preview" && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
              {saving ? "Saving..." : <><Check size={16}/> Save Assembly</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
