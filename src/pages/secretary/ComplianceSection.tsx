// src/pages/secretary/ComplianceSection.tsx
import React, { useEffect, useMemo, useState } from "react";
import { ShieldAlert, FolderOpen, Plus, Pencil, Trash2, Download, Upload } from "lucide-react";
import { Card, CardHeader, Btn, Badge, Table, Th, Tr, Td, Modal, Field, Input, Textarea, Alert, Spinner, Empty } from "../../components/ui";
import { supabase } from "../../lib/supabase";

// file_url stores the STORAGE PATH within the company-documents bucket
// (e.g. "<company_id>/<timestamp>_<filename>"), not a public URL — same
// naming convention documents.ts's uploadProjectFile() already uses for
// project_documents.file_url. The bucket is private, so retrieval goes
// through storage.download(), matching documents.ts's downloadProjectFile.
type CompanyDocument = {
  id: string;
  document_category: string;
  title: string;
  document_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  file_url: string | null;
  notes: string | null;
  created_at: string;
};

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

function fileNameFromPath(path: string) {
  const last = path.split("/").pop() || path;
  // Strip the "<timestamp>_" prefix uploadFile() adds, so the download
  // filename/display name matches what was actually uploaded.
  return last.replace(/^\d+_/, "");
}

export default function ComplianceSection() {
  const [companyId, setCompanyId] = useState<string>("");
  const [docs, setDocs] = useState<CompanyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Add/Edit modal state — editingId null means creating new (insert on
  // save); set means editing that row (update, no duplicate).
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [existingFileUrl, setExistingFileUrl] = useState<string | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);
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

      const { data, error: docsErr } = await supabase
        .from("company_documents")
        .select("id, document_category, title, document_number, issue_date, expiry_date, file_url, notes, created_at")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false });
      if (docsErr) throw docsErr;
      setDocs((data || []) as CompanyDocument[]);
    } catch (e: any) {
      setLoadErr(e.message || "Failed to load company documents.");
    }
    setLoading(false);
  }

  // Same 90-day-window, sorted-soonest-first, red/amber/slate pattern
  // proven in Worker Admin's Expiring Soon view — no second source to
  // merge here (no company-level analog to workers.id_expiry_date), so
  // this is just company_documents.expiry_date on its own.
  const expiringDocs = useMemo(() => {
    return docs
      .filter(d => d.expiry_date)
      .map(d => ({ doc: d, daysLeft: daysUntil(d.expiry_date!) }))
      .filter(x => x.daysLeft <= 90)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [docs]);

  function openAdd() {
    setEditingId(null);
    setCategory("");
    setTitle("");
    setDocNumber("");
    setIssueDate("");
    setExpiryDate("");
    setNotes("");
    setExistingFileUrl(null);
    setNewFile(null);
    setSaveErr("");
    setModalOpen(true);
  }

  function openEdit(d: CompanyDocument) {
    setEditingId(d.id);
    setCategory(d.document_category);
    setTitle(d.title);
    setDocNumber(d.document_number || "");
    setIssueDate(d.issue_date || "");
    setExpiryDate(d.expiry_date || "");
    setNotes(d.notes || "");
    setExistingFileUrl(d.file_url);
    setNewFile(null);
    setSaveErr("");
    setModalOpen(true);
  }

  async function uploadFile(file: File): Promise<string> {
    const path = `${companyId}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("company-documents").upload(path, file);
    if (error) throw error;
    return path;
  }

  async function saveDoc() {
    if (!category.trim()) { setSaveErr("Enter a category."); return; }
    if (!title.trim()) { setSaveErr("Enter a title."); return; }
    setSaving(true);
    setSaveErr("");
    try {
      let fileUrl = existingFileUrl;
      if (newFile) {
        fileUrl = await uploadFile(newFile);
      }
      const payload = {
        document_category: category.trim(),
        title: title.trim(),
        document_number: docNumber.trim() || null,
        issue_date: issueDate || null,
        expiry_date: expiryDate || null,
        file_url: fileUrl,
        notes: notes.trim() || null,
      };
      if (editingId) {
        const { error: updateErr } = await supabase.from("company_documents")
          .update(payload).eq("id", editingId);
        if (updateErr) throw updateErr;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error: insertErr } = await supabase.from("company_documents").insert({
          ...payload,
          company_id: companyId,
          created_by: user?.id || null,
        });
        if (insertErr) throw insertErr;
      }
      setModalOpen(false);
      setEditingId(null);
      await init();
    } catch (e: any) {
      setSaveErr(e.message || "Failed to save document.");
    }
    setSaving(false);
  }

  async function deleteDoc(d: CompanyDocument) {
    if (!window.confirm(`Delete "${d.title}"? This can't be undone.`)) return;
    setBusyId(d.id);
    setActionErr("");
    try {
      if (d.file_url) {
        // Best-effort — same as documents.ts's deleteProjectFile: log a
        // storage failure but still remove the DB row rather than leaving
        // an undeletable record over an orphaned/already-gone file.
        const { error: storageErr } = await supabase.storage.from("company-documents").remove([d.file_url]);
        if (storageErr) console.error("Error deleting file from storage:", storageErr);
      }
      const { error: dbErr } = await supabase.from("company_documents").delete().eq("id", d.id);
      if (dbErr) throw dbErr;
      await init();
    } catch (e: any) {
      setActionErr(e.message || "Failed to delete.");
    }
    setBusyId(null);
  }

  async function downloadDoc(d: CompanyDocument) {
    if (!d.file_url) return;
    setBusyId(d.id);
    setActionErr("");
    try {
      const { data, error: err } = await supabase.storage.from("company-documents").download(d.file_url);
      if (err) throw err;
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileNameFromPath(d.file_url);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setActionErr(e.message || "Failed to download file.");
    }
    setBusyId(null);
  }

  if (loading) {
    return <div className="py-16 flex justify-center"><Spinner /></div>;
  }

  return (
    <div className="space-y-5">
      {loadErr && <Alert type="error">{loadErr}</Alert>}
      {actionErr && <Alert type="error" onClose={() => setActionErr("")}>{actionErr}</Alert>}

      <Card padding={false}>
        <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.06] flex items-center gap-2">
          <ShieldAlert size={14} className="text-amber-400" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Expiring Soon</span>
          <span className="text-[11px] text-slate-500">— next 90 days</span>
        </div>
        {expiringDocs.length === 0 ? (
          <Empty icon={<ShieldAlert size={22} />} title="Nothing expiring soon" body="Documents expiring within 90 days will show up here." />
        ) : (
          <Table minWidth={560}>
            <thead><tr><Th>Document</Th><Th>Category</Th><Th>Expires</Th><Th right>Status</Th></tr></thead>
            <tbody>
              {expiringDocs.map(({ doc: d, daysLeft }) => (
                <Tr key={d.id}>
                  <Td>{d.title}</Td>
                  <Td muted>{d.document_category}</Td>
                  <Td muted>{formatDate(d.expiry_date)}</Td>
                  <Td right><Badge color={expiryColor(daysLeft)}>{daysLeft < 0 ? "Expired" : `${daysLeft}d`}</Badge></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <CardHeader title="Document Filing" subtitle="Company documents on record" />
          <Btn variant="primary" size="sm" icon={<Plus size={13} />} onClick={openAdd}>Add Document</Btn>
        </div>

        {docs.length === 0 ? (
          <Empty icon={<FolderOpen size={18} />} title="No documents filed yet" />
        ) : (
          <Table minWidth={760}>
            <thead><tr><Th>Title</Th><Th>Category</Th><Th>Number</Th><Th>Issued</Th><Th>Expires</Th><Th right>Actions</Th></tr></thead>
            <tbody>
              {docs.map(d => {
                const daysLeft = d.expiry_date ? daysUntil(d.expiry_date) : null;
                return (
                  <Tr key={d.id}>
                    <Td>{d.title}</Td>
                    <Td muted>{d.document_category}</Td>
                    <Td muted>{d.document_number || "-"}</Td>
                    <Td muted>{formatDate(d.issue_date)}</Td>
                    <Td>
                      {d.expiry_date ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-600 dark:text-slate-300">{formatDate(d.expiry_date)}</span>
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
                        {d.file_url && (
                          <Btn variant="secondary" size="xs" icon={<Download size={12} />} disabled={busyId === d.id} onClick={() => downloadDoc(d)}>Download</Btn>
                        )}
                        <Btn variant="secondary" size="xs" icon={<Pencil size={12} />} onClick={() => openEdit(d)}>Edit</Btn>
                        <Btn variant="secondary" size="xs" icon={<Trash2 size={12} />} disabled={busyId === d.id} onClick={() => deleteDoc(d)}>Delete</Btn>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingId(null); }}
        title={editingId ? "Edit Document" : "Add Document"}
        width="max-w-lg"
      >
        <div className="space-y-4">
          <Field label="Category" hint='e.g. "Business License", "Insurance Policy", "Permit"'>
            <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="Document category" />
          </Field>
          <Field label="Title">
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. General Liability Insurance" />
          </Field>
          <Field label="Document / Policy Number" hint="Optional">
            <Input value={docNumber} onChange={e => setDocNumber(e.target.value)} />
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
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </Field>
          <Field label="File" hint={existingFileUrl ? `Current file: ${fileNameFromPath(existingFileUrl)} — choose a new one to replace it` : "Optional — PDF, JPG, PNG, or WEBP, up to 20MB"}>
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-white/15 text-xs text-slate-500 cursor-pointer hover:border-cyan-400 transition-colors">
              <Upload size={13} />
              {newFile ? newFile.name : "Choose file…"}
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={e => setNewFile(e.target.files?.[0] || null)}
              />
            </label>
          </Field>

          {saveErr && <Alert type="error">{saveErr}</Alert>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Btn variant="secondary" size="sm" onClick={() => { setModalOpen(false); setEditingId(null); }}>Cancel</Btn>
            <Btn variant="primary" size="sm" disabled={saving} onClick={saveDoc}>{saving ? "Saving…" : editingId ? "Save Changes" : "Add Document"}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
