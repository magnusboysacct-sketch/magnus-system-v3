import React from "react";
import { Settings } from "lucide-react";

export function TakeoffSettingsTab() {
  return (
    <div className="h-full overflow-auto p-6">
      <div className="mb-6">
        <div className="text-lg font-semibold text-slate-900">Takeoff Settings</div>
        <div className="mt-1 text-sm text-slate-500">Configure your takeoff workspace preferences</div>
      </div>

      <div className="space-y-6">
        {/* Display Settings */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 text-sm font-semibold text-slate-900">Display</div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-700">Show measurement labels</div>
                <div className="text-xs text-slate-500">Display values on measurement shapes</div>
              </div>
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-700">Snap to grid</div>
                <div className="text-xs text-slate-500">Enable grid snapping for precise placement</div>
              </div>
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" />
            </div>
          </div>
        </div>

        {/* Measurement Defaults */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 text-sm font-semibold text-slate-900">Measurement Defaults</div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-slate-700">Default unit system</label>
              <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400">
                <option value="ft">Imperial (ft)</option>
                <option value="m">Metric (m)</option>
                <option value="in">Inches</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-700">Line thickness</label>
              <input
                type="range"
                min="1"
                max="5"
                defaultValue="2"
                className="mt-1 w-full"
              />
            </div>
          </div>
        </div>

        {/* Export Options */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 text-sm font-semibold text-slate-900">Export Options</div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-700">Include raw pixel data</div>
                <div className="text-xs text-slate-500">Export uncalibrated measurements</div>
              </div>
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-700">Group by page</div>
                <div className="text-xs text-slate-500">Organize exports by page number</div>
              </div>
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" defaultChecked />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
        <Settings className="h-4 w-4" />
        <span>Settings are saved automatically</span>
      </div>
    </div>
  );
}
