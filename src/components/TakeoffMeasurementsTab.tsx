import React from "react";
import { Check } from "lucide-react";

type Point = { x: number; y: number };

type GroupRow = {
  id: string;
  name: string;
  color: string;
  trade?: string | null;
  sort_order: number;
};

type MeasurementRow = {
  id: string;
  type: string;
  group_id: string | null;
  page_number: number;
  result: number;
  unit: string;
  points: Point[];
  meta?: any;
};

type TotalsByGroup = {
  group: GroupRow | null;
  line: number;
  area: number;
  count: number;
  volume: number;
  lineUnit: string;
  areaUnit: string;
  volumeUnit: string;
};

type TakeoffMeasurementsTabProps = {
  groups: GroupRow[];
  measurements: MeasurementRow[];
  totalsByGroup: TotalsByGroup[];
  selectedGroupId: string | null;
  selectedMeasurementId: string | null;
  highlightedGroupId: string | null;
  calibrationScale: number | null;
  calibrationUnit: string;
  onSelectGroup: (groupId: string | null) => void;
  onSelectMeasurement: (measurementId: string) => void;
  onHighlightGroup: (groupId: string | null) => void;
  onAddGroup: () => void;
  onDeleteGroup: (groupId: string) => void;
  onRemoveMeasurement: (measurementId: string) => void;
  onUpdateDimensions: (measurementId: string, dimensions: any) => void;
  formatNumber: (n: number, decimals?: number) => string;
  getMeasurementBadge: (measurement: MeasurementRow, calibrated: boolean) => React.ReactNode;
};

export function TakeoffMeasurementsTab(props: TakeoffMeasurementsTabProps) {
  const {
    groups,
    measurements,
    totalsByGroup,
    selectedGroupId,
    selectedMeasurementId,
    highlightedGroupId,
    calibrationScale,
    calibrationUnit,
    onSelectGroup,
    onSelectMeasurement,
    onHighlightGroup,
    onAddGroup,
    onDeleteGroup,
    onRemoveMeasurement,
    onUpdateDimensions,
    formatNumber,
    getMeasurementBadge,
  } = props;

  const selectedMeasurement = measurements.find((m) => m.id === selectedMeasurementId) ?? null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Totals Summary */}
      {totalsByGroup.filter((t) => t.group !== null).length > 0 && (
        <div className="border-b border-slate-200 bg-slate-50/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Measurement Legend</div>
            {highlightedGroupId && (
              <button
                type="button"
                onClick={() => onHighlightGroup(null)}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                Clear Filter
              </button>
            )}
          </div>
          <div className="space-y-2">
            {totalsByGroup
              .filter((t) => t.group !== null)
              .map((total) => {
                const group = total.group!;
                const measurementCount = measurements.filter((m) => m.group_id === group.id).length;
                const isHighlighted = highlightedGroupId === group.id;

                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => onHighlightGroup(isHighlighted ? null : group.id)}
                    className={`w-full rounded-xl border p-3 text-left transition-all ${
                      isHighlighted
                        ? "border-blue-400 bg-blue-50 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <div className="h-3 w-3 rounded" style={{ backgroundColor: group.color }} />
                      <span className="flex-1 text-sm font-semibold text-slate-900">{group.name}</span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {measurementCount}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {total.line > 0 && (
                        <div>
                          <span className="text-slate-500">Length: </span>
                          <span className="font-medium text-slate-900">{formatNumber(total.line)} {total.lineUnit}</span>
                        </div>
                      )}
                      {total.area > 0 && (
                        <div>
                          <span className="text-slate-500">Area: </span>
                          <span className="font-medium text-slate-900">{formatNumber(total.area)} {total.areaUnit}</span>
                        </div>
                      )}
                      {total.volume > 0 && (
                        <div>
                          <span className="text-slate-500">Volume: </span>
                          <span className="font-medium text-slate-900">{formatNumber(total.volume)} {total.volumeUnit}</span>
                        </div>
                      )}
                      {total.count > 0 && (
                        <div>
                          <span className="text-slate-500">Count: </span>
                          <span className="font-medium text-slate-900">{formatNumber(total.count)} ea</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Groups & Measurements List */}
      <div className="flex-1 overflow-auto">
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Groups</div>
            <button
              type="button"
              onClick={onAddGroup}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
            >
              + New Group
            </button>
          </div>

          <div className="space-y-3">
            {groups
              .filter((g) => !g.trade || g.trade !== "__unassigned__")
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((group) => {
                const groupMeasurements = measurements
                  .filter((m) => m.group_id === group.id)
                  .sort((a, b) => (b.meta?.timestamp || 0) - (a.meta?.timestamp || 0));

                return (
                  <div key={group.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div
                      className={`flex items-center gap-2 rounded-t-xl border-b border-slate-200 p-3 ${
                        selectedGroupId === group.id ? "bg-slate-50" : ""
                      }`}
                    >
                      <div className="h-4 w-4 rounded" style={{ backgroundColor: group.color }} />
                      <div className="flex-1 text-sm font-semibold text-slate-900">{group.name}</div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onSelectGroup(selectedGroupId === group.id ? null : group.id)}
                          className="rounded-lg px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                        >
                          {selectedGroupId === group.id ? "Active" : "Select"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteGroup(group.id)}
                          className="rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {groupMeasurements.length > 0 && (
                      <div className="divide-y divide-slate-100">
                        {groupMeasurements.map((m) => {
                          const active = selectedMeasurementId === m.id;
                          return (
                            <div
                              key={m.id}
                              className={`flex items-center gap-2 p-2 hover:bg-slate-50 ${
                                active ? "bg-blue-50" : ""
                              }`}
                            >
                              {active && <Check className="h-3 w-3 flex-shrink-0 text-blue-600" />}
                              <button
                                type="button"
                                onClick={() => onSelectMeasurement(m.id)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <div className="truncate text-xs font-medium text-slate-900">
                                  {m.type.toUpperCase()} • Page {m.page_number}
                                </div>
                                <div className="text-xs text-slate-600">
                                  {getMeasurementBadge(m, calibrationScale !== null)}
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={() => onRemoveMeasurement(m.id)}
                                className="rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                              >
                                Delete
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          {/* Totals Panel */}
          <div className="mt-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-slate-900">Totals</div>
            <div className="space-y-3">
              {totalsByGroup.length === 0 ? (
                <div className="text-sm text-slate-500">
                  Totals will appear here after you start measuring.
                </div>
              ) : (
                totalsByGroup.map((row, index) => (
                  <div key={index} className="rounded-lg bg-white p-3 shadow-sm">
                    {row.group ? (
                      <div className="mb-2 flex items-center gap-2">
                        <div className="h-3 w-3 rounded" style={{ backgroundColor: row.group.color }} />
                        <span className="text-sm font-semibold text-slate-900">{row.group.name}</span>
                      </div>
                    ) : (
                      <div className="mb-2 text-sm font-semibold text-slate-500">Ungrouped</div>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {row.line > 0 && (
                        <div>
                          <span className="text-slate-500">Length: </span>
                          <span className="font-bold text-slate-900">{formatNumber(row.line)} {row.lineUnit}</span>
                        </div>
                      )}
                      {row.area > 0 && (
                        <div>
                          <span className="text-slate-500">Area: </span>
                          <span className="font-bold text-slate-900">{formatNumber(row.area)} {row.areaUnit}</span>
                        </div>
                      )}
                      {row.volume > 0 && (
                        <div>
                          <span className="text-slate-500">Volume: </span>
                          <span className="font-bold text-slate-900">{formatNumber(row.volume)} {row.volumeUnit}</span>
                        </div>
                      )}
                      {row.count > 0 && (
                        <div>
                          <span className="text-slate-500">Count: </span>
                          <span className="font-bold text-slate-900">{formatNumber(row.count)} ea</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Selected Measurement Details */}
          {selectedMeasurement && (
            <div className="mt-4 rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-blue-600">Selected</div>
                <button
                  onClick={() => onSelectMeasurement("")}
                  className="rounded-lg p-1 text-slate-400 hover:bg-blue-100 hover:text-slate-600"
                  title="Deselect"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded"
                    style={{
                      backgroundColor: groups.find((g) => g.id === selectedMeasurement.group_id)?.color ?? "#2563eb",
                    }}
                  />
                  <div className="flex-1 text-sm font-semibold text-slate-900">
                    {groups.find((g) => g.id === selectedMeasurement.group_id)?.name ?? "Measurement"}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-medium">
                    {selectedMeasurement.type.toUpperCase()}
                  </span>
                  <span>•</span>
                  <span>Page {selectedMeasurement.page_number}</span>
                </div>

                <div className="mt-3 rounded-lg bg-white p-3 shadow-sm">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Value</div>
                  <div className="mt-1 text-xl font-bold text-slate-900">
                    {getMeasurementBadge(selectedMeasurement, calibrationScale !== null)}
                  </div>
                </div>

                {/* Dimension Inputs */}
                <div className="mt-3 space-y-2 rounded-lg bg-white p-3 shadow-sm">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Dimensions</div>

                  {selectedMeasurement.type === "line" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="w-16 text-xs text-slate-600">Width:</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={selectedMeasurement.meta?.width ?? ""}
                          onChange={(e) => {
                            const val = e.target.value ? parseFloat(e.target.value) : null;
                            onUpdateDimensions(selectedMeasurement.id, { width: val });
                          }}
                          placeholder="Optional"
                          className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-blue-400"
                        />
                        <span className="text-xs text-slate-500">{calibrationUnit}</span>
                      </div>
                      {selectedMeasurement.meta?.width && (
                        <div className="text-xs text-slate-500">
                          Area: {formatNumber((selectedMeasurement.meta?.raw_length ?? 0) * (calibrationScale ?? 0) * selectedMeasurement.meta.width)}{" "}
                          {calibrationUnit === "ft" ? "sq ft" : calibrationUnit === "m" ? "sq m" : "sq in"}
                        </div>
                      )}
                    </div>
                  )}

                  {(selectedMeasurement.type === "area" || selectedMeasurement.type === "line") && (
                    <div className="flex items-center gap-2">
                      <label className="w-16 text-xs text-slate-600">Depth:</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={selectedMeasurement.meta?.depth ?? ""}
                        onChange={(e) => {
                          const val = e.target.value ? parseFloat(e.target.value) : null;
                          onUpdateDimensions(selectedMeasurement.id, { depth: val });
                        }}
                        placeholder="Optional"
                        className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-blue-400"
                      />
                      <span className="text-xs text-slate-500">{calibrationUnit}</span>
                    </div>
                  )}

                  {selectedMeasurement.type === "count" && (
                    <div className="flex items-center gap-2">
                      <label className="w-16 text-xs text-slate-600">Count:</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={selectedMeasurement.meta?.count ?? 1}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value) : 1;
                          onUpdateDimensions(selectedMeasurement.id, { count: val });
                        }}
                        className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-blue-400"
                      />
                      <span className="text-xs text-slate-500">ea</span>
                    </div>
                  )}

                  {selectedMeasurement.type === "volume" && selectedMeasurement.meta?.depth && (
                    <div className="text-xs text-slate-500">
                      Depth: {selectedMeasurement.meta.depth} {calibrationUnit}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
