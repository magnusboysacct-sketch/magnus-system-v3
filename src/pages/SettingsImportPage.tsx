// src/pages/SettingsImportPage.tsx
//
// /settings/import — director-only (see App.tsx's RoleGuard on this route).
// Thin page shell: resolves the company_id every insert needs, picks which
// entity type is being imported, fetches cross-entity lookup maps (see
// below) for whichever fields need one, and renders the generic
// ImportWizard. All the actual wizard logic lives in ImportWizard.tsx /
// entityConfigs.ts, not here.
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { PageHeader, Card, Spinner, Select } from "../components/ui";
import { UploadCloud } from "lucide-react";
import ImportWizard from "../components/import/ImportWizard";
import { ENTITY_CONFIGS, LOOKUP_SOURCES } from "../lib/import/entityConfigs";
import type { LookupMaps } from "../lib/import/types";

export default function SettingsImportPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [entityKey, setEntityKey] = useState(ENTITY_CONFIGS[0]?.key || "");
  const [lookups, setLookups] = useState<LookupMaps>({});
  const [loadingLookups, setLoadingLookups] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => { setCompanyId(data?.company_id || null); setLoading(false); });
    });
  }, []);

  const config = ENTITY_CONFIGS.find(c => c.key === entityKey);

  // Rebuilds whichever cross-entity lookup maps the selected entity's fields
  // declare (e.g. Projects' "client" field -> Clients, Expenses' "category"
  // field -> expense_categories) every time the entity changes. Always a
  // fresh, live query via LOOKUP_SOURCES — not every lookup target is
  // itself a directly-importable entity (expense_categories isn't), so
  // this is keyed separately from ENTITY_CONFIGS — so a Projects import
  // can resolve a client that already existed before any wizard session
  // ever ran, not just clients created earlier in this same visit (a
  // stale/session-only map would silently fail to link older clients,
  // which is exactly the kind of gap this whole wizard exists to avoid
  // elsewhere).
  useEffect(() => {
    if (!companyId || !config) { setLookups({}); return; }
    // Driven purely by lookupEntityKey, not also gated on type === "lookup"
    // — a field can need a lookup map loaded (e.g. Field Payments' worker
    // classification check, via validateFieldWithLookups) without buildPayload
    // itself ever consuming a resolved id, since it's type "text" and stores
    // the raw value directly. Every field that DOES need type "lookup" for
    // its own resolution still has lookupEntityKey too, so this is a strict
    // superset of the old condition — no existing entity's loaded lookups change.
    const neededKeys = Array.from(new Set([
      ...config.fields.filter(f => f.lookupEntityKey).map(f => f.lookupEntityKey!),
      // A field's own lookupEntityKey covers what IT resolves against, but
      // a validateFieldWithLookups check on that same field can need a
      // completely different map (e.g. Bills' supplier_id resolves against
      // suppliers for its own FK, but also needs workers loaded purely to
      // check whether the vendor is actually a subcontractor) — see
      // EntityImportConfig.additionalLookupSources in types.ts.
      ...(config.additionalLookupSources || []),
    ]));
    if (neededKeys.length === 0) { setLookups({}); return; }
    let alive = true;
    setLoadingLookups(true);
    Promise.all(neededKeys.map(async (key): Promise<[string, Map<string, { id: string; label: string }>]> => {
      const source = LOOKUP_SOURCES[key];
      if (!source) return [key, new Map()];
      const records = await source.fetchExisting(companyId);
      // Indexed by EVERY candidate key a record offers (e.g. a supplier's
      // email AND supplier_name AND contact_name), not just its primary
      // label — additive vs. the old label-only indexing: every existing
      // record's label was already one of its own keys, so nothing that
      // resolved before stops resolving; some values that previously
      // failed to resolve (e.g. a contact person's name instead of the
      // business name) now correctly do.
      const map = new Map<string, { id: string; label: string }>();
      for (const r of records) {
        for (const k of r.keys) {
          if (k && !map.has(k)) map.set(k, { id: r.id, label: r.label });
        }
      }
      return [key, map];
    })).then(entries => {
      if (!alive) return;
      setLookups(Object.fromEntries(entries));
      setLoadingLookups(false);
    }).catch(() => { if (alive) setLoadingLookups(false); });
    return () => { alive = false; };
  }, [companyId, config?.key]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Import Data"
        subtitle="Bring in clients, projects, expenses, invoices, vendors, bills, field payments, vendor payments, customer payments, fund transfers, and your chart of accounts from another system — mapped, deduplicated, and reviewed before anything is saved."
      />

      <div className="p-6 max-w-4xl mx-auto space-y-5">
        {loading ? (
          <Card>
            <div className="flex items-center justify-center gap-2.5 py-10 text-xs text-slate-500 dark:text-slate-600">
              <Spinner size={16} /> Loading...
            </div>
          </Card>
        ) : !companyId ? (
          <Card>
            <div className="text-center py-10 text-sm text-slate-500 dark:text-slate-600">
              Couldn't determine your company. Please contact support.
            </div>
          </Card>
        ) : (
          <>
            {ENTITY_CONFIGS.length > 1 && (
              <Card>
                <div className="flex items-center gap-3">
                  <UploadCloud size={16} className="text-cyan-500 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">What are you importing?</div>
                  </div>
                  <Select className="w-48" value={entityKey} onChange={e => setEntityKey(e.target.value)}>
                    {ENTITY_CONFIGS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </Select>
                </div>
              </Card>
            )}

            {loadingLookups ? (
              <Card>
                <div className="flex items-center justify-center gap-2.5 py-10 text-xs text-slate-500 dark:text-slate-600">
                  <Spinner size={16} /> Loading {config?.fields.find(f => f.lookupEntityKey)?.lookupEntityKey || "linked"} records to match against...
                </div>
              </Card>
            ) : config ? (
              <ImportWizard key={config.key} config={config} companyId={companyId} lookups={lookups} />
            ) : (
              <Card>
                <div className="text-center py-10 text-sm text-slate-500 dark:text-slate-600">No importable entity types are configured yet.</div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
