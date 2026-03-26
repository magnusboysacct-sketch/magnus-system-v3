import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  FolderTree,
  Hash,
  Image as ImageIcon,
  Layers3,
  Link2,
  Loader2,
  Move,
  Package,
  PencilRuler,
  Plus,
  RefreshCcw,
  Ruler,
  Save,
  Search,
  Settings,
  Square,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import { supabase } from "../lib/supabase";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type ToolMode = "pan" | "line" | "area" | "count";
type RightTab = "items" | "assemblies" | "linked" | "rules" | "boq";
type PickerType = "item" | "assembly";
type Point = { x: number; y: number };

type ProjectRow = {
  id: string;
  name: string | null;
};

type SessionRow = {
  id: string;
  company_id?: string | null;
  project_id: string;
  name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type GroupRow = {
  id: string;
  company_id?: string | null;
  session_id: string;
  name: string;
  color?: string | null;
  trade?: string | null;
  is_hidden?: boolean | null;
  sort_order?: number | null;
};

type PageAsset = {
  kind: "pdf" | "image";
  name: string;
  dataUrl: string;
  numPages?: number;
  pageNumber?: number;
};

type PageData = {
  asset?: PageAsset | null;
  drawing?: PageAsset | null;
  imageDataUrl?: string | null;
  linkedSelections?: Record<string, LinkedResource | null>;
  quantityRules?: Record<string, QuantityRule | null>;
  boqSync?: Record<string, any>;
  [key: string]: any;
};

type PageRow = {
  id: string;
  project_id: string;
  drawing_id?: string | null;
  page_number: number;
  calibration_scale?: number | null;
  calibration_unit?: string | null;
  calibration_p1?: Point | null;
  calibration_p2?: Point | null;
  page_data?: PageData | null;
  created_at?: string | null;
  updated_at?: string | null;
  session_id: string;
  page_label?: string | null;
  width?: number | null;
  height?: number | null;
  calibration_point_1?: Point | null;
  calibration_point_2?: Point | null;
  calibration_distance?: number | null;
};

type CategoryRow = {
  id: string;
  name: string;
  code?: string | null;
  sort_order?: number | null;
};

type ItemRow = {
  id: string;
  name: string;
  item_code?: string | null;
  category_id?: string | null;
  description?: string | null;
  base_unit?: string | null;
  unit_type?: string | null;
  default_quantity?: number | null;
  is_active?: boolean | null;
};

type AssemblyRow = {
  id: string;
  name: string;
  assembly_code?: string | null;
  category_id?: string | null;
  description?: string | null;
  output_unit?: string | null;
  unit_type?: string | null;
  waste_percent?: number | null;
  productivity_factor?: number | null;
  is_active?: boolean | null;
};

type LinkedResource = {
  type: PickerType;
  id: string;
  name: string;
  code?: string | null;
  categoryId?: string | null;
  unit?: string | null;
  unitType?: string | null;
};

type QuantityRule = {
  multiplier: number;
  wastePercent: number;
  deductionValue: number;
  formulaNote: string;
};

type MeasurementRow = {
  id: string;
  company_id?: string | null;
  project_id: string;
  session_id: string | null;
  drawing_id?: string | null;
  group_id?: string | null;
  boq_id?: string | null;
  boq_section_id?: string | null;
  boq_item_id?: string | null;
  page_number?: number | null;
  tool_type?: ToolMode | null;
  type?: ToolMode | null;
  name?: string | null;
  description?: string | null;
  points: Point[];
  closed_shape?: boolean | null;
  raw_length?: number | null;
  raw_area?: number | null;
  raw_count?: number | null;
  raw_volume?: number | null;
  display_unit?: string | null;
  scale_x?: number | null;
  scale_y?: number | null;
  multiplier?: number | null;
  waste_percent?: number | null;
  deduction_value?: number | null;
  formula_id?: string | null;
  assembly_id?: string | null;
  cost_item_id?: string | null;
  fill_color?: string | null;
  stroke_color?: string | null;
  line_width?: number | null;
  sort_order?: number | null;
  is_deleted?: boolean | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  unit?: string | null;
  result?: number | null;
  meta?: any;
};

const GROUP_COLORS = [
  "#38bdf8",
  "#34d399",
  "#f59e0b",
  "#fb7185",
  "#a78bfa",
  "#22c55e",
  "#f97316",
  "#14b8a6",
  "#e879f9",
  "#60a5fa",
];

const FRACTIONS = [
  "0",
  "1/16",
  "1/8",
  "3/16",
  "1/4",
  "5/16",
  "3/8",
  "7/16",
  "1/2",
  "9/16",
  "5/8",
  "11/16",
  "3/4",
  "13/16",
  "7/8",
  "15/16",
];

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function parseFraction(input: string) {
  if (!input || input === "0") return 0;
  const [a, b] = input.split("/");
  const n = Number(a);
  const d = Number(b);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return 0;
  return n / d;
}

function feetFromFIS(feet: string, inches: string, fraction: string) {
  return (
    Number(feet || 0) +
    Number(inches || 0) / 12 +
    parseFraction(fraction) / 12
  );
}

function isPoint(value: any): value is Point {
  return !!value && typeof value.x === "number" && typeof value.y === "number";
}

function distancePx(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function polylineLength(points: Point[]) {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distancePx(points[i - 1], points[i]);
  }
  return total;
}

function polygonArea(points: Point[]) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum / 2);
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function getPageAsset(page: PageRow | null): PageAsset | null {
  const pageData = (page?.page_data || {}) as PageData;
  if (pageData.asset?.dataUrl && pageData.asset.kind) return pageData.asset;
  if (pageData.drawing?.dataUrl && pageData.drawing.kind) return pageData.drawing;
  if (typeof pageData.imageDataUrl === "string" && pageData.imageDataUrl) {
    return {
      kind: "image",
      name: page?.page_label || `Page ${page?.page_number || 1}`,
      dataUrl: pageData.imageDataUrl,
    };
  }
  return null;
}

function getPageScale(page: PageRow | null) {
  const p1 = page?.calibration_point_1 || page?.calibration_p1;
  const p2 = page?.calibration_point_2 || page?.calibration_p2;
  const dist = page?.calibration_distance || page?.calibration_scale || 0;
  if (!isPoint(p1) || !isPoint(p2) || !dist) return null;
  const px = distancePx(p1, p2);
  if (!px) return null;
  return dist / px;
}

function getMeasurementUnit(type: ToolMode, page: PageRow | null) {
  const u = page?.calibration_unit || "ft";
  if (type === "line") return u;
  if (type === "area") return `${u}²`;
  if (type === "count") return "ea";
  return "";
}

function getMeasurementName(type: ToolMode, index: number) {
  if (type === "line") return `Linear ${index}`;
  if (type === "area") return `Area ${index}`;
  if (type === "count") return `Count ${index}`;
  return `Measurement ${index}`;
}

function getMeasurementResult(type: ToolMode, points: Point[], page: PageRow | null) {
  const scale = getPageScale(page);
  if (type === "count") {
    return points.length > 0 ? 1 : 0;
  }
  if (type === "line") {
    const raw = polylineLength(points);
    return scale ? raw * scale : raw;
  }
  if (type === "area") {
    const raw = polygonArea(points);
    return scale ? raw * scale * scale : raw;
  }
  return 0;
}

function getRawMetrics(type: ToolMode, points: Point[]) {
  return {
    raw_length: type === "line" ? polylineLength(points) : 0,
    raw_area: type === "area" ? polygonArea(points) : 0,
    raw_count: type === "count" ? 1 : 0,
    raw_volume: 0,
  };
}

function getMeasurementCenter(points: Point[]) {
  if (!points.length) return { x: 0, y: 0 };
  const total = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 }
  );
  return { x: total.x / points.length, y: total.y / points.length };
}

function getDefaultRule(row: MeasurementRow): QuantityRule {
  return {
    multiplier: Number(row.multiplier ?? row.meta?.quantityRule?.multiplier ?? 1) || 1,
    wastePercent:
      Number(row.waste_percent ?? row.meta?.quantityRule?.wastePercent ?? 0) || 0,
    deductionValue:
      Number(row.deduction_value ?? row.meta?.quantityRule?.deductionValue ?? 0) || 0,
    formulaNote: String(row.meta?.quantityRule?.formulaNote || ""),
  };
}

function computeFinalQuantity(row: MeasurementRow) {
  const base = Number(row.result || 0);
  const rule = getDefaultRule(row);
  const withMultiplier = base * rule.multiplier;
  const withWaste = withMultiplier * (1 + rule.wastePercent / 100);
  const finalQty = withWaste - rule.deductionValue;
  return Math.max(0, Number(finalQty.toFixed(4)));
}

function getMeasurementLinkedResource(row: MeasurementRow): LinkedResource | null {
  return (row.meta?.linkedResource || null) as LinkedResource | null;
}

function getMeasurementColor(groupId: string | null | undefined, groups: GroupRow[]) {
  return groups.find((g) => g.id === groupId)?.color || "#38bdf8";
}

function toSvgPoint(
  e: React.MouseEvent<SVGSVGElement, MouseEvent>,
  svgEl: SVGSVGElement,
  zoom: number,
  pan: Point
): Point {
  const rect = svgEl.getBoundingClientRect();
  const x = (e.clientX - rect.left - pan.x) / zoom;
  const y = (e.clientY - rect.top - pan.y) / zoom;
  return { x, y };
}

function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800/80">
        <FolderOpen className="h-5 w-5 text-slate-300" />
      </div>
      <div className="text-sm font-semibold text-slate-100">{title}</div>
      <div className="mt-2 text-sm text-slate-400">{text}</div>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export default function TakeoffPage() {
  const navigate = useNavigate();
  const { projectId = "" } = useParams<{ projectId: string }>();

  const bootstrappedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isMountedRef = useRef(true);
  const panStartRef = useRef<Point | null>(null);

  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");

  const [project, setProject] = useState<ProjectRow | null>(null);
  const [companyId, setCompanyId] = useState<string>("");
  const [session, setSession] = useState<SessionRow | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [pages, setPages] = useState<PageRow[]>([]);
  const [activePageId, setActivePageId] = useState<string>("");

  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string>("");

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [assemblies, setAssemblies] = useState<AssemblyRow[]>([]);
  const [libraryTypeFilter, setLibraryTypeFilter] = useState<PickerType>("item");
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryCategoryId, setLibraryCategoryId] = useState<string>("all");

  const [rightTab, setRightTab] = useState<RightTab>("items");
  const [toolMode, setToolMode] = useState<ToolMode>("pan");
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const [pdfLoading, setPdfLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [showCalibrationModal, setShowCalibrationModal] = useState(false);
  const [calibrationForm, setCalibrationForm] = useState({
    feet: "",
    inches: "",
    fraction: "0",
    unit: "ft",
  });
  const [calibrationDraft, setCalibrationDraft] = useState<{
    p1: Point | null;
    p2: Point | null;
  }>({ p1: null, p2: null });
  const [isPickingCalibration, setIsPickingCalibration] = useState(false);

  const [showPicker, setShowPicker] = useState(false);
  const [pickerType, setPickerType] = useState<PickerType>("item");
  const [pickerCategoryId, setPickerCategoryId] = useState<string>("all");
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerSelectedId, setPickerSelectedId] = useState<string>("");

  const activePage = useMemo(
    () => pages.find((p) => p.id === activePageId) || pages[0] || null,
    [pages, activePageId]
  );

  const activeAsset = useMemo(() => getPageAsset(activePage), [activePage]);

  const activePageMeasurements = useMemo(() => {
    if (!activePage || !session) return [];
    return measurements
      .filter(
        (m) =>
          m.session_id === session.id &&
          Number(m.page_number || 0) === Number(activePage.page_number || 0) &&
          !m.is_deleted
      )
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  }, [activePage, measurements, session]);

  const selectedMeasurement = useMemo(
    () => activePageMeasurements.find((m) => m.id === selectedMeasurementId) || null,
    [activePageMeasurements, selectedMeasurementId]
  );

  const filteredItems = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    return items.filter((row) => {
      const categoryMatch =
        libraryCategoryId === "all" || row.category_id === libraryCategoryId;
      const searchMatch =
        !q ||
        row.name.toLowerCase().includes(q) ||
        String(row.item_code || "").toLowerCase().includes(q) ||
        String(row.description || "").toLowerCase().includes(q);
      return categoryMatch && searchMatch;
    });
  }, [items, libraryCategoryId, librarySearch]);

  const filteredAssemblies = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    return assemblies.filter((row) => {
      const categoryMatch =
        libraryCategoryId === "all" || row.category_id === libraryCategoryId;
      const searchMatch =
        !q ||
        row.name.toLowerCase().includes(q) ||
        String(row.assembly_code || "").toLowerCase().includes(q) ||
        String(row.description || "").toLowerCase().includes(q);
      return categoryMatch && searchMatch;
    });
  }, [assemblies, libraryCategoryId, librarySearch]);

  const pickerFilteredCategories = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        String(c.code || "").toLowerCase().includes(q)
    );
  }, [categories, pickerSearch]);

  const pickerFilteredResources = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    const list = pickerType === "item" ? items : assemblies;
    return list.filter((row: any) => {
      const categoryMatch =
        pickerCategoryId === "all" || row.category_id === pickerCategoryId;
      const code =
        pickerType === "item" ? row.item_code || "" : row.assembly_code || "";
      const searchMatch =
        !q ||
        row.name.toLowerCase().includes(q) ||
        String(code).toLowerCase().includes(q) ||
        String(row.description || "").toLowerCase().includes(q);
      return categoryMatch && searchMatch;
    });
  }, [assemblies, items, pickerCategoryId, pickerSearch, pickerType]);

  const groupedTotals = useMemo(() => {
    const map = new Map<
      string,
      {
        group: GroupRow | null;
        line: number;
        area: number;
        count: number;
        linkedCount: number;
      }
    >();

    activePageMeasurements.forEach((m) => {
      const key = m.group_id || "ungrouped";
      if (!map.has(key)) {
        map.set(key, {
          group: groups.find((g) => g.id === m.group_id) || null,
          line: 0,
          area: 0,
          count: 0,
          linkedCount: 0,
        });
      }
      const row = map.get(key)!;
      const qty = computeFinalQuantity(m);
      const type = (m.tool_type || m.type || "line") as ToolMode;
      if (type === "line") row.line += qty;
      if (type === "area") row.area += qty;
      if (type === "count") row.count += qty;
      if (getMeasurementLinkedResource(m)) row.linkedCount += 1;
    });

    return Array.from(map.values());
  }, [activePageMeasurements, groups]);

  const boqSyncRows = useMemo(() => {
    return activePageMeasurements
      .filter((m) => !!getMeasurementLinkedResource(m))
      .map((m) => ({
        id: m.id,
        name: m.name || "Untitled",
        quantity: computeFinalQuantity(m),
        unit: m.display_unit || m.unit || "",
        linked: getMeasurementLinkedResource(m),
        group: groups.find((g) => g.id === m.group_id) || null,
      }));
  }, [activePageMeasurements, groups]);

  const saveGroupSummaryToLocal = useCallback(() => {
    if (!session || !projectId) return;
    const serialGroups = groups.map((g, index) => ({
      id: g.id,
      name: g.name,
      color: g.color || GROUP_COLORS[index % GROUP_COLORS.length],
      sortOrder: Number(g.sort_order || index + 1),
    }));
    const totals: Record<
      string,
      {
        line_ft: number;
        area_ft2: number;
        volume_yd3: number;
        count_ea: number;
      }
    > = {};
    groupedTotals.forEach((t) => {
      if (!t.group) return;
      totals[t.group.id] = {
        line_ft: Number(t.line || 0),
        area_ft2: Number(t.area || 0),
        volume_yd3: 0,
        count_ea: Number(t.count || 0),
      };
    });
    localStorage.setItem("takeoff_groups", JSON.stringify(serialGroups));
    localStorage.setItem("takeoff_group_totals", JSON.stringify(totals));
  }, [groupedTotals, groups, projectId, session]);

  useEffect(() => {
    saveGroupSummaryToLocal();
  }, [saveGroupSummaryToLocal]);

  const setSaving = useCallback((state: "saving" | "saved" | "error" | "idle", msg = "") => {
    setSaveState(state);
    setStatusText(msg);
    if (state === "saved") {
      window.setTimeout(() => {
        if (isMountedRef.current) {
          setSaveState("idle");
          setStatusText("");
        }
      }, 1500);
    }
  }, []);

  const loadLibrary = useCallback(async () => {
    const [categoriesRes, itemsRes, assembliesRes] = await Promise.all([
      supabase
        .from("master_categories")
        .select("id,name,code,sort_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("items")
        .select(
          "id,name,item_code,category_id,description,base_unit,unit_type,default_quantity,is_active"
        )
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("assemblies")
        .select(
          "id,name,assembly_code,category_id,description,output_unit,unit_type,waste_percent,productivity_factor,is_active"
        )
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

    if (!categoriesRes.error) setCategories((categoriesRes.data || []) as CategoryRow[]);
    if (!itemsRes.error) setItems((itemsRes.data || []) as ItemRow[]);
    if (!assembliesRes.error) setAssemblies((assembliesRes.data || []) as AssemblyRow[]);
  }, []);

  const persistPage = useCallback(
    async (pageId: string, patch: Partial<PageRow>) => {
      const payload = {
        ...patch,
        updated_at: new Date().toISOString(),
      };
      setSaving("saving", "Saving page...");
      const { error } = await supabase.from("takeoff_pages").update(payload).eq("id", pageId);
      if (error) {
        setSaving("error", error.message || "Failed to save page.");
        throw error;
      }
      setPages((prev) =>
        prev.map((p) => (p.id === pageId ? ({ ...p, ...payload } as PageRow) : p))
      );
      setSaving("saved", "Page saved");
    },
    [setSaving]
  );

  const loadMeasurements = useCallback(
    async (sessionId: string) => {
      const { data, error } = await supabase
        .from("takeoff_measurements")
        .select("*")
        .eq("project_id", projectId)
        .eq("session_id", sessionId)
        .order("page_number", { ascending: true })
        .order("sort_order", { ascending: true });

      if (error) {
        setErrorText(error.message || "Failed to load measurements.");
        return;
      }

      const rows = ((data || []) as any[]).map((row) => ({
        ...row,
        points: Array.isArray(row.points) ? row.points : [],
        meta: row.meta || {},
      })) as MeasurementRow[];

      setMeasurements(rows);
    },
    [projectId]
  );

  const ensureDefaultGroup = useCallback(
    async (sessionRow: SessionRow, userCompanyId: string) => {
      const { data, error } = await supabase
        .from("takeoff_groups")
        .select("*")
        .eq("session_id", sessionRow.id)
        .order("sort_order", { ascending: true });

      if (error) throw error;

      let rows = (data || []) as GroupRow[];
      if (!rows.length) {
        const payload = {
          id: uid(),
          company_id: userCompanyId,
          session_id: sessionRow.id,
          name: "General",
          color: GROUP_COLORS[0],
          trade: null,
          is_hidden: false,
          sort_order: 1,
        };
        const insert = await supabase.from("takeoff_groups").insert(payload).select("*").single();
        if (insert.error) throw insert.error;
        rows = [insert.data as GroupRow];
      }

      setGroups(rows);
      setSelectedGroupId((prev) => prev || rows[0]?.id || "");
      return rows;
    },
    []
  );

  const pageCreationLockRef = useRef(false);

const createPageRecord = useCallback(
  async (
    sessionRow: SessionRow,
    pageNumber: number,
    label: string,
    pageData: PageData,
    size?: { width?: number; height?: number }
  ) => {
    const payload = {
      project_id: projectId,
      session_id: sessionRow.id,
      page_number: pageNumber,
      page_label: label,
      page_data: pageData,
      width: size?.width || 1200,
      height: size?.height || 900,
      calibration_scale: null,
      calibration_unit: "ft",
      calibration_distance: null,
      calibration_point_1: null,
      calibration_point_2: null,
      updated_at: new Date().toISOString(),
    };

    const upsert = await supabase
      .from("takeoff_pages")
      .upsert(payload, {
        onConflict: "session_id,page_number",
      })
      .select("*")
      .single();

    if (upsert.error) throw upsert.error;

    return upsert.data as PageRow;
  },
  [projectId]
);

  const bootstrap = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      setErrorText("Open Takeoff from a project route.");
      return;
    }

    setLoading(true);
    setErrorText("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErrorText("You must be signed in.");
        setLoading(false);
        return;
      }

      const [projectRes, profileRes] = await Promise.all([
        supabase.from("projects").select("id,name").eq("id", projectId).maybeSingle(),
        supabase
          .from("user_profiles")
          .select("company_id")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      if (projectRes.data) {
        setProject(projectRes.data as ProjectRow);
      }

      const userCompanyId = String(profileRes.data?.company_id || "");
      setCompanyId(userCompanyId);

      let sessionRow: SessionRow | null = null;

      const existingSession = await supabase
        .from("takeoff_sessions")
        .select("*")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSession.data) {
        sessionRow = existingSession.data as SessionRow;
      } else {
        const insert = await supabase
          .from("takeoff_sessions")
          .insert({
            project_id: projectId,
            company_id: userCompanyId || null,
            name: "Takeoff Session",
          })
          .select("*")
          .single();

        if (insert.error) throw insert.error;
        sessionRow = insert.data as SessionRow;
      }

      setSession(sessionRow);

      const pagesRes = await supabase
        .from("takeoff_pages")
        .select("*")
        .eq("project_id", projectId)
        .eq("session_id", sessionRow.id)
        .order("page_number", { ascending: true });

     const pageRows = ((pagesRes.data || []) as PageRow[]).sort(
  (a, b) => a.page_number - b.page_number
);

      setPages(pageRows);
      setActivePageId((prev) => prev || pageRows[0]?.id || "");

      await Promise.all([
        ensureDefaultGroup(sessionRow, userCompanyId),
        loadMeasurements(sessionRow.id),
        loadLibrary(),
      ]);
    } catch (error: any) {
      setErrorText(error?.message || "Failed to load takeoff page.");
    } finally {
      setLoading(false);
    }
  }, [
    createPageRecord,
    ensureDefaultGroup,
    loadLibrary,
    loadMeasurements,
    projectId,
  ]);

 useEffect(() => {
  if (bootstrappedRef.current) return;
  bootstrappedRef.current = true;
  bootstrap();
}, [bootstrap]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!activePage) return;
    const p1 = activePage.calibration_point_1 || activePage.calibration_p1 || null;
    const p2 = activePage.calibration_point_2 || activePage.calibration_p2 || null;
    setCalibrationDraft({
      p1: isPoint(p1) ? p1 : null,
      p2: isPoint(p2) ? p2 : null,
    });

    const dist = Number(
      activePage.calibration_distance || activePage.calibration_scale || 0
    );
    const unit = activePage.calibration_unit || "ft";
    if (unit === "ft") {
      const wholeFeet = Math.floor(dist || 0);
      const inchesFloat = ((dist || 0) - wholeFeet) * 12;
      const wholeInches = Math.floor(inchesFloat);
      setCalibrationForm({
        feet: dist ? String(wholeFeet) : "",
        inches: dist ? String(wholeInches) : "",
        fraction: "0",
        unit: "ft",
      });
    } else {
      setCalibrationForm({
        feet: dist ? String(dist) : "",
        inches: "",
        fraction: "0",
        unit,
      });
    }
  }, [activePage]);

  const updateMeasurementInState = useCallback((id: string, patch: Partial<MeasurementRow>) => {
    setMeasurements((prev) =>
      prev.map((m) => (m.id === id ? ({ ...m, ...patch } as MeasurementRow) : m))
    );
  }, []);

  const upsertMeasurement = useCallback(
    async (row: MeasurementRow) => {
      const payload = {
        id: row.id,
        company_id: companyId || null,
        project_id: row.project_id,
        session_id: row.session_id,
        drawing_id: row.drawing_id || activePage?.drawing_id || null,
        group_id: row.group_id || null,
        boq_id: row.boq_id || null,
        boq_section_id: row.boq_section_id || null,
        boq_item_id: row.boq_item_id || null,
        page_number: row.page_number || activePage?.page_number || 1,
        tool_type: row.tool_type || row.type || "line",
        type: row.type || row.tool_type || "line",
        name: row.name || null,
        description: row.description || null,
        points: row.points,
        closed_shape: row.closed_shape || false,
        raw_length: row.raw_length || 0,
        raw_area: row.raw_area || 0,
        raw_count: row.raw_count || 0,
        raw_volume: row.raw_volume || 0,
        display_unit: row.display_unit || row.unit || null,
        scale_x: row.scale_x ?? getPageScale(activePage),
        scale_y: row.scale_y ?? getPageScale(activePage),
        multiplier: row.multiplier ?? 1,
        waste_percent: row.waste_percent ?? 0,
        deduction_value: row.deduction_value ?? 0,
        formula_id: row.formula_id || null,
        assembly_id: row.assembly_id || null,
        cost_item_id: row.cost_item_id || null,
        fill_color: row.fill_color || "rgba(56,189,248,0.14)",
        stroke_color: row.stroke_color || "#38bdf8",
        line_width: row.line_width || 2,
        sort_order: row.sort_order || 1,
        is_deleted: false,
        created_by: row.created_by || null,
        unit: row.unit || row.display_unit || null,
        result: row.result ?? 0,
        meta: row.meta || {},
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("takeoff_measurements").upsert(payload, {
        onConflict: "id",
      });

      if (error) {
        setSaving("error", error.message || "Failed to save measurement.");
        throw error;
      }
    },
    [activePage, companyId, setSaving]
  );

  const deleteMeasurement = useCallback(
    async (id: string) => {
      setMeasurements((prev) => prev.filter((m) => m.id !== id));
      if (selectedMeasurementId === id) setSelectedMeasurementId("");

      const { error } = await supabase.from("takeoff_measurements").delete().eq("id", id);
      if (error) {
        setSaving("error", error.message || "Failed to delete measurement.");
        return;
      }
      setSaving("saved", "Measurement deleted");
    },
    [selectedMeasurementId, setSaving]
  );

  const finalizeMeasurement = useCallback(
    async (type: ToolMode, points: Point[]) => {
      if (!session || !activePage || !points.length) return;
      if (type === "line" && points.length < 2) return;
      if (type === "area" && points.length < 3) return;
      if (type === "count" && points.length < 1) return;

      const metrics = getRawMetrics(type, points);
      const result = getMeasurementResult(type, points, activePage);
      const unit = getMeasurementUnit(type, activePage);
      const nextIndex = activePageMeasurements.filter(
        (m) => (m.tool_type || m.type) === type
      ).length + 1;

      const row: MeasurementRow = {
        id: uid(),
        company_id: companyId || null,
        project_id: projectId,
        session_id: session.id,
        drawing_id: activePage.drawing_id || null,
        group_id: selectedGroupId || null,
        page_number: activePage.page_number,
        tool_type: type,
        type,
        name: getMeasurementName(type, nextIndex),
        description: null,
        points,
        closed_shape: type === "area",
        raw_length: metrics.raw_length,
        raw_area: metrics.raw_area,
        raw_count: metrics.raw_count,
        raw_volume: 0,
        display_unit: unit,
        scale_x: getPageScale(activePage),
        scale_y: getPageScale(activePage),
        multiplier: 1,
        waste_percent: 0,
        deduction_value: 0,
        assembly_id: null,
        cost_item_id: null,
        fill_color:
          type === "area"
            ? "rgba(56,189,248,0.14)"
            : type === "count"
            ? "rgba(245,158,11,0.18)"
            : "rgba(56,189,248,0.10)",
        stroke_color: getMeasurementColor(selectedGroupId, groups),
        line_width: 2,
        sort_order: activePageMeasurements.length + 1,
        is_deleted: false,
        unit,
        result,
        meta: {
          linkedResource: null,
          quantityRule: {
            multiplier: 1,
            wastePercent: 0,
            deductionValue: 0,
            formulaNote: "",
          },
          pageId: activePage.id,
        },
      };

      setMeasurements((prev) => [...prev, row]);
      setSelectedMeasurementId(row.id);
      setDraftPoints([]);
      setHoverPoint(null);
      setSaving("saving", "Saving measurement...");
      try {
        await upsertMeasurement(row);
        setSaving("saved", "Measurement saved");
      } catch {
        //
      }
    },
    [
      activePage,
      activePageMeasurements,
      companyId,
      groups,
      projectId,
      selectedGroupId,
      session,
      setSaving,
      upsertMeasurement,
    ]
  );

  const handleOpenUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const persistRenderedSize = useCallback(
    async (width: number, height: number) => {
      if (!activePage) return;
      if (
        Number(activePage.width || 0) === Math.round(width) &&
        Number(activePage.height || 0) === Math.round(height)
      ) {
        return;
      }
      await persistPage(activePage.id, {
        width: Math.round(width),
        height: Math.round(height),
      });
    },
    [activePage, persistPage]
  );

  const renderPdfPage = useCallback(async () => {
    if (!activeAsset || activeAsset.kind !== "pdf" || !canvasRef.current || !activePage) {
      return;
    }
    setPdfLoading(true);
    try {
      const loadingTask = pdfjs.getDocument(activeAsset.dataUrl);
      const pdf = await loadingTask.promise;
      const pageNum = clamp(activeAsset.pageNumber || activePage.page_number || 1, 1, pdf.numPages);
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      await persistRenderedSize(viewport.width, viewport.height);
    } catch (error: any) {
      setErrorText(error?.message || "Failed to render PDF page.");
    } finally {
      setPdfLoading(false);
    }
  }, [activeAsset, activePage, persistRenderedSize]);

  useEffect(() => {
    if (activeAsset?.kind === "pdf") {
      void renderPdfPage();
    }
  }, [activeAsset, renderPdfPage]);

  const handleImageLoaded = useCallback(
    async (img: HTMLImageElement) => {
      if (!img?.naturalWidth || !img?.naturalHeight) return;
      await persistRenderedSize(img.naturalWidth, img.naturalHeight);
      setImageLoading(false);
    },
    [persistRenderedSize]
  );

  const handleUploadFile = useCallback(
    async (file: File) => {
      if (!session) return;
      setUploading(true);
      setErrorText("");
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

     if (file.type.includes("pdf")) {
  const loadingTask = pdfjs.getDocument(dataUrl);
  const pdf = await loadingTask.promise;
  const createdPages: PageRow[] = [];

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const existing = await supabase
      .from("takeoff_pages")
      .select("*")
      .eq("project_id", projectId)
      .eq("session_id", session.id)
      .eq("page_number", i)
      .maybeSingle();

    if (existing.error) {
      throw existing.error;
    }

    if (existing.data) {
      createdPages.push(existing.data as PageRow);
      continue;
    }

    const pdfPage = await pdf.getPage(i);
    const viewport = pdfPage.getViewport({ scale: 1.5 });

    const pageData: PageData = {
      asset: {
        kind: "pdf",
        name: file.name,
        dataUrl,
        numPages: pdf.numPages,
        pageNumber: i,
      },
    };

    const row = await createPageRecord(
      session,
      i,
      `${file.name} - Page ${i}`,
      pageData,
      { width: viewport.width, height: viewport.height }
    );

    createdPages.push(row);
  }

  setPages(createdPages.sort((a, b) => a.page_number - b.page_number));
  setActivePageId(createdPages[0]?.id || "");
  setZoom(1);
  setPan({ x: 0, y: 0 });
  setSaving("saved", "PDF uploaded");
  return;
}

        const currentPage =
          activePage ||
          (await createPageRecord(
            session,
            1,
            file.name,
            {
              asset: {
                kind: "image",
                name: file.name,
                dataUrl,
              },
            },
            { width: 1200, height: 900 }
          ));

        const nextPageData: PageData = {
          ...((currentPage.page_data || {}) as PageData),
          asset: {
            kind: "image",
            name: file.name,
            dataUrl,
          },
        };

        await persistPage(currentPage.id, {
          page_label: file.name,
          page_data: nextPageData,
        });

        setPages((prev) =>
          prev.map((p) =>
            p.id === currentPage.id
              ? ({
                  ...p,
                  page_label: file.name,
                  page_data: nextPageData,
                } as PageRow)
              : p
          )
        );
        setActivePageId(currentPage.id);
        setImageLoading(true);
        setZoom(1);
        setPan({ x: 0, y: 0 });
      } catch (error: any) {
        setSaving("error", error?.message || "Upload failed.");
      } finally {
        setUploading(false);
      }
    },
    [activePage, createPageRecord, persistPage, session, setSaving]
  );

  const addGroup = useCallback(async () => {
    if (!session) return;
    const nextSort = groups.length + 1;
    const payload = {
      id: uid(),
      company_id: companyId || null,
      session_id: session.id,
      name: `Group ${nextSort}`,
      color: GROUP_COLORS[(nextSort - 1) % GROUP_COLORS.length],
      trade: null,
      is_hidden: false,
      sort_order: nextSort,
    };
    const { data, error } = await supabase.from("takeoff_groups").insert(payload).select("*").single();
    if (error) {
      setSaving("error", error.message || "Failed to create group.");
      return;
    }
    setGroups((prev) => [...prev, data as GroupRow]);
    setSelectedGroupId((data as GroupRow).id);
    setSaving("saved", "Group created");
  }, [companyId, groups.length, session, setSaving]);

  const addBlankPage = useCallback(async () => {
    if (!session) return;
    const nextPageNumber = pages.length
      ? Math.max(...pages.map((p) => p.page_number)) + 1
      : 1;
    try {
      const row = await createPageRecord(
        session,
        nextPageNumber,
        `Page ${nextPageNumber}`,
        { asset: null },
        { width: 1200, height: 900 }
      );
      setPages((prev) => [...prev, row].sort((a, b) => a.page_number - b.page_number));
      setActivePageId(row.id);
      setSaving("saved", "Page created");
    } catch (error: any) {
      setSaving("error", error?.message || "Failed to create page.");
    }
  }, [createPageRecord, pages, session, setSaving]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const zoomBy = useCallback((delta: number) => {
    setZoom((prev) => clamp(Number((prev + delta).toFixed(2)), 0.25, 6));
  }, []);

  const handleMouseDownViewer = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (toolMode !== "pan") return;
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    },
    [pan.x, pan.y, toolMode]
  );

  const handleMouseMoveViewer = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (toolMode === "pan" && isPanning && panStartRef.current) {
        setPan({
          x: e.clientX - panStartRef.current.x,
          y: e.clientY - panStartRef.current.y,
        });
      }
    },
    [isPanning, toolMode]
  );

  const handleMouseUpViewer = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  const handleSvgClick = useCallback(
    async (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
      if (!svgRef.current || !activePage) return;
      const point = toSvgPoint(e, svgRef.current, zoom, pan);

      if (isPickingCalibration) {
        if (!calibrationDraft.p1) {
          setCalibrationDraft({ p1: point, p2: null });
          return;
        }
        if (!calibrationDraft.p2) {
          setCalibrationDraft((prev) => ({ ...prev, p2: point }));
          setIsPickingCalibration(false);
          setShowCalibrationModal(true);
          return;
        }
      }

      if (toolMode === "pan") return;

      if (toolMode === "count") {
        await finalizeMeasurement("count", [point]);
        return;
      }

      if (toolMode === "line") {
        const next = [...draftPoints, point];
        setDraftPoints(next);
        if (next.length >= 2) {
          await finalizeMeasurement("line", next);
        }
        return;
      }

      if (toolMode === "area") {
        setDraftPoints((prev) => [...prev, point]);
      }
    },
    [
      activePage,
      calibrationDraft.p1,
      calibrationDraft.p2,
      draftPoints,
      finalizeMeasurement,
      isPickingCalibration,
      pan,
      toolMode,
      zoom,
    ]
  );

  const handleSvgMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
      if (!svgRef.current) return;
      if (toolMode === "pan") return;
      setHoverPoint(toSvgPoint(e, svgRef.current, zoom, pan));
    },
    [pan, toolMode, zoom]
  );

  const finishAreaMeasurement = useCallback(async () => {
    if (toolMode !== "area" || draftPoints.length < 3) return;
    await finalizeMeasurement("area", draftPoints);
  }, [draftPoints, finalizeMeasurement, toolMode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraftPoints([]);
        setHoverPoint(null);
        setIsPickingCalibration(false);
      }
      if (e.key === "Enter" && toolMode === "area" && draftPoints.length >= 3) {
        void finishAreaMeasurement();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [draftPoints.length, finishAreaMeasurement, toolMode]);

  const startCalibrationPicking = useCallback(() => {
    setCalibrationDraft({ p1: null, p2: null });
    setShowCalibrationModal(false);
    setIsPickingCalibration(true);
  }, []);

  const saveCalibration = useCallback(async () => {
    if (!activePage) return;
    if (!calibrationDraft.p1 || !calibrationDraft.p2) {
      setErrorText("Pick two points on the drawing first.");
      return;
    }

    const distance =
      calibrationForm.unit === "ft"
        ? feetFromFIS(
            calibrationForm.feet,
            calibrationForm.inches,
            calibrationForm.fraction
          )
        : Number(calibrationForm.feet || 0);

    if (!distance) {
      setErrorText("Enter a calibration distance.");
      return;
    }

    await persistPage(activePage.id, {
      calibration_point_1: calibrationDraft.p1,
      calibration_point_2: calibrationDraft.p2,
      calibration_p1: calibrationDraft.p1,
      calibration_p2: calibrationDraft.p2,
      calibration_distance: distance,
      calibration_scale: distance,
      calibration_unit: calibrationForm.unit,
    });

    setShowCalibrationModal(false);

    const updatedRows = activePageMeasurements.map((m) => {
      const result = getMeasurementResult(
        (m.tool_type || m.type || "line") as ToolMode,
        m.points,
        {
          ...activePage,
          calibration_point_1: calibrationDraft.p1,
          calibration_point_2: calibrationDraft.p2,
          calibration_p1: calibrationDraft.p1,
          calibration_p2: calibrationDraft.p2,
          calibration_distance: distance,
          calibration_scale: distance,
          calibration_unit: calibrationForm.unit,
        }
      );

      const updated: MeasurementRow = {
        ...m,
        result,
        unit: getMeasurementUnit((m.tool_type || m.type || "line") as ToolMode, {
          ...activePage,
          calibration_unit: calibrationForm.unit,
        }),
        display_unit: getMeasurementUnit((m.tool_type || m.type || "line") as ToolMode, {
          ...activePage,
          calibration_unit: calibrationForm.unit,
        }),
        scale_x: distance / distancePx(calibrationDraft.p1, calibrationDraft.p2),
        scale_y: distance / distancePx(calibrationDraft.p1, calibrationDraft.p2),
      };

      void upsertMeasurement(updated);
      return updated;
    });

    setMeasurements((prev) =>
      prev.map((m) => updatedRows.find((u) => u.id === m.id) || m)
    );
  }, [
    activePage,
    activePageMeasurements,
    calibrationDraft.p1,
    calibrationDraft.p2,
    calibrationForm.feet,
    calibrationForm.fraction,
    calibrationForm.inches,
    calibrationForm.unit,
    persistPage,
    upsertMeasurement,
  ]);

  const openPickerForMeasurement = useCallback(
    (measurementId: string, type?: PickerType) => {
      setSelectedMeasurementId(measurementId);
      setPickerType(type || "item");
      setPickerSelectedId("");
      setPickerCategoryId("all");
      setPickerSearch("");
      setShowPicker(true);
    },
    []
  );

  const applyPickerSelection = useCallback(async () => {
    if (!selectedMeasurement || !pickerSelectedId) return;

    const resource =
      pickerType === "item"
        ? items.find((i) => i.id === pickerSelectedId)
        : assemblies.find((a) => a.id === pickerSelectedId);

    if (!resource) return;

    const linked: LinkedResource = {
      type: pickerType,
      id: resource.id,
      name: resource.name,
      code:
        pickerType === "item"
          ? (resource as ItemRow).item_code || null
          : (resource as AssemblyRow).assembly_code || null,
      categoryId: (resource as any).category_id || null,
      unit:
        pickerType === "item"
          ? (resource as ItemRow).base_unit || null
          : (resource as AssemblyRow).output_unit || null,
      unitType: (resource as any).unit_type || null,
    };

    const rule = getDefaultRule(selectedMeasurement);

    const updated: MeasurementRow = {
      ...selectedMeasurement,
      assembly_id: pickerType === "assembly" ? resource.id : null,
      cost_item_id: pickerType === "item" ? resource.id : null,
      meta: {
        ...(selectedMeasurement.meta || {}),
        linkedResource: linked,
        quantityRule: rule,
      },
    };

    updateMeasurementInState(selectedMeasurement.id, updated);
    setShowPicker(false);
    setSaving("saving", "Linking selection...");
    try {
      await upsertMeasurement(updated);
      setSaving("saved", "Selection linked");
    } catch {
      //
    }
  }, [
    assemblies,
    items,
    pickerSelectedId,
    pickerType,
    selectedMeasurement,
    setSaving,
    updateMeasurementInState,
    upsertMeasurement,
  ]);

  const updateQuantityRule = useCallback(
    async (patch: Partial<QuantityRule>) => {
      if (!selectedMeasurement) return;
      const current = getDefaultRule(selectedMeasurement);
      const nextRule: QuantityRule = {
        multiplier: patch.multiplier ?? current.multiplier,
        wastePercent: patch.wastePercent ?? current.wastePercent,
        deductionValue: patch.deductionValue ?? current.deductionValue,
        formulaNote: patch.formulaNote ?? current.formulaNote,
      };

      const updated: MeasurementRow = {
        ...selectedMeasurement,
        multiplier: nextRule.multiplier,
        waste_percent: nextRule.wastePercent,
        deduction_value: nextRule.deductionValue,
        meta: {
          ...(selectedMeasurement.meta || {}),
          linkedResource: getMeasurementLinkedResource(selectedMeasurement),
          quantityRule: nextRule,
        },
      };

      updateMeasurementInState(selectedMeasurement.id, updated);
      try {
        await upsertMeasurement(updated);
        setSaving("saved", "Rule saved");
      } catch {
        //
      }
    },
    [selectedMeasurement, setSaving, updateMeasurementInState, upsertMeasurement]
  );

  const renameMeasurement = useCallback(
    async (name: string) => {
      if (!selectedMeasurement) return;
      const updated = { ...selectedMeasurement, name };
      updateMeasurementInState(selectedMeasurement.id, updated);
      try {
        await upsertMeasurement(updated);
        setSaving("saved", "Measurement updated");
      } catch {
        //
      }
    },
    [selectedMeasurement, setSaving, updateMeasurementInState, upsertMeasurement]
  );

  const updateMeasurementGroup = useCallback(
    async (groupId: string) => {
      if (!selectedMeasurement) return;
      const updated = {
        ...selectedMeasurement,
        group_id: groupId || null,
        stroke_color: getMeasurementColor(groupId, groups),
      };
      updateMeasurementInState(selectedMeasurement.id, updated);
      try {
        await upsertMeasurement(updated);
        setSaving("saved", "Measurement moved");
      } catch {
        //
      }
    },
    [groups, selectedMeasurement, setSaving, updateMeasurementInState, upsertMeasurement]
  );

  const prevPage = useCallback(() => {
    if (!activePage) return;
    const index = pages.findIndex((p) => p.id === activePage.id);
    if (index > 0) setActivePageId(pages[index - 1].id);
  }, [activePage, pages]);

  const nextPage = useCallback(() => {
    if (!activePage) return;
    const index = pages.findIndex((p) => p.id === activePage.id);
    if (index < pages.length - 1) setActivePageId(pages[index + 1].id);
  }, [activePage, pages]);

  const calibrationReady = Boolean(calibrationDraft.p1 && calibrationDraft.p2);
  const pageScale = getPageScale(activePage);

  if (!projectId) {
    return (
      <div className="p-6">
        <EmptyState
          title="No project route"
          text="Open Takeoff from /projects/:projectId/takeoff."
          action={
            <button
              type="button"
              onClick={() => navigate("/projects")}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
            >
              Open Projects
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-slate-950 text-slate-100">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUploadFile(file);
          e.currentTarget.value = "";
        }}
      />

      <div className="border-b border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Magnus Takeoff
            </div>
            <div className="mt-1 flex items-center gap-2">
              <h1 className="text-xl font-semibold">
                {project?.name || `Project ${projectId}`}
              </h1>
              {loading ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900 px-2 py-0.5 text-xs text-slate-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-2xl border border-slate-800 bg-slate-900 p-1">
              {[
                { key: "pan", icon: Move, label: "Pan" },
                { key: "line", icon: Ruler, label: "Line" },
                { key: "area", icon: Square, label: "Area" },
                { key: "count", icon: Hash, label: "Count" },
              ].map((tool) => {
                const Icon = tool.icon;
                const active = toolMode === tool.key;
                return (
                  <button
                    key={tool.key}
                    type="button"
                    onClick={() => {
                      setToolMode(tool.key as ToolMode);
                      setDraftPoints([]);
                      setHoverPoint(null);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium transition",
                      active
                        ? "bg-sky-500 text-slate-950"
                        : "text-slate-300 hover:bg-slate-800"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {tool.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1 rounded-2xl border border-slate-800 bg-slate-900 p-1">
              <button
                type="button"
                onClick={() => zoomBy(-0.1)}
                className="rounded-xl px-3 py-2 text-slate-300 hover:bg-slate-800"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <div className="min-w-[4.5rem] text-center text-sm text-slate-300">
                {Math.round(zoom * 100)}%
              </div>
              <button
                type="button"
                onClick={() => zoomBy(0.1)}
                className="rounded-xl px-3 py-2 text-slate-300 hover:bg-slate-800"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={resetView}
                className="rounded-xl px-3 py-2 text-slate-300 hover:bg-slate-800"
              >
                <RefreshCcw className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowCalibrationModal(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800"
            >
              <PencilRuler className="h-4 w-4" />
              Calibration
            </button>

            {toolMode === "area" ? (
              <button
                type="button"
                onClick={() => void finishAreaMeasurement()}
                className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20"
              >
                <CheckCircle2 className="h-4 w-4" />
                Finish Area
              </button>
            ) : null}

            <button
              type="button"
              onClick={handleOpenUpload}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800 disabled:opacity-60"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload
            </button>

            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm",
                saveState === "saving"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  : saveState === "saved"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : saveState === "error"
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                  : "border-slate-800 bg-slate-900 text-slate-400"
              )}
            >
              {saveState === "saving" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saveState === "saved" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : saveState === "error" ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {statusText || (saveState === "idle" ? "Ready" : saveState)}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span>Session: {session?.name || "Takeoff Session"}</span>
          <span>Page: {activePage?.page_number || 1}</span>
          <span>
            Scale:{" "}
            {pageScale
              ? `1 px = ${formatNumber(pageScale, 5)} ${activePage?.calibration_unit || "ft"}`
              : "Not calibrated"}
          </span>
          <span>Group: {groups.find((g) => g.id === selectedGroupId)?.name || "None"}</span>
          {errorText ? (
            <span className="text-rose-300">{errorText}</span>
          ) : null}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_360px] gap-0">
        <aside className="flex min-h-0 flex-col border-r border-slate-800 bg-slate-950">
          <div className="border-b border-slate-800 px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">Drawings / Pages</div>
              <button
                type="button"
                onClick={() => void addBlankPage()}
                className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                <Plus className="mr-1 inline h-3 w-3" />
                Page
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={prevPage}
                className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-300 hover:bg-slate-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={nextPage}
                className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-300 hover:bg-slate-800"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <div className="text-xs text-slate-400">
                {pages.length} page{pages.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
            <div className="space-y-2">
              {pages.map((page) => {
                const isActive = page.id === activePage?.id;
                const asset = getPageAsset(page);
                return (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => {
                      setActivePageId(page.id);
                      setDraftPoints([]);
                      setHoverPoint(null);
                    }}
                    className={cn(
                      "w-full rounded-2xl border p-3 text-left transition",
                      isActive
                        ? "border-sky-500/40 bg-sky-500/10"
                        : "border-slate-800 bg-slate-900/70 hover:bg-slate-900"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-100">
                          {page.page_label || `Page ${page.page_number}`}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          Page {page.page_number}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">
                        {asset?.kind === "pdf"
                          ? "PDF"
                          : asset?.kind === "image"
                          ? "Image"
                          : "Blank"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 border-t border-slate-800 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold">Takeoff Groups</div>
                <button
                  type="button"
                  onClick={() => void addGroup()}
                  className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  <Plus className="mr-1 inline h-3 w-3" />
                  Group
                </button>
              </div>

              <div className="space-y-2">
                {groups.map((group, index) => {
                  const totals = groupedTotals.find((t) => t.group?.id === group.id);
                  const active = selectedGroupId === group.id;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => setSelectedGroupId(group.id)}
                      className={cn(
                        "w-full rounded-2xl border p-3 text-left transition",
                        active
                          ? "border-sky-500/40 bg-slate-900"
                          : "border-slate-800 bg-slate-900/60 hover:bg-slate-900"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{
                            backgroundColor:
                              group.color || GROUP_COLORS[index % GROUP_COLORS.length],
                          }}
                        />
                        <span className="text-sm font-medium text-slate-100">
                          {group.name}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-400">
                        <div>L {formatNumber(totals?.line || 0)}</div>
                        <div>A {formatNumber(totals?.area || 0)}</div>
                        <div>C {formatNumber(totals?.count || 0, 0)}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        <main className="relative flex min-h-0 flex-col bg-slate-900">
          <div className="border-b border-slate-800 px-4 py-2">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
              <span className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5">
                {activePage?.page_label || "No page"}
              </span>
              <span className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5">
                Tool: {toolMode}
              </span>
              <span className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5">
                Measurements: {activePageMeasurements.length}
              </span>
              {draftPoints.length ? (
                <span className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-amber-300">
                  Draft points: {draftPoints.length}
                </span>
              ) : null}
            </div>
          </div>

          <div
            ref={viewerRef}
            className="relative min-h-0 flex-1 overflow-hidden"
            onMouseDown={handleMouseDownViewer}
            onMouseMove={handleMouseMoveViewer}
            onMouseUp={handleMouseUpViewer}
            onMouseLeave={handleMouseUpViewer}
          >
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                width: activePage?.width || 1200,
                height: activePage?.height || 900,
              }}
            >
              <div
                className="relative overflow-hidden rounded-none border-r border-slate-800 bg-slate-950 shadow-2xl"
                style={{
                  width: activePage?.width || 1200,
                  height: activePage?.height || 900,
                }}
              >
                {!activeAsset ? (
                  <div className="flex h-full items-center justify-center p-8">
                    <EmptyState
                      title="No drawing loaded"
                      text="Upload a PDF or image to begin measuring."
                      action={
                        <button
                          type="button"
                          onClick={handleOpenUpload}
                          className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
                        >
                          Upload Drawing
                        </button>
                      }
                    />
                  </div>
                ) : activeAsset.kind === "pdf" ? (
                  <div className="relative h-full w-full bg-white">
                    {pdfLoading ? (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/30">
                        <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-200">
                          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                          Rendering PDF...
                        </div>
                      </div>
                    ) : null}
                    <canvas
                      ref={canvasRef}
                      className="block h-full w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="relative h-full w-full bg-slate-950">
                    {imageLoading ? (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/40">
                        <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-200">
                          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                          Loading image...
                        </div>
                      </div>
                    ) : null}
                    <img
                      src={activeAsset.dataUrl}
                      alt={activeAsset.name}
                      className="block h-full w-full object-contain"
                      onLoad={(e) => void handleImageLoaded(e.currentTarget)}
                    />
                  </div>
                )}

                <svg
                  ref={svgRef}
                  width={activePage?.width || 1200}
                  height={activePage?.height || 900}
                  className={cn(
                    "absolute inset-0 h-full w-full",
                    toolMode === "pan" ? "cursor-grab" : "cursor-crosshair"
                  )}
                  onClick={(e) => void handleSvgClick(e)}
                  onMouseMove={handleSvgMouseMove}
                >
                  {activePageMeasurements.map((row) => {
                    const type = (row.tool_type || row.type || "line") as ToolMode;
                    const color = row.stroke_color || getMeasurementColor(row.group_id, groups);
                    const center = getMeasurementCenter(row.points);
                    const linked = getMeasurementLinkedResource(row);
                    const finalQty = computeFinalQuantity(row);
                    return (
                      <g
                        key={row.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMeasurementId(row.id);
                        }}
                        opacity={selectedMeasurementId && selectedMeasurementId !== row.id ? 0.65 : 1}
                      >
                        {type === "line" && row.points.length >= 2 ? (
                          <>
                            <polyline
                              points={row.points.map((p) => `${p.x},${p.y}`).join(" ")}
                              fill="none"
                              stroke={color}
                              strokeWidth={selectedMeasurementId === row.id ? 3 : 2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <text
                              x={center.x}
                              y={center.y - 8}
                              fill="#e2e8f0"
                              fontSize={12}
                              textAnchor="middle"
                            >
                              {formatNumber(finalQty)} {row.display_unit || row.unit || ""}
                              {linked ? ` · ${linked.name}` : ""}
                            </text>
                          </>
                        ) : null}

                        {type === "area" && row.points.length >= 3 ? (
                          <>
                            <polygon
                              points={row.points.map((p) => `${p.x},${p.y}`).join(" ")}
                              fill={row.fill_color || "rgba(56,189,248,0.14)"}
                              stroke={color}
                              strokeWidth={selectedMeasurementId === row.id ? 3 : 2}
                            />
                            <text
                              x={center.x}
                              y={center.y}
                              fill="#f8fafc"
                              fontSize={12}
                              textAnchor="middle"
                            >
                              {formatNumber(finalQty)} {row.display_unit || row.unit || ""}
                              {linked ? ` · ${linked.name}` : ""}
                            </text>
                          </>
                        ) : null}

                        {type === "count" && row.points.length >= 1 ? (
                          <>
                            <circle
                              cx={row.points[0].x}
                              cy={row.points[0].y}
                              r={selectedMeasurementId === row.id ? 8 : 6}
                              fill={color}
                            />
                            <text
                              x={row.points[0].x}
                              y={row.points[0].y - 12}
                              fill="#f8fafc"
                              fontSize={12}
                              textAnchor="middle"
                            >
                              {linked ? linked.name : row.name}
                            </text>
                          </>
                        ) : null}
                      </g>
                    );
                  })}

                  {draftPoints.length ? (
                    <g>
                      {toolMode === "line" && (
                        <polyline
                          points={[...draftPoints, ...(hoverPoint ? [hoverPoint] : [])]
                            .map((p) => `${p.x},${p.y}`)
                            .join(" ")}
                          fill="none"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                        />
                      )}
                      {toolMode === "area" && (
                        <polygon
                          points={[...draftPoints, ...(hoverPoint ? [hoverPoint] : [])]
                            .map((p) => `${p.x},${p.y}`)
                            .join(" ")}
                          fill="rgba(245,158,11,0.10)"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                        />
                      )}
                      {draftPoints.map((p, i) => (
                        <circle key={`${p.x}-${p.y}-${i}`} cx={p.x} cy={p.y} r={4} fill="#f59e0b" />
                      ))}
                    </g>
                  ) : null}

                  {calibrationDraft.p1 ? (
                    <circle
                      cx={calibrationDraft.p1.x}
                      cy={calibrationDraft.p1.y}
                      r={6}
                      fill="#22c55e"
                    />
                  ) : null}
                  {calibrationDraft.p2 ? (
                    <circle
                      cx={calibrationDraft.p2.x}
                      cy={calibrationDraft.p2.y}
                      r={6}
                      fill="#22c55e"
                    />
                  ) : null}
                  {calibrationDraft.p1 && calibrationDraft.p2 ? (
                    <line
                      x1={calibrationDraft.p1.x}
                      y1={calibrationDraft.p1.y}
                      x2={calibrationDraft.p2.x}
                      y2={calibrationDraft.p2.y}
                      stroke="#22c55e"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                    />
                  ) : null}
                </svg>
              </div>
            </div>
          </div>
        </main>

        <aside className="flex min-h-0 flex-col border-l border-slate-800 bg-slate-950">
          <div className="border-b border-slate-800 px-3 py-3">
            <div className="grid grid-cols-5 gap-1 rounded-2xl border border-slate-800 bg-slate-900 p-1">
              {[
                { key: "items", label: "Items", icon: Package },
                { key: "assemblies", label: "Assemblies", icon: Boxes },
                { key: "linked", label: "Linked", icon: Link2 },
                { key: "rules", label: "Rules", icon: Settings },
                { key: "boq", label: "BOQ", icon: Layers3 },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = rightTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setRightTab(tab.key as RightTab)}
                    className={cn(
                      "rounded-xl px-2 py-2 text-xs font-medium transition",
                      active
                        ? "bg-sky-500 text-slate-950"
                        : "text-slate-300 hover:bg-slate-800"
                    )}
                  >
                    <Icon className="mx-auto mb-1 h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3">
            {rightTab === "items" ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-semibold">Item Library</div>
                    <button
                      type="button"
                      onClick={() => {
                        setLibraryTypeFilter("item");
                        setRightTab("items");
                      }}
                      className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200"
                    >
                      {filteredItems.length} items
                    </button>
                  </div>
                  <div className="relative mb-3">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      value={librarySearch}
                      onChange={(e) => setLibrarySearch(e.target.value)}
                      placeholder="Search items"
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500/40"
                    />
                  </div>
                  <select
                    value={libraryCategoryId}
                    onChange={(e) => setLibraryCategoryId(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none"
                  >
                    <option value="all">All categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  {filteredItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-100">{item.name}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {item.item_code || "No code"} · {item.base_unit || "unit"}
                          </div>
                        </div>
                        {selectedMeasurement ? (
                          <button
                            type="button"
                            onClick={() => openPickerForMeasurement(selectedMeasurement.id, "item")}
                            className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
                          >
                            Link
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {rightTab === "assemblies" ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-semibold">Assembly Library</div>
                    <button
                      type="button"
                      onClick={() => {
                        setLibraryTypeFilter("assembly");
                        setRightTab("assemblies");
                      }}
                      className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200"
                    >
                      {filteredAssemblies.length} assemblies
                    </button>
                  </div>
                  <div className="relative mb-3">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      value={librarySearch}
                      onChange={(e) => setLibrarySearch(e.target.value)}
                      placeholder="Search assemblies"
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500/40"
                    />
                  </div>
                  <select
                    value={libraryCategoryId}
                    onChange={(e) => setLibraryCategoryId(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none"
                  >
                    <option value="all">All categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  {filteredAssemblies.map((assembly) => (
                    <div
                      key={assembly.id}
                      className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-100">
                            {assembly.name}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            {assembly.assembly_code || "No code"} ·{" "}
                            {assembly.output_unit || "unit"}
                          </div>
                        </div>
                        {selectedMeasurement ? (
                          <button
                            type="button"
                            onClick={() =>
                              openPickerForMeasurement(selectedMeasurement.id, "assembly")
                            }
                            className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
                          >
                            Link
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {rightTab === "linked" ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Linked Selections</div>
                    {selectedMeasurement ? (
                      <button
                        type="button"
                        onClick={() => openPickerForMeasurement(selectedMeasurement.id, "item")}
                        className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
                      >
                        <FolderTree className="mr-1 inline h-3 w-3" />
                        Folder Picker
                      </button>
                    ) : null}
                  </div>
                </div>

                {selectedMeasurement ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                    <div className="text-sm font-medium text-slate-100">
                      {selectedMeasurement.name || "Selected measurement"}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {(selectedMeasurement.tool_type || selectedMeasurement.type || "line").toUpperCase()} ·{" "}
                      Qty {formatNumber(computeFinalQuantity(selectedMeasurement))}{" "}
                      {selectedMeasurement.display_unit || selectedMeasurement.unit || ""}
                    </div>

                    <div className="mt-4 space-y-2">
                      {getMeasurementLinkedResource(selectedMeasurement) ? (
                        <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
                          <div className="text-xs uppercase tracking-wide text-sky-300">
                            Linked
                          </div>
                          <div className="mt-1 text-sm font-medium text-slate-100">
                            {getMeasurementLinkedResource(selectedMeasurement)?.name}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            {getMeasurementLinkedResource(selectedMeasurement)?.type} ·{" "}
                            {getMeasurementLinkedResource(selectedMeasurement)?.code || "No code"}
                          </div>
                        </div>
                      ) : (
                        <EmptyState
                          title="No item or assembly linked"
                          text="Use the folder-style picker to attach a library selection to this measurement."
                          action={
                            <button
                              type="button"
                              onClick={() =>
                                openPickerForMeasurement(selectedMeasurement.id, "item")
                              }
                              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
                            >
                              Open Picker
                            </button>
                          }
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="Select a measurement"
                    text="Choose a measurement from the drawing or the list below to link items and assemblies."
                  />
                )}

                <div className="space-y-2">
                  {activePageMeasurements.map((m) => {
                    const linked = getMeasurementLinkedResource(m);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedMeasurementId(m.id)}
                        className={cn(
                          "w-full rounded-2xl border p-3 text-left transition",
                          selectedMeasurementId === m.id
                            ? "border-sky-500/40 bg-slate-900"
                            : "border-slate-800 bg-slate-900/60 hover:bg-slate-900"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-slate-100">
                              {m.name || "Untitled"}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              Qty {formatNumber(computeFinalQuantity(m))}{" "}
                              {m.display_unit || m.unit || ""}
                            </div>
                          </div>
                          <div className="text-right text-xs text-slate-400">
                            {linked ? linked.type : "unlinked"}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {rightTab === "rules" ? (
              <div className="space-y-3">
                {selectedMeasurement ? (
                  <>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
                      <div className="text-sm font-semibold">Quantity Rules</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {selectedMeasurement.name || "Measurement"}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                      <label className="mb-1 block text-xs text-slate-400">Measurement name</label>
                      <input
                        value={selectedMeasurement.name || ""}
                        onChange={(e) => void renameMeasurement(e.target.value)}
                        className="mb-3 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none"
                      />

                      <label className="mb-1 block text-xs text-slate-400">Group</label>
                      <select
                        value={selectedMeasurement.group_id || ""}
                        onChange={(e) => void updateMeasurementGroup(e.target.value)}
                        className="mb-3 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none"
                      >
                        <option value="">No group</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>

                      <label className="mb-1 block text-xs text-slate-400">Multiplier</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={getDefaultRule(selectedMeasurement).multiplier}
                        onChange={(e) =>
                          void updateQuantityRule({
                            multiplier: Number(e.target.value || 1),
                          })
                        }
                        className="mb-3 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none"
                      />

                      <label className="mb-1 block text-xs text-slate-400">Waste %</label>
                      <input
                        type="number"
                        step="0.01"
                        value={getDefaultRule(selectedMeasurement).wastePercent}
                        onChange={(e) =>
                          void updateQuantityRule({
                            wastePercent: Number(e.target.value || 0),
                          })
                        }
                        className="mb-3 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none"
                      />

                      <label className="mb-1 block text-xs text-slate-400">Deduction</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={getDefaultRule(selectedMeasurement).deductionValue}
                        onChange={(e) =>
                          void updateQuantityRule({
                            deductionValue: Number(e.target.value || 0),
                          })
                        }
                        className="mb-3 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none"
                      />

                      <label className="mb-1 block text-xs text-slate-400">Formula note</label>
                      <textarea
                        value={getDefaultRule(selectedMeasurement).formulaNote}
                        onChange={(e) =>
                          void updateQuantityRule({
                            formulaNote: e.target.value,
                          })
                        }
                        rows={4}
                        className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none"
                      />

                      <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                        Final quantity: {formatNumber(computeFinalQuantity(selectedMeasurement))}{" "}
                        {selectedMeasurement.display_unit || selectedMeasurement.unit || ""}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void deleteMeasurement(selectedMeasurement.id)}
                      className="w-full rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-300 hover:bg-rose-500/20"
                    >
                      Delete Measurement
                    </button>
                  </>
                ) : (
                  <EmptyState
                    title="No measurement selected"
                    text="Select a measurement to edit multiplier, waste, deductions, and notes."
                  />
                )}
              </div>
            ) : null}

            {rightTab === "boq" ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
                  <div className="text-sm font-semibold">BOQ Sync Prep</div>
                  <div className="mt-1 text-xs text-slate-400">
                    Linked takeoff quantities ready for BOQ flow.
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                    <div>Total linked rows</div>
                    <div className="text-right">{boqSyncRows.length}</div>
                    <div>Groups with takeoff</div>
                    <div className="text-right">{groupedTotals.length}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  {boqSyncRows.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3"
                    >
                      <div className="text-sm font-medium text-slate-100">
                        {row.name}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {row.linked?.type} · {row.linked?.name}
                      </div>
                      <div className="mt-2 text-sm text-sky-300">
                        Qty {formatNumber(row.quantity)} {row.unit}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Group: {row.group?.name || "None"}
                      </div>
                    </div>
                  ))}
                </div>

                {!boqSyncRows.length ? (
                  <EmptyState
                    title="Nothing linked yet"
                    text="Link measurements to items or assemblies first so quantities can flow into BOQ."
                  />
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 border-t border-slate-800 pt-4">
              <div className="mb-2 text-sm font-semibold">Measurements</div>
              <div className="space-y-2">
                {activePageMeasurements.map((m) => {
                  const type = (m.tool_type || m.type || "line") as ToolMode;
                  const linked = getMeasurementLinkedResource(m);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMeasurementId(m.id)}
                      className={cn(
                        "w-full rounded-2xl border p-3 text-left transition",
                        selectedMeasurementId === m.id
                          ? "border-sky-500/40 bg-slate-900"
                          : "border-slate-800 bg-slate-900/60 hover:bg-slate-900"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-100">
                            {m.name || "Untitled"}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            {type.toUpperCase()} · {formatNumber(computeFinalQuantity(m))}{" "}
                            {m.display_unit || m.unit || ""}
                          </div>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          {linked ? linked.type : "unlinked"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {showCalibrationModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-slate-100">Calibrate Page</div>
                <div className="mt-1 text-sm text-slate-400">
                  Start closes this modal, lets you pick point 1 and point 2 on the drawing, then reopens here.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCalibrationModal(false)}
                className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-slate-300 hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 px-5 py-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Point 1
                  </div>
                  <div className="mt-2 text-sm text-slate-100">
                    {calibrationDraft.p1
                      ? `${formatNumber(calibrationDraft.p1.x, 1)}, ${formatNumber(
                          calibrationDraft.p1.y,
                          1
                        )}`
                      : "Not picked"}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Point 2
                  </div>
                  <div className="mt-2 text-sm text-slate-100">
                    {calibrationDraft.p2
                      ? `${formatNumber(calibrationDraft.p2.x, 1)}, ${formatNumber(
                          calibrationDraft.p2.y,
                          1
                        )}`
                      : "Not picked"}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="mb-3 text-sm font-medium text-slate-100">Real Distance</div>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">
                      {calibrationForm.unit === "ft" ? "Feet" : "Distance"}
                    </label>
                    <input
                      value={calibrationForm.feet}
                      onChange={(e) =>
                        setCalibrationForm((prev) => ({ ...prev, feet: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Inches</label>
                    <input
                      disabled={calibrationForm.unit !== "ft"}
                      value={calibrationForm.inches}
                      onChange={(e) =>
                        setCalibrationForm((prev) => ({ ...prev, inches: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none disabled:opacity-40"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Fraction</label>
                    <select
                      disabled={calibrationForm.unit !== "ft"}
                      value={calibrationForm.fraction}
                      onChange={(e) =>
                        setCalibrationForm((prev) => ({ ...prev, fraction: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none disabled:opacity-40"
                    >
                      {FRACTIONS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Unit</label>
                    <select
                      value={calibrationForm.unit}
                      onChange={(e) =>
                        setCalibrationForm((prev) => ({
                          ...prev,
                          unit: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                    >
                      <option value="ft">ft</option>
                      <option value="m">m</option>
                      <option value="in">in</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-400">
                  {isPickingCalibration
                    ? "Pick point 1 and point 2 on the drawing."
                    : calibrationReady
                    ? "Calibration points selected."
                    : "Press Start / Restart to begin point picking."}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={startCalibrationPicking}
                    className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
                  >
                    Start / Restart
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCalibrationDraft({ p1: null, p2: null });
                      setCalibrationForm({
                        feet: "",
                        inches: "",
                        fraction: "0",
                        unit: "ft",
                      });
                    }}
                    className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveCalibration()}
                    disabled={!calibrationReady}
                    className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    Save Calibration
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showPicker ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <div className="flex h-[85vh] w-full max-w-5xl flex-col rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-slate-100">
                  Folder-Style Library Picker
                </div>
                <div className="mt-1 text-sm text-slate-400">
                  Type → Category → {pickerType === "item" ? "Item" : "Assembly"} → link to measurement
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-slate-300 hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[180px_240px_minmax(0,1fr)]">
              <div className="border-r border-slate-800 p-4">
                <div className="mb-3 text-xs uppercase tracking-wide text-slate-500">
                  Step 1 · Type
                </div>
                <div className="space-y-2">
                  {[
                    { key: "item", label: "Items", icon: Package },
                    { key: "assembly", label: "Assemblies", icon: Boxes },
                  ].map((t) => {
                    const Icon = t.icon;
                    const active = pickerType === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => {
                          setPickerType(t.key as PickerType);
                          setPickerSelectedId("");
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-2xl border px-3 py-3 text-sm transition",
                          active
                            ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
                            : "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-800"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-r border-slate-800 p-4">
                <div className="mb-3 text-xs uppercase tracking-wide text-slate-500">
                  Step 2 · Category
                </div>
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="Search"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setPickerCategoryId("all")}
                    className={cn(
                      "w-full rounded-2xl border px-3 py-3 text-left text-sm transition",
                      pickerCategoryId === "all"
                        ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
                        : "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-800"
                    )}
                  >
                    All categories
                  </button>
                  {pickerFilteredCategories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setPickerCategoryId(c.id)}
                      className={cn(
                        "w-full rounded-2xl border px-3 py-3 text-left text-sm transition",
                        pickerCategoryId === c.id
                          ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
                          : "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-800"
                      )}
                    >
                      <div>{c.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{c.code || "—"}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Step 3 · {pickerType === "item" ? "Item" : "Assembly"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {pickerFilteredResources.length} result
                    {pickerFilteredResources.length === 1 ? "" : "s"}
                  </div>
                </div>

                <div className="min-h-0 space-y-2 overflow-auto">
                  {pickerFilteredResources.map((row: any) => {
                    const code =
                      pickerType === "item" ? row.item_code || "—" : row.assembly_code || "—";
                    const unit =
                      pickerType === "item" ? row.base_unit || "—" : row.output_unit || "—";
                    const selected = pickerSelectedId === row.id;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setPickerSelectedId(row.id)}
                        className={cn(
                          "w-full rounded-2xl border p-3 text-left transition",
                          selected
                            ? "border-sky-500/40 bg-sky-500/10"
                            : "border-slate-800 bg-slate-950 hover:bg-slate-800"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-slate-100">
                              {row.name}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              {code} · {unit}
                            </div>
                            {row.description ? (
                              <div className="mt-2 text-xs text-slate-500">
                                {row.description}
                              </div>
                            ) : null}
                          </div>
                          <div className="rounded-xl border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">
                            {pickerType}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-4">
                  <div className="text-sm text-slate-400">
                    {pickerSelectedId
                      ? "Selection ready to link to the current measurement."
                      : "Choose an item or assembly to continue."}
                  </div>
                  <button
                    type="button"
                    onClick={() => void applyPickerSelection()}
                    disabled={!pickerSelectedId}
                    className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    <Link2 className="mr-2 inline h-4 w-4" />
                    Link Selection
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}