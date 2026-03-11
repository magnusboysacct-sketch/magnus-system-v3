import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";

interface ReceivingDocument {
  id: string;
  receiving_no: string;
  received_date: string;
  purchase_order_id: string | null;
}

export default function ReceivingPage() {
  const { currentProjectId } = useProjectContext();
  const [documents, setDocuments] = useState<ReceivingDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentProjectId) return;

    loadReceivingDocuments();
  }, [currentProjectId]);

  async function loadReceivingDocuments() {
    setLoading(true);

    const { data, error } = await supabase
     .from("receiving_records")
     .select("id,receiving_no,received_date,purchase_order_id,supplier_name,delivery_note_no,status")
      .eq("project_id", currentProjectId)
      .order("received_date", { ascending: false });

    if (error) {
      console.error("Failed to load receiving documents", error);
    } else {
      setDocuments(data || []);
    }

    setLoading(false);
  }

  if (!currentProjectId) {
    return (
      <div className="p-6 text-sm text-slate-500">
        Please select a project to view receiving documents.
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Receiving</h1>
          <p className="text-slate-400 mt-1">
            Material deliveries received from suppliers
          </p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-8 text-center">
          <p className="text-slate-400">Loading receiving documents...</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-8 text-center">
          <p className="text-slate-400">No receiving documents found</p>
          <p className="text-xs text-slate-500 mt-2">
            Create receiving from a procurement document
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="rounded-xl border border-slate-800 bg-slate-900/30 p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                 <div className="font-medium text-lg">{doc.receiving_no}</div>

                  <div className="text-xs text-slate-400 mt-1">
                    Received {new Date(doc.received_date).toLocaleDateString()}
                  </div>
                </div>

                <div className="text-xs text-slate-500">
                  ID: {doc.id.substring(0, 8)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}