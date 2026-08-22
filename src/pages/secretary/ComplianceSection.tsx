// src/pages/secretary/ComplianceSection.tsx
import React from "react";
import { ShieldAlert, FolderOpen } from "lucide-react";
import { Card, CardHeader, Badge, Table, Th, Tr, Td, Empty } from "../../components/ui";

const PLACEHOLDER_COMPLIANCE = [
  { doc: "Business License", authority: "Companies Office of Jamaica", expires: "2026-12-01", daysLeft: 101 },
  { doc: "General Liability Insurance", authority: "GK General Insurance", expires: "2026-09-30", daysLeft: 39 },
  { doc: "Building Permit — Riverside Villas", authority: "NEPA", expires: "2027-02-15", daysLeft: 177 },
];

// TODO: Stage 2 — a real document filing list needs its own table (no
// existing table covers this — confirmed by checking, not assumed) plus
// the company-scoped storage bucket named in this handoff
// (company-documents), separate from the existing project-scoped
// project-files bucket. Neither is built yet; Stage 1 is layout only.
const PLACEHOLDER_FILES = [
  { name: "Certificate of Incorporation.pdf", category: "Legal", uploaded: "2026-01-14" },
  { name: "GCT Registration.pdf", category: "Tax", uploaded: "2026-02-02" },
];

export default function ComplianceSection() {
  return (
    <div className="space-y-5">
      {/* TODO: Stage 2 — needs a new table (e.g. company_compliance_docs:
          id, company_id, doc_name, issuing_authority, expiry_date,
          storage_path, status) — nothing today tracks company-level
          (as opposed to project- or worker-level) compliance expiry
          dates. Urgency coloring mirrors the same pattern used
          throughout this app (e.g. Director Dashboard's remittance
          alerts). */}
      <Card padding={false}>
        <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.06] flex items-center gap-2">
          <ShieldAlert size={14} className="text-amber-400" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Licenses, Insurance & Permits</span>
        </div>
        <Table>
          <thead><tr><Th>Document</Th><Th>Authority</Th><Th>Expires</Th><Th right>Days Left</Th></tr></thead>
          <tbody>
            {PLACEHOLDER_COMPLIANCE.map((c, i) => (
              <Tr key={i}>
                <Td>{c.doc}</Td>
                <Td muted>{c.authority}</Td>
                <Td muted>{c.expires}</Td>
                <Td right><Badge color={c.daysLeft <= 30 ? "red" : c.daysLeft <= 60 ? "amber" : "slate"}>{c.daysLeft}d</Badge></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Document Filing" subtitle="Company documents on record" />
        {PLACEHOLDER_FILES.length === 0 ? (
          <Empty icon={<FolderOpen size={18} />} title="No documents filed yet" />
        ) : (
          <div className="space-y-2">
            {PLACEHOLDER_FILES.map((f, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-lg border border-slate-200 dark:border-white/[0.06]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FolderOpen size={14} className="text-slate-400 flex-shrink-0" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{f.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] text-slate-500">{f.category}</span>
                  <span className="text-[11px] text-slate-400">{f.uploaded}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
