// src/pages/secretary/WorkerAdminSection.tsx
import React, { useEffect, useMemo, useState } from "react";
import { UserCheck, AlertTriangle, Search, Plus, Pencil, Trash2, FileText } from "lucide-react";
import { Card, CardHeader, Btn, Badge, Table, Th, Tr, Td, Modal, Field, Input, Textarea, Alert, Spinner, Empty } from "../../components/ui";
import { supabase } from "../../lib/supabase";

// Real, confirmed workers columns only — same discipline as
// CorrespondenceSection.tsx. id_expiry_date is specifically ID CARD
// expiry (20260723000001_add_workers_id_expiry_date.sql), not a general
// certifications concept — that's exactly the gap worker_certifications
// (this section's new table) fills. Both are tracked here side by side,
// not one replacing the other.
type Worker = {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  id_expiry_date: string | null;
  status: string;
};

type Certification = {
  id: string;
  worker_id: string;
  certification_type: string;
  certification_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
};

type ExpiringItem = {
  workerId: string;
  workerName: string;
  item: string;
  expires: string;
  daysLeft: number;
};

function fullName(w: Worker) {
  return [w.first_name, w.last_name].filter(Boolean).join(" ");
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-JM", { year: "numeric", month: "long", day: "numeric" });
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - new Date(new Date().toDateString()).getTime();
  return Math.round(ms / 86400000);
}

function expiryColor(daysLeft: number): "red" | "amber" | "slate" {
  if (daysLeft <= 14) return "red";
  if (daysLeft <= 30) return "amber";
  return "slate";
}

export default function WorkerAdminSection({
  onQuickCreateEmploymentLetter,
}: {
  onQuickCreateEmploymentLetter: (workerId: string) => void;
}) {
  const [companyId, setCompanyId] = useState<string>("");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [workerSearch, setWorkerSearch] = useState("");
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>("");

  // Add/Edit certification modal state — editingCertId null means creating
  // new (insert on save); set means editing that row (update, no duplicate).
  const [certModalOpen, setCertModalOpen] = useState(false);
  const [editingCertId, setEditingCertId] = useState<string | null>(null);
  const [certType, setCertType] = useState("");
  const [certNumber, setCertNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [certNotes, setCertNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  useEffect(() => { init(); }, []);

  async function init() {
    setLoading(true);
    setLoadErr("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadErr("Not signed in."); setLoading(false); return; }

      const { data: profile, error: profileErr } = await supabase
        .from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
      if (profileErr || !profile?.company_id) { setLoadErr("Could not load company."); setLoading(false); return; }
      setCompanyId(profile.company_id);

      const [{ data: workersData, error: workersErr }, { data: certsData, error: certsErr }] = await Promise.all([
        supabase.from("workers").select("id, first_name, last_name, job_title, id_expiry_date, status")
          .eq("company_id", profile.company_id).order("first_name"),
        supabase.from("worker_certifications")
          .select("id, worker_id, certification_type, certification_number, issue_date, expiry_date, notes, created_at")
          .eq("company_id", profile.company_id).order("expiry_date", { ascending: true, nullsFirst: false }),
      ]);

      if (workersErr) throw workersErr;
      if (certsErr) throw certsErr;
      setWorkers((workersData || []) as Worker[]);
      setCertifications((certsData || []) as Certification[]);
    } catch (e: any) {
      setLoadErr(e.message || "Failed to load worker admin data.");
    }
    setLoading(false);
  }

  const filteredWorkers = useMemo(() => {
    const q = workerSearch.trim().toLowerCase();
    if (!q) return workers;
    return workers.filter(w => fullName(w).toLowerCase().includes(q) || (w.job_title || "").toLowerCase().includes(q));
  }, [workers, workerSearch]);

  const selectedWorker = useMemo(() => workers.find(w => w.id === selectedWorkerId) || null, [workers, selectedWorkerId]);

  const selectedWorkerCerts = useMemo(
    () => certifications.filter(c => c.worker_id === selectedWorkerId),
    [certifications, selectedWorkerId]
  );

  // Simple flat list, sorted soonest-first — combines worker_certifications'
  // expiry_date with workers.id_expiry_date (still a real, separate field;
  // the new table doesn't replace it). 90-day window, including anything
  // already overdue (negative daysLeft) so nothing already-expired silently
  // disappears from view.
  const expiringItems = useMemo<ExpiringItem[]>(() => {
    const items: ExpiringItem[] = [];
    const workerById = new Map(workers.map(w => [w.id, w]));

    for (const c of certifications) {
      if (!c.expiry_date) continue;
      const w = workerById.get(c.worker_id);
      if (!w) continue;
      const daysLeft = daysUntil(c.expiry_date);
      if (daysLeft <= 90) items.push({ workerId: w.id, workerName: fullName(w), item: c.certification_type, expires: c.expiry_date, daysLeft });
    }
    for (const w of workers) {
      if (!w.id_expiry_date) continue;
      const daysLeft = daysUntil(w.id_expiry_date);
      if (daysLeft <= 90) items.push({ workerId: w.id, workerName: fullName(w), item: "ID Card", expires: w.id_expiry_date, daysLeft });
    }
    return items.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [certifications, workers]);

  function openAddCert() {
    setEditingCertId(null);
    setCertType("");
    setCertNumber("");
    setIssueDate("");
    setExpiryDate("");
    setCertNotes("");
    setSaveErr("");
    setCertModalOpen(true);
  }

  function openEditCert(c: Certification) {
    setEditingCertId(c.id);
    setCertType(c.certification_type);
    setCertNumber(c.certification_number || "");
    setIssueDate(c.issue_date || "");
    setExpiryDate(c.expiry_date || "");
    setCertNotes(c.notes || "");
    setSaveErr("");
    setCertModalOpen(true);
  }

  async function saveCert() {
    if (!selectedWorkerId) { setSaveErr("No worker selected."); return; }
    if (!certType.trim()) { setSaveErr("Enter a certification type."); return; }
    setSaving(true);
    setSaveErr("");
    try {
      const payload = {
        certification_type: certType.trim(),
        certification_number: certNumber.trim() || null,
        issue_date: issueDate || null,
        expiry_date: expiryDate || null,
        notes: certNotes.trim() || null,
      };
      if (editingCertId) {
        const { error: updateErr } = await supabase.from("worker_certifications")
          .update(payload).eq("id", editingCertId);
        if (updateErr) throw updateErr;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error: insertErr } = await supabase.from("worker_certifications").insert({
          ...payload,
          company_id: companyId,
          worker_id: selectedWorkerId,
          created_by: user?.id || null,
        });
        if (insertErr) throw insertErr;
      }
      setCertModalOpen(false);
      setEditingCertId(null);
      await init();
    } catch (e: any) {
      setSaveErr(e.message || "Failed to save certification.");
    }
    setSaving(false);
  }

  async function deleteCert(c: Certification) {
    if (!window.confirm(`Delete "${c.certification_type}"? This can't be undone.`)) return;
    setBusyId(c.id);
    setActionErr("");
    const { error: err } = await supabase.from("worker_certifications").delete().eq("id", c.id);
    if (err) setActionErr(err.message || "Failed to delete.");
    else await init();
    setBusyId(null);
  }

  if (loading) {
    return <div className="py-16 flex justify-center"><Spinner /></div>;
  }

  return (
    <div className="space-y-5">
      {loadErr && <Alert type="error">{loadErr}</Alert>}
      {actionErr && <Alert type="error" onClose={() => setActionErr("")}>{actionErr}</Alert>}

      <Card>
        <CardHeader title="Worker Certifications" subtitle="Select a worker to view or manage their certifications" />
        <div className="relative mb-3">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <Input value={workerSearch} onChange={e => setWorkerSearch(e.target.value)} placeholder="Search workers…" className="pl-8" />
        </div>

        {filteredWorkers.length === 0 ? (
          <p className="text-xs text-slate-500">No workers match "{workerSearch}".</p>
        ) : (
          <div className="space-y-1.5 max-h-56 overflow-y-auto mb-4">
            {filteredWorkers.map(w => (
              <button
                key={w.id}
                onClick={() => setSelectedWorkerId(w.id)}
                className={`w-full text-left flex items-center justify-between py-2.5 px-3 rounded-lg border transition-colors ${
                  selectedWorkerId === w.id
                    ? "border-cyan-400 dark:border-cyan-500/40 bg-cyan-500/5"
                    : "border-slate-200 dark:border-white/[0.06] hover:border-slate-300 dark:hover:border-white/[0.13]"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <UserCheck size={14} className="text-cyan-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{fullName(w)}</div>
                    <div className="text-[11px] text-slate-500">{w.job_title || "—"}</div>
                  </div>
                </div>
                <Badge color="slate">{certifications.filter(c => c.worker_id === w.id).length} cert{certifications.filter(c => c.worker_id === w.id).length === 1 ? "" : "s"}</Badge>
              </button>
            ))}
          </div>
        )}

        {!selectedWorker ? (
          <Empty icon={<UserCheck size={22} />} title="No worker selected" body="Pick a worker above to view or manage their certifications." />
        ) : (
          <div className="border-t border-slate-200 dark:border-white/[0.06] pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{fullName(selectedWorker)}</div>
                <div className="text-[11px] text-slate-500">
                  {selectedWorker.job_title || "—"} · ID card expires {formatDate(selectedWorker.id_expiry_date)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Btn variant="secondary" size="xs" icon={<FileText size={12} />} onClick={() => onQuickCreateEmploymentLetter(selectedWorker.id)}>
                  Create Employment Letter
                </Btn>
                <Btn variant="primary" size="xs" icon={<Plus size={12} />} onClick={openAddCert}>Add Certification</Btn>
              </div>
            </div>

            {selectedWorkerCerts.length === 0 ? (
              <Empty icon={<UserCheck size={20} />} title="No certifications on file" body="Add this worker's first certification or license above." />
            ) : (
              <Table minWidth={640}>
                <thead><tr><Th>Type</Th><Th>Number</Th><Th>Issued</Th><Th>Expires</Th><Th right>Actions</Th></tr></thead>
                <tbody>
                  {selectedWorkerCerts.map(c => {
                    const daysLeft = c.expiry_date ? daysUntil(c.expiry_date) : null;
                    return (
                      <Tr key={c.id}>
                        <Td>{c.certification_type}</Td>
                        <Td muted>{c.certification_number || "-"}</Td>
                        <Td muted>{formatDate(c.issue_date)}</Td>
                        <Td>
                          {c.expiry_date ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-600 dark:text-slate-300">{formatDate(c.expiry_date)}</span>
                              {daysLeft !== null && daysLeft <= 90 && (
                                <Badge color={expiryColor(daysLeft)}>{daysLeft < 0 ? "Expired" : `${daysLeft}d`}</Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">No expiry</span>
                          )}
                        </Td>
                        <Td right>
                          <div className="flex items-center justify-end gap-1.5">
                            <Btn variant="secondary" size="xs" icon={<Pencil size={12} />} onClick={() => openEditCert(c)}>Edit</Btn>
                            <Btn variant="secondary" size="xs" icon={<Trash2 size={12} />} disabled={busyId === c.id} onClick={() => deleteCert(c)}>Delete</Btn>
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </div>
        )}
      </Card>

      <Card padding={false}>
        <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.06] flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-400" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Expiring Soon</span>
          <span className="text-[11px] text-slate-500">— certifications and ID cards, next 90 days</span>
        </div>
        {expiringItems.length === 0 ? (
          <Empty icon={<AlertTriangle size={22} />} title="Nothing expiring soon" body="Certifications and ID cards expiring within 90 days will show up here." />
        ) : (
          <Table minWidth={560}>
            <thead><tr><Th>Worker</Th><Th>Item</Th><Th>Expires</Th><Th right>Status</Th></tr></thead>
            <tbody>
              {expiringItems.map((it, i) => (
                <Tr key={i} onClick={() => setSelectedWorkerId(it.workerId)}>
                  <Td>{it.workerName}</Td>
                  <Td muted>{it.item}</Td>
                  <Td muted>{formatDate(it.expires)}</Td>
                  <Td right><Badge color={expiryColor(it.daysLeft)}>{it.daysLeft < 0 ? "Expired" : `${it.daysLeft}d`}</Badge></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={certModalOpen}
        onClose={() => { setCertModalOpen(false); setEditingCertId(null); }}
        title={editingCertId ? "Edit Certification" : "Add Certification"}
        subtitle={selectedWorker ? fullName(selectedWorker) : undefined}
      >
        <div className="space-y-4">
          <Field label="Type" hint={`e.g. "Driver's License", "Forklift Certification", "OSHA Safety Card"`}>
            <Input value={certType} onChange={e => setCertType(e.target.value)} placeholder="Certification or license type" />
          </Field>
          <Field label="Number" hint="Optional">
            <Input value={certNumber} onChange={e => setCertNumber(e.target.value)} placeholder="License/certificate number" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Issue Date" hint="Optional">
              <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
            </Field>
            <Field label="Expiry Date" hint="Optional — leave blank if it doesn't expire">
              <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Notes" hint="Optional">
            <Textarea value={certNotes} onChange={e => setCertNotes(e.target.value)} rows={3} />
          </Field>

          {saveErr && <Alert type="error">{saveErr}</Alert>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Btn variant="secondary" size="sm" onClick={() => { setCertModalOpen(false); setEditingCertId(null); }}>Cancel</Btn>
            <Btn variant="primary" size="sm" disabled={saving} onClick={saveCert}>{saving ? "Saving…" : editingCertId ? "Save Changes" : "Add Certification"}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
