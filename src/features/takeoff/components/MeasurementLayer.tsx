import React, { useRef, useEffect } from "react";
import type { Measurement } from "../types/takeoff.types";
import { centroid } from "../utils/geometry";

type MeasurementLayerProps = {
  measurements: Measurement[];
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  selectedId?: string | null;
  onMeasurementClick?: (id: string) => void;
};

export function MeasurementLayer({
  measurements,
  scale,
  offsetX,
  offsetY,
  width,
  height,
  selectedId,
  onMeasurementClick,
}: MeasurementLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    const countMeasurements = measurements.filter(m => m.type === "count");

    for (const measurement of measurements) {
      const isSelected = selectedId === measurement.id;
      const color = measurement.color || "#3b82f6";

      ctx.strokeStyle = isSelected ? "#f59e0b" : color;
      ctx.fillStyle = isSelected ? "#f59e0b" : color;
      ctx.lineWidth = isSelected ? 3 / scale : 2 / scale;

      if (measurement.type === "line" && measurement.points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(measurement.points[0].x, measurement.points[0].y);
        for (let i = 1; i < measurement.points.length; i++) {
          ctx.lineTo(measurement.points[i].x, measurement.points[i].y);
        }
        ctx.stroke();

        for (const point of measurement.points) {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 4 / scale, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (measurement.type === "area" && measurement.points.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(measurement.points[0].x, measurement.points[0].y);
        for (let i = 1; i < measurement.points.length; i++) {
          ctx.lineTo(measurement.points[i].x, measurement.points[i].y);
        }
        ctx.closePath();

        ctx.globalAlpha = 0.2;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.stroke();

        for (const point of measurement.points) {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 4 / scale, 0, Math.PI * 2);
          ctx.fill();
        }

        const center = centroid(measurement.points);
        const centerX = center.x;
        const centerY = center.y;

        const labelText = `${measurement.result.toFixed(2)} ${measurement.unit}`;
        ctx.font = `${14 / scale}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const textWidth = ctx.measureText(labelText).width;
        const padding = 8 / scale;
        const labelHeight = 24 / scale;

        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(
          centerX - textWidth / 2 - padding,
          centerY - labelHeight / 2,
          textWidth + padding * 2,
          labelHeight
        );

        ctx.strokeStyle = color;
        ctx.lineWidth = 1 / scale;
        ctx.strokeRect(
          centerX - textWidth / 2 - padding,
          centerY - labelHeight / 2,
          textWidth + padding * 2,
          labelHeight
        );

        ctx.fillStyle = "#ffffff";
        ctx.fillText(labelText, centerX, centerY);
      } else if (measurement.type === "point" && measurement.points.length > 0) {
        for (const point of measurement.points) {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 6 / scale, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1 / scale;
          ctx.stroke();
        }
      } else if (measurement.type === "count" && measurement.points.length > 0) {
        const countIndex = countMeasurements.indexOf(measurement);
        const displayNumber = countIndex + 1;

        for (const point of measurement.points) {
          const radius = 10 / scale;

          ctx.beginPath();
          ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2 / scale;
          ctx.stroke();

          ctx.fillStyle = "#ffffff";
          ctx.font = `bold ${14 / scale}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(displayNumber), point.x, point.y);
        }
      }
    }

    ctx.restore();
  }, [measurements, scale, offsetX, offsetY, width, height, selectedId]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onMeasurementClick) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left - offsetX) / scale;
    const clickY = (e.clientY - rect.top - offsetY) / scale;

    for (let i = measurements.length - 1; i >= 0; i--) {
      const m = measurements[i];

      if (m.type === "point" || m.type === "count") {
        for (const point of m.points) {
          const dist = Math.sqrt(
            (clickX - point.x) ** 2 + (clickY - point.y) ** 2
          );
          if (dist < 10 / scale) {
            onMeasurementClick(m.id);
            return;
          }
        }
      } else if (m.type === "line" && m.points.length >= 2) {
        for (let j = 0; j < m.points.length - 1; j++) {
          const p1 = m.points[j];
          const p2 = m.points[j + 1];

          const dist = pointToLineDistance(
            { x: clickX, y: clickY },
            p1,
            p2
          );

          if (dist < 10 / scale) {
            onMeasurementClick(m.id);
            return;
          }
        }
      } else if (m.type === "area" && m.points.length >= 3) {
        if (isPointInPolygon({ x: clickX, y: clickY }, m.points)) {
          onMeasurementClick(m.id);
          return;
        }
      }
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onClick={handleCanvasClick}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: onMeasurementClick ? "auto" : "none",
        cursor: onMeasurementClick ? "pointer" : "default",
      }}
    />
  );
}

function pointToLineDistance(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number }
): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) {
    return Math.sqrt(
      (point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2
    );
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) /
        (length * length)
    )
  );

  const projection = {
    x: lineStart.x + t * dx,
    y: lineStart.y + t * dy,
  };

  return Math.sqrt(
    (point.x - projection.x) ** 2 + (point.y - projection.y) ** 2
  );
}

function isPointInPolygon(
  point: { x: number; y: number },
  polygon: { x: number; y: number }[]
): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}
