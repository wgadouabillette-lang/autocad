export type DrawingTool =
  | "select"
  | "line"
  | "circle"
  | "arc"
  | "polyline"
  | "move"
  | "copy"
  | "mirror";

export type EntityType = "line" | "circle" | "arc" | "polyline";

export interface BaseEntity {
  id: string;
  type: EntityType;
  layer: string;
}

export interface LineEntity extends BaseEntity {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CircleEntity extends BaseEntity {
  type: "circle";
  cx: number;
  cy: number;
  r: number;
}

export interface ArcEntity extends BaseEntity {
  type: "arc";
  cx: number;
  cy: number;
  r: number;
  startAngle: number;
  endAngle: number;
}

export interface PolylineEntity extends BaseEntity {
  type: "polyline";
  points: number[];
  closed: boolean;
}

export type DrawingEntity = LineEntity | CircleEntity | ArcEntity | PolylineEntity;

export interface DrawingDocument {
  name: string;
  units: "mm";
  entities: DrawingEntity[];
}

export interface Point2 {
  x: number;
  y: number;
}

export interface ToolSession {
  tool: DrawingTool;
  phase: number;
  points: Point2[];
  fromIds?: string[];
}

export const EMPTY_DRAWING: DrawingDocument = {
  name: "Untitled",
  units: "mm",
  entities: [],
};
