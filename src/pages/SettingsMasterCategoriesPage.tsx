import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type MasterCategoryRow = {
  id: string;
  name: string | null;
  is_active: boolean | null;
  scope_of_work: string | null;
};

type RowDraft = {
  name: string;
  is_active: boolean;
  scope_of_work: string;
  dirty: boolean;
  saving: boolean;
  error: string | null;
};

export default function SettingsMasterCategoriesPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [rows, setRows] = useState<MasterCategoryRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [savingAll, setSavingAll] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);

    try {
      const { data, error } = await supabase
        .from("master_categories")
        .select("id, name, is_active, scope_of_work")
        .order("name", { ascending: true });

      if (error) throw error;

      const safe = (data ?? []) as MasterCategoryRow[];
      setRows(safe);

      // initialize drafts (keep existing dirty edits if already present)
      setDrafts((prev) => {
        const next: Record<string, RowDraft> = { ...prev };
        for (const r of safe) {
          if (!next[r.id]) {
            next[r.id] = {
              name: (r.name ?? "").toString(),
              is_active: !!r.is_active,
              scope_of_work: (r.scope_of_work ?? "").toString(),
              dirty: false,
              saving: false,
              error: null,
            };
          }
        }
        return next;
      });
    } catch (e: unknown) {
      console.error("Failed to load master_categories:", e);
      setLoadError(e instanceof Error ? e.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const dirtyIds = useMemo(
    () => Object.entries(drafts).filter(([, d]) => d.dirty).map(([id]) => id),
    [drafts]
  );

  function updateDraft(id: string, patch: Partial<RowDraft>) {
    setDrafts((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      const nextRow: RowDraft = { ...cur, ...patch, dirty: true, error: null };
      return { ...prev, [id]: nextRow };
    });
  }

  async function saveRow(id: string) {
    const d = drafts[id];
    if (!d) return;

    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], saving: true, error: null },
    }));

    try {
      const payload = {
        name: d.name.trim(),
        is_active: d.is_active,
        scope_of_work: d.scope_of_work.trim(),
      };

      const { error } = await supabase
        .from("master_categories")
        .update(payload)
        .eq("id", id);

      if (error) throw error;

      // mark clean + refresh local rows view
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...payload } : r))
      );
      setDrafts((prev) => ({
        ...prev,
        [id]: { ...prev[id], saving: false, dirty: false, error: null },
      }));
    } catch (e: unknown) {
      console.error("Save row failed:", e);
      setDrafts((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          saving: false,
          error: e instanceof Error ? e.message : "Save failed",
        },
      }));
    }
  }

  async function saveAll() {
    if (dirtyIds.length === 0) return;

    setSavingAll(true);
    try {
      // Save sequentially (simple + predictable)
      for (const id of dirtyIds) {
        // eslint-disable-next-line no-await-in-loop
        await saveRow(id);
      }
    } finally {
      setSavingAll(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Master Categories</h1>
          <div className="text-sm text-slate-500">
            Edit category scopes here so nobody has to touch Supabase.
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={load}
            className="px-3 py-2 rounded bg-slate-800 text-white"
            disabled={loading || savingAll}
          >
            Refresh
          </button>

          <button
            onClick={saveAll}
            className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
            disabled={dirtyIds.length === 0 || savingAll || loading}
          >
            {savingAll ? "Saving…" : `Save All (${dirtyIds.length})`}
          </button>
        </div>
      </div>

      {/* Load state */}
      {loading ? (
        <div className="text-sm text-slate-400">Loading categories…</div>
      ) : loadError ? (
        <div className="text-sm text-red-400">Error: {loadError}</div>
      ) : null}

      {/* Table */}
      {!loading && !loadError ? (
        <div className="space-y-3">
          {rows.length === 0 ? (
            <div className="text-sm text-slate-400">No categories found.</div>
          ) : (
            rows.map((r) => {
              const d = drafts[r.id];
              if (!d) return null;

              return (
                <div
                  key={r.id}
                  className="p-4 border border-slate-700 rounded space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="text-sm text-slate-400">Category</div>
                      <input
                        value={d.name}
                        onChange={(e) => updateDraft(r.id, { name: e.target.value })}
                        className="px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white w-[320px]"
                        placeholder="Category name"
                      />
                      <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={d.is_active}
                          onChange={(e) =>
                            updateDraft(r.id, { is_active: e.target.checked })
                          }
                        />
                        Active
                      </label>
                      {d.dirty ? (
                        <span className="text-xs text-yellow-400">Unsaved</span>
                      ) : (
                        <span className="text-xs text-slate-500">Saved</span>
                      )}
                    </div>

                    <button
                      onClick={() => saveRow(r.id)}
                      disabled={!d.dirty || d.saving}
                      className="px-3 py-2 rounded bg-slate-800 text-white disabled:opacity-50"
                    >
                      {d.saving ? "Saving…" : "Save"}
                    </button>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs text-slate-400">Scope of Work</div>
                    <textarea
                      value={d.scope_of_work}
                      onChange={(e) =>
                        updateDraft(r.id, { scope_of_work: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                      rows={4}
                      placeholder="Type the default scope that should auto-fill on BOQ sections…"
                    />
                    {d.error ? (
                      <div className="text-xs text-red-400">{d.error}</div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}