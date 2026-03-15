import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

interface GroupSummary {
  groupId: string;
  groupName: string;
  color: string;
  totalLength: number;
  totalArea: number;
  totalVolume: number;
  totalCount: number;
  lengthUnit: string;
  areaUnit: string;
  volumeUnit: string;
}

interface ExportToBOQModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  groupSummaries: GroupSummary[];
  sessionId: string;
}

export function ExportToBOQModal({
  isOpen,
  onClose,
  projectId,
  groupSummaries,
  sessionId,
}: ExportToBOQModalProps) {
  const navigate = useNavigate();
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [selectedMetrics, setSelectedMetrics] = useState<Map<string, string>>(new Map());

  if (!isOpen) return null;

  const toggleGroup = (groupId: string) => {
    const newSelected = new Set(selectedGroups);
    if (newSelected.has(groupId)) {
      newSelected.delete(groupId);
      const newMetrics = new Map(selectedMetrics);
      newMetrics.delete(groupId);
      setSelectedMetrics(newMetrics);
    } else {
      newSelected.add(groupId);
    }
    setSelectedGroups(newSelected);
  };

  const setMetric = (groupId: string, metric: string) => {
    const newMetrics = new Map(selectedMetrics);
    newMetrics.set(groupId, metric);
    setSelectedMetrics(newMetrics);
  };

  const getAvailableMetrics = (group: GroupSummary) => {
    const metrics: Array<{ key: string; label: string; value: number; unit: string }> = [];

    if (group.totalLength > 0) {
      metrics.push({
        key: "length",
        label: "Length",
        value: group.totalLength,
        unit: group.lengthUnit,
      });
    }

    if (group.totalArea > 0) {
      metrics.push({
        key: "area",
        label: "Area",
        value: group.totalArea,
        unit: group.areaUnit,
      });
    }

    if (group.totalVolume > 0) {
      metrics.push({
        key: "volume",
        label: "Volume",
        value: group.totalVolume,
        unit: group.volumeUnit,
      });
    }

    if (group.totalCount > 0) {
      metrics.push({
        key: "count",
        label: "Count",
        value: group.totalCount,
        unit: "ea",
      });
    }

    return metrics;
  };

  const handleExport = () => {
    const exports = Array.from(selectedGroups).map((groupId) => {
      const group = groupSummaries.find((g) => g.groupId === groupId);
      const metric = selectedMetrics.get(groupId);
      return { group, metric };
    }).filter((item) => item.group && item.metric);

    if (exports.length === 0) {
      alert("Please select at least one group and metric");
      return;
    }

    const params = new URLSearchParams({
      project_id: projectId,
      takeoff_session: sessionId,
      groups: JSON.stringify(exports.map((e) => ({
        groupId: e.group!.groupId,
        groupName: e.group!.groupName,
        metric: e.metric,
        value: e.metric === "length" ? e.group!.totalLength :
               e.metric === "area" ? e.group!.totalArea :
               e.metric === "volume" ? e.group!.totalVolume :
               e.group!.totalCount,
        unit: e.metric === "length" ? e.group!.lengthUnit :
              e.metric === "area" ? e.group!.areaUnit :
              e.metric === "volume" ? e.group!.volumeUnit : "ea",
      }))),
    });

    navigate(`/projects/${projectId}/boq?${params.toString()}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">Export to BOQ</div>
            <div className="mt-1 text-xs text-slate-600">
              Select takeoff groups and metrics to send to Bill of Quantities
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 hover:bg-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto p-6" style={{ maxHeight: "calc(90vh - 180px)" }}>
          {groupSummaries.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mb-2 text-slate-600">No measurements found</div>
              <div className="text-xs text-slate-500">
                Create measurements grouped by trade or item type first
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {groupSummaries.map((group) => {
                const metrics = getAvailableMetrics(group);
                const isSelected = selectedGroups.has(group.groupId);
                const selectedMetric = selectedMetrics.get(group.groupId);

                return (
                  <div
                    key={group.groupId}
                    className={`rounded-xl border p-4 transition ${
                      isSelected
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleGroup(group.groupId)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <div
                        className="h-4 w-4 rounded"
                        style={{ backgroundColor: group.color }}
                      />
                      <div className="flex-1 font-medium text-slate-900">
                        {group.groupName}
                      </div>
                    </div>

                    {isSelected && metrics.length > 0 && (
                      <div className="ml-7 mt-3 space-y-2 border-t border-slate-200 pt-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Select Metric to Export
                        </div>
                        {metrics.map((metric) => (
                          <label
                            key={metric.key}
                            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                              selectedMetric === metric.key
                                ? "border-blue-500 bg-blue-50"
                                : "border-slate-200 bg-white hover:bg-slate-50"
                            }`}
                          >
                            <input
                              type="radio"
                              name={`metric-${group.groupId}`}
                              value={metric.key}
                              checked={selectedMetric === metric.key}
                              onChange={() => setMetric(group.groupId, metric.key)}
                              className="h-4 w-4"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-slate-900">
                                {metric.label}
                              </div>
                              <div className="text-xs text-slate-600">
                                {metric.value.toFixed(2)} {metric.unit}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}

                    {isSelected && metrics.length === 0 && (
                      <div className="ml-7 mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                        No measurements in this group
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={selectedGroups.size === 0 || selectedMetrics.size === 0}
            className={`rounded-xl px-4 py-2 text-sm font-medium ${
              selectedGroups.size > 0 && selectedMetrics.size > 0
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "cursor-not-allowed bg-slate-200 text-slate-400"
            }`}
          >
            Export to BOQ ({selectedGroups.size})
          </button>
        </div>
      </div>
    </div>
  );
}
