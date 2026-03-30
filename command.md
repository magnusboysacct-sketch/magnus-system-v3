# Magnus System v3 — Takeoff Page Master Command

## Objective
Rebuild and upgrade the **Takeoff Page only** into a professional, future-ready, desktop-grade takeoff workspace while keeping the **Magnus theme/layout style** and preserving real backend integration.

This file is the single source of truth for what Windsurf should check, protect, fix, and build for `src/pages/TakeoffPage.tsx`.

---

## Core Rules

1. **Only work on the Takeoff Page**
   - Main target: `src/pages/TakeoffPage.tsx`
   - Reuse existing takeoff engine/modules where possible
   - Do not refactor unrelated pages

2. **Keep Magnus visual identity**
   - Keep dark Magnus theme
   - Keep professional compact desktop style
   - Improve layout and UX without turning it into a different product

3. **Do not guess backend/schema**
   - Use the real existing Supabase schema only
   - Do not invent columns or tables
   - Do not break current project routing/context logic

4. **Prefer safe upgrades over random rewrites**
   - Audit first
   - Then patch cleanly
   - Keep working logic where it is valid
   - Replace only fragile or broken sections

5. **Do not return partial fixes**
   - Fix the page in a complete, connected way
   - Avoid introducing duplicate functions, duplicate state, or dead code

---

## Current Known Product Direction

The Takeoff Page should become a full working quantity takeoff workspace that supports:

- PDF/image drawing viewing
- smooth zoom/pan
- calibration
- line/area/count/volume measurements
- live preview while drawing
- clean tool completion/cancel flow
- item + assembly picking directly inside takeoff
- future connection from takeoff quantities -> BOQ
- professional desktop layout similar to a serious estimating tool

---

## Exact Features We Want

### 1. Drawing/PDF Handling
Check and build:

- reliable PDF upload
- reliable PDF rendering
- support for multi-page drawings
- faster loading performance
- safer page/document bootstrap flow
- no duplicate insert/session/page conflicts
- if PDF has multiple pages, user must be able to access all pages
- left-side page navigation/thumbnails if already present should be preserved/improved

### 2. Viewer / Workspace
The drawing workspace should support:

- fit-to-view on load
- smooth zoom
- Ctrl + wheel zoom-to-cursor
- pan behavior that feels professional
- stable rendering area
- visible drawing layer and overlay layer
- good empty state when no drawing is loaded

### 3. Measurement Tools
Tools that must exist and work:

- Select
- Line
- Area
- Count
- Volume

Expected behavior:

- line tool should show live length while drawing
- area tool should show live draft area/perimeter while drawing
- count tool should place count markers clearly
- volume tool should use takeoff logic consistent with current structure
- selected measurement should highlight clearly
- draft geometry should be visibly different from saved geometry
- draft line/polygon preview should be dashed and easy to see

### 4. Tool Finish / Cancel Flow
This is important.

Must support:

- right click to finish area
- ESC to cancel active drawing
- visible **Cancel Tool** button
- clear finish behavior for area and other multi-click tools
- no “stuck in tool mode” feeling

### 5. Delete Actions
Must support deleting:

- a single selected measurement
- a group
- possibly selected draft before save if applicable

Delete behavior should be clear and safe.

### 6. Calibration Flow
Calibration must behave correctly:

- clicking **Start** or **Restart** closes the modal
- user picks point 1 on drawing
- user picks point 2 on drawing
- modal reopens after second point
- user confirms real-world distance
- calibration saves correctly to real schema fields
- no broken modal loop

### 7. Groups Panel
Groups panel should be professional and useful.

Check/fix:

- create/use groups cleanly
- color/group tagging
- select current group easily
- delete group safely
- show group organization clearly
- measurements should respect selected group

### 8. Item / Assembly Picker Inside Takeoff
We want a folder-style picker in Takeoff Page.

This should support:

- choosing Items from library
- choosing Assemblies from library
- folder/category style navigation
- clean modal/drawer/panel UX
- allow linking selected library item/assembly to takeoff measurement/group
- future-ready structure so formulas and assemblies can later drive BOQ quantities

Do not fake old rate library behavior if new library tables are already the real source.

### 9. Professional Layout Direction
Target layout feel:

- top compact ribbon/toolbar
- optional left navigation/pages/library area
- center drawing workspace
- right groups/properties/measurements panel
- compact spacing
- desktop-grade professional look
- keep Magnus styling, just make it better

### 10. Save / Persistence
Check all save logic carefully:

- no duplicate session/page creation issues
- no stale active page issues
- no “No active page id” type failures
- use real route-based project loading
- use real existing backend logic
- keep autosave or debounced save if already valid
- measurements must persist correctly
- calibration must persist correctly
- drawing/page data must persist correctly

---

## Existing Constraints To Respect

- Keep project route logic correct
  - real route is project-based
- Keep existing Supabase integration
- Keep real schema mapping
- Keep Magnus theme
- Do not bloat toolbar
- Do not redesign into a different app
- Do not break future BOQ linkage direction
- Do not remove current useful engine modules if they already exist

---

## Specific Bugs/Failures To Audit First

Windsurf must explicitly inspect and report on these before changing code:

1. Why PDF loading is slow
2. Why PDF multi-page rendering/support is incomplete or broken
3. Whether the page bootstrap/session bootstrap is fragile
4. Whether duplicate functions or duplicate state blocks exist
5. Whether render tree is doing too much work
6. Whether measurement preview logic is missing or incomplete
7. Whether area finish logic is missing
8. Whether cancel flow is incomplete
9. Whether delete logic is missing for measurements/groups
10. Whether calibration modal flow is broken
11. Whether item/assembly picker already partially exists and should be reused
12. Whether current layout can be improved without breaking logic

---

## Delivery Style For Windsurf

When working from this file, follow this sequence:

### Phase 1 — Audit
Inspect current `src/pages/TakeoffPage.tsx` and related takeoff modules.
Return:

- section map
- state map
- handler/function map
- fragile areas
- render bottlenecks
- confirmed missing features
- exact safe patch plan

### Phase 2 — Implement
Apply the fixes and upgrades cleanly.

### Phase 3 — Final Output
Return:

- one full updated paste-ready `src/pages/TakeoffPage.tsx`
- only add/update supporting files if truly required
- no fake placeholders
- no pseudo-code
- no partial snippets

---

## Preferred UX Details

- compact toolbar spacing
- professional button grouping
- clearer active tool state
- visible draft measurement overlay
- clear selected measurement styling
- strong empty-state messaging
- smooth workflow from upload -> calibrate -> measure -> assign group/item -> save

---

## Future Direction
This page should be built so that later we can support:

- formulas tied to selected items
- assemblies tied to measured quantities
- takeoff quantity flow into BOQ
- smarter snapping
- measurement editing handles
- richer measurement labels on the drawing
- more advanced takeoff production workflow

Do not overbuild these now unless structure is needed to support them.

---

## Absolute Don’ts

- do not guess schema
- do not change unrelated pages
- do not destroy Magnus styling
- do not leave duplicate code behind
- do not give partial fragmented fixes
- do not simplify away core takeoff functionality
- do not remove item/assembly future direction

---

## Final Instruction
Treat this as the master requirements file for the Takeoff Page.
Before making major changes, verify the real current file and real connected modules.
Build a strong, stable, future-ready Takeoff Page that works properly.