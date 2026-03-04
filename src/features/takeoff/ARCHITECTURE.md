# Takeoff System Architecture

## Component Hierarchy

```
TakeoffPage (Orchestrator)
│
├── PDF Canvas Layer (Static)
│   └── PDF.js rendering
│
├── MeasurementLayer (Dynamic Overlay)
│   ├── Line measurements
│   ├── Area measurements
│   ├── Point measurements
│   └── Count measurements
│
├── Toolbar Component
│   ├── Tool selection
│   ├── Zoom controls
│   └── View controls
│
├── Sidebar Component
│   ├── Measurement list
│   ├── Group management
│   └── Calibration controls
│
└── Modals
    ├── Calibration modal
    ├── Volume input modal
    └── Export modal
```

## Data Flow

```
User Interaction
      ↓
Event Handler (TakeoffPage)
      ↓
Hook Method Call
      ↓
┌─────────────────┬──────────────────┐
│                 │                  │
usePanZoom      useMeasurements    Utilities
│                 │                  │
├─ zoom           ├─ measurements    ├─ geometry.ts
├─ panX           ├─ add()           │  └─ distance()
├─ panY           ├─ remove()        │     polygonArea()
│                 ├─ update()        │     centroid()
│                 │                  │
│                 │                  └─ measurements.ts
│                 │                     └─ calculateLineLength()
│                 │                        calculateArea()
│                 │                        calculateVolume()
└─────────────────┴──────────────────┘
      ↓
State Update (React)
      ↓
Re-render Components
      ↓
Canvas Redraw (MeasurementLayer)
      ↓
Visual Update
```

## Hook Dependencies

```
usePanZoom
├── useState (zoom, panX, panY)
├── useRef (isPanning, lastMousePos)
└── useCallback (all methods)

useMeasurements
├── useState (measurements[])
└── useCallback (CRUD methods)

useTakeoffPersistence (future)
├── usePanZoom
├── useMeasurements
└── Supabase client
```

## Type System

```
Core Types
├── Point { x, y }
├── MeasurementType (union)
├── TakeoffTool (union)
│
Measurement Data
├── Measurement
│   ├── id: string
│   ├── type: MeasurementType
│   ├── points: Point[]
│   ├── result: number
│   ├── unit: string
│   ├── label?: string
│   ├── groupId?: string
│   ├── color?: string
│   └── timestamp: number
│
Group Data
├── MeasurementGroup
│   ├── id: string
│   ├── name: string
│   ├── color: string
│   ├── trade?: string
│   ├── visible: boolean
│   ├── locked: boolean
│   └── sortOrder: number
│
State
├── CalibrationState
│   ├── isCalibrated: boolean
│   ├── point1: Point | null
│   ├── point2: Point | null
│   ├── realDistance: number
│   ├── unit: 'ft' | 'in' | 'm' | 'cm'
│   └── pixelsPerUnit: number
│
└── PanZoomState
    ├── zoom: number
    ├── panX: number
    └── panY: number
```

## Canvas Rendering Strategy

```
┌──────────────────────────────────────┐
│  Container (relative positioning)     │
│                                       │
│  ┌────────────────────────────────┐  │
│  │ PDF Canvas (static, z-index: 1)│  │
│  │ - Only redraws on page change  │  │
│  │ - Only redraws on zoom change  │  │
│  └────────────────────────────────┘  │
│                                       │
│  ┌────────────────────────────────┐  │
│  │ MeasurementLayer (z-index: 2)  │  │
│  │ - Redraws on measurement add   │  │
│  │ - Redraws on selection change  │  │
│  │ - Redraws on pan/zoom          │  │
│  └────────────────────────────────┘  │
│                                       │
│  ┌────────────────────────────────┐  │
│  │ UI Overlay (z-index: 3)        │  │
│  │ - React components             │  │
│  │ - Tooltips, labels             │  │
│  │ - No canvas redraw needed      │  │
│  └────────────────────────────────┘  │
│                                       │
└──────────────────────────────────────┘
```

## Measurement Creation Flow

```
Line Tool Example:
1. User selects "Line" tool
2. activeTool = "line"
3. User clicks point 1
   → tempPoints = [p1]
4. User clicks point 2
   → tempPoints = [p1, p2]
   → addMeasurement() called
   → calculateLineLength(points, pixelsPerUnit)
   → Measurement created with result
   → tempPoints cleared
5. Measurement appears in list
6. MeasurementLayer renders line

Area Tool Example:
1. User selects "Area" tool
2. activeTool = "area"
3. User clicks multiple points
   → tempPoints = [p1, p2, p3, ...]
4. User clicks "Finish Area"
   → addMeasurement() called
   → calculateArea(points, pixelsPerUnit)
   → Measurement created with result
   → tempPoints cleared
5. Measurement appears in list
6. MeasurementLayer renders polygon
```

## Coordinate Systems

```
Screen Coordinates (pixels from top-left)
      ↓ screenToWorld()
World Coordinates (actual measurement space)
      ↓ calibration.pixelsPerUnit
Real-World Units (ft, m, etc.)

Example:
Screen: { x: 500, y: 300 }
   ↓ (subtract panX, panY, divide by zoom)
World: { x: 450, y: 270 }
   ↓ (divide by pixelsPerUnit = 10)
Real: 45 ft, 27 ft
   ↓ distance formula
Result: 52.20 ft
```

## Performance Optimizations

```
1. Canvas Layering
   - PDF layer: Static, rarely redraws
   - Measurement layer: Only redraws when needed
   - UI layer: React components, no canvas

2. State Management
   - usePanZoom uses refs for isPanning
   - Prevents re-renders during drag
   - Only updates state on gesture end

3. Pure Functions
   - All utils/*.ts are pure
   - No side effects
   - Easy to memoize

4. Debouncing (to add)
   - Pan updates: 16ms (60fps)
   - Auto-save: 5000ms
   - Search: 300ms

5. Lazy Rendering
   - Only visible measurements rendered
   - Off-screen measurements culled
   - Large datasets paginated
```

## Future Extensions

```
Planned Features:
├── Multi-page support
│   └── takeoff_measurements.page_number
│
├── Measurement templates
│   └── "Wall Area - Gypsum" → auto-creates area tool
│
├── Assemblies integration
│   └── Link measurement to assembly
│       └── Auto-calculate material needs
│
├── BOQ integration
│   └── boq_section_items.takeoff_group_id
│       └── Auto-update quantities
│
├── Undo/Redo
│   └── Command pattern
│       └── Invertible operations
│
├── Collaboration
│   └── Supabase real-time subscriptions
│       └── Multi-user editing
│
└── AI Assistance
    └── Auto-detect walls/rooms from PDF
        └── Suggest measurements
```

## File Size & Complexity

```
Component Breakdown:
├── takeoff.types.ts       ~80 lines   (simple)
├── geometry.ts           ~150 lines   (moderate)
├── measurements.ts       ~180 lines   (moderate)
├── usePanZoom.ts         ~120 lines   (moderate)
├── useMeasurements.ts    ~100 lines   (simple)
├── MeasurementLayer.tsx  ~200 lines   (moderate)
└── TakeoffDemo.tsx       ~180 lines   (simple)

Total: ~1,010 lines (vs 1,157 in old monolith)

Complexity Reduction:
- Old: Everything in one file (high coupling)
- New: Separated concerns (low coupling, high cohesion)
```

## Testing Strategy

```
Unit Tests (Pure Functions)
├── geometry.ts
│   ├── distance() → assert result
│   ├── polygonArea() → assert area
│   └── centroid() → assert center
│
├── measurements.ts
│   ├── calculateLineLength() → assert length
│   ├── calculateArea() → assert area
│   └── convertUnits() → assert conversion
│
Integration Tests (Hooks)
├── usePanZoom
│   ├── zoomIn() → assert zoom increased
│   ├── zoomToCursor() → assert pan updated
│   └── resetView() → assert initial state
│
├── useMeasurements
│   ├── addMeasurement() → assert count increased
│   ├── removeMeasurement() → assert count decreased
│   └── updateMeasurement() → assert values changed
│
Component Tests (React)
├── MeasurementLayer
│   ├── Renders line measurements
│   ├── Renders area measurements
│   ├── Click detection works
│   └── Selection highlighting works
│
E2E Tests (Playwright/Cypress)
└── TakeoffPage
    ├── User can pan/zoom
    ├── User can create line measurement
    ├── User can create area measurement
    ├── Measurements persist
    └── BOQ integration works
```

## Migration Path

```
Current State (Phase 1 Complete)
├── ✅ New architecture created
├── ✅ Hooks implemented
├── ✅ Components built
├── ✅ Utils written
└── ✅ Demo working

Phase 2: Integration
├── Import new hooks into TakeoffPage.tsx
├── Replace inline state
├── Add MeasurementLayer overlay
└── Test existing features

Phase 3: New Tools
├── Area tool
├── Volume tool
├── Count tool
└── Rectangle tool

Phase 4: Groups
├── Group management UI
├── Color-coded rendering
├── Group visibility toggles
└── Lock/unlock groups

Phase 5: Persistence
├── Supabase tables
├── Save/load hooks
├── Auto-save
└── Version history

Phase 6: BOQ Integration
├── Link measurements to BOQ items
├── Auto-update quantities
├── Visual indicators
└── Sync on change
```

## Comparison Matrix

| Feature | Old System | New System |
|---------|-----------|-----------|
| Architecture | Monolithic | Modular |
| Lines of Code | 1,157 | ~1,010 (split) |
| TypeScript | Partial | Full |
| Testability | Low | High |
| Pan/Zoom | Manual | Hook-based |
| Cursor Zoom | Choppy | Smooth ⭐ |
| Measurements | In-memory | Hook-managed |
| Rendering | Mixed | Layered |
| Persistence | None | Ready for DB |
| Groups | No | Yes (ready) |
| BOQ Integration | No | Yes (planned) |
| Extensibility | Hard | Easy |
| Performance | Good | Optimized |
| Documentation | Minimal | Complete |

---

**Summary**: The new architecture provides a solid foundation for building a modern, PlanSwift-level takeoff system while maintaining clean code, type safety, and excellent performance.
