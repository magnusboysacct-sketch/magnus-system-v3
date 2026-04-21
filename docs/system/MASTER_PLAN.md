# MASTER_PLAN.md
## Magnus System v3 — Full System Bible
### Takeoff → Item → Assembly → BOQ → Client Output Architecture

---

## 1. PURPOSE

This document is the master control file for the Magnus System v3 estimating and quantity workflow.

It defines the production-ready architecture for:

- Takeoff measurement capture
- Metadata-rich organization
- Item and assembly linking
- Category inheritance and rollups
- BOQ generation
- Internal vs client output separation
- Search and filtering
- Performance and recalculation strategy
- UI structure
- WinServe execution workflow
- Build phases

This plan extends the existing Magnus System v3 data model and **must not duplicate** existing structures already in place.

---

## 2. CURRENT SYSTEM BASELINE

The following core structures already exist in Magnus System v3 and are to be reused, extended, and connected:

### Existing core tables already in system
- `master_categories`
- `master_units`
- `cost_items`
- `cost_item_rates`
- `assemblies`
- BOQ structure tables
- project-related tables
- company-scoped security via RLS
- project context architecture
- existing Magnus theme/UI shell

### Architectural rule
We are **not** rebuilding the library from scratch.

We are:
- reusing the existing category system
- reusing the existing unit system
- reusing cost items
- reusing assemblies
- reusing BOQ headers/sections/items where possible
- adding takeoff as the missing structured quantity engine layer
- adding metadata, search, and organization systems around it
- adding client-safe visibility logic on BOQ output

---

## 3. CORE DESIGN PRINCIPLES

### 3.1 One source of truth
- Library entities live in the library tables
- Measurement entities live in takeoff tables
- BOQ presentation lives in BOQ tables/views
- Client output is a filtered representation, not a duplicate estimating system

### 3.2 Extend, do not duplicate
No duplicate versions of:
- categories
- units
- items
- assemblies
- rates
- project BOQ logic

### 3.3 Structured capture first
Measurements must be captured with:
- geometry
- metadata
- folder placement
- tags
- type
- scale context
- optional item/assembly linkage

### 3.4 Search-first navigation
Users must not be forced to manually drill through folders to find measurements.

System must support:
- instant search
- smart filtering
- folder browsing
- tag browsing
- category browsing
- linked item browsing

### 3.5 Client-safe output
Internal estimating detail and client-facing BOQ must be separated by controlled visibility rules.

### 3.6 Compact professional UI
All pages must keep Magnus System compact, clean, professional, and scalable for large projects.

---

# 4. COMPLETE DATABASE SCHEMA

---

## 4.1 EXISTING TABLES TO REUSE

---

### 4.1.1 `master_categories`
Purpose:
Primary category tree for all estimating, item, assembly, takeoff, and BOQ grouping logic.

#### Required fields
- `id uuid primary key`
- `company_id uuid nullable` — null for global/shared if system supports it, otherwise company-scoped
- `name text not null`
- `code text null`
- `parent_id uuid null references master_categories(id)`
- `description text null`
- `sort_order integer default 0`
- `is_active boolean default true`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

#### Reuse in this plan
Used for:
- item categories
- assembly categories
- takeoff folder/category defaults
- BOQ grouping
- category rollups
- search filters
- output grouping

---

### 4.1.2 `master_units`
Purpose:
Source of approved units and unit types.

#### Required fields
- `id uuid primary key`
- `name text not null`
- `symbol text null`
- `unit_type text not null`
- `sort_order integer default 0`
- `is_active boolean default true`
- `created_at timestamptz default now()`

#### Example unit_type values
- `length`
- `area`
- `volume`
- `count`
- `weight`
- `time`
- `lump_sum`

#### Reuse in this plan
Used for:
- measurement result unit
- item unit
- assembly output unit
- BOQ quantity unit
- formula validation

---

### 4.1.3 `cost_items`
Purpose:
Base rate library items.

#### Required fields assumed existing / aligned
- `id uuid primary key`
- `company_id uuid not null`
- `category_id uuid null references master_categories(id)`
- `item_code text null`
- `item_name text not null`
- `description text null`
- `item_type text null`
- `unit text null`
- `unit_id uuid null references master_units(id)`
- `unit_type text null`
- `variant text null`
- `calc_engine_json jsonb null`
- `is_active boolean default true`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

#### Reuse in this plan
Used as:
- direct takeoff-linked estimate items
- BOQ items
- assembly components
- search target
- category inheritance source

---

### 4.1.4 `cost_item_rates`
Purpose:
Stores current and historical rate entries for items.

#### Required fields assumed existing / aligned
- `id uuid primary key`
- `company_id uuid not null`
- `cost_item_id uuid not null references cost_items(id)`
- `rate numeric(18,4) not null`
- `currency text default 'JMD'`
- `effective_date date null`
- `supplier_id uuid null`
- `notes text null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

#### Reuse in this plan
Used by:
- internal estimating
- rollups
- assembly calculations
- BOQ totals

---

### 4.1.5 `assemblies`
Purpose:
Composite estimating objects built from items and/or future nested logic.

#### Required fields assumed existing / aligned
- `id uuid primary key`
- `company_id uuid not null`
- `category_id uuid null references master_categories(id)`
- `assembly_code text null`
- `assembly_name text not null`
- `description text null`
- `output_unit_id uuid null references master_units(id)`
- `output_unit_type text null`
- `calc_engine_json jsonb null`
- `is_active boolean default true`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

#### Reuse in this plan
Used by:
- measurement linking
- BOQ line generation
- category inheritance
- structured production pricing

---

### 4.1.6 `assembly_items`
Purpose:
Defines assembly composition.

#### Required fields assumed existing / aligned
- `id uuid primary key`
- `assembly_id uuid not null references assemblies(id)`
- `cost_item_id uuid not null references cost_items(id)`
- `qty_factor numeric(18,6) not null`
- `waste_factor numeric(18,6) default 0`
- `formula_json jsonb null`
- `sort_order integer default 0`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

#### Reuse in this plan
Used by:
- assembly explosion
- internal cost expansion
- procurement-ready downstream workflows

---

### 4.1.7 Existing BOQ structure
Assumed existing aligned structure:
- `boqs`
- `boq_sections`
- `boq_section_items`

These should be reused and extended with visibility and source-link fields where needed.

---

## 4.2 NEW TABLES TO ADD

---

## 4.2.1 `takeoff_folders`
Purpose:
Hierarchical folder structure for organizing takeoff measurements inside a project.

### Fields
- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null`
- `project_id uuid not null references projects(id) on delete cascade`
- `parent_id uuid null references takeoff_folders(id) on delete cascade`
- `category_id uuid null references master_categories(id)`
- `folder_name text not null`
- `folder_code text null`
- `folder_type text not null default 'standard'`
- `path_text text not null`
- `depth integer not null default 0`
- `sort_order integer not null default 0`
- `color_token text null`
- `icon_token text null`
- `is_system_generated boolean not null default false`
- `is_locked boolean not null default false`
- `notes text null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_by uuid null references auth.users(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### Folder type examples
- `standard`
- `discipline`
- `level`
- `zone`
- `drawing_group`
- `system`
- `auto_category`
- `auto_trade`

### Purpose
Supports:
- manual folder structure
- auto-generated category folders
- structured explorer navigation
- large project segmentation

---

## 4.2.2 `takeoff_tags`
Purpose:
Reusable tag dictionary for project measurements.

### Fields
- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null`
- `project_id uuid not null references projects(id) on delete cascade`
- `tag_name text not null`
- `tag_group text null`
- `color_token text null`
- `description text null`
- `is_system_generated boolean default false`
- `created_by uuid null references auth.users(id)`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### Unique rule
- unique `(project_id, lower(tag_name))`

### Purpose
Supports:
- quick classification
- search
- multi-dimensional grouping
- automatic tagging

---

## 4.2.3 `takeoff_measurements`
Purpose:
Primary structured storage for all takeoff measurements.

### Fields
- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null`
- `project_id uuid not null references projects(id) on delete cascade`
- `drawing_id uuid null references project_drawings(id) on delete set null`
- `takeoff_page_id uuid null references takeoff_pages(id) on delete set null`
- `folder_id uuid null references takeoff_folders(id) on delete set null`
- `category_id uuid null references master_categories(id) on delete set null`

- `measurement_code text null`
- `measurement_name text not null`
- `measurement_type text not null`
- `capture_mode text not null default 'manual'`
- `status text not null default 'active'`

- `page_number integer null`
- `drawing_label text null`
- `sheet_reference text null`

- `geometry_json jsonb not null`
- `anchor_points_json jsonb not null default '[]'::jsonb`
- `bounds_json jsonb null`

- `raw_value numeric(18,6) null`
- `calculated_value numeric(18,6) null`
- `display_value numeric(18,6) null`

- `unit_id uuid null references master_units(id)`
- `unit_type text null`

- `multiplier numeric(18,6) not null default 1`
- `waste_percent numeric(18,6) not null default 0`
- `rounding_rule text null`

- `level_name text null`
- `zone_name text null`
- `area_name text null`
- `trade_name text null`
- `system_name text null`

- `source_template_id uuid null`
- `repeat_group_id uuid null references takeoff_repeat_groups(id) on delete set null`
- `source_measurement_id uuid null references takeoff_measurements(id) on delete set null`
- `instance_index integer null`

- `linked_item_id uuid null references cost_items(id) on delete set null`
- `linked_assembly_id uuid null references assemblies(id) on delete set null`
- `link_mode text null`

- `formula_inputs_json jsonb not null default '{}'::jsonb`
- `resolved_fields_json jsonb not null default '{}'::jsonb`
- `metadata jsonb not null default '{}'::jsonb`

- `search_text tsvector null`

- `client_visible boolean not null default true`
- `internal_notes text null`
- `client_notes text null`

- `created_by uuid null references auth.users(id)`
- `updated_by uuid null references auth.users(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `deleted_at timestamptz null`

### Measurement type examples
- `length`
- `area`
- `count`
- `volume`
- `polyline`
- `opening`
- `fixture`
- `allowance`
- `reference`

### Capture mode examples
- `manual`
- `template_popup`
- `copied`
- `repeated`
- `imported`

### Status examples
- `active`
- `draft`
- `archived`
- `void`

### Link mode examples
- `item`
- `assembly`
- `unlinked`
- `reference_only`

### Purpose
This is the core production table for takeoff.

---

## 4.2.4 `takeoff_measurement_tags`
Purpose:
Many-to-many link between measurements and tags.

### Fields
- `id uuid primary key default gen_random_uuid()`
- `measurement_id uuid not null references takeoff_measurements(id) on delete cascade`
- `tag_id uuid not null references takeoff_tags(id) on delete cascade`
- `created_at timestamptz not null default now()`

### Unique rule
- unique `(measurement_id, tag_id)`

---

## 4.2.5 `takeoff_measurement_links`
Purpose:
Explicit multi-link support when one measurement needs to drive multiple outputs.

### Fields
- `id uuid primary key default gen_random_uuid()`
- `measurement_id uuid not null references takeoff_measurements(id) on delete cascade`
- `link_type text not null`
- `cost_item_id uuid null references cost_items(id) on delete cascade`
- `assembly_id uuid null references assemblies(id) on delete cascade`
- `weight numeric(18,6) not null default 1`
- `formula_json jsonb null`
- `quantity_factor numeric(18,6) not null default 1`
- `visibility_mode text not null default 'internal_only'`
- `sort_order integer not null default 0`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### Link type examples
- `primary_item`
- `primary_assembly`
- `secondary_item`
- `secondary_assembly`
- `reference`

### Purpose
Used when:
- one takeoff drives multiple outputs
- one area drives material + labor + accessories
- one measurement needs multiple estimate mappings

---

## 4.2.6 `takeoff_templates`
Purpose:
Defines structured popup-driven measurement templates.

### Fields
- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null`
- `category_id uuid null references master_categories(id)`
- `template_name text not null`
- `template_code text null`
- `measurement_type text not null`
- `default_unit_id uuid null references master_units(id)`
- `default_item_id uuid null references cost_items(id)`
- `default_assembly_id uuid null references assemblies(id)`
- `folder_strategy text not null default 'inherit_category'`
- `tag_strategy jsonb not null default '[]'::jsonb`
- `field_schema_json jsonb not null`
- `formula_schema_json jsonb not null default '{}'::jsonb`
- `default_metadata jsonb not null default '{}'::jsonb`
- `client_visible_default boolean not null default true`
- `is_repeatable boolean not null default true`
- `is_active boolean not null default true`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### Purpose
Supports:
- popup forms
- standardized measurement capture
- intelligent defaults
- auto-foldering
- auto-tagging
- reusable field systems

---

## 4.2.7 `takeoff_repeat_groups`
Purpose:
Groups repeated or templated measurement instances.

### Fields
- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null`
- `project_id uuid not null references projects(id) on delete cascade`
- `template_id uuid null references takeoff_templates(id) on delete set null`
- `group_name text not null`
- `group_code text null`
- `source_type text not null default 'manual_template'`
- `repeat_pattern text null`
- `instance_count integer not null default 1`
- `link_behavior text not null default 'independent_values'`
- `folder_id uuid null references takeoff_folders(id) on delete set null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_by uuid null references auth.users(id)`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### Source type examples
- `manual_template`
- `copied_block`
- `array_repeat`
- `future_linked_instance`

### Link behavior examples
- `independent_values`
- `shared_formula`
- `linked_edit_future`

---

## 4.2.8 `takeoff_category_rules`
Purpose:
Stores mapping and inheritance rules for takeoff-to-category behavior.

### Fields
- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null`
- `rule_name text not null`
- `priority integer not null default 100`
- `is_active boolean not null default true`
- `match_json jsonb not null`
- `result_category_id uuid not null references master_categories(id)`
- `result_folder_strategy text null`
- `result_tag_strategy jsonb null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### Purpose
Supports:
- automatic category assignment
- override logic
- rule-based grouping
- future AI-assisted mapping without breaking core logic

---

## 4.2.9 `boq_output_profiles`
Purpose:
Controls BOQ rendering rules for internal vs client output.

### Fields
- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null`
- `profile_name text not null`
- `profile_type text not null`
- `show_rates boolean not null default false`
- `show_line_amounts boolean not null default false`
- `show_measurement_breakdown boolean not null default false`
- `show_assembly_breakdown boolean not null default false`
- `show_internal_codes boolean not null default false`
- `show_internal_notes boolean not null default false`
- `show_category_codes boolean not null default false`
- `show_zero_value_lines boolean not null default false`
- `grouping_mode text not null default 'category_section'`
- `sort_mode text not null default 'section_then_item'`
- `metadata jsonb not null default '{}'::jsonb`
- `is_default boolean not null default false`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### Profile type examples
- `internal`
- `client`
- `procurement`
- `summary_only`

---

## 4.2.10 `boq_item_sources`
Purpose:
Traceability table linking BOQ lines back to measurement and estimate sources.

### Fields
- `id uuid primary key default gen_random_uuid()`
- `boq_section_item_id uuid not null references boq_section_items(id) on delete cascade`
- `measurement_id uuid null references takeoff_measurements(id) on delete set null`
- `cost_item_id uuid null references cost_items(id) on delete set null`
- `assembly_id uuid null references assemblies(id) on delete set null`
- `source_type text not null`
- `source_qty numeric(18,6) null`
- `resolved_qty numeric(18,6) null`
- `resolved_unit_id uuid null references master_units(id)`
- `resolved_rate numeric(18,4) null`
- `resolved_amount numeric(18,4) null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz default now()`

### Purpose
Allows:
- traceability
- audit
- recalc pathing
- measurement drillback from BOQ

---

## 4.2.11 `project_search_index`
Purpose:
Optional denormalized search layer for fast project-wide search.

### Fields
- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null`
- `project_id uuid not null references projects(id) on delete cascade`
- `entity_type text not null`
- `entity_id uuid not null`
- `title text not null`
- `subtitle text null`
- `category_id uuid null references master_categories(id)`
- `folder_id uuid null references takeoff_folders(id)`
- `tag_ids uuid[] null`
- `search_text text not null`
- `search_vector tsvector not null`
- `metadata jsonb not null default '{}'::jsonb`
- `updated_at timestamptz default now()`

### Purpose
Supports:
- unified instant search
- fast filtering across measurements, folders, items, assemblies, BOQ

---

# 5. RELATIONSHIPS AND FOREIGN KEYS

---

## 5.1 High-level relationship map

### Project
A project owns:
- takeoff folders
- takeoff tags
- takeoff measurements
- repeat groups
- project drawings
- takeoff pages
- BOQs

### Category
A category can be linked to:
- folders
- cost items
- assemblies
- measurements
- BOQ sections/items
- search index records

### Item / Assembly
A measurement can link to:
- one direct item
- one direct assembly
- many additional item/assembly links through `takeoff_measurement_links`

### BOQ
A BOQ line may be sourced from:
- direct measurement → item
- direct measurement → assembly
- manual BOQ line
- aggregated measurement rollup
- assembly expansion

---

## 5.2 Key FK summary

### `takeoff_measurements`
- `project_id -> projects.id`
- `drawing_id -> project_drawings.id`
- `takeoff_page_id -> takeoff_pages.id`
- `folder_id -> takeoff_folders.id`
- `category_id -> master_categories.id`
- `unit_id -> master_units.id`
- `linked_item_id -> cost_items.id`
- `linked_assembly_id -> assemblies.id`
- `repeat_group_id -> takeoff_repeat_groups.id`
- `source_measurement_id -> takeoff_measurements.id`

### `takeoff_measurement_tags`
- `measurement_id -> takeoff_measurements.id`
- `tag_id -> takeoff_tags.id`

### `takeoff_measurement_links`
- `measurement_id -> takeoff_measurements.id`
- `cost_item_id -> cost_items.id`
- `assembly_id -> assemblies.id`

### `takeoff_templates`
- `category_id -> master_categories.id`
- `default_unit_id -> master_units.id`
- `default_item_id -> cost_items.id`
- `default_assembly_id -> assemblies.id`

### `takeoff_repeat_groups`
- `project_id -> projects.id`
- `template_id -> takeoff_templates.id`
- `folder_id -> takeoff_folders.id`

### `takeoff_category_rules`
- `result_category_id -> master_categories.id`

### `boq_item_sources`
- `boq_section_item_id -> boq_section_items.id`
- `measurement_id -> takeoff_measurements.id`
- `cost_item_id -> cost_items.id`
- `assembly_id -> assemblies.id`
- `resolved_unit_id -> master_units.id`

---

# 6. TAKEOFF ENGINE DESIGN

---

## 6.1 Core takeoff architecture

The Takeoff Engine is the structured quantity capture system that sits between:

- project drawings / pages
- estimating library
- BOQ generation

### Input layers
- drawing or PDF page
- calibrated takeoff page
- measurement tool
- popup form
- folder/tag/category defaults

### Output layers
- measurement row
- linked item or assembly
- searchable metadata
- BOQ source link
- rollup-ready quantity data

---

## 6.2 Measurement storage model

Each saved takeoff measurement must contain:

### Geometry
Stored in:
- `geometry_json`
- `anchor_points_json`
- `bounds_json`

### Numeric result
Stored in:
- `raw_value`
- `calculated_value`
- `display_value`

### Unit context
Stored in:
- `unit_id`
- `unit_type`

### Estimating context
Stored in:
- `linked_item_id`
- `linked_assembly_id`
- `category_id`

### Organization context
Stored in:
- `folder_id`
- tags via join table
- level/zone/area/trade/system metadata

### Auditability
Stored in:
- `created_by`
- `updated_by`
- `source_measurement_id`
- `repeat_group_id`

---

## 6.3 Geometry handling

### Supported geometry types

#### Length
Stores:
- 2+ ordered points
- line segments
- linear length result

#### Area
Stores:
- polygon points
- closed boundary
- area result

#### Count
Stores:
- point markers
- optional quantity override

#### Volume
Derived from:
- area geometry + depth field
or
- length * width * depth fields in popup

#### Opening
Specialized measurement with:
- width
- height
- count
- optional deduction logic

#### Allowance / lump
No geometry required, but may reference page or area

---

## 6.4 Geometry JSON structure

### Example line
```json
{
  "type": "length",
  "points": [
    { "x": 120.4, "y": 88.2 },
    { "x": 420.7, "y": 90.5 }
  ],
  "segments": [
    { "start": 0, "end": 1, "length_raw": 300.3 }
  ]
}