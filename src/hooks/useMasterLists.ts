import { useCallback, useEffect, useState } from "react";
import {
  fetchActiveMasterCategories,
  fetchActiveMasterUnits,
} from "../lib/masterLists";
import type { MasterCategory, MasterUnit } from "../lib/masterLists";

function normalizeCategories(rows: any[]): MasterCategory[] {
  return (rows || []).map((r) => ({
    id: r.id,
    name: r.name ?? "",
    scope_of_work: r.scope_of_work ?? null,
    is_active: typeof r.is_active === "boolean" ? r.is_active : true,
    sort_order: Number.isFinite(Number(r.sort_order)) ? Number(r.sort_order) : 0,
  }));
}

function normalizeUnits(rows: any[]): MasterUnit[] {
  return (rows || []).map((r) => ({
    id: r.id,
    name: r.name ?? "",
    unit_type: r.unit_type ?? null, // ✅ REQUIRED by MasterUnit
    is_active: typeof r.is_active === "boolean" ? r.is_active : true,
    sort_order: Number.isFinite(Number(r.sort_order)) ? Number(r.sort_order) : 0,
  }));
}

export function useMasterLists() {
  const [categories, setCategories] = useState<MasterCategory[]>([]);
  const [units, setUnits] = useState<MasterUnit[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [categoriesData, unitsData] = await Promise.all([
        fetchActiveMasterCategories(),
        fetchActiveMasterUnits(),
      ]);

      setCategories(
        normalizeCategories(Array.isArray(categoriesData) ? categoriesData : [])
      );
      setUnits(normalizeUnits(Array.isArray(unitsData) ? unitsData : []));
    } catch (err) {
      console.error("Master list load failed:", err);
      setError("Failed to load master lists");
      setCategories([]);
      setUnits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { categories, units, loading, error, refresh };
}