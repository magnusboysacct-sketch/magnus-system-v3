export type Point = {
  x: number;
  y: number;
};

export type MeasurementType = "point" | "line" | "area" | "volume" | "count";

export type TakeoffTool =
  | "select"
  | "pan"
  | "line"
  | "area"
  | "point"
  | "count"
  | "volume";

export type Measurement = {
  id: string;
  type: MeasurementType;
  points: Point[];
  result: number;
  unit: string;
  label?: string;
  groupId?: string;
  color?: string;
  timestamp: number;
  linked_item_id?: string;
  linked_item_name?: string;
  linked_assembly_id?: string;
  linked_assembly_name?: string;
  linked_tag_ids?: string[];
  calculated_quantity?: number;
  meta?: {
    depthInches?: number;
    [key: string]: any;
  };
  pixelsPerUnit?: number;
};

export type MeasurementGroup = {
  id: string;
  name: string;
  color: string;
  trade?: string;
  visible: boolean;
  locked: boolean;
  sortOrder: number;
};

export type CalibrationState = {
  isCalibrated: boolean;
  point1: Point | null;
  point2: Point | null;
  realDistance: number;
  unit: "ft" | "in" | "m" | "cm";
  pixelsPerUnit: number;
};

export type PanZoomState = {
  zoom: number;
  panX: number;
  panY: number;
};

export type TakeoffState = {
  activeTool: TakeoffTool;
  measurements: Measurement[];
  groups: MeasurementGroup[];
  calibration: CalibrationState;
  panZoom: PanZoomState;
  selectedMeasurementId: string | null;
};
