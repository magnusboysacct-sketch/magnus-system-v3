import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

type EstimateHeader = {
  id: string;
  project_id: string;
  title: string;
  status: string;
  version: number;
  created_at: string;
};

export default function EstimatesPage() {
  const [estimates, setEstimates] = useState<EstimateHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  // Load estimates on mount
  useEffect(() => {
    async function loadEstimates() {
      try {
        const { data, error } = await supabase
          .from("estimate_headers")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setEstimates(data || []);
      } catch (err) {
        console.error("Failed to load estimates:", err);
        setError("Failed to load estimates");
      } finally {
        setLoading(false);
      }
    }

    loadEstimates();
  }, []);

  async function handleNewEstimate() {
    try {
      // For now, use first project as temporary placeholder
      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .limit(1);

      if (!projects || projects.length === 0) {
        setError("No projects available");
        return;
      }

      const { error } = await supabase
        .from("estimate_headers")
        .insert({
          project_id: projects[0].id,
          title: "Estimate",
          status: "draft",
          version: 1,
        });

      if (error) throw error;

      // Reload list after insert
      const { data: newData, error: newError } = await supabase
        .from("estimate_headers")
        .select("*")
        .order("created_at", { ascending: false });

      if (newError) throw newError;
      setEstimates(newData || []);
    } catch (err) {
      console.error("Failed to create estimate:", err);
      setError("Failed to create estimate");
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Estimates</h1>
          <p className="text-slate-400 mt-1">Create, manage, and approve estimates.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button 
            onClick={handleNewEstimate}
            className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm"
          >
            New Estimate
          </button>
          <button className="px-3 py-2 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 text-sm">
            Secondary
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        {loading ? (
          <p className="text-sm text-slate-300">Loading estimates...</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : estimates.length === 0 ? (
          <p className="text-sm text-slate-300">No estimates yet</p>
        ) : (
          <div className="space-y-3">
            {estimates.map((estimate) => (
              <Link 
                key={estimate.id}
                to={`/estimates/${estimate.id}`}
                className="block"
              >
                <div 
                  className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 hover:border-slate-600 cursor-pointer transition"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-medium text-slate-200">
                        {estimate.title}
                      </h3>
                      <div className="mt-2 space-y-1 text-sm text-slate-400">
                        <div>Status: <span className="text-slate-300">{estimate.status}</span></div>
                        <div>Version: <span className="text-slate-300">{estimate.version}</span></div>
                        <div>Created: <span className="text-slate-300">{new Date(estimate.created_at).toLocaleDateString()}</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
