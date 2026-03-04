import type { Point, Measurement } from "../types/takeoff.types";
import { distance, polygonArea, rectangleArea } from "./geometry";

export function calculateLineLength(
  points: Point[],
  pixelsPerUnit: number
): number {
  if (points.length < 2 || pixelsPerUnit === 0) return 0;

  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalLength += distance(points[i], points[i + 1]);
  }

  return totalLength / pixelsPerUnit;
}

export function calculateArea(
  points: Point[],
  pixelsPerUnit: number,
  areaUnit: "ft2" | "m2" | "in2" = "ft2"
): number {
  if (points.length < 3 || pixelsPerUnit === 0) return 0;

  const areaInPixels = polygonArea(points);
  const areaInUnits = areaInPixels / (pixelsPerUnit * pixelsPerUnit);

  return areaInUnits;
}

export function calculateRectangleArea(
  p1: Point,
  p2: Point,
  pixelsPerUnit: number
): number {
  if (pixelsPerUnit === 0) return 0;

  const areaInPixels = rectangleArea(p1, p2);
  return areaInPixels / (pixelsPerUnit * pixelsPerUnit);
}

export function calculateVolume(
  areaValue: number,
  depth: number,
  depthUnit: "ft" | "in" | "m" | "cm" = "ft",
  volumeUnit: "ft3" | "m3" | "yd3" = "ft3"
): number {
  let depthInFeet = depth;

  if (depthUnit === "in") {
    depthInFeet = depth / 12;
  } else if (depthUnit === "cm") {
    depthInFeet = depth / 30.48;
  } else if (depthUnit === "m") {
    depthInFeet = depth * 3.28084;
  }

  const volumeInCubicFeet = areaValue * depthInFeet;

  if (volumeUnit === "yd3") {
    return volumeInCubicFeet / 27;
  } else if (volumeUnit === "m3") {
    return volumeInCubicFeet * 0.0283168;
  }

  return volumeInCubicFeet;
}

export function calculateCount(points: Point[]): number {
  return points.length;
}

export function formatMeasurement(value: number, unit: string, decimals = 2): string {
  return `${value.toFixed(decimals)} ${unit}`;
}

export function convertUnits(
  value: number,
  fromUnit: string,
  toUnit: string
): number {
  const conversions: Record<string, Record<string, number>> = {
    ft: { in: 12, m: 0.3048, cm: 30.48 },
    in: { ft: 1 / 12, m: 0.0254, cm: 2.54 },
    m: { ft: 3.28084, in: 39.3701, cm: 100 },
    cm: { ft: 0.0328084, in: 0.393701, m: 0.01 },
    ft2: { in2: 144, m2: 0.092903 },
    in2: { ft2: 1 / 144, m2: 0.00064516 },
    m2: { ft2: 10.7639, in2: 1550 },
    ft3: { in3: 1728, m3: 0.0283168, yd3: 1 / 27 },
    yd3: { ft3: 27, m3: 0.764555 },
    m3: { ft3: 35.3147, yd3: 1.30795 },
  };

  if (fromUnit === toUnit) return value;

  const conversion = conversions[fromUnit]?.[toUnit];
  if (conversion === undefined) return value;

  return value * conversion;
}

export function getMeasurementLabel(measurement: Measurement): string {
  if (measurement.label) return measurement.label;

  const type = measurement.type;
  const result = measurement.result.toFixed(2);
  const unit = measurement.unit;

  switch (type) {
    case "line":
      return `Line: ${result} ${unit}`;
    case "area":
      return `Area: ${result} ${unit}`;
    case "volume":
      return `Volume: ${result} ${unit}`;
    case "count":
      return `Count: ${Math.round(measurement.result)}`;
    case "point":
      return "Point";
    default:
      return `Measurement: ${result} ${unit}`;
  }
}

export function getTotalByType(
  measurements: Measurement[],
  type: string
): number {
  return measurements
    .filter((m) => m.type === type)
    .reduce((sum, m) => sum + m.result, 0);
}

export function getTotalByGroup(
  measurements: Measurement[],
  groupId: string
): number {
  return measurements
    .filter((m) => m.groupId === groupId)
    .reduce((sum, m) => sum + m.result, 0);
}

export function exportMeasurementsToCSV(measurements: Measurement[]): string {
  const headers = ["ID", "Type", "Label", "Result", "Unit", "Group ID", "Timestamp"];
  const rows = measurements.map((m) => [
    m.id,
    m.type,
    m.label || "",
    m.result.toFixed(2),
    m.unit,
    m.groupId || "",
    new Date(m.timestamp).toISOString(),
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
  ].join("\n");

  return csvContent;
}
