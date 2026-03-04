# Takeoff Feature Module

Modern, modular architecture for the Magnus System v3 Takeoff engine.

## Structure

```
takeoff/
├── types/
│   └── takeoff.types.ts      # TypeScript type definitions
├── hooks/
│   ├── usePanZoom.ts          # Pan & zoom state management
│   └── useMeasurements.ts     # Measurement CRUD operations
├── components/
│   └── MeasurementLayer.tsx   # Canvas rendering for measurements
├── utils/
│   ├── geometry.ts            # Pure geometry functions
│   └── measurements.ts        # Measurement calculations
└── index.ts                   # Barrel exports
```

## Types

### Core Types
- `Point` - 2D coordinate
- `MeasurementType` - "point" | "line" | "area" | "volume" | "count"
- `TakeoffTool` - Active tool selection
- `Measurement` - Complete measurement data
- `MeasurementGroup` - Grouping/organization
- `CalibrationState` - Calibration configuration

## Hooks

### `usePanZoom(config)`
Manages pan and zoom state for canvas interactions.

**Returns:**
- `zoom`, `panX`, `panY` - Current transform state
- `zoomIn()`, `zoomOut()` - Discrete zoom controls
- `zoomToCursor(x, y, delta)` - Smooth cursor-centered zoom
- `startPan()`, `updatePan()`, `endPan()` - Pan gesture handlers
- `resetView()` - Reset to initial state
- `fitToView()` - Auto-fit content
- `screenToWorld(point)` - Convert screen coords to world coords
- `worldToScreen(point)` - Convert world coords to screen coords

### `useMeasurements()`
Manages measurement collection state.

**Returns:**
- `measurements` - Array of all measurements
- `addMeasurement(params)` - Create new measurement
- `removeMeasurement(id)` - Delete measurement
- `updateMeasurement(id, updates)` - Modify measurement
- `clearMeasurements()` - Remove all measurements
- `getMeasurementById(id)` - Find by ID
- `getMeasurementsByGroup(groupId)` - Filter by group
- `getMeasurementsByType(type)` - Filter by type
- `duplicateMeasurement(id)` - Clone measurement
- `getTotalCount()` - Count all measurements
- `getTotalByType(type)` - Sum results by type

## Components

### `MeasurementLayer`
Canvas-based overlay for rendering measurements.

**Props:**
- `measurements` - Array of measurements to render
- `scale` - Current zoom level
- `offsetX`, `offsetY` - Pan offsets
- `width`, `height` - Canvas dimensions
- `selectedId` - Highlighted measurement ID
- `onMeasurementClick` - Click handler

**Features:**
- Renders lines, areas, points, and count markers
- Click detection for measurement selection
- Visual highlighting for selected measurements
- Color-coded by measurement or group

## Utilities

### `geometry.ts`
Pure mathematical functions for 2D geometry:
- `distance(p1, p2)` - Euclidean distance
- `polygonArea(points)` - Area of polygon
- `centroid(points)` - Center point of polygon
- `pointToLineDistance()` - Distance from point to line segment
- `isPointInPolygon()` - Hit testing
- `rectangleArea()` - Quick rectangle area
- `midpoint()` - Middle of two points
- `rotatePoint()` - Rotate around center
- `snapToGrid()` - Snap to grid
- `findNearestPoint()` - Find closest point

### `measurements.ts`
Measurement-specific calculations:
- `calculateLineLength()` - Total length with calibration
- `calculateArea()` - Polygon area with unit conversion
- `calculateRectangleArea()` - Fast rectangle area
- `calculateVolume()` - Area × depth with unit conversion
- `calculateCount()` - Simple point count
- `formatMeasurement()` - Display formatting
- `convertUnits()` - Unit conversion
- `getMeasurementLabel()` - Auto-generate labels
- `getTotalByType()` - Aggregate by type
- `getTotalByGroup()` - Aggregate by group
- `exportMeasurementsToCSV()` - CSV export

## Usage Example

```tsx
import {
  usePanZoom,
  useMeasurements,
  MeasurementLayer,
} from "@/features/takeoff";

function TakeoffCanvas() {
  const { zoom, panX, panY, zoomToCursor } = usePanZoom({
    minZoom: 0.1,
    maxZoom: 10,
  });

  const { measurements, addMeasurement } = useMeasurements();

  const handleAddLine = () => {
    addMeasurement({
      type: "line",
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      pixelsPerUnit: 10,
      unit: "ft",
      label: "Wall length",
    });
  };

  return (
    <div>
      <MeasurementLayer
        measurements={measurements}
        scale={zoom}
        offsetX={panX}
        offsetY={panY}
        width={800}
        height={600}
      />
    </div>
  );
}
```

## Integration Plan

1. **Phase 1** - Use hooks in existing TakeoffPage.tsx
2. **Phase 2** - Extract UI components (toolbar, sidebar)
3. **Phase 3** - Add persistence layer (Supabase)
4. **Phase 4** - Add advanced tools (area, volume)
5. **Phase 5** - BOQ integration

## Benefits

- **Modular** - Each piece has single responsibility
- **Testable** - Pure functions, isolated hooks
- **Reusable** - Components work in any context
- **Type-safe** - Full TypeScript coverage
- **Performant** - Optimized rendering patterns
- **Maintainable** - Clear separation of concerns
