import { supabase } from "../lib/supabase";

export type BoqStatus = "draft" | "approved";

export type BoqHeaderRow = {
  id: string;
  project_id: string;
  status: BoqStatus;
  version: number;
  created_at?: string;
  updated_at?: string;
};

export type BOQItemRow = {
  id: string;
  pick_type: string;
  pick_category: string;
  pick_item: string;
  pick_variant: string;
  cost_item_id: string | null;
  item_name: string;
  description: string;
  unit_id: string | null;

  // quantity
  qty: number;
  rate: number;

  // takeoff-driven quantity (optional; default manual)
  qty_source?: "manual" | "takeoff_group";
  takeoff_group_id?: string | null;
  takeoff_metric?: "area_ft2" | "volume_ft3" | "volume_yd3" | "volume_m3" | null;
  qty_manual?: number | null;
};

export type Section = {
  id: string;
  masterCategoryId: string | null;
  title: string;
  scope: string;
  items: BOQItemRow[];
};

function numOr(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Load latest BOQ for project (by updated_at then version).
 * Returns null if none exists.
 */
export async function loadLatestBoqForProject(projectId: string) {
  const { data: headers, error: headerErr } = await supabase
    .from("boq_headers")
    .select("id,project_id,status,version,updated_at")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .order("version", { ascending: false })
    .limit(1);

  if (headerErr) throw headerErr;

  const header = Array.isArray(headers) ? (headers[0] as BoqHeaderRow | undefined) : undefined;
  if (!header) return null;

  const { data: secRows, error: secErr } = await supabase
    .from("boq_sections")
    .select("id,boq_id,sort_order,master_category_id,title,scope")
    .eq("boq_id", header.id)
    .order("sort_order", { ascending: true });

  if (secErr) throw secErr;

  const secList = Array.isArray(secRows) ? secRows : [];
  const sectionIds = secList.map((s: any) => s.id).filter(Boolean);

  const itemsBySection = new Map<string, any[]>();
  if (sectionIds.length > 0) {
    const { data: itemRows, error: itemErr } = await supabase
      .from("boq_section_items")
      .select(
        "id,section_id,sort_order,pick_type,pick_category,pick_item,pick_variant,cost_item_id,item_name,description,unit_id,qty,rate,qty_source,takeoff_group_id,takeoff_metric,qty_manual,qty_calculated"
      )
      .in("section_id", sectionIds)
      .order("sort_order", { ascending: true });

    if (itemErr) throw itemErr;

    const list = Array.isArray(itemRows) ? itemRows : [];
    for (const r of list) {
      const sid = String((r as any).section_id ?? "");
      if (!sid) continue;
      if (!itemsBySection.has(sid)) itemsBySection.set(sid, []);
      itemsBySection.get(sid)!.push(r);
    }
  }

  const sections: Section[] = secList.map((s: any) => {
    const sid = String(s.id);
    const itemsRaw = itemsBySection.get(sid) ?? [];
    const items: BOQItemRow[] = itemsRaw.map((r: any) => ({
      id: String(r.id),
      pick_type: String(r.pick_type ?? ""),
      pick_category: String(r.pick_category ?? ""),
      pick_item: String(r.pick_item ?? ""),
      pick_variant: String(r.pick_variant ?? ""),
      cost_item_id: r.cost_item_id ? String(r.cost_item_id) : null,
      item_name: String(r.item_name ?? ""),
      description: String(r.description ?? ""),
      unit_id: r.unit_id ? String(r.unit_id) : null,
      qty: numOr(r.qty, 0),
      rate: numOr(r.rate, 0),

      qty_source: (r as any).qty_source ?? "manual",
      takeoff_group_id: (r as any).takeoff_group_id ? String((r as any).takeoff_group_id) : null,
      takeoff_metric: (r as any).takeoff_metric ?? null,
      qty_manual: (r as any).qty_manual !== null && (r as any).qty_manual !== undefined ? numOr((r as any).qty_manual, 0) : null,
    }));

    return {
      id: sid,
      masterCategoryId: s.master_category_id ? String(s.master_category_id) : null,
      title: String(s.title ?? "New Section"),
      scope: String(s.scope ?? ""),
      items,
    };
  });

  return { header, sections };
}

/**
 * Save BOQ content (creates header if missing).
 * Replaces sections + items (simple & stable).
 */
export async function saveBoq({
  boqId,
  projectId,
  status,
  sections,
}: {
  boqId: string | null;
  projectId: string;
  status: BoqStatus;
  sections: Section[];
}) {
  let headerId = boqId;

  if (!headerId) {
    const { data: ins, error: insErr } = await supabase
      .from("boq_headers")
      .insert([{ project_id: projectId, status, version: 1 }])
      .select("id")
      .single();

    if (insErr) throw insErr;
    headerId = String((ins as any).id);
  } else {
    const { error: upErr } = await supabase.from("boq_headers").update({ status }).eq("id", headerId);
    if (upErr) throw upErr;
  }

  // Replace sections
  const { error: delSecErr } = await supabase.from("boq_sections").delete().eq("boq_id", headerId);
  if (delSecErr) throw delSecErr;

  const sectionPayload = sections.map((s, idx) => ({
    id: s.id,
    boq_id: headerId,
    sort_order: idx,
    master_category_id: s.masterCategoryId,
    title: s.title ?? "New Section",
    scope: s.scope ?? "",
  }));

  const { error: secInsErr } = await supabase.from("boq_sections").insert(sectionPayload);
  if (secInsErr) throw secInsErr;

  // Replace items
  const itemPayload: any[] = [];
  for (const s of sections) {
    for (let i = 0; i < s.items.length; i++) {
      const it = s.items[i];
      itemPayload.push({
        id: it.id,
        section_id: s.id,
        sort_order: i,
        pick_type: it.pick_type ?? "",
        pick_category: it.pick_category ?? "",
        pick_item: it.pick_item ?? "",
        pick_variant: it.pick_variant ?? "",
        cost_item_id: it.cost_item_id,
        item_name: it.item_name ?? "",
        description: it.description ?? "",
        unit_id: it.unit_id,
        qty: numOr(it.qty, 0),
        rate: numOr(it.rate, 0),
      });
    }
  }

  if (itemPayload.length > 0) {
    const { error: itemInsErr } = await supabase.from("boq_section_items").insert(itemPayload);
    if (itemInsErr) throw itemInsErr;
  }

  return headerId;
}






