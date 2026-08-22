// src/pages/secretary/CorrespondenceSection.tsx
import React from "react";
import { Plus, FileText, Send } from "lucide-react";
import { Card, CardHeader, Btn, Badge, Table, Th, Tr, Td } from "../../components/ui";

const PLACEHOLDER_TEMPLATES = [
  { name: "Job Letter", desc: "Confirms a worker's current role and status for external use (bank, visa, etc.)" },
  { name: "Employment Letter", desc: "Formal offer/confirmation of employment terms" },
  { name: "Reference Letter", desc: "Character/work reference for a current or former worker" },
];

const PLACEHOLDER_LOG = [
  { title: "Job Letter — Marcus Bailey", type: "Job Letter", status: "printed" as const, date: "2026-08-18" },
  { title: "Reference Letter — Andrea Fisher", type: "Reference Letter", status: "approved" as const, date: "2026-08-20" },
  { title: "Employment Letter — Sean Powell", type: "Employment Letter", status: "pending_approval" as const, date: "2026-08-21" },
];

const STATUS_COLOR: Record<string, "green" | "amber" | "slate" | "red" | "cyan"> = {
  draft: "slate", pending_approval: "amber", approved: "cyan", printed: "green", rejected: "red",
};

export default function CorrespondenceSection() {
  return (
    <div className="space-y-5">
      {/* TODO: Stage 2 — wire template list to a real templates source
          (either a small static config per document_type, or a new
          secretary_document_templates table if templates need to be
          editable in-app) and "Create New" to a real secretary_documents
          insert (status: 'draft') + AI-assisted drafting via
          magnusAI.chat(...), same pattern already proven in
          ContractsPage.tsx's aiGenerateScope(). */}
      <Card>
        <div className="flex items-center justify-between">
          <CardHeader title="Letter Templates" subtitle="Start a new letter from a template" />
          <Btn variant="primary" size="sm" icon={<Plus size={13} />}>Create New</Btn>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {PLACEHOLDER_TEMPLATES.map(t => (
            <div key={t.name} className="p-4 rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0c1018]">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-3">
                <FileText size={15} className="text-cyan-400" />
              </div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">{t.name}</div>
              <div className="text-xs text-slate-500">{t.desc}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* TODO: Stage 2 — wire to a real SELECT against secretary_documents
          (company-scoped, ordered by created_at desc), with the History-
          modal-style pattern already built for Rate Library's price
          history if a per-letter audit trail is wanted later. */}
      <Card padding={false}>
        <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.06] flex items-center gap-2">
          <Send size={14} className="text-slate-400" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Sent Letter Log</span>
        </div>
        <Table>
          <thead><tr><Th>Title</Th><Th>Type</Th><Th>Status</Th><Th>Date</Th></tr></thead>
          <tbody>
            {PLACEHOLDER_LOG.map((l, i) => (
              <Tr key={i}>
                <Td>{l.title}</Td>
                <Td muted>{l.type}</Td>
                <Td><Badge color={STATUS_COLOR[l.status]} dot>{l.status.replace("_", " ")}</Badge></Td>
                <Td muted>{l.date}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
