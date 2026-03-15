import { useEffect, useState } from "react";
import { fetchActiveCostCodes, type CostCode } from "../lib/costCodes";

interface Props {
  companyId: string;
  value: string | null | undefined;
  onChange: (costCodeId: string | null) => void;
  required?: boolean;
  className?: string;
  placeholder?: string;
}

export default function CostCodeSelect({
  companyId,
  value,
  onChange,
  required = false,
  className = "",
  placeholder = "Select Cost Code",
}: Props) {
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCostCodes();
  }, [companyId]);

  async function loadCostCodes() {
    try {
      setLoading(true);
      const codes = await fetchActiveCostCodes(companyId);
      setCostCodes(codes);
    } catch (error) {
      console.error("Error loading cost codes:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <select disabled className={className || "w-full px-3 py-2 border border-gray-300 rounded"}>
        <option>Loading...</option>
      </select>
    );
  }

  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value || null)}
      required={required}
      className={className || "w-full px-3 py-2 border border-gray-300 rounded"}
    >
      <option value="">{placeholder}</option>
      {costCodes.map((code) => (
        <option key={code.id} value={code.id}>
          {code.code} - {code.description}
          {code.category ? ` (${code.category})` : ""}
        </option>
      ))}
    </select>
  );
}
