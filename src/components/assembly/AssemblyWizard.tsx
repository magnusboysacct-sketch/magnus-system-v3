import React, { useState, useMemo, useEffect } from "react";
import { X, ChevronRight, ChevronLeft, Check, AlertCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import CostItemPicker, { type CostItem } from "../common/CostItemPicker";

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
  { key: "setting_out",   label: "Setting Out",      icon: "📍", group: "Structural",  category: "Preliminary Works" },
  { key: "excavation",    label: "Excavation",       icon: "⛏️", group: "Structural",  category: "Preliminary Works" },
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
  { key: "rough_render",    label: "Rough Render",      icon: "🪨", group: "Finishes", category: "Plastering" },
  { key: "float_coat",      label: "Float Coat",         icon: "🪣", group: "Finishes", category: "Plastering" },
  { key: "skim_coat",       label: "Skim Coat",          icon: "✨", group: "Finishes", category: "Plastering" },
  { key: "floor_screed",    label: "Floor Screed",       icon: "🔲", group: "Finishes", category: "Plastering" },
  { key: "waterproof_render", label: "Waterproof Render", icon: "💧", group: "Finishes", category: "Plastering" },
  { key: "tyrolean",        label: "Tyrolean/Roughcast", icon: "🏚️", group: "Finishes", category: "Plastering" },
  { key: "wall_tiling",     label: "Wall Tiling",        icon: "🟦", group: "Finishes", category: "Tiling & Flooring" },
  { key: "ground_slab",   label: "Ground Floor Slab",icon: "⬜", group: "Structural",  category: "Concrete Works" },
  // Partitions
  { key: "drywall_partition", label: "Drywall Partition", icon: "🏢", group: "Partitions", category: "Drywall & Plastering" },
  { key: "drywall_painting",  label: "Drywall Painting",  icon: "🖌️", group: "Partitions", category: "Painting" },
  // External
  { key: "chain_link",        label: "Chain Link Fence",  icon: "🔗", group: "External",   category: "Fencing" },
  { key: "septic_tank",       label: "Septic Tank",       icon: "🪣", group: "External",   category: "Drainage" },
  { key: "drain_gutter",      label: "Drain / Gutter",    icon: "💧", group: "External",   category: "Drainage" },
  // Plumbing
  { key: "water_supply",     label: "Water Supply",      icon: "🚿", group: "Plumbing",   category: "Plumbing" },
  { key: "drainage_piping",  label: "Drainage Piping",   icon: "🪠", group: "Plumbing",   category: "Plumbing" },
  { key: "plumbing_fixtures",label: "Bathroom Fitout",   icon: "🛁", group: "Plumbing",   category: "Plumbing" },
  // Electrical
  { key: "electrical_wiring",label: "Electrical Wiring", icon: "⚡", group: "Electrical", category: "Electrical" },
  { key: "electrical_fitout",label: "Electrical Fitout", icon: "🔌", group: "Electrical", category: "Electrical" },
  // Doors & Windows
  { key: "door_solid",       label: "Door (Solid)",      icon: "🚪", group: "Doors & Windows", category: "Doors & Windows" },
  { key: "window_aluminum",  label: "Window (Aluminum)", icon: "🪟", group: "Doors & Windows", category: "Doors & Windows" },
  { key: "window_louvre",    label: "Window (Louvre)",   icon: "🪟", group: "Doors & Windows", category: "Doors & Windows" },
  // Structural Steel
  { key: "roof_truss",       label: "Roof Truss",        icon: "🏗️", group: "Structural Steel", category: "Structural Steel" },
  // External
  { key: "paving",           label: "Paving",            icon: "🛣️", group: "External",  category: "External Works" },
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

  // Water supply
  water_pipe_size: string;      // "1/2\"" "3/4\"" "1\""
  water_pipe_material: string;  // "CPVC" "PEX" "Galvanized"
  water_num_fixtures: number;
  water_include_fittings: boolean;

  // Drainage
  drain_pipe_size: string;      // "4\"" "3\"" "2\""
  drain_pipe_material: string;  // "PVC" "Cast Iron"
  drain_num_wc: number;
  drain_num_basins: number;
  drain_include_fittings: boolean;
  drain_include_vent: boolean;

  // Plumbing fixtures
  num_wc: number;
  num_washbasin: number;
  num_shower: number;
  num_bath: number;
  fixture_grade: string;        // "standard" "mid" "premium"

  // Electrical wiring
  num_circuits: number;
  circuit_length: number;       // avg metres per circuit
  wire_size: string;            // "12 AWG" "10 AWG"
  conduit_type: string;         // "EMT" "PVC"
  include_conduit: boolean;

  // Electrical fitout
  num_outlets: number;
  num_switches: number;
  num_lights: number;
  num_ac_points: number;
  include_db: boolean;          // distribution board
  db_breakers: number;

  // Door
  door_width: number;           // mm
  door_height: number;          // mm
  door_material: string;        // "solid-wood" "hollow-core" "steel"
  door_include_frame: boolean;
  door_include_hardware: boolean;
  door_include_paint: boolean;

  // Window aluminum
  win_width: number;            // mm
  win_height: number;           // mm
  win_type: string;             // "sliding" "casement" "awning"
  win_glass: string;            // "clear" "tinted" "frosted"
  win_include_grille: boolean;

  // Window louvre
  louv_width: number;           // mm
  louv_height: number;          // mm
  louv_blade_material: string;  // "glass" "aluminum"
  louv_num_blades: number;

  // Roof truss
  truss_span: number;           // mm — width of building
  truss_spacing: number;        // mm — spacing between trusses
  truss_pitch: number;          // degrees
  truss_type: string;           // "fink" "howe" "mono-pitch"
  truss_steel_size: string;     // "2x2x1/8" "2x3x3/16"
  truss_include_purlins: boolean;
  truss_purlin_spacing: number; // mm
  truss_include_ridge: boolean;

  // Paving
  paving_type: string;          // "concrete" "asphalt" "pavers" "tiles"
  paving_thickness: number;     // mm
  paving_sub_base: boolean;
  sub_base_thickness: number;   // mm
  paving_include_curb: boolean;

  // Setting out
  setting_out_perimeter: number;    // metres — total wall perimeter
  include_profiles: boolean;        // timber profile boards
  profile_post_spacing: number;     // mm spacing between profile posts
  include_builders_line: boolean;
  include_lime_marking: boolean;

  // Excavation
  excav_width: number;              // mm — trench width
  excav_depth: number;              // mm — trench depth
  excav_method: string;             // "manual" "machine" "mixed"
  include_spoil_removal: boolean;   // truck away excavated material
  include_backfill: boolean;        // backfill after foundation
  backfill_percent: number;         // % of excavation to backfill
  include_compaction: boolean;      // compact backfill

  // Rough render
  rough_render_thickness: number;   // mm typically 15
  rough_render_mix: string;         // "1:3" "1:4"

  // Float coat
  float_thickness: number;          // mm typically 10
  float_mix: string;                // "1:3" "1:4"

  // Skim coat
  skim_thickness: number;           // mm typically 3-5
  skim_type: string;                // "cement-lime" "gypsum"

  // Floor screed
  screed_thickness: number;         // mm typically 50-75
  screed_mix: string;               // "1:3" "1:4"
  screed_reinforced: boolean;       // include wire mesh
  screed_finish: string;            // "steel-trowel" "wood-float" "power-float"

  // Waterproof render
  waterproof_coats: number;         // typically 2
  waterproof_thickness: number;     // mm per coat
  waterproof_additive: string;      // "sika" "aquaseal" "hydrostop"

  // Tyrolean
  tyrolean_coats: number;           // typically 2-3
  tyrolean_type: string;            // "machine" "hand"

  // Wall tiling
  wall_tile_size: string;           // "4x4" "6x6" "8x10" "12x24"
  wall_tile_waste: number;          // % waste
  wall_include_adhesive: boolean;
  wall_include_grout: boolean;
  wall_include_trim: boolean;       // edge trim tiles
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
  water_pipe_size: "1/2\"",
  water_pipe_material: "CPVC",
  water_num_fixtures: 6,
  water_include_fittings: true,
  drain_pipe_size: "4\"",
  drain_pipe_material: "PVC",
  drain_num_wc: 1,
  drain_num_basins: 1,
  drain_include_fittings: true,
  drain_include_vent: true,
  num_wc: 1,
  num_washbasin: 1,
  num_shower: 1,
  num_bath: 0,
  fixture_grade: "standard",
  num_circuits: 8,
  circuit_length: 15,
  wire_size: "12 AWG",
  conduit_type: "PVC",
  include_conduit: true,
  num_outlets: 10,
  num_switches: 8,
  num_lights: 10,
  num_ac_points: 2,
  include_db: true,
  db_breakers: 12,
  door_width: 900,
  door_height: 2100,
  door_material: "solid-wood",
  door_include_frame: true,
  door_include_hardware: true,
  door_include_paint: true,
  win_width: 1200,
  win_height: 1050,
  win_type: "sliding",
  win_glass: "clear",
  win_include_grille: true,
  louv_width: 900,
  louv_height: 900,
  louv_blade_material: "glass",
  louv_num_blades: 6,
  truss_span: 8000,
  truss_spacing: 1200,
  truss_pitch: 25,
  truss_type: "fink",
  truss_steel_size: "2x2x1/8",
  truss_include_purlins: true,
  truss_purlin_spacing: 600,
  truss_include_ridge: true,
  paving_type: "concrete",
  paving_thickness: 100,
  paving_sub_base: true,
  sub_base_thickness: 150,
  paving_include_curb: false,
  setting_out_perimeter: 0,
  include_profiles: true,
  profile_post_spacing: 1200,
  include_builders_line: true,
  include_lime_marking: true,
  excav_width: 600,
  excav_depth: 900,
  excav_method: "manual",
  include_spoil_removal: true,
  include_backfill: true,
  backfill_percent: 30,
  include_compaction: true,
  rough_render_thickness: 15,
  rough_render_mix: "1:3",
  float_thickness: 10,
  float_mix: "1:4",
  skim_thickness: 4,
  skim_type: "cement-lime",
  screed_thickness: 50,
  screed_mix: "1:3",
  screed_reinforced: false,
  screed_finish: "steel-trowel",
  waterproof_coats: 2,
  waterproof_thickness: 6,
  waterproof_additive: "sika",
  tyrolean_coats: 2,
  tyrolean_type: "machine",
  wall_tile_size: "8x10",
  wall_tile_waste: 10,
  wall_include_adhesive: true,
  wall_include_grout: true,
  wall_include_trim: true,
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

// The review step's working copy of a generated component: still everything
// generateComponents() produced, plus whatever the Rate Library match-finder
// (or the user, via CostItemPicker) resolved it to. Nothing is written to the
// database until every row is either matched or explicitly skipped — see the
// "preview" step and handleSave below.
interface ReviewComponent extends GeneratedComponent {
  cost_item_id: string | null;
  matched_item_name: string | null;
  match_status: "auto_matched" | "user_matched" | "unmatched" | "skipped";
}

function generateComponents(elementType: string, v: WizardValues): GeneratedComponent[] {
  const w = v.col_width / 1000;
  const d = v.col_depth / 1000;
  const sp = v.spacing / 1000;
  const hook = v.hook_allowance / 1000;
  const mw = barWeight(v.main_bar);
  const lw = barWeight(v.link_bar);

  switch (elementType) {
    case "setting_out": {
      const psp = v.profile_post_spacing / 1000;
      const comps: GeneratedComponent[] = [];
      if (v.include_profiles) {
        comps.push({
          item_name: "Timber Profile Post 2×2",
          type: "material",
          formula: `(length / ${psp}) * 2`,
          waste_percent: 10,
          description: `Profile posts @ ${v.profile_post_spacing}mm — both sides of trench`,
        });
        comps.push({
          item_name: "Profile Board 1×6",
          type: "material",
          formula: "length * 2",
          waste_percent: 10,
          description: "Horizontal profile boards (lf)",
        });
        comps.push({
          item_name: "Nail (Assorted)",
          type: "material",
          formula: `(length / ${psp}) * 0.1`,
          waste_percent: 5,
          description: "Nails for profile boards (lbs)",
        });
      }
      if (v.include_builders_line) comps.push({
        item_name: "Builder's Line / String Line",
        type: "material",
        formula: "length * 3",
        waste_percent: 20,
        description: "String line for setting out (lf)",
      });
      if (v.include_lime_marking) comps.push({
        item_name: "Hydrated Lime / Chalk",
        type: "material",
        formula: "length * 0.02",
        waste_percent: 10,
        description: "Lime powder for ground marking (bags)",
      });
      comps.push({
        item_name: "Labor - Setting Out",
        type: "labor",
        formula: "length * 0.3",
        waste_percent: 0,
        description: "Setting out labor (man-hours)",
      });
      return comps;
    }

    case "excavation": {
      const ew = v.excav_width / 1000;
      const ed = v.excav_depth / 1000;
      const comps: GeneratedComponent[] = [
        {
          item_name: v.excav_method === "machine" ? "Excavator Hire" : "Labor - Excavation",
          type: v.excav_method === "machine" ? "equipment" : "labor",
          formula: v.excav_method === "machine"
            ? `length * ${ew} * ${ed} * 0.5`   // machine: 0.5 hrs per m³
            : `length * ${ew} * ${ed} * 4`,     // manual: 4 man-hours per m³
          waste_percent: 0,
          description: v.excav_method === "machine"
            ? `Machine excavation ${v.excav_width}×${v.excav_depth}mm trench (hours)`
            : `Manual excavation ${v.excav_width}×${v.excav_depth}mm trench (man-hours)`,
        },
      ];
      if (v.excav_method === "mixed") comps.push({
        item_name: "Excavator Hire",
        type: "equipment",
        formula: `length * ${ew} * ${ed} * 0.25`,
        waste_percent: 0,
        description: "Machine excavation (hours)",
      });
      if (v.include_spoil_removal) comps.push({
        item_name: "Tipper Truck Hire",
        type: "equipment",
        formula: `length * ${ew} * ${ed} * ${(100 - v.backfill_percent) / 100} / 5`,
        waste_percent: 0,
        description: `Spoil removal — ${100 - v.backfill_percent}% of excavation (truck loads)`,
      });
      if (v.include_backfill) {
        comps.push({
          item_name: "Labor - Backfill",
          type: "labor",
          formula: `length * ${ew} * ${ed} * ${v.backfill_percent / 100} * 2`,
          waste_percent: 0,
          description: `Backfill ${v.backfill_percent}% of excavation (man-hours)`,
        });
        if (v.include_compaction) comps.push({
          item_name: "Compactor / Wacker Plate Hire",
          type: "equipment",
          formula: `length * ${ew} * ${ed} * ${v.backfill_percent / 100} * 0.5`,
          waste_percent: 0,
          description: "Compaction of backfill (hours)",
        });
      }
      return comps;
    }

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

    case "water_supply": {
      const fittingsFactor = v.water_include_fittings ? 0.3 : 0;
      return [
        {
          item_name: `${v.water_pipe_material} Pipe ${v.water_pipe_size}`,
          type: "material",
          formula: `length * 1.1`,
          waste_percent: 10,
          description: `${v.water_pipe_size} ${v.water_pipe_material} supply pipe (lf)`,
        },
        ...(v.water_include_fittings ? [{
          item_name: `Pipe Fitting ${v.water_pipe_size}`,
          type: "material",
          formula: `length * ${fittingsFactor}`,
          waste_percent: 10,
          description: "Elbows, tees, couplings (est. 30% of pipe length)",
        }] : []),
        {
          item_name: "Labor - Plumbing",
          type: "labor",
          formula: "length * 0.4",
          waste_percent: 0,
          description: "Plumbing labor (man-hours)",
        },
      ];
    }

    case "drainage_piping": {
      return [
        {
          item_name: `${v.drain_pipe_material} Soil Pipe ${v.drain_pipe_size}`,
          type: "material",
          formula: "length * 1.1",
          waste_percent: 10,
          description: `${v.drain_pipe_size} ${v.drain_pipe_material} drainage pipe (lf)`,
        },
        ...(v.drain_include_fittings ? [{
          item_name: `Drainage Fitting ${v.drain_pipe_size}`,
          type: "material",
          formula: "length * 0.25",
          waste_percent: 10,
          description: "Bends, junctions, reducers",
        }] : []),
        ...(v.drain_include_vent ? [{
          item_name: `PVC Vent Pipe 2"`,
          type: "material",
          formula: `${v.drain_num_wc + v.drain_num_basins} * 3`,
          waste_percent: 5,
          description: "Vent stack per fixture",
        }] : []),
        {
          item_name: "Labor - Drainage",
          type: "labor",
          formula: "length * 0.5",
          waste_percent: 0,
          description: "Drainage labor (man-hours)",
        },
      ];
    }

    case "plumbing_fixtures": {
      const comps: GeneratedComponent[] = [];
      if (v.num_wc > 0) comps.push({
        item_name: "WC Suite (Toilet + Cistern)",
        type: "material",
        formula: `${v.num_wc}`,
        waste_percent: 0,
        description: `${v.num_wc} toilet suite(s) — ${v.fixture_grade} grade`,
      });
      if (v.num_washbasin > 0) comps.push({
        item_name: "Wash Basin + Pedestal",
        type: "material",
        formula: `${v.num_washbasin}`,
        waste_percent: 0,
        description: `${v.num_washbasin} wash basin(s)`,
      });
      if (v.num_shower > 0) comps.push({
        item_name: "Shower Set",
        type: "material",
        formula: `${v.num_shower}`,
        waste_percent: 0,
        description: `${v.num_shower} shower set(s)`,
      });
      if (v.num_bath > 0) comps.push({
        item_name: "Bathtub",
        type: "material",
        formula: `${v.num_bath}`,
        waste_percent: 0,
        description: `${v.num_bath} bathtub(s)`,
      });
      comps.push({
        item_name: "Labor - Fixture Install",
        type: "labor",
        formula: `${(v.num_wc + v.num_washbasin + v.num_shower + v.num_bath) * 3}`,
        waste_percent: 0,
        description: "Fixture installation labor (man-hours)",
      });
      return comps;
    }

    case "electrical_wiring": {
      return [
        {
          item_name: `${v.wire_size} Wire`,
          type: "material",
          formula: `${v.num_circuits} * length * 1.2`,
          waste_percent: 10,
          description: `${v.wire_size} electrical wire — ${v.num_circuits} circuits`,
        },
        ...(v.include_conduit ? [{
          item_name: `${v.conduit_type} Conduit`,
          type: "material",
          formula: `${v.num_circuits} * length * 1.1`,
          waste_percent: 10,
          description: `${v.conduit_type} conduit`,
        }] : []),
        {
          item_name: "Wire Connector",
          type: "material",
          formula: `${v.num_circuits} * length * 0.5`,
          waste_percent: 10,
          description: "Wire connectors and clips",
        },
        {
          item_name: "Labor - Electrical",
          type: "labor",
          formula: `${v.num_circuits} * length * 0.3`,
          waste_percent: 0,
          description: "Electrical wiring labor (man-hours)",
        },
      ];
    }

    case "electrical_fitout": {
      const comps: GeneratedComponent[] = [
        { item_name: "Electrical Outlet (Duplex)", type: "material", formula: `${v.num_outlets}`, waste_percent: 5, description: `${v.num_outlets} power outlets` },
        { item_name: "Light Switch", type: "material", formula: `${v.num_switches}`, waste_percent: 5, description: `${v.num_switches} switches` },
        { item_name: "Light Fitting", type: "material", formula: `${v.num_lights}`, waste_percent: 5, description: `${v.num_lights} light fittings` },
      ];
      if (v.num_ac_points > 0) comps.push({
        item_name: "AC Disconnect Box",
        type: "material",
        formula: `${v.num_ac_points}`,
        waste_percent: 0,
        description: `${v.num_ac_points} A/C points`,
      });
      if (v.include_db) comps.push({
        item_name: "Distribution Board",
        type: "material",
        formula: "1",
        waste_percent: 0,
        description: `${v.db_breakers} way distribution board`,
      }, {
        item_name: "Circuit Breaker",
        type: "material",
        formula: `${v.db_breakers}`,
        waste_percent: 0,
        description: `${v.db_breakers} circuit breakers`,
      });
      comps.push({
        item_name: "Labor - Electrical Fitout",
        type: "labor",
        formula: `${(v.num_outlets + v.num_switches + v.num_lights) * 1.5}`,
        waste_percent: 0,
        description: "Fitout labor (man-hours)",
      });
      return comps;
    }

    case "door_solid": {
      const dw = v.door_width / 1000;
      const dh = v.door_height / 1000;
      const comps: GeneratedComponent[] = [];
      if (v.door_include_frame) comps.push({
        item_name: "Door Frame",
        type: "material",
        formula: `count * ${((dw * 2 + dh * 2) + 0.3).toFixed(3)}`,
        waste_percent: 10,
        description: `Door frame (lf) — ${v.door_width}×${v.door_height}mm opening`,
      });
      comps.push({
        item_name: `Door ${v.door_material === "solid-wood" ? "Solid Wood" : v.door_material === "hollow-core" ? "Hollow Core" : "Steel"} ${v.door_width}×${v.door_height}`,
        type: "material",
        formula: "count",
        waste_percent: 0,
        description: `${v.door_width}mm × ${v.door_height}mm ${v.door_material} door`,
      });
      if (v.door_include_hardware) comps.push({
        item_name: "Door Hardware Set",
        type: "material",
        formula: "count",
        waste_percent: 0,
        description: "Hinges, handle, lock set",
      });
      if (v.door_include_paint) comps.push({
        item_name: "Paint",
        type: "material",
        formula: `count * ${(dw * dh * 2 / 400).toFixed(4)}`,
        waste_percent: 10,
        description: "Door paint (both sides, 2 coats)",
      });
      comps.push({
        item_name: "Labor - Door Install",
        type: "labor",
        formula: "count * 3",
        waste_percent: 0,
        description: "Door installation (man-hours per door)",
      });
      return comps;
    }

    case "window_aluminum": {
      const ww = v.win_width / 1000;
      const wh = v.win_height / 1000;
      const comps: GeneratedComponent[] = [
        {
          item_name: `Aluminum Window ${v.win_type} ${v.win_width}×${v.win_height}`,
          type: "material",
          formula: "count",
          waste_percent: 0,
          description: `${v.win_width}×${v.win_height}mm ${v.win_type} window — ${v.win_glass} glass`,
        },
      ];
      if (v.win_include_grille) comps.push({
        item_name: "Window Grille",
        type: "material",
        formula: "count",
        waste_percent: 0,
        description: "Security grille per window",
      });
      comps.push({
        item_name: "Sealant/Silicone",
        type: "material",
        formula: `count * ${((ww + wh) * 2 / 6).toFixed(3)}`,
        waste_percent: 10,
        description: "Perimeter sealant (tubes)",
      });
      comps.push({
        item_name: "Labor - Window Install",
        type: "labor",
        formula: "count * 2",
        waste_percent: 0,
        description: "Window installation (man-hours per window)",
      });
      return comps;
    }

    case "window_louvre": {
      const lw = v.louv_width / 1000;
      return [
        {
          item_name: `Louvre Frame ${v.louv_width}×${v.louv_height}`,
          type: "material",
          formula: "count",
          waste_percent: 0,
          description: `${v.louv_width}×${v.louv_height}mm louvre frame`,
        },
        {
          item_name: `Louvre ${v.louv_blade_material === "glass" ? "Glass" : "Aluminum"} Blade`,
          type: "material",
          formula: `count * ${v.louv_num_blades}`,
          waste_percent: 5,
          description: `${v.louv_num_blades} blades per window`,
        },
        {
          item_name: "Louvre Operator",
          type: "material",
          formula: "count",
          waste_percent: 0,
          description: "Operating mechanism per window",
        },
        {
          item_name: "Labor - Louvre Install",
          type: "labor",
          formula: "count * 1.5",
          waste_percent: 0,
          description: "Installation labor (man-hours)",
        },
      ];
    }

    case "roof_truss": {
      const trussSpacingM = v.truss_spacing / 1000;
      const trussSpanM = v.truss_span / 1000;
      // Rafter length = span/2 / cos(pitch)
      const pitchRad = (v.truss_pitch * Math.PI) / 180;
      const rafterLength = (trussSpanM / 2) / Math.cos(pitchRad);
      const totalTrussLength = rafterLength * 2 + trussSpanM * 1.5; // simplified truss steel
      const purlinSp = v.truss_purlin_spacing / 1000;
      return [
        {
          item_name: `Angle Iron ${v.truss_steel_size}`,
          type: "material",
          formula: `(length / ${trussSpacingM}) * ${totalTrussLength.toFixed(3)}`,
          waste_percent: 10,
          description: `Steel for ${v.truss_type} trusses @ ${v.truss_spacing}mm spacing`,
        },
        {
          item_name: "Bolt & Nut Set",
          type: "material",
          formula: `(length / ${trussSpacingM}) * 12`,
          waste_percent: 5,
          description: "Gusset plate bolts per truss",
        },
        {
          item_name: "Gusset Plate",
          type: "material",
          formula: `(length / ${trussSpacingM}) * 4`,
          waste_percent: 5,
          description: "Gusset plates per truss",
        },
        ...(v.truss_include_purlins ? [{
          item_name: "Purlin 2×4",
          type: "material",
          formula: `(${rafterLength.toFixed(3)} * 2 / ${purlinSp}) * length`,
          waste_percent: 10,
          description: `Purlins @ ${v.truss_purlin_spacing}mm`,
        }] : []),
        ...(v.truss_include_ridge ? [{
          item_name: `Angle Iron ${v.truss_steel_size}`,
          type: "material",
          formula: "length * 1.05",
          waste_percent: 5,
          description: "Ridge beam",
        }] : []),
        {
          item_name: "Labor - Steel Roofing",
          type: "labor",
          formula: `(length / ${trussSpacingM}) * 8`,
          waste_percent: 0,
          description: "Truss fabrication + erection (man-hours)",
        },
      ];
    }

    case "paving": {
      const pt = v.paving_thickness / 1000;
      const sbt = v.sub_base_thickness / 1000;
      const comps: GeneratedComponent[] = [];
      if (v.paving_sub_base) comps.push({
        item_name: "Crusher Run / Marl",
        type: "material",
        formula: `length * width * ${sbt}`,
        waste_percent: 10,
        description: `${v.sub_base_thickness}mm sub-base compacted fill`,
      });
      if (v.paving_type === "concrete") {
        comps.push({ item_name: "Ready Mix Concrete", type: "material", formula: `length * width * ${pt}`, waste_percent: 5, description: `${v.paving_thickness}mm concrete slab` });
        comps.push({ item_name: `BRC Mesh 4x4 W4`, type: "material", formula: `length * width * 1.1 / 14.4`, waste_percent: 10, description: "BRC mesh reinforcement" });
      } else if (v.paving_type === "pavers") {
        comps.push({ item_name: "Concrete Paver", type: "material", formula: `length * width * 1.05 / 0.0929`, waste_percent: 5, description: "Paving blocks (each)" });
        comps.push({ item_name: "Sand Bedding", type: "material", formula: `length * width * 0.05`, waste_percent: 10, description: "50mm sand bedding (m³)" });
        comps.push({ item_name: "Jointing Sand", type: "material", formula: `length * width * 0.01`, waste_percent: 10, description: "Jointing sand (m³)" });
      } else if (v.paving_type === "asphalt") {
        comps.push({ item_name: "Asphalt", type: "material", formula: `length * width * ${pt} * 2.4`, waste_percent: 5, description: `${v.paving_thickness}mm asphalt (tonnes)` });
      }
      if (v.paving_include_curb) comps.push({
        item_name: "Concrete Curb",
        type: "material",
        formula: "(length + width) * 2",
        waste_percent: 5,
        description: "Perimeter curbing (lf)",
      });
      comps.push({ item_name: "Labor - Paving", type: "labor", formula: "length * width * 0.3", waste_percent: 0, description: "Paving labor (man-hours)" });
      return comps;
    }

    case "rough_render": {
      // Mix ratio determines cement:sand quantities
      // 1:3 mix — 1 bag cement covers approx 8 sf at 15mm thick
      // Sand — approx 0.028 m³ per m² at 15mm
      const thicknessFactor = v.rough_render_thickness / 15;
      const mixFactor = v.rough_render_mix === "1:3" ? 1 : 0.8;
      return [
        {
          item_name: "Portland Cement",
          type: "material",
          formula: `length * height * ${(0.086 * thicknessFactor * mixFactor).toFixed(4)}`,
          waste_percent: 10,
          description: `Cement for ${v.rough_render_mix} render at ${v.rough_render_thickness}mm (bags)`,
        },
        {
          item_name: "Sharp Sand",
          type: "material",
          formula: `length * height * ${(0.028 * thicknessFactor).toFixed(4)}`,
          waste_percent: 10,
          description: `Sharp sand for rough render (m³)`,
        },
        {
          item_name: "Labor - Rendering",
          type: "labor",
          formula: "length * height * 0.6",
          waste_percent: 0,
          description: "Rough render labor (man-hours)",
        },
      ];
    }

    case "float_coat": {
      const thicknessFactor = v.float_thickness / 10;
      const mixFactor = v.float_mix === "1:3" ? 1 : 0.8;
      return [
        {
          item_name: "Portland Cement",
          type: "material",
          formula: `length * height * ${(0.057 * thicknessFactor * mixFactor).toFixed(4)}`,
          waste_percent: 10,
          description: `Cement for ${v.float_mix} float coat at ${v.float_thickness}mm (bags)`,
        },
        {
          item_name: "Fine Sand",
          type: "material",
          formula: `length * height * ${(0.019 * thicknessFactor).toFixed(4)}`,
          waste_percent: 10,
          description: "Fine sand for float coat (m³)",
        },
        {
          item_name: "Labor - Float Coat",
          type: "labor",
          formula: "length * height * 0.5",
          waste_percent: 0,
          description: "Float coat labor (man-hours)",
        },
      ];
    }

    case "skim_coat": {
      const isGypsum = v.skim_type === "gypsum";
      return [
        ...(isGypsum ? [{
          item_name: "Gypsum Plaster",
          type: "material",
          formula: "length * height * 0.008",
          waste_percent: 10,
          description: `Gypsum skim at ${v.skim_thickness}mm (bags)`,
        }] : [
          {
            item_name: "Portland Cement",
            type: "material",
            formula: "length * height * 0.025",
            waste_percent: 10,
            description: "Cement for skim coat (bags)",
          },
          {
            item_name: "Hydrated Lime",
            type: "material",
            formula: "length * height * 0.012",
            waste_percent: 10,
            description: "Lime for skim coat (bags)",
          },
        ]),
        {
          item_name: "Labor - Skim Coat",
          type: "labor",
          formula: "length * height * 0.4",
          waste_percent: 0,
          description: "Skim coat labor (man-hours) — fine finish",
        },
      ];
    }

    case "floor_screed": {
      const st = v.screed_thickness / 1000;
      const mixFactor = v.screed_mix === "1:3" ? 1 : 0.8;
      const comps: GeneratedComponent[] = [
        {
          item_name: "Portland Cement",
          type: "material",
          formula: `length * width * ${(st * 300 * mixFactor).toFixed(3)}`,
          waste_percent: 10,
          description: `Cement for ${v.screed_mix} screed at ${v.screed_thickness}mm (bags)`,
        },
        {
          item_name: "Sharp Sand",
          type: "material",
          formula: `length * width * ${st.toFixed(4)}`,
          waste_percent: 10,
          description: `Sand for floor screed (m³)`,
        },
      ];
      if (v.screed_reinforced) comps.push({
        item_name: "Wire Mesh (Chicken Wire)",
        type: "material",
        formula: "length * width * 1.1",
        waste_percent: 10,
        description: "Light mesh reinforcement (m²)",
      });
      comps.push({
        item_name: "Labor - Floor Screed",
        type: "labor",
        formula: `length * width * ${v.screed_finish === "power-float" ? 0.3 : 0.5}`,
        waste_percent: 0,
        description: `${v.screed_finish} finish screed labor (man-hours)`,
      });
      if (v.screed_finish === "power-float") comps.push({
        item_name: "Power Float Hire",
        type: "equipment",
        formula: "length * width * 0.05",
        waste_percent: 0,
        description: "Power float machine hire (hours)",
      });
      return comps;
    }

    case "waterproof_render": {
      const wpFactor = v.waterproof_coats * (v.waterproof_thickness / 6);
      return [
        {
          item_name: "Portland Cement",
          type: "material",
          formula: `length * height * ${(0.057 * wpFactor).toFixed(4)}`,
          waste_percent: 10,
          description: `Cement for waterproof render ${v.waterproof_coats} coat(s) (bags)`,
        },
        {
          item_name: "Fine Sand",
          type: "material",
          formula: `length * height * ${(0.019 * wpFactor).toFixed(4)}`,
          waste_percent: 10,
          description: "Sand for waterproof render (m³)",
        },
        {
          item_name: `Waterproof Additive (${v.waterproof_additive})`,
          type: "material",
          formula: `length * height * ${(0.15 * v.waterproof_coats).toFixed(3)}`,
          waste_percent: 5,
          description: `${v.waterproof_additive} waterproofing additive (litres)`,
        },
        {
          item_name: "Labor - Waterproof Render",
          type: "labor",
          formula: `length * height * ${(0.5 * v.waterproof_coats).toFixed(2)}`,
          waste_percent: 0,
          description: `Waterproof render labor — ${v.waterproof_coats} coats (man-hours)`,
        },
      ];
    }

    case "tyrolean": {
      return [
        {
          item_name: "Portland Cement",
          type: "material",
          formula: `length * height * ${(0.04 * v.tyrolean_coats).toFixed(3)}`,
          waste_percent: 15,
          description: `Cement for tyrolean ${v.tyrolean_coats} coat(s) (bags)`,
        },
        {
          item_name: "Fine Aggregate / Pea Gravel",
          type: "material",
          formula: `length * height * ${(0.012 * v.tyrolean_coats).toFixed(4)}`,
          waste_percent: 15,
          description: "Fine aggregate for tyrolean texture (m³)",
        },
        ...(v.tyrolean_type === "machine" ? [{
          item_name: "Tyrolean Machine Hire",
          type: "equipment" as const,
          formula: `length * height * 0.05`,
          waste_percent: 0,
          description: "Tyrolean projector machine hire (hours)",
        }] : []),
        {
          item_name: "Labor - Tyrolean",
          type: "labor",
          formula: `length * height * ${v.tyrolean_type === "machine" ? 0.3 : 0.6}`,
          waste_percent: 0,
          description: `${v.tyrolean_type === "machine" ? "Machine" : "Hand"} tyrolean labor (man-hours)`,
        },
      ];
    }

    case "wall_tiling": {
      // Tiles per sf based on size
      const tileSizeMap: Record<string, number> = {
        "4x4": 9, "6x6": 4, "8x10": 1.8, "12x24": 0.5,
      };
      const tilesPerSqFt = tileSizeMap[v.wall_tile_size] || 1.8;
      const comps: GeneratedComponent[] = [
        {
          item_name: `Ceramic Wall Tile ${v.wall_tile_size}"`,
          type: "material",
          formula: `length * height * ${tilesPerSqFt} * ${1 + v.wall_tile_waste / 100}`,
          waste_percent: 0,
          description: `${v.wall_tile_size}" wall tiles with ${v.wall_tile_waste}% waste`,
        },
      ];
      if (v.wall_include_adhesive) comps.push({
        item_name: "Wall Tile Adhesive",
        type: "material",
        formula: "length * height * 0.05",
        waste_percent: 5,
        description: "Tile adhesive (bags)",
      });
      if (v.wall_include_grout) comps.push({
        item_name: "Tile Grout",
        type: "material",
        formula: "length * height * 0.012",
        waste_percent: 5,
        description: "Tile grout (bags)",
      });
      if (v.wall_include_trim) comps.push({
        item_name: "Edge Trim / Tile Bead",
        type: "material",
        formula: "(length + height) * 2 * 1.1",
        waste_percent: 10,
        description: "Perimeter edge trim (lf)",
      });
      comps.push({
        item_name: "Labor - Wall Tiling",
        type: "labor",
        formula: "length * height * 1.0",
        waste_percent: 0,
        description: "Wall tiling labor (man-hours)",
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

// ─── Rate Library auto-match ────────────────────────────────────────────────
// Given a generated component's name, try to find a real cost_items row for
// it. No company_id filter — matches AssembliesPage.tsx's own item-picker
// query (see CostItemPicker), relying on RLS (company_id IS NULL OR own
// company) to return the right rows. Scoping this to company_id previously
// excluded the Rate Library's seeded items entirely (almost all global,
// company_id IS NULL), which is the real reason auto-match rates were low.
async function findMatch(itemName: string): Promise<{ id: string; item_name: string } | null> {
  // Strategy 1: exact item_name match
  const { data: exact } = await supabase
    .from("cost_items").select("id,item_name").ilike("item_name", itemName).limit(1);
  if (exact?.[0]) return exact[0];

  // Strategy 2: match base name (e.g. "Rebar" for "Rebar #4") against variant/grade
  const baseName = itemName.split(" ")[0];
  const sizeSpec = itemName.split(" ").slice(1).join(" ");
  const { data: byBase } = await supabase
    .from("cost_items").select("id,item_name,variant,grade")
    .ilike("item_name", `%${baseName}%`).limit(10);
  const match = (byBase as any[] | null)?.find(i =>
    (i.variant || "").toLowerCase().includes(sizeSpec.toLowerCase()) ||
    (i.grade || "").toLowerCase().includes(sizeSpec.toLowerCase()) ||
    i.item_name.toLowerCase().includes(sizeSpec.toLowerCase())
  );
  if (match) return { id: match.id, item_name: match.item_name };

  // Strategy 3: partial name match on any significant word
  const words = itemName.split(" ").filter(w => w.length > 2);
  for (const word of words) {
    const { data: partial } = await supabase
      .from("cost_items").select("id,item_name").ilike("item_name", `%${word}%`).limit(1);
    if (partial?.[0]) return partial[0];
  }
  return null;
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

  // Review step (still called "preview" internally) state — populated by
  // runReview() when the user leaves "configure", never mutated until then.
  const [reviewComponents, setReviewComponents] = useState<ReviewComponent[]>([]);
  const [matching, setMatching] = useState(false);
  // Index into reviewComponents currently being (re)matched via CostItemPicker,
  // or null when the picker is closed.
  const [pickerOpenFor, setPickerOpenFor] = useState<number | null>(null);
  const [costItems, setCostItems] = useState<CostItem[]>([]);

  // Loaded once, not scoped to company_id — matches AssembliesPage.tsx's own
  // item list (see CostItemPicker), relying on RLS to return global + own-
  // company items. Needed here only for the picker; the auto-match strategies
  // in findMatch() run their own targeted queries instead of filtering this list.
  useEffect(() => {
    let alive = true;
    supabase.from("cost_items")
      .select("id,item_name,unit,category,item_type,variant")
      .eq("is_active", true).order("item_name").limit(5000)
      .then(({ data }) => { if (alive) setCostItems(data || []); });
    return () => { alive = false; };
  }, []);

  function updateReviewComponent(index: number, patch: Partial<ReviewComponent>) {
    setReviewComponents(prev => prev.map((r, i) => i === index ? { ...r, ...patch } : r));
  }

  function set<K extends keyof WizardValues>(key: K, val: WizardValues[K]) {
    setValues(prev => ({ ...prev, [key]: val }));
  }

  const selectedElement = ELEMENT_TYPES.find(e => e.key === elementType);

  const components = useMemo(() => {
    if (!elementType) return [];
    return generateComponents(elementType, values);
  }, [elementType, values]);

  // Preview vars — a 3m x 3m x 3m element, matching the variables the live
  // BOQPage.tsx formula evaluator recognizes (length/height/width for
  // linear/area/volume assemblies; count for count-type ones — the "Add From
  // Assembly" modal now threads the typed Qty into dims.count for count-type
  // assemblies specifically, so this preview and the real evaluator agree).
  const previewVars = { length: 3, width: 3, height: 3, count: 1 };

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

  // Explicit per-type mapping (not substring matching) since "wall" now
  // matches both block_wall (area-shaped formulas) and retaining_wall
  // (length-shaped formulas) — those need different measure types.
  // water_supply, drainage_piping and electrical_wiring are intentionally
  // left out of AREA_TYPES — their formulas only reference `length` (a
  // pipe/cable run), not `width`, so "linear" is the accurate tag; they
  // fall through to the default below.
  const AREA_TYPES = new Set(["slab", "block_wall", "plastering", "tiling", "painting", "ceiling", "roofing", "blinding", "ground_slab", "drywall_partition", "drywall_painting", "paving", "rough_render", "float_coat", "skim_coat", "floor_screed", "waterproof_render", "tyrolean", "wall_tiling"]);
  const COUNT_TYPES = new Set(["staircase", "septic_tank", "plumbing_fixtures", "electrical_fitout", "door_solid", "window_aluminum", "window_louvre"]);
  function measureTypeFor(type: string) {
    return AREA_TYPES.has(type) ? "area" : COUNT_TYPES.has(type) ? "count" : "linear";
  }

  // Runs the Rate Library auto-match for every generated component and moves
  // to the review step — no database writes here. The assembly itself isn't
  // created until the user actually clicks Save on the review step, so
  // cancelling out of review (or coming back to reconfigure) never leaves a
  // half-created assembly behind.
  async function runReview() {
    setMatching(true);
    try {
      const resolved = await Promise.all(components.map(async (comp): Promise<ReviewComponent> => {
        const found = await findMatch(comp.item_name);
        return {
          ...comp,
          cost_item_id: found?.id ?? null,
          matched_item_name: found?.item_name ?? null,
          match_status: found ? "auto_matched" : "unmatched",
        };
      }));
      setReviewComponents(resolved);
      setStep("preview");
    } finally {
      setMatching(false);
    }
  }

  const unresolvedCount = reviewComponents.filter(c => c.match_status === "unmatched").length;

  async function handleSave() {
    if (!elementType || !values.name.trim()) return;
    if (unresolvedCount > 0) return; // Save button is disabled for this too; belt-and-braces guard.
    setSaving(true);
    try {
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
            measure_type: measureTypeFor(elementType),
            constants: buildConstants(elementType, values),
            wizard_type: elementType,
            wizard_values: values,
          },
        })
        .select("id")
        .single();

      if (asmErr || !asm) { alert(asmErr?.message || "Failed to create assembly"); return; }

      // Every component's fate (matched to which item, or deliberately
      // skipped) was already resolved on the review step — this is a plain
      // insert, no more matching or silent drops. assembly_components stores
      // the formula inside `notes` (prefixed "formula:") and has no
      // item_name/component_type columns of its own.
      let sortOrder = 0;
      for (const comp of reviewComponents) {
        if (comp.match_status === "skipped" || !comp.cost_item_id) continue;
        await supabase.from("assembly_components").insert({
          assembly_id: asm.id,
          cost_item_id: comp.cost_item_id,
          line_type: comp.type,
          quantity_factor: 1,
          waste_percent: comp.waste_percent,
          sort_order: sortOrder++,
          notes: `formula:${comp.formula}`,
        });
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
              {["Structural", "Masonry", "Finishes", "Partitions", "Plumbing", "Electrical", "Doors & Windows", "Structural Steel", "External"].map(group => (
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

              {/* Setting Out */}
              {elementType === "setting_out" && (
                <>
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400">
                    💡 Setting out is the first operation on site — marking foundation positions before excavation. Enter total <strong>wall perimeter length</strong> in BOQ.
                  </div>
                  <Toggle label="Include timber profile boards" value={values.include_profiles} onChange={v => set("include_profiles", v)}/>
                  {values.include_profiles && (
                    <NumInput
                      label="Profile post spacing"
                      value={values.profile_post_spacing}
                      onChange={v => set("profile_post_spacing", v)}
                      unit="mm"
                      hint="Posts every 1200mm along wall line"
                    />
                  )}
                  <Toggle label="Include builder's line" value={values.include_builders_line} onChange={v => set("include_builders_line", v)}/>
                  <Toggle label="Include lime/chalk marking" value={values.include_lime_marking} onChange={v => set("include_lime_marking", v)}/>
                </>
              )}

              {/* Excavation */}
              {elementType === "excavation" && (
                <>
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
                    💡 Enter total foundation <strong>trench length</strong> in BOQ. Width and depth set below.
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Trench width" value={values.excav_width} onChange={v => set("excav_width", v)} unit="mm" hint="Typically 600-900mm"/>
                    <NumInput label="Trench depth" value={values.excav_depth} onChange={v => set("excav_depth", v)} unit="mm" hint="Typically 900-1200mm"/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Excavation method</label>
                    <div className="flex gap-2">
                      {[["manual", "Manual (Labor)"], ["machine", "Machine (JCB)"], ["mixed", "Mixed"]].map(([key, label]) => (
                        <button key={key} type="button"
                          onClick={() => set("excav_method", key)}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${values.excav_method === key ? "border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Toggle label="Include spoil removal (truck away)" value={values.include_spoil_removal} onChange={v => set("include_spoil_removal", v)}/>
                  <Toggle label="Include backfill after foundation" value={values.include_backfill} onChange={v => set("include_backfill", v)}/>
                  {values.include_backfill && (
                    <>
                      <NumInput
                        label="Backfill percentage"
                        value={values.backfill_percent}
                        onChange={v => set("backfill_percent", v)}
                        unit="%"
                        hint="How much excavated material goes back (typically 30%)"
                      />
                      <Toggle label="Include compaction" value={values.include_compaction} onChange={v => set("include_compaction", v)}/>
                    </>
                  )}
                </>
              )}

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

              {/* Rough Render */}
              {elementType === "rough_render" && (
                <>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400">
                    💡 First coat applied directly to block wall. Provides key/bond for float coat. Enter wall <strong>length × height</strong> in BOQ.
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Thickness" value={values.rough_render_thickness} onChange={v => set("rough_render_thickness", v)} unit="mm" hint="Typically 12-15mm"/>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Mix ratio (cement:sand)</label>
                      <div className="flex gap-2">
                        {["1:3", "1:4"].map(m => (
                          <button key={m} type="button" onClick={() => set("rough_render_mix", m)}
                            className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${values.rough_render_mix === m ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Float Coat */}
              {elementType === "float_coat" && (
                <>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400">
                    💡 Second coat over rough render. Produces smooth even surface ready for skim or paint. Enter wall <strong>length × height</strong> in BOQ.
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Thickness" value={values.float_thickness} onChange={v => set("float_thickness", v)} unit="mm" hint="Typically 8-10mm"/>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Mix ratio</label>
                      <div className="flex gap-2">
                        {["1:3", "1:4"].map(m => (
                          <button key={m} type="button" onClick={() => set("float_mix", m)}
                            className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${values.float_mix === m ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Skim Coat */}
              {elementType === "skim_coat" && (
                <>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400">
                    💡 Ultra-thin final coat giving a perfectly smooth surface before painting. Enter wall <strong>length × height</strong> in BOQ.
                  </div>
                  <NumInput label="Thickness" value={values.skim_thickness} onChange={v => set("skim_thickness", v)} unit="mm" hint="Typically 3-5mm"/>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Skim type</label>
                    <div className="flex gap-2">
                      {[["cement-lime", "Cement + Lime"], ["gypsum", "Gypsum Plaster"]].map(([key, label]) => (
                        <button key={key} type="button" onClick={() => set("skim_type", key)}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${values.skim_type === key ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Floor Screed */}
              {elementType === "floor_screed" && (
                <>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400">
                    💡 Levelling layer applied over concrete slab before floor finish. Enter floor <strong>length × width</strong> in BOQ.
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Thickness" value={values.screed_thickness} onChange={v => set("screed_thickness", v)} unit="mm" hint="Typically 50-75mm"/>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Mix ratio</label>
                      <div className="flex gap-2">
                        {["1:3", "1:4"].map(m => (
                          <button key={m} type="button" onClick={() => set("screed_mix", m)}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${values.screed_mix === m ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Surface finish</label>
                    <div className="flex gap-2">
                      {[["steel-trowel", "Steel Trowel"], ["wood-float", "Wood Float"], ["power-float", "Power Float"]].map(([key, label]) => (
                        <button key={key} type="button" onClick={() => set("screed_finish", key)}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${values.screed_finish === key ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Toggle label="Include wire mesh reinforcement" value={values.screed_reinforced} onChange={v => set("screed_reinforced", v)}/>
                </>
              )}

              {/* Waterproof Render */}
              {elementType === "waterproof_render" && (
                <>
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
                    💡 Used in wet areas — bathrooms, basements, water tanks, retaining walls. Enter <strong>length × height</strong> in BOQ.
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Number of coats" value={values.waterproof_coats} onChange={v => set("waterproof_coats", v)} hint="Typically 2 coats"/>
                    <NumInput label="Thickness per coat" value={values.waterproof_thickness} onChange={v => set("waterproof_thickness", v)} unit="mm" hint="Typically 6mm per coat"/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Waterproofing additive</label>
                    <div className="flex gap-2">
                      {["Sika", "Aquaseal", "Hydrostop", "Febmix"].map(a => (
                        <button key={a} type="button" onClick={() => set("waterproof_additive", a.toLowerCase())}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${values.waterproof_additive === a.toLowerCase() ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Tyrolean */}
              {elementType === "tyrolean" && (
                <>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400">
                    💡 Decorative textured exterior finish. Applied over float coat. Enter wall <strong>length × height</strong> in BOQ.
                  </div>
                  <NumInput label="Number of coats" value={values.tyrolean_coats} onChange={v => set("tyrolean_coats", v)} hint="Typically 2-3 coats for full coverage"/>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Application method</label>
                    <div className="flex gap-2">
                      {[["machine", "Machine Projector"], ["hand", "Hand Applied"]].map(([key, label]) => (
                        <button key={key} type="button" onClick={() => set("tyrolean_type", key)}
                          className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${values.tyrolean_type === key ? "border-slate-700 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                            {label}
                          </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Wall Tiling */}
              {elementType === "wall_tiling" && (
                <>
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
                    💡 For bathroom and kitchen walls. Different from floor tiling. Enter wall <strong>length × height</strong> in BOQ.
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Tile size</label>
                    <div className="grid grid-cols-4 gap-2">
                      {["4x4", "6x6", "8x10", "12x24"].map(s => (
                        <button key={s} type="button" onClick={() => set("wall_tile_size", s)}
                          className={`py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${values.wall_tile_size === s ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {s}"
                        </button>
                      ))}
                    </div>
                  </div>
                  <NumInput label="Waste %" value={values.wall_tile_waste} onChange={v => set("wall_tile_waste", v)} hint="10% straight lay, 15% diagonal"/>
                  <Toggle label="Include tile adhesive" value={values.wall_include_adhesive} onChange={v => set("wall_include_adhesive", v)}/>
                  <Toggle label="Include grout" value={values.wall_include_grout} onChange={v => set("wall_include_grout", v)}/>
                  <Toggle label="Include edge trim" value={values.wall_include_trim} onChange={v => set("wall_include_trim", v)}/>
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

              {/* Water Supply */}
              {elementType === "water_supply" && (
                <>
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
                    💡 Enter total pipe <strong>run length</strong> in the BOQ.
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Pipe material</label>
                    <div className="flex gap-2">
                      {["CPVC", "PEX", "Galvanized"].map(m => (
                        <button key={m} type="button" onClick={() => set("water_pipe_material", m)}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${values.water_pipe_material === m ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Pipe size</label>
                    <div className="flex gap-2">
                      {['1/2"', '3/4"', '1"'].map(s => (
                        <button key={s} type="button" onClick={() => set("water_pipe_size", s)}
                          className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${values.water_pipe_size === s ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Toggle label="Include fittings" value={values.water_include_fittings} onChange={v => set("water_include_fittings", v)}/>
                </>
              )}

              {/* Drainage Piping */}
              {elementType === "drainage_piping" && (
                <>
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
                    💡 Enter total drain pipe <strong>run length</strong> in BOQ.
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Pipe size</label>
                    <div className="flex gap-2">
                      {['2"', '3"', '4"'].map(s => (
                        <button key={s} type="button" onClick={() => set("drain_pipe_size", s)}
                          className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${values.drain_pipe_size === s ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="No. of WC connections" value={values.drain_num_wc} onChange={v => set("drain_num_wc", v)}/>
                    <NumInput label="No. of basin connections" value={values.drain_num_basins} onChange={v => set("drain_num_basins", v)}/>
                  </div>
                  <Toggle label="Include fittings" value={values.drain_include_fittings} onChange={v => set("drain_include_fittings", v)}/>
                  <Toggle label="Include vent stack" value={values.drain_include_vent} onChange={v => set("drain_include_vent", v)}/>
                </>
              )}

              {/* Plumbing Fixtures */}
              {elementType === "plumbing_fixtures" && (
                <>
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
                    💡 Enter <strong>count = 1</strong> per bathroom in the BOQ. Quantities are calculated from fixture counts below.
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Fixture grade</label>
                    <div className="flex gap-2">
                      {[["standard", "Standard"], ["mid", "Mid-Range"], ["premium", "Premium"]].map(([key, label]) => (
                        <button key={key} type="button" onClick={() => set("fixture_grade", key)}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${values.fixture_grade === key ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Toilets (WC)" value={values.num_wc} onChange={v => set("num_wc", v)}/>
                    <NumInput label="Wash basins" value={values.num_washbasin} onChange={v => set("num_washbasin", v)}/>
                    <NumInput label="Showers" value={values.num_shower} onChange={v => set("num_shower", v)}/>
                    <NumInput label="Bathtubs" value={values.num_bath} onChange={v => set("num_bath", v)}/>
                  </div>
                </>
              )}

              {/* Electrical Wiring */}
              {elementType === "electrical_wiring" && (
                <>
                  <div className="p-3 rounded-xl bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-100 dark:border-yellow-500/20 text-xs text-yellow-600 dark:text-yellow-400">
                    💡 Enter average circuit <strong>run length</strong> in BOQ. Number of circuits set below.
                  </div>
                  <NumInput label="Number of circuits" value={values.num_circuits} onChange={v => set("num_circuits", v)} hint="Lighting + power circuits"/>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Wire size</label>
                    <div className="flex gap-2">
                      {["12 AWG", "10 AWG", "8 AWG"].map(s => (
                        <button key={s} type="button" onClick={() => set("wire_size", s)}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${values.wire_size === s ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-500/10 text-yellow-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Conduit type</label>
                    <div className="flex gap-2">
                      {["PVC", "EMT", "None"].map(c => (
                        <button key={c} type="button" onClick={() => { set("conduit_type", c); set("include_conduit", c !== "None"); }}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${values.conduit_type === c ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-500/10 text-yellow-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Electrical Fitout */}
              {elementType === "electrical_fitout" && (
                <>
                  <div className="p-3 rounded-xl bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-100 dark:border-yellow-500/20 text-xs text-yellow-600 dark:text-yellow-400">
                    💡 Enter <strong>count = 1</strong> per floor/zone in BOQ. All quantities from settings below.
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Power outlets" value={values.num_outlets} onChange={v => set("num_outlets", v)}/>
                    <NumInput label="Light switches" value={values.num_switches} onChange={v => set("num_switches", v)}/>
                    <NumInput label="Light fittings" value={values.num_lights} onChange={v => set("num_lights", v)}/>
                    <NumInput label="A/C points" value={values.num_ac_points} onChange={v => set("num_ac_points", v)}/>
                  </div>
                  <Toggle label="Include distribution board" value={values.include_db} onChange={v => set("include_db", v)}/>
                  {values.include_db && (
                    <NumInput label="Number of breakers" value={values.db_breakers} onChange={v => set("db_breakers", v)} hint="Typically 12 or 24 way"/>
                  )}
                </>
              )}

              {/* Door */}
              {elementType === "door_solid" && (
                <>
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
                    💡 Enter <strong>number of doors</strong> (count) in BOQ.
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Door width" value={values.door_width} onChange={v => set("door_width", v)} unit="mm" hint="Typically 900mm"/>
                    <NumInput label="Door height" value={values.door_height} onChange={v => set("door_height", v)} unit="mm" hint="Typically 2100mm"/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Door type</label>
                    <div className="flex gap-2">
                      {[["solid-wood", "Solid Wood"], ["hollow-core", "Hollow Core"], ["steel", "Steel"]].map(([key, label]) => (
                        <button key={key} type="button" onClick={() => set("door_material", key)}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${values.door_material === key ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Toggle label="Include door frame" value={values.door_include_frame} onChange={v => set("door_include_frame", v)}/>
                  <Toggle label="Include hardware (hinges, lock)" value={values.door_include_hardware} onChange={v => set("door_include_hardware", v)}/>
                  <Toggle label="Include painting" value={values.door_include_paint} onChange={v => set("door_include_paint", v)}/>
                </>
              )}

              {/* Aluminum Window */}
              {elementType === "window_aluminum" && (
                <>
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
                    💡 Enter <strong>number of windows</strong> (count) in BOQ.
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Width" value={values.win_width} onChange={v => set("win_width", v)} unit="mm"/>
                    <NumInput label="Height" value={values.win_height} onChange={v => set("win_height", v)} unit="mm"/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Window type</label>
                    <div className="flex gap-2">
                      {[["sliding", "Sliding"], ["casement", "Casement"], ["awning", "Awning"]].map(([key, label]) => (
                        <button key={key} type="button" onClick={() => set("win_type", key)}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${values.win_type === key ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Glass type</label>
                    <div className="flex gap-2">
                      {["clear", "tinted", "frosted"].map(g => (
                        <button key={g} type="button" onClick={() => set("win_glass", g)}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 capitalize transition-colors ${values.win_glass === g ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Toggle label="Include security grille" value={values.win_include_grille} onChange={v => set("win_include_grille", v)}/>
                </>
              )}

              {/* Louvre Window */}
              {elementType === "window_louvre" && (
                <>
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
                    💡 Enter <strong>number of louvre windows</strong> (count) in BOQ.
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Width" value={values.louv_width} onChange={v => set("louv_width", v)} unit="mm"/>
                    <NumInput label="Height" value={values.louv_height} onChange={v => set("louv_height", v)} unit="mm"/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Blade material</label>
                    <div className="flex gap-2">
                      {[["glass", "Glass"], ["aluminum", "Aluminum"]].map(([key, label]) => (
                        <button key={key} type="button" onClick={() => set("louv_blade_material", key)}
                          className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${values.louv_blade_material === key ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <NumInput label="Number of blades" value={values.louv_num_blades} onChange={v => set("louv_num_blades", v)} hint="Typically 4-8 blades"/>
                </>
              )}

              {/* Roof Truss */}
              {elementType === "roof_truss" && (
                <>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400">
                    💡 Enter total <strong>roof length</strong> (ridge length) in BOQ. Span and spacing set below.
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Building span" value={values.truss_span} onChange={v => set("truss_span", v)} unit="mm" hint="Width of building"/>
                    <NumInput label="Truss spacing" value={values.truss_spacing} onChange={v => set("truss_spacing", v)} unit="mm" hint="Typically 1200mm"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Roof pitch" value={values.truss_pitch} onChange={v => set("truss_pitch", v)} unit="°" hint="Angle e.g. 25°"/>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Steel size</label>
                      <select value={values.truss_steel_size} onChange={e => set("truss_steel_size", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none">
                        <option value="2x2x1/8">2×2×1/8" angle iron</option>
                        <option value="2x3x3/16">2×3×3/16" angle iron</option>
                        <option value="3x3x1/4">3×3×1/4" angle iron</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Truss type</label>
                    <div className="flex gap-2">
                      {[["fink", "Fink"], ["howe", "Howe"], ["mono-pitch", "Mono Pitch"]].map(([key, label]) => (
                        <button key={key} type="button" onClick={() => set("truss_type", key)}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${values.truss_type === key ? "border-slate-700 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Toggle label="Include purlins" value={values.truss_include_purlins} onChange={v => set("truss_include_purlins", v)}/>
                  {values.truss_include_purlins && (
                    <NumInput label="Purlin spacing" value={values.truss_purlin_spacing} onChange={v => set("truss_purlin_spacing", v)} unit="mm"/>
                  )}
                  <Toggle label="Include ridge beam" value={values.truss_include_ridge} onChange={v => set("truss_include_ridge", v)}/>
                </>
              )}

              {/* Paving */}
              {elementType === "paving" && (
                <>
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
                    💡 Enter paved area <strong>length × width</strong> in BOQ.
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Paving type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[["concrete", "Concrete"], ["pavers", "Concrete Pavers"], ["asphalt", "Asphalt"], ["tiles", "Outdoor Tiles"]].map(([key, label]) => (
                        <button key={key} type="button" onClick={() => set("paving_type", key)}
                          className={`py-2.5 rounded-lg text-xs font-semibold border-2 transition-colors ${values.paving_type === key ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <NumInput label="Thickness" value={values.paving_thickness} onChange={v => set("paving_thickness", v)} unit="mm" hint="Concrete: 100-150mm"/>
                  <Toggle label="Include sub-base" value={values.paving_sub_base} onChange={v => set("paving_sub_base", v)}/>
                  {values.paving_sub_base && (
                    <NumInput label="Sub-base thickness" value={values.sub_base_thickness} onChange={v => set("sub_base_thickness", v)} unit="mm" hint="Typically 150mm crusher run"/>
                  )}
                  <Toggle label="Include perimeter curb" value={values.paving_include_curb} onChange={v => set("paving_include_curb", v)}/>
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
              {!["setting_out", "excavation", "block_wall", "plastering", "tiling", "painting", "ceiling", "roofing", "blinding", "ground_slab", "drywall_partition", "drywall_painting", "chain_link", "septic_tank", "drain_gutter", "water_supply", "drainage_piping", "plumbing_fixtures", "electrical_wiring", "electrical_fitout", "door_solid", "window_aluminum", "window_louvre", "roof_truss", "paving", "rough_render", "float_coat", "skim_coat", "floor_screed", "waterproof_render", "tyrolean", "wall_tiling"].includes(elementType) && (
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

              {unresolvedCount > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-2.5">
                  <AlertCircle size={13} className="text-amber-500 flex-shrink-0"/>
                  <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                    {unresolvedCount} component{unresolvedCount !== 1 ? "s" : ""} still need{unresolvedCount === 1 ? "s" : ""} a Rate Library match or an explicit Skip before you can save
                  </span>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left px-4 py-2 text-slate-500 font-semibold">Component</th>
                      <th className="text-left px-4 py-2 text-slate-500 font-semibold hidden sm:table-cell">Formula</th>
                      <th className="text-right px-4 py-2 text-slate-500 font-semibold">Preview Qty</th>
                      <th className="text-left px-4 py-2 text-slate-500 font-semibold">Rate Library Match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {reviewComponents.map((c, i) => (
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
                        <td className="px-4 py-3">
                          {c.match_status === "skipped" ? (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex px-2 py-1 rounded-full bg-slate-200 dark:bg-white/[0.08] text-slate-500 dark:text-slate-400 text-[10px] font-semibold whitespace-nowrap">Skipped</span>
                              <button type="button"
                                onClick={() => updateReviewComponent(i, { match_status: c.cost_item_id ? "auto_matched" : "unmatched" })}
                                className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline">
                                Undo
                              </button>
                            </div>
                          ) : c.match_status === "auto_matched" || c.match_status === "user_matched" ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold max-w-[160px] truncate" title={c.matched_item_name || ""}>
                                Matched: {c.matched_item_name}
                              </span>
                              <button type="button" onClick={() => setPickerOpenFor(i)}
                                className="text-[10px] text-blue-500 hover:text-blue-600 underline whitespace-nowrap">
                                Change
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex px-2 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-semibold whitespace-nowrap">Not matched</span>
                              <button type="button" onClick={() => setPickerOpenFor(i)}
                                className="text-[10px] text-blue-500 hover:text-blue-600 underline whitespace-nowrap">
                                Search Rate Library
                              </button>
                              <button type="button" onClick={() => updateReviewComponent(i, { match_status: "skipped" })}
                                className="text-[10px] text-slate-500 hover:text-red-500 underline whitespace-nowrap">
                                Skip
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-slate-400 text-center">
                Matched and unskipped components will be added to your assembly. You can edit formulas afterwards in the Assembly Builder.
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
              onClick={runReview}
              disabled={!values.name.trim() || matching}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
              {matching ? "Matching against Rate Library…" : <>Preview<ChevronRight size={16}/></>}
            </button>
          )}

          {step === "preview" && (
            <button
              onClick={handleSave}
              disabled={saving || unresolvedCount > 0}
              title={unresolvedCount > 0 ? "Match or skip every component first" : undefined}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
              {saving ? "Saving..." : <><Check size={16}/> Save Assembly</>}
            </button>
          )}
        </div>
      </div>

      {pickerOpenFor !== null && (
        <CostItemPicker
          costItems={costItems}
          onSelect={(item) => {
            updateReviewComponent(pickerOpenFor, { cost_item_id: item.id, matched_item_name: item.item_name, match_status: "user_matched" });
            setPickerOpenFor(null);
          }}
          onClose={() => setPickerOpenFor(null)}
        />
      )}
    </div>
  );
}
