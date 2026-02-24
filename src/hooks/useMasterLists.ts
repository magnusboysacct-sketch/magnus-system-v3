import { useCallback, useEffect, useState } from "react";
import {
  fetchActiveMasterCategories,
  fetchActiveMasterUnits,
} from "../lib/masterLists";
import type { MasterCategory, MasterUnit } from "../lib/masterLists";

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

      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
      setUnits(Array.isArray(unitsData) ? unitsData : []);
    } catch (err: unknown) {
      console.error("Master list load failed:", err);
      setError("Failed to load master lists");
      setCategories([]);
      setUnits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    categories,
    units,
    loading,
    error,
    refresh,
  };
}