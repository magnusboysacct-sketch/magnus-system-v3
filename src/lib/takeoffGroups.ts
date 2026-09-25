// Groups Takeoff measurements into the per-line totals that are sent to the BOQ page. Pure (no I/O), so the Takeoff page's
// "Send to BOQ" and, later, the BOQ page's reconcile pass can both ask the same question of the same code:
// "what does Takeoff say the total is for this group?"

// The measurement fields the grouping reads (structural, so Takeoff's own Measurement type satisfies it).
export interface GroupableMeasurement {
  type: string;
  result: number;
  unit: string;
  linkedAssemblyId?: string;
  linkedAssemblyName?: string;
  linkedItemId?: string;
  linkedItemName?: string;
  wallLength?: number;
  wallHeight?: number;
}

// The cost-item fields used for coverage-factor conversion.
export interface GroupableCostItem {
  id: string;
  unit?: string | null;
  coverage_factor?: number | null;
}

export interface TakeoffGroup {
  name: string;
  value: number;
  metric: string;
  assemblyId?: string;
  // The rate-library item's real id (never set together with an assembly), so BOQ can look up its rate.
  costItemId?: string;
  // The stable key this group was built under: assembly id, else "item:" + item id, else item name, else the bare type.
  groupKey: string;
  length?: number;
  height?: number;
  width?: number;
  heightMismatch?: boolean;
}

// The key a measurement is grouped under. Assembly id, else the linked rate item's id (so two items that share a display
// name stay separate), else the item name (measurements saved before item ids were carried), else the bare type.
export function takeoffGroupKey(m: Pick<GroupableMeasurement, "type" | "linkedAssemblyId" | "linkedItemId" | "linkedItemName">): string {
  return m.linkedAssemblyId ||
    (m.linkedItemId ? "item:" + m.linkedItemId : "") ||
    m.linkedItemName ||
    m.type;
}

export function groupTakeoffMeasurements(measurements: GroupableMeasurement[], costItems: GroupableCostItem[]): TakeoffGroup[] {
  // A plain object (not a Map) on purpose: the groups come back in this object's key order, exactly as before this was
  // moved out of the Takeoff page.
  const groups: Record<string, TakeoffGroup> = {};

  measurements.forEach(m => {
    const key = takeoffGroupKey(m);

    // Apply coverage conversion for rate-library items with a coverage factor
    const item = m.linkedItemId ? costItems.find(i => i.id === m.linkedItemId) : null;
    const cf = item?.coverage_factor;
    const convertedVal = (cf && cf > 0) ? Math.ceil(m.result / cf) : m.result;
    const sellUnit = (cf && cf > 0 && item?.unit) ? item.unit : m.unit;

    if (!groups[key]) {
      groups[key] = {
        name:
          m.linkedAssemblyName ||
          m.linkedItemName ||
          m.type,
        value: 0,
        metric: sellUnit,
        assemblyId: m.linkedAssemblyId,
        costItemId: m.linkedAssemblyId ? undefined : m.linkedItemId,
        groupKey: key,
      };
    }

    if (m.type === "wall" && typeof m.wallLength === "number" && typeof m.wallHeight === "number") {
      groups[key].length = (groups[key].length || 0) + m.wallLength;
      if (groups[key].height === undefined) {
        groups[key].height = m.wallHeight;
      } else if (groups[key].height !== m.wallHeight) {
        groups[key].heightMismatch = true;
      }
    }

    groups[key].value += convertedVal;
  });

  return Object.values(groups);
}
