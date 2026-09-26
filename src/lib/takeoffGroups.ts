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
  // Percent added for waste when converting by coverage_factor. 0 / null / undefined mean "never set" and use DEFAULT_COVERAGE_WASTE_PERCENT.
  waste_percent?: number | null;
}

// Matches the 5% the BOQ "Enter measurements" modal applies. Used when an item's waste_percent is 0 or unset.
export const DEFAULT_COVERAGE_WASTE_PERCENT = 5;

export function effectiveWastePercent(item: { waste_percent?: number | null } | null | undefined): number {
  const w = Number(item?.waste_percent);
  return Number.isFinite(w) && w > 0 ? w : DEFAULT_COVERAGE_WASTE_PERCENT;
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
  // Set only when the value was converted by a coverage_factor: the waste percent that was included in it.
  wastePercent?: number;
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
  const coverage: Record<string, Record<string, { raw: number; cf: number; waste: number }>> = {};

  measurements.forEach(m => {
    const key = takeoffGroupKey(m);

    // Apply coverage conversion for rate-library items with a coverage factor
    const item = m.linkedItemId ? costItems.find(i => i.id === m.linkedItemId) : null;
    const cf = item?.coverage_factor;
    const hasCoverage = !!(item && cf && cf > 0);
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

    if (hasCoverage) {
      // Sum the raw measured quantity per item; waste and the round-up are applied once, after the loop.
      const acc = (coverage[key] ??= {});
      (acc[item!.id] ??= { raw: 0, cf: cf as number, waste: effectiveWastePercent(item) }).raw += m.result;
    } else {
      groups[key].value += m.result;
    }
  });

  // ceil((sum of measured / coverage_factor) * (1 + waste/100)), once per item in the group. The toFixed guards float
  // noise (e.g. 10 * 1.1 = 11.000000000000002) from rounding up an extra unit.
  Object.keys(coverage).forEach(key => {
    Object.values(coverage[key]).forEach(c => {
      groups[key].value += Math.ceil(Number(((c.raw / c.cf) * (1 + c.waste / 100)).toFixed(6)));
      if (groups[key].wastePercent === undefined) groups[key].wastePercent = c.waste;
    });
  });

  return Object.values(groups);
}
