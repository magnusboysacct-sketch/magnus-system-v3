import React, { useEffect, useState } from "react";
import { getMeasurementsSummaryByGroup } from "../lib/takeoffDB";

interface ImportTakeoffModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onImport: (groupName: string, metric: string, value: number) => void;
}

export function ImportTakeoffModal({
  isOpen,
  onClose,
  projectId,
  onImport,
}: ImportTakeoffModalProps) {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<
    Array<{
      group_name: string;
      line_ft: number;
      area_ft2: number;
      volume_yd3: number;
      count_ea: number;
    }>
  >([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && projectId) {
      loadMeasurements();
    }
  }, [isOpen, projectId]);

  async function loadMeasurements() {
    setLoading(true);
    try {
      const result = await getMeasurementsSummaryByGroup(projectId);
      if (result.success) {
        setGroups(result.data);
      }
    } catch (e) {
      console.error("Failed to load takeoff measurements:", e);
    } finally {
      setLoading(false);
    }
  }

  function handleImport() {
    if (!selectedGroup || !selectedMetric) {
      alert("Please select a group and metric");
      return;
    }

    const group = groups.find((g) => g.group_name === selectedGroup);
    if (!group) return;

    let value = 0;
    if (selectedMetric === "line_ft") value = group.line_ft;
    else if (selectedMetric === "area_ft2") value = group.area_ft2;
    else if (selectedMetric === "volume_yd3") value = group.volume_yd3;
    else if (selectedMetric === "count_ea") value = group.count_ea;

    onImport(selectedGroup, selectedMetric, value);
    setSelectedGroup(null);
    setSelectedMetric(null);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-950 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <div className="text-lg font-semibold">Import Takeoff Quantities</div>
            <div className="text-xs text-slate-400 mt-1">
              Select a takeoff group and metric to import into this BOQ item
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-2 py-1 rounded-lg hover:bg-slate-800/50"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          {loading ? (
            <div className="text-center py-8 text-slate-400">
              Loading takeoff measurements...
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-slate-400 mb-2">No takeoff measurements found</div>
              <div className="text-xs text-slate-500">
                Create measurements in the Takeoff page first
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Select Takeoff Group
                </label>
                <select
                  value={selectedGroup || ""}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm"
                >
                  <option value="">-- Choose a group --</option>
                  {groups.map((group) => (
                    <option key={group.group_name} value={group.group_name}>
                      {group.group_name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedGroup && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Select Measurement Metric
                  </label>
                  <div className="space-y-2">
                    {groups
                      .find((g) => g.group_name === selectedGroup)
                      && (() => {
                        const group = groups.find((g) => g.group_name === selectedGroup)!;
                        return (
                          <>
                            {group.line_ft > 0 && (
                              <label className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-slate-800 hover:bg-slate-900 cursor-pointer">
                                <input
                                  type="radio"
                                  name="metric"
                                  value="line_ft"
                                  checked={selectedMetric === "line_ft"}
                                  onChange={(e) => setSelectedMetric(e.target.value)}
                                />
                                <div className="flex-1">
                                  <div className="text-sm font-medium">Linear (ft)</div>
                                  <div className="text-xs text-slate-400">
                                    {group.line_ft.toFixed(2)} ft
                                  </div>
                                </div>
                              </label>
                            )}
                            {group.area_ft2 > 0 && (
                              <label className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-slate-800 hover:bg-slate-900 cursor-pointer">
                                <input
                                  type="radio"
                                  name="metric"
                                  value="area_ft2"
                                  checked={selectedMetric === "area_ft2"}
                                  onChange={(e) => setSelectedMetric(e.target.value)}
                                />
                                <div className="flex-1">
                                  <div className="text-sm font-medium">Area (ft²)</div>
                                  <div className="text-xs text-slate-400">
                                    {group.area_ft2.toFixed(2)} ft²
                                  </div>
                                </div>
                              </label>
                            )}
                            {group.volume_yd3 > 0 && (
                              <label className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-slate-800 hover:bg-slate-900 cursor-pointer">
                                <input
                                  type="radio"
                                  name="metric"
                                  value="volume_yd3"
                                  checked={selectedMetric === "volume_yd3"}
                                  onChange={(e) => setSelectedMetric(e.target.value)}
                                />
                                <div className="flex-1">
                                  <div className="text-sm font-medium">Volume (yd³)</div>
                                  <div className="text-xs text-slate-400">
                                    {group.volume_yd3.toFixed(2)} yd³
                                  </div>
                                </div>
                              </label>
                            )}
                            {group.count_ea > 0 && (
                              <label className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-slate-800 hover:bg-slate-900 cursor-pointer">
                                <input
                                  type="radio"
                                  name="metric"
                                  value="count_ea"
                                  checked={selectedMetric === "count_ea"}
                                  onChange={(e) => setSelectedMetric(e.target.value)}
                                />
                                <div className="flex-1">
                                  <div className="text-sm font-medium">Count (ea)</div>
                                  <div className="text-xs text-slate-400">
                                    {group.count_ea} ea
                                  </div>
                                </div>
                              </label>
                            )}
                          </>
                        );
                      })()}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={!selectedGroup || !selectedMetric}
                  className={
                    "px-4 py-2 rounded-xl text-sm " +
                    (selectedGroup && selectedMetric
                      ? "bg-emerald-900/50 hover:bg-emerald-900/70 border border-emerald-900/40"
                      : "bg-slate-800/20 text-slate-500 cursor-not-allowed")
                  }
                >
                  Import Quantity
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
