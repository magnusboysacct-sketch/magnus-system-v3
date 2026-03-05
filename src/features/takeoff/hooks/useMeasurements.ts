import { useState, useCallback } from "react";
import type { Measurement, MeasurementType, Point } from "../types/takeoff.types";
import {
  calculateLineLength,
  calculateArea,
  calculateCount,
} from "../utils/measurements";

function calculateAreaInPixels(points: Point[]): number {
  if (points.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area / 2);
}

export type AddMeasurementParams = {
  type: MeasurementType;
  points: Point[];
  pixelsPerUnit: number;
  unit: string;
  label?: string;
  groupId?: string;
  color?: string;
  meta?: {
    depthInches?: number;
    volumeM3?: number;
    [key: string]: any;
  };
};

export function useMeasurements() {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);

  const addMeasurement = useCallback(
    (params: AddMeasurementParams): Measurement => {
      const { type, points, pixelsPerUnit, unit, label, groupId, color, meta } = params;

      let result = 0;

      switch (type) {
        case "line":
          result = calculateLineLength(points, pixelsPerUnit);
          break;
        case "area":
          result = calculateArea(points, pixelsPerUnit);
          break;
        case "count":
          result = calculateCount(points);
          break;
        case "point":
          result = 1;
          break;
        case "volume":
          if (meta?.depthInches) {
            const areaPixels = calculateAreaInPixels(points);
            const areaFt2 = areaPixels / (pixelsPerUnit * pixelsPerUnit);
            const depthFt = meta.depthInches / 12;
            const volumeFt3 = areaFt2 * depthFt;
            result = volumeFt3 / 27;
          }
          break;
        default:
          result = 0;
      }

      const newMeasurement: Measurement = {
        id: crypto.randomUUID(),
        type,
        points,
        result,
        unit,
        label,
        groupId,
        color: color || "#3b82f6",
        timestamp: Date.now(),
        meta,
        pixelsPerUnit,
      };

      setMeasurements((prev) => [...prev, newMeasurement]);
      return newMeasurement;
    },
    []
  );

  const removeMeasurement = useCallback((id: string) => {
    setMeasurements((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const updateMeasurement = useCallback(
    (id: string, updates: Partial<Measurement>) => {
      setMeasurements((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
      );
    },
    []
  );

  const clearMeasurements = useCallback(() => {
    setMeasurements([]);
  }, []);

  const getMeasurementById = useCallback(
    (id: string): Measurement | undefined => {
      return measurements.find((m) => m.id === id);
    },
    [measurements]
  );

  const getMeasurementsByGroup = useCallback(
    (groupId: string): Measurement[] => {
      return measurements.filter((m) => m.groupId === groupId);
    },
    [measurements]
  );

  const getMeasurementsByType = useCallback(
    (type: MeasurementType): Measurement[] => {
      return measurements.filter((m) => m.type === type);
    },
    [measurements]
  );

  const reorderMeasurements = useCallback((newOrder: Measurement[]) => {
    setMeasurements(newOrder);
  }, []);

  const duplicateMeasurement = useCallback((id: string) => {
    setMeasurements((prev) => {
      const original = prev.find((m) => m.id === id);
      if (!original) return prev;

      const duplicate: Measurement = {
        ...original,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        label: original.label ? `${original.label} (copy)` : undefined,
      };

      return [...prev, duplicate];
    });
  }, []);

  const getTotalCount = useCallback(() => {
    return measurements.length;
  }, [measurements]);

  const getTotalByType = useCallback(
    (type: MeasurementType): number => {
      return measurements
        .filter((m) => m.type === type)
        .reduce((sum, m) => sum + m.result, 0);
    },
    [measurements]
  );

  const setAllMeasurements = useCallback((newMeasurements: Measurement[]) => {
    setMeasurements(newMeasurements);
  }, []);

  return {
    measurements,
    addMeasurement,
    removeMeasurement,
    updateMeasurement,
    clearMeasurements,
    getMeasurementById,
    getMeasurementsByGroup,
    getMeasurementsByType,
    reorderMeasurements,
    duplicateMeasurement,
    getTotalCount,
    getTotalByType,
    setAllMeasurements,
  };
}
