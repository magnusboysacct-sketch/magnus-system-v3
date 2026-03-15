import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CostCodeManager from "../components/CostCodeManager";

export default function SettingsCostCodesPage() {
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserCompany();
  }, []);

  async function loadUserCompany() {
    try {
      const { supabase } = await import("../lib/supabase");
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        navigate("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (profile?.company_id) {
        setCompanyId(profile.company_id);
      }
    } catch (error) {
      console.error("Error loading user company:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">No company found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white px-8 py-5">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/settings")}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            ← Back to Settings
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cost Codes</h1>
            <p className="text-sm text-gray-600">Manage job cost codes for expense tracking</p>
          </div>
        </div>
      </div>

      <div className="p-8">
        <CostCodeManager companyId={companyId} />
      </div>
    </div>
  );
}
