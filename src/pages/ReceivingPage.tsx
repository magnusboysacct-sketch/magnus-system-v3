import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";

interface ReceivingDocument {
  id: string;
  receiving_no: string;
  received_date: string;
  purchase_order_id: string | null;
  supplier_name: string | null;
  delivery_note_no: string | null;
  status: string;
}

interface ReceivingItem {
  id: string;
  purchase_order_item_id: string | null;
  item_name: string;
  description: string | null;
  unit: string | null;
  ordered_qty: number;
  previously_received_qty: number;
  received_qty: number;
  unit_cost: number;
  delivered_cost: number;
  notes: string | null;
}

export default function ReceivingPage() {
  const { currentProjectId } = useProjectContext();
  const navigate = useNavigate();
  const { id: receivingId } = useParams();

  const [documents, setDocuments] = useState<ReceivingDocument[]>([]);
  const [items, setItems] = useState<ReceivingItem[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<ReceivingDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load receiving list
  useEffect(() => {
    if (!currentProjectId) return;
    loadReceivingDocuments();
  }, [currentProjectId]);

  // Load receiving record
  useEffect(() => {
    if (!receivingId) return;
    loadReceivingRecord();
    loadReceivingItems();
  }, [receivingId]);

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

  async function loadReceivingRecord() {
    if (!receivingId) return;

    const { data, error } = await supabase
      .from("receiving_records")
      .select("id,receiving_no,received_date,purchase_order_id,supplier_name,delivery_note_no,status")
      .eq("id", receivingId)
      .single();

    if (error) {
      console.error("Failed to load receiving record", error);
      setSelectedDocument(null);
    } else {
      setSelectedDocument(data);
    }
  }

  async function loadReceivingItems() {
    if (!receivingId) return;

    const { data, error } = await supabase
      .from("receiving_record_items")
      .select(`
        id,
        purchase_order_item_id,
        item_name,
        description,
        unit,
        ordered_qty,
        previously_received_qty,
        received_qty,
        unit_cost,
        delivered_cost,
        notes
      `)
      .eq("receiving_record_id", receivingId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to load receiving items", error);
      setItems([]);
    } else {
      setItems(data || []);
    }
  }

  if (!currentProjectId) {
    return (
      <div className="p-6 text-sm text-slate-500">
        Please select a project to view receiving documents.
      </div>
    );
  }

  // Receiving editor mode
  if (receivingId) {
    return (
      <div className="p-6">
       <div className="flex items-start justify-between gap-4 mb-6">
  <div>
    <h1 className="text-2xl font-semibold">Receiving Editor</h1>
    <p className="text-slate-400 mt-1">
      Update received quantities and track delivery details.
    </p>
  </div>

  <div className="flex items-center gap-2">
    <button
      onClick={() => navigate("/receiving")}
      className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm"
    >
      Back to Receiving
    </button>

   <button
  onClick={() => {
    console.log("Save receiving changes");
  }}
  disabled={saving}
  className="px-3 py-2 rounded-xl bg-slate-200 text-slate-900 hover:bg-white text-sm font-medium disabled:opacity-60"
>
  {saving ? "Saving..." : "Save Changes"}
</button>
  </div>
</div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6">
          {!selectedDocument ? (
            <div className="text-sm text-slate-400">Loading receiving record...</div>
          ) : (
            <div className="space-y-2">
              <div className="text-lg font-medium text-white">
                {selectedDocument.receiving_no}
              </div>

              <div className="text-sm text-slate-400">
                Supplier: {selectedDocument.supplier_name || "Unknown"}
              </div>

              <div className="text-sm text-slate-400">
                Received Date:{" "}
                {new Date(selectedDocument.received_date).toLocaleDateString()}
              </div>

              <div className="text-sm text-slate-400">
                Delivery Note: {selectedDocument.delivery_note_no || "—"}
              </div>

              <div className="text-sm text-slate-400">
                Status: {selectedDocument.status}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/30 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">Received Items</h2>
            <div className="text-xs text-slate-500">{items.length} item(s)</div>
          </div>

          {items.length === 0 ? (
            <div className="text-sm text-slate-400">No receiving items found.</div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium text-white">{item.item_name}</div>

                      {item.description && (
                        <div className="text-xs text-slate-500 mt-1">
                          {item.description}
                        </div>
                      )}

                      <div className="text-xs text-slate-400 mt-2">
                        Unit: {item.unit || "—"}
                      </div>
                    </div>

                    <div className="text-right text-xs text-slate-400 space-y-1">
                      <div>Ordered: {item.ordered_qty}</div>
                      <div>Previously Received: {item.previously_received_qty}</div>
                     <div className="flex items-center justify-end gap-2">
  <span>This Delivery:</span>

  <input
    type="number"
    value={item.received_qty}
    onChange={(e) => {
      const newQty = Number(e.target.value);

      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, received_qty: newQty }
            : i
        )
      );
    }}
    className="w-20 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-right"
  />
</div>
                      <div>Unit Cost: {item.unit_cost}</div>
                    <div>
  Delivered Cost: {(Number(item.received_qty || 0) * Number(item.unit_cost || 0)).toFixed(2)}
</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Receiving list
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
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              onClick={() => navigate(`/receiving/${doc.id}`)}
              className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 cursor-pointer hover:bg-slate-900/50 transition"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-lg">{doc.receiving_no}</div>

                  <div className="text-xs text-slate-400 mt-1">
                    Supplier: {doc.supplier_name || "Unknown"}
                  </div>

                  <div className="text-xs text-slate-400">
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