// src/pages/TakeoffPage.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  ChevronLeft,
  ChevronRight,
  Compass,
  FileDigit,
  FileText,
  Gauge,
  Layers3,
  Link2,
  Maximize2,
  Minimize2,
  MousePointer2,
  PencilRuler,
  Plus,
  RefreshCcw,
  Ruler,
  Save,
  Search,
  Settings,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";

type MainTab = "drawings" | "measurements" | "details" | "boq" | "settings";
type DrawMode = "pan" | "calibration" | "line" | "area" | "count";
type UnitType = "ft" | "m" | "in" | "mm";

type Point = {
  x: number;
  y: number;
};

type CalibrationDraft = {
  p1: Point | null;
  p2: Point | null;
  distanceText: string;
  unit: UnitType;
};

type CalibrationForm = {
  feet: string;
  inches: string;
  fraction: string;
  unit: UnitType;
};

type CalibrationState = {
  p1: Point | null;
  p2: Point | null;
  distance: number;
  unit: UnitType;
  scale: number;
};

type MeasurementRow = {
  id: string;
  type: "line" | "area" | "count";
  label: string;
  unit: string;
  value: number;
  points: Point[];
  description?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  source?: "db" | "local";
};

type TakeoffSessionRow = {
  id: string;
  company_id?: string | null;
  project_id?: string | null;
  drawing_id?: string | null;
  name?: string | null;
  status?: string | null;
  pdf_url?: string | null;
  pdf_name?: string | null;
  pdf_path?: string | null;
  pdf_storage_path?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type PageDataShape = {
  previewUrl?: string | null;
  fileName?: string | null;
  detailNotes?: string | null;
  boqLink?: string | null;
  rotation?: number | null;
  [key: string]: any;
};

type TakeoffPageRow = {
  id: string;
  project_id?: string | null;
  drawing_id?: string | null;
  page_number: number;
  calibration_scale?: number | null;
  calibration_unit?: string | null;
  calibration_p1?: Point | null;
  calibration_p2?: Point | null;
  page_data?: PageDataShape | null;
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

type ViewerClickCapture =
  | { mode: "calibration"; points: Point[] }
  | { mode: "line"; points: Point[] }
  | { mode: "area"; points: Point[] }
  | { mode: "count"; points: Point[] }
  | null;

type ProjectRow = {
  id: string;
  company_id?: string | null;
  name?: string | null;
  project_name?: string | null;
  title?: string | null;
  is_active?: boolean | null;
};

const TAB_OPTIONS: Array<{
  key: MainTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "drawings", label: "Drawings", icon: FileText },
  { key: "measurements", label: "Measurements", icon: Ruler },
  { key: "details", label: "Extracted Details", icon: FileDigit },
  { key: "boq", label: "BOQ Links", icon: Link2 },
  { key: "settings", label: "Settings", icon: Settings },
];

const FRACTION_OPTIONS = [
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

const DEFAULT_CALIBRATION_FORM: CalibrationForm = {
  feet: "",
  inches: "",
  fraction: "0",
  unit: "ft",
};

const DEFAULT_CALIBRATION_DRAFT: CalibrationDraft = {
  p1: null,
  p2: null,
  distanceText: "1",
  unit: "ft",
};

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function fractionToDecimal(value: string): number {
  if (!value || value === "0") return 0;
  const [a, b] = value.split("/").map(Number);
  if (!a || !b) return 0;
  return a / b;
}

function calibrationFormToDistance(form: CalibrationForm): number {
  if (form.unit === "ft") {
    const feet = Number(form.feet || 0);
    const inches = Number(form.inches || 0);
    const frac = fractionToDecimal(form.fraction || "0");
    return feet + (inches + frac) / 12;
  }
  if (form.unit === "in") {
    const inches = Number(form.inches || 0);
    const frac = fractionToDecimal(form.fraction || "0");
    return inches + frac;
  }
  return Number(form