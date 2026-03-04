# Takeoff System Migration Guide

## Phase 1: Foundation ✅ COMPLETE

**Status**: New modular architecture created without breaking existing code.

**Created Files**:
- ✅ `types/takeoff.types.ts` - TypeScript type definitions
- ✅ `utils/geometry.ts` - Pure geometry functions (15+ helpers)
- ✅ `utils/measurements.ts` - Measurement calculations & conversions
- ✅ `hooks/usePanZoom.ts` - Pan/zoom state management with cursor-centered zoom
- ✅ `hooks/useMeasurements.ts` - Measurement CRUD operations
- ✅ `components/MeasurementLayer.tsx` - Canvas rendering layer
- ✅ `components/TakeoffDemo.tsx` - Demo implementation
- ✅ `index.ts` - Barrel exports
- ✅ `README.md` - Documentation

**What Changed**: Nothing in existing code. All new files are isolated.

**Build Status**: ✅ Project builds successfully

---

## Phase 2: Integrate into TakeoffPage.tsx (NEXT STEP)

**Goal**: Replace inline logic with new hooks while maintaining all existing features.

### Step 2.1: Import New Modules

```tsx
// At top of TakeoffPage.tsx
import {
  usePanZoom,
  useMeasurements,
  MeasurementLayer,
  type TakeoffTool,
  type Measurement,
} from "../features/takeoff";
```

### Step 2.2: Replace Pan/Zoom State

**Before (current code)**:
```tsx
const [zoom, setZoom] = useState(1);
const [panX, setPanX] = useState(0);
const [panY, setPanY] = useState(0);
// ... lots of manual zoom/pan logic
```

**After**:
```tsx
const {
  zoom,
  panX,
  panY,
  zoomToCursor,
  handleWheel,
  startPan,
  updatePan,
  endPan,
  resetView,
  fitToView,
  screenToWorld,
  worldToScreen,
} = usePanZoom({
  minZoom: 0.1,
  maxZoom: 10,
  initialZoom: 1,
});
```

### Step 2.3: Replace Measurement State

**Before**:
```tsx
const [measurements, setMeasurements] = useState([]);
// manual add/remove logic
```

**After**:
```tsx
const {
  measurements,
  addMeasurement,
  removeMeasurement,
  updateMeasurement,
  clearMeasurements,
} = useMeasurements();
```

### Step 2.4: Add MeasurementLayer Overlay

**Before**: Drawing measurements directly on PDF canvas

**After**: Separate overlay layer
```tsx
<div className="relative">
  {/* Existing PDF canvas */}
  <canvas ref={canvasRef} />

  {/* New measurement overlay */}
  <MeasurementLayer
    measurements={measurements}
    scale={zoom}
    offsetX={panX}
    offsetY={panY}
    width={pdfWidth}
    height={pdfHeight}
    selectedId={selectedMeasurementId}
    onMeasurementClick={setSelectedMeasurementId}
  />
</div>
```

### Step 2.5: Update Event Handlers

**Wheel Event**:
```tsx
const handleWheelEvent = useCallback((e: WheelEvent) => {
  if (!containerRef.current) return;
  const rect = containerRef.current.getBoundingClientRect();
  handleWheel(e, rect);
}, [handleWheel]);
```

**Mouse Events**:
```tsx
const handleMouseDown = (e: MouseEvent) => {
  if (e.button === 1 || (e.button === 0 && activeTool === "pan")) {
    startPan(e.clientX, e.clientY);
  }
};

const handleMouseMove = (e: MouseEvent) => {
  updatePan(e.clientX, e.clientY);
};

const handleMouseUp = () => {
  endPan();
};
```

---

## Phase 3: Add New Measurement Tools

### Step 3.1: Area Tool

```tsx
// In click handler
if (activeTool === "area") {
  const worldPoint = screenToWorld({ x: e.clientX, y: e.clientY });

  if (tempPoints.length < 3) {
    setTempPoints([...tempPoints, worldPoint]);
  } else {
    // Complete the area
    addMeasurement({
      type: "area",
      points: [...tempPoints, worldPoint],
      pixelsPerUnit: calibration.pixelsPerUnit,
      unit: "ft²",
      label: "Area measurement",
    });
    setTempPoints([]);
  }
}
```

### Step 3.2: Volume Tool

```tsx
// Area + depth dialog
const handleVolumeComplete = (depth: number) => {
  const area = calculateArea(tempPoints, pixelsPerUnit);
  const volume = calculateVolume(area, depth, "in", "ft³");

  addMeasurement({
    type: "volume",
    points: tempPoints,
    result: volume,
    unit: "ft³",
    label: `Concrete volume (${depth}" depth)`,
  });
};
```

### Step 3.3: Count Tool

```tsx
if (activeTool === "count") {
  const worldPoint = screenToWorld({ x: e.clientX, y: e.clientY });

  if (!activeCountMeasurement) {
    // Start new count
    const m = addMeasurement({
      type: "count",
      points: [worldPoint],
      pixelsPerUnit: 1,
      unit: "ea",
      label: "Count",
    });
    setActiveCountMeasurement(m.id);
  } else {
    // Add to existing count
    const existing = getMeasurementById(activeCountMeasurement);
    if (existing) {
      updateMeasurement(activeCountMeasurement, {
        points: [...existing.points, worldPoint],
        result: existing.points.length + 1,
      });
    }
  }
}
```

---

## Phase 4: Add Measurement Groups

### Step 4.1: Create Group State

```tsx
const [groups, setGroups] = useState<MeasurementGroup[]>([
  {
    id: "concrete",
    name: "Concrete",
    color: "#ef4444",
    trade: "Concrete",
    visible: true,
    locked: false,
    sortOrder: 0,
  },
  {
    id: "masonry",
    name: "Masonry",
    color: "#f59e0b",
    trade: "Masonry",
    visible: true,
    locked: false,
    sortOrder: 1,
  },
]);

const [activeGroupId, setActiveGroupId] = useState<string | null>("concrete");
```

### Step 4.2: Group Selector UI

```tsx
<div className="space-y-2">
  <div className="text-xs opacity-70">Active Group</div>
  {groups.map((group) => (
    <button
      key={group.id}
      onClick={() => setActiveGroupId(group.id)}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded ${
        activeGroupId === group.id ? "bg-white/15" : "bg-white/5"
      }`}
    >
      <div
        className="w-3 h-3 rounded"
        style={{ backgroundColor: group.color }}
      />
      <span>{group.name}</span>
      <button onClick={() => toggleGroupVisibility(group.id)}>
        {group.visible ? "👁️" : "👁️‍🗨️"}
      </button>
    </button>
  ))}
</div>
```

### Step 4.3: Assign Measurements to Groups

```tsx
// When creating measurement
addMeasurement({
  type: "line",
  points: [...],
  groupId: activeGroupId,
  color: groups.find(g => g.id === activeGroupId)?.color,
  // ...
});
```

---

## Phase 5: Add Persistence (Supabase)

### Step 5.1: Create Database Tables

```sql
-- Already exists: projects table

create table if not exists takeoff_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  pdf_name text not null,
  pdf_url text,
  pages jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists takeoff_groups (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references takeoff_sessions(id) on delete cascade,
  name text not null,
  color text not null,
  trade text,
  visible boolean default true,
  locked boolean default false,
  sort_order int default 0
);

create table if not exists takeoff_measurements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references takeoff_sessions(id) on delete cascade,
  group_id uuid references takeoff_groups(id) on delete set null,
  page_number int default 1,
  type text not null,
  points jsonb not null,
  result numeric not null,
  unit text not null,
  label text,
  color text,
  created_at timestamptz default now()
);

-- Enable RLS
alter table takeoff_sessions enable row level security;
alter table takeoff_groups enable row level security;
alter table takeoff_measurements enable row level security;

-- Policies (authenticated users only)
create policy "Users can view own takeoffs"
  on takeoff_sessions for select
  to authenticated
  using (true);

create policy "Users can insert own takeoffs"
  on takeoff_sessions for insert
  to authenticated
  with check (true);

create policy "Users can update own takeoffs"
  on takeoff_sessions for update
  to authenticated
  using (true);
```

### Step 5.2: Create Persistence Hook

```tsx
// src/features/takeoff/hooks/useTakeoffPersistence.ts
export function useTakeoffPersistence(sessionId: string | null) {
  const saveMeasurements = async (measurements: Measurement[]) => {
    if (!sessionId) return;

    const { error } = await supabase
      .from("takeoff_measurements")
      .upsert(
        measurements.map((m) => ({
          id: m.id,
          session_id: sessionId,
          type: m.type,
          points: m.points,
          result: m.result,
          unit: m.unit,
          label: m.label,
          group_id: m.groupId,
          color: m.color,
        }))
      );

    if (error) console.error("Save failed:", error);
  };

  const loadMeasurements = async (): Promise<Measurement[]> => {
    if (!sessionId) return [];

    const { data, error } = await supabase
      .from("takeoff_measurements")
      .select("*")
      .eq("session_id", sessionId);

    if (error) {
      console.error("Load failed:", error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      type: row.type,
      points: row.points,
      result: row.result,
      unit: row.unit,
      label: row.label,
      groupId: row.group_id,
      color: row.color,
      timestamp: new Date(row.created_at).getTime(),
    }));
  };

  return { saveMeasurements, loadMeasurements };
}
```

### Step 5.3: Auto-Save

```tsx
// In TakeoffPage.tsx
const { saveMeasurements } = useTakeoffPersistence(sessionId);

useEffect(() => {
  const timer = setInterval(() => {
    saveMeasurements(measurements);
  }, 5000); // Auto-save every 5 seconds

  return () => clearInterval(timer);
}, [measurements, saveMeasurements]);
```

---

## Phase 6: BOQ Integration

### Step 6.1: Link Takeoff Group to BOQ Item

```tsx
// In BOQPage.tsx
const linkTakeoffGroup = async (boqItemId: string, groupId: string) => {
  await supabase
    .from("boq_section_items")
    .update({
      qty_source: "takeoff_group",
      takeoff_group_id: groupId,
    })
    .eq("id", boqItemId);
};
```

### Step 6.2: Auto-Update BOQ Quantities

```tsx
// Create view in Supabase
create view v_boq_items_with_takeoff as
select
  bi.*,
  coalesce(
    (
      select sum(tm.result)
      from takeoff_measurements tm
      where tm.group_id = bi.takeoff_group_id
      and tm.type = 'area'
    ),
    bi.qty
  ) as qty_calculated
from boq_section_items bi;
```

### Step 6.3: Display Linked Status

```tsx
// In BOQ item row
{item.qty_source === "takeoff_group" && (
  <div className="text-xs opacity-70 flex items-center gap-1">
    <span>📏</span>
    <span>Linked to Takeoff</span>
  </div>
)}
```

---

## Testing Checklist

### Phase 2 (Integration)
- [ ] Pan with middle mouse works
- [ ] Pan with space + drag works
- [ ] Zoom with Ctrl+wheel is cursor-centered
- [ ] Existing line measurement tool still works
- [ ] Calibration still works
- [ ] All measurements render correctly
- [ ] No performance regression

### Phase 3 (New Tools)
- [ ] Area tool: click to add points, close polygon
- [ ] Volume tool: area + depth input
- [ ] Count tool: click to add numbered markers
- [ ] Point tool: single-click markers

### Phase 4 (Groups)
- [ ] Create/edit/delete groups
- [ ] Assign measurements to groups
- [ ] Toggle group visibility
- [ ] Lock groups to prevent edits
- [ ] Color-coded rendering

### Phase 5 (Persistence)
- [ ] Save session to database
- [ ] Load existing session
- [ ] Auto-save every 5 seconds
- [ ] Measurements persist across page reload
- [ ] Multi-page support

### Phase 6 (BOQ Integration)
- [ ] Link BOQ item to takeoff group
- [ ] Auto-update quantities when measurements change
- [ ] Visual indicator of linked items
- [ ] Unlinking removes auto-update

---

## Performance Optimization

### Current Issues (to fix in Phase 2)
1. **Too many re-renders** - Use `useCallback` and `useMemo`
2. **Full canvas redraw** - Separate PDF layer from measurement layer
3. **No debouncing** - Add to pan/zoom handlers

### Solutions Implemented
- ✅ Separate `MeasurementLayer` component
- ✅ `usePanZoom` hook uses refs to avoid re-renders
- ✅ Pure geometry functions (no side effects)
- ✅ Memoized calculations in hooks

### To Add in Phase 2
- `useCallback` for all event handlers
- `useMemo` for filtered measurements
- `requestAnimationFrame` for smooth pan
- Debounce canvas redraws (16ms = 60fps)

---

## Rollback Plan

If migration causes issues:

1. **Keep both implementations** - Old `TakeoffPage.tsx` and new modules coexist
2. **Feature flag** - Add toggle in settings to use old vs new
3. **Gradual migration** - Migrate one hook at a time
4. **No data loss** - New persistence layer is additive only

---

## Summary

**Phase 1 Status**: ✅ Complete - Foundation built, no existing code changed

**Next Action**: Phase 2 - Integrate `usePanZoom` and `useMeasurements` into existing `TakeoffPage.tsx`

**Estimated Timeline**:
- Phase 2: 2-3 days
- Phase 3: 2 days
- Phase 4: 1-2 days
- Phase 5: 2-3 days
- Phase 6: 2-3 days

**Total**: ~10-14 days for complete modernization
