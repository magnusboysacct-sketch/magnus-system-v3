import React, { useState } from "react";
import { usePanZoom } from "../hooks/usePanZoom";
import { useMeasurements } from "../hooks/useMeasurements";
import { MeasurementLayer } from "./MeasurementLayer";
import type { TakeoffTool } from "../types/takeoff.types";

export function TakeoffDemo() {
  const [activeTool, setActiveTool] = useState<TakeoffTool>("select");
  const [tempPoints, setTempPoints] = useState<{ x: number; y: number }[]>([]);

  const {
    zoom,
    panX,
    panY,
    zoomIn,
    zoomOut,
    resetView,
    screenToWorld,
  } = usePanZoom({
    minZoom: 0.1,
    maxZoom: 10,
    initialZoom: 1,
  });

  const {
    measurements,
    addMeasurement,
    removeMeasurement,
    clearMeasurements,
  } = useMeasurements();

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const screenPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    const worldPoint = screenToWorld(screenPoint);

    if (activeTool === "line") {
      const newPoints = [...tempPoints, worldPoint];
      setTempPoints(newPoints);

      if (newPoints.length >= 2) {
        addMeasurement({
          type: "line",
          points: newPoints,
          pixelsPerUnit: 10,
          unit: "ft",
          label: `Line ${measurements.length + 1}`,
        });
        setTempPoints([]);
      }
    } else if (activeTool === "area") {
      setTempPoints([...tempPoints, worldPoint]);
    } else if (activeTool === "point") {
      addMeasurement({
        type: "point",
        points: [worldPoint],
        pixelsPerUnit: 1,
        unit: "ea",
        label: `Point ${measurements.length + 1}`,
      });
    }
  };

  const finishArea = () => {
    if (tempPoints.length >= 3) {
      addMeasurement({
        type: "area",
        points: tempPoints,
        pixelsPerUnit: 10,
        unit: "ft²",
        label: `Area ${measurements.length + 1}`,
      });
      setTempPoints([]);
    }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      <div className="w-64 border-r border-white/10 p-4 space-y-4">
        <h2 className="text-lg font-semibold">Takeoff Demo</h2>

        <div className="space-y-2">
          <div className="text-xs opacity-70">Tools</div>
          {(["select", "pan", "line", "area", "point"] as TakeoffTool[]).map(
            (tool) => (
              <button
                key={tool}
                onClick={() => setActiveTool(tool)}
                className={`w-full px-3 py-2 text-sm rounded ${
                  activeTool === tool
                    ? "bg-blue-600"
                    : "bg-white/10 hover:bg-white/20"
                }`}
              >
                {tool.charAt(0).toUpperCase() + tool.slice(1)}
              </button>
            )
          )}
        </div>

        <div className="space-y-2">
          <div className="text-xs opacity-70">View</div>
          <button
            onClick={zoomIn}
            className="w-full px-3 py-2 text-sm bg-white/10 hover:bg-white/20 rounded"
          >
            Zoom In
          </button>
          <button
            onClick={zoomOut}
            className="w-full px-3 py-2 text-sm bg-white/10 hover:bg-white/20 rounded"
          >
            Zoom Out
          </button>
          <button
            onClick={resetView}
            className="w-full px-3 py-2 text-sm bg-white/10 hover:bg-white/20 rounded"
          >
            Reset View
          </button>
        </div>

        {activeTool === "area" && tempPoints.length > 0 && (
          <div className="space-y-2">
            <button
              onClick={finishArea}
              className="w-full px-3 py-2 text-sm bg-green-600 hover:bg-green-700 rounded"
            >
              Finish Area ({tempPoints.length} points)
            </button>
            <button
              onClick={() => setTempPoints([])}
              className="w-full px-3 py-2 text-sm bg-red-600 hover:bg-red-700 rounded"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-xs opacity-70">
            Measurements ({measurements.length})
          </div>
          <div className="max-h-[400px] overflow-y-auto space-y-1">
            {measurements.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between bg-white/5 p-2 rounded text-xs"
              >
                <div>
                  <div className="font-medium">{m.label}</div>
                  <div className="opacity-70">
                    {m.result.toFixed(2)} {m.unit}
                  </div>
                </div>
                <button
                  onClick={() => removeMeasurement(m.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {measurements.length > 0 && (
            <button
              onClick={clearMeasurements}
              className="w-full px-3 py-2 text-sm bg-red-600 hover:bg-red-700 rounded"
            >
              Clear All
            </button>
          )}
        </div>

        <div className="text-xs opacity-60 space-y-1">
          <div>Zoom: {zoom.toFixed(2)}x</div>
          <div>Pan: ({panX.toFixed(0)}, {panY.toFixed(0)})</div>
        </div>
      </div>

      <div className="flex-1 relative bg-gray-800" onClick={handleCanvasClick}>
        <MeasurementLayer
          measurements={measurements}
          scale={zoom}
          offsetX={panX}
          offsetY={panY}
          width={window.innerWidth - 256}
          height={window.innerHeight}
        />

        {tempPoints.length > 0 && (
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{ width: "100%", height: "100%" }}
          >
            {tempPoints.map((point, i) => {
              const screenX = point.x * zoom + panX;
              const screenY = point.y * zoom + panY;
              return (
                <circle
                  key={i}
                  cx={screenX}
                  cy={screenY}
                  r={4}
                  fill="#f59e0b"
                />
              );
            })}
            {tempPoints.length > 1 && activeTool === "area" && (
              <polyline
                points={tempPoints
                  .map((p) => `${p.x * zoom + panX},${p.y * zoom + panY}`)
                  .join(" ")}
                stroke="#f59e0b"
                fill="none"
                strokeWidth={2}
              />
            )}
          </svg>
        )}

        <div className="absolute top-4 right-4 bg-black/50 p-3 rounded text-xs">
          Active Tool: <strong>{activeTool}</strong>
        </div>
      </div>
    </div>
  );
}
