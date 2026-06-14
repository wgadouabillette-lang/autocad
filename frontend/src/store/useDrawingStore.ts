import { create } from "zustand";
import type { DrawingDocument, DrawingEntity, DrawingTool, Point2, ToolSession } from "../lib/drawing/types";
import { EMPTY_DRAWING } from "../lib/drawing/types";
import { mirrorEntity, uid, arcFrom3Points } from "../lib/drawing/geometry";

interface DrawingState {
  drawing: DrawingDocument;
  activeTool: DrawingTool;
  toolSession: ToolSession | null;
  selectedIds: string[];
  snapEnabled: boolean;
  showGrid: boolean;
  showReference: boolean;
  cursor: Point2 | null;
  panX: number;
  panY: number;
  zoom: number;
  history: DrawingDocument[];
  historyIndex: number;
  historySkip: boolean;
  toolHint: string;

  setTool: (tool: DrawingTool) => void;
  setCursor: (p: Point2 | null) => void;
  setView: (panX: number, panY: number, zoom: number) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (factor: number) => void;
  toggleSnap: () => void;
  toggleGrid: () => void;
  toggleReference: () => void;
  selectIds: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  deleteSelected: () => void;
  addEntity: (e: DrawingEntity) => void;
  addEntities: (entities: DrawingEntity[]) => void;
  pushPoint: (p: Point2) => void;
  cancelTool: () => void;
  finishPolyline: (closed?: boolean) => void;
  moveSelection: (dx: number, dy: number) => boolean;
  commitHistory: () => void;
  recordHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  resetDrawing: () => void;
  loadDrawing: (doc: DrawingDocument) => void;
  getDrawingSnapshot: () => DrawingDocument;
}

const TOOL_HINTS: Record<DrawingTool, string> = {
  select: "Click to select · Drag to move · Delete to erase",
  line: "Click: start point · Click: end point",
  circle: "Click: center · Click: radius",
  arc: "Click: start · Click: point on arc · Click: end",
  polyline: "Click: vertices · Enter to finish · C to close",
  move: "Select objects, then drag, or click base → destination",
  copy: "Click: base point · Click: destination point",
  mirror: "Click: first axis point · Click: second axis point",
};

function hintFor(tool: DrawingTool, phase: number, selected: number) {
  if (tool === "mirror" && selected === 0) return "Select objects, then choose the mirror axis";
  if (tool === "copy" && selected === 0) return "Select objects to copy";
  if (tool === "move" && selected === 0) return "Select objects to move";
  const base = TOOL_HINTS[tool];
  if (phase > 0 && tool !== "select") return `${base} (${phase})`;
  return base;
}

function translateEntity(e: DrawingEntity, dx: number, dy: number, id?: string): DrawingEntity {
  const c = structuredClone(e);
  if (id) c.id = id;
  switch (c.type) {
    case "line":
      c.x1 += dx;
      c.y1 += dy;
      c.x2 += dx;
      c.y2 += dy;
      break;
    case "circle":
    case "arc":
      c.cx += dx;
      c.cy += dy;
      break;
    case "polyline":
      c.points = c.points.map((v, i) => v + (i % 2 === 0 ? dx : dy));
      break;
  }
  return c;
}

export const useDrawingStore = create<DrawingState>((set, get) => ({
  drawing: structuredClone(EMPTY_DRAWING),
  activeTool: "line",
  toolSession: null,
  selectedIds: [],
  snapEnabled: true,
  showGrid: true,
  showReference: true,
  cursor: null,
  panX: 0,
  panY: 0,
  zoom: 1,
  history: [structuredClone(EMPTY_DRAWING)],
  historyIndex: 0,
  historySkip: false,
  toolHint: TOOL_HINTS.line,

  setTool: (tool) => {
    set({
      activeTool: tool,
      toolSession: { tool, phase: 0, points: [] },
      toolHint: hintFor(tool, 0, get().selectedIds.length),
    });
  },

  setCursor: (p) => set({ cursor: p }),

  setView: (panX, panY, zoom) => set({ panX, panY, zoom: Math.max(0.1, Math.min(20, zoom)) }),

  panBy: (dx, dy) => set((s) => ({ panX: s.panX + dx, panY: s.panY + dy })),

  zoomAt: (factor) => {
    set((s) => ({ zoom: Math.max(0.1, Math.min(20, s.zoom * factor)) }));
  },

  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleReference: () => set((s) => ({ showReference: !s.showReference })),

  selectIds: (ids) => set({ selectedIds: ids }),

  toggleSelect: (id) => {
    const cur = get().selectedIds;
    if (cur.includes(id)) {
      set({ selectedIds: cur.filter((x) => x !== id) });
    } else {
      set({ selectedIds: [...cur, id] });
    }
  },

  clearSelection: () => set({ selectedIds: [] }),

  deleteSelected: () => {
    const { selectedIds, drawing } = get();
    if (selectedIds.length === 0) return;
    const ids = new Set(selectedIds);
    set({
      drawing: { ...drawing, entities: drawing.entities.filter((e) => !ids.has(e.id)) },
      selectedIds: [],
    });
    get().recordHistory();
  },

  addEntity: (e) => {
    const { drawing } = get();
    set({ drawing: { ...drawing, entities: [...drawing.entities, e] } });
    get().recordHistory();
  },

  addEntities: (entities) => {
    const { drawing } = get();
    set({ drawing: { ...drawing, entities: [...drawing.entities, ...entities] } });
    get().recordHistory();
  },

  pushPoint: (p) => {
    const { activeTool, toolSession, drawing, selectedIds } = get();
    const session = toolSession ?? { tool: activeTool, phase: 0, points: [] };
    const points = [...session.points, p];

    if (activeTool === "line" && points.length === 2) {
      get().addEntity({
        id: uid("line"),
        type: "line",
        layer: "0",
        x1: points[0].x,
        y1: points[0].y,
        x2: points[1].x,
        y2: points[1].y,
      });
      set({ toolSession: { tool: activeTool, phase: 0, points: [] }, toolHint: hintFor(activeTool, 0, selectedIds.length) });
      return;
    }

    if (activeTool === "circle" && points.length === 2) {
      const r = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      if (r > 0.01) {
        get().addEntity({
          id: uid("circle"),
          type: "circle",
          layer: "0",
          cx: points[0].x,
          cy: points[0].y,
          r,
        });
      }
      set({ toolSession: { tool: activeTool, phase: 0, points: [] }, toolHint: hintFor(activeTool, 0, selectedIds.length) });
      return;
    }

    if (activeTool === "arc" && points.length === 3) {
      const arc = arcFrom3Points(points[0], points[1], points[2]);
      if (arc) {
        get().addEntity({
          id: uid("arc"),
          type: "arc",
          layer: "0",
          ...arc,
        });
      }
      set({ toolSession: { tool: activeTool, phase: 0, points: [] }, toolHint: hintFor(activeTool, 0, selectedIds.length) });
      return;
    }

    if (activeTool === "copy" && points.length === 2) {
      const ids = selectedIds.length > 0 ? selectedIds : session.fromIds ?? [];
      const dx = points[1].x - points[0].x;
      const dy = points[1].y - points[0].y;
      const copies = drawing.entities
        .filter((e) => ids.includes(e.id))
        .map((e) => translateEntity(e, dx, dy, uid(e.type)));
      if (copies.length) get().addEntities(copies);
      set({ toolSession: { tool: activeTool, phase: 0, points: [] }, toolHint: hintFor(activeTool, 0, selectedIds.length) });
      return;
    }

    if (activeTool === "mirror" && points.length === 2) {
      const ids = selectedIds.length > 0 ? selectedIds : session.fromIds ?? [];
      const mirrored = drawing.entities
        .filter((e) => ids.includes(e.id))
        .map((e) => mirrorEntity(e, points[0], points[1], uid(e.type)));
      if (mirrored.length) get().addEntities(mirrored);
      set({ toolSession: { tool: activeTool, phase: 0, points: [] }, toolHint: hintFor(activeTool, 0, selectedIds.length) });
      return;
    }

    set({
      toolSession: { ...session, tool: activeTool, phase: session.phase + 1, points },
      toolHint: hintFor(activeTool, session.phase + 1, selectedIds.length),
    });
  },

  cancelTool: () => {
    const { activeTool, selectedIds } = get();
    set({
      toolSession: { tool: activeTool, phase: 0, points: [] },
      toolHint: hintFor(activeTool, 0, selectedIds.length),
    });
  },

  finishPolyline: (closed = false) => {
    const { toolSession, activeTool } = get();
    if (activeTool !== "polyline" || !toolSession || toolSession.points.length < 2) {
      get().cancelTool();
      return;
    }
    const flat = toolSession.points.flatMap((p) => [p.x, p.y]);
    get().addEntity({
      id: uid("polyline"),
      type: "polyline",
      layer: "0",
      points: flat,
      closed,
    });
    set({ toolSession: { tool: activeTool, phase: 0, points: [] } });
  },

  moveSelection: (dx, dy) => {
    const { selectedIds, drawing } = get();
    if (selectedIds.length === 0 || (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6)) return false;
    const ids = new Set(selectedIds);
    const entities = drawing.entities.map((e) =>
      ids.has(e.id) ? translateEntity(e, dx, dy, e.id) : e,
    );
    set({ drawing: { ...drawing, entities } });
    return true;
  },

  commitHistory: () => get().recordHistory(),

  recordHistory: () => {
    if (get().historySkip) return;
    const doc = structuredClone(get().drawing);
    let { history, historyIndex } = get();
    history = history.slice(0, historyIndex + 1);
    history.push(doc);
    if (history.length > 80) history.shift();
    else historyIndex += 1;
    set({ history, historyIndex });
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const idx = historyIndex - 1;
    set({
      historySkip: true,
      historyIndex: idx,
      drawing: structuredClone(history[idx]),
      selectedIds: [],
    });
    set({ historySkip: false });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const idx = historyIndex + 1;
    set({
      historySkip: true,
      historyIndex: idx,
      drawing: structuredClone(history[idx]),
      selectedIds: [],
    });
    set({ historySkip: false });
  },

  resetDrawing: () => {
    const empty = structuredClone(EMPTY_DRAWING);
    set({
      drawing: empty,
      selectedIds: [],
      history: [empty],
      historyIndex: 0,
      toolSession: { tool: get().activeTool, phase: 0, points: [] },
    });
  },

  loadDrawing: (doc) => {
    const d = structuredClone(doc);
    set({
      drawing: d,
      selectedIds: [],
      history: [d],
      historyIndex: 0,
    });
  },

  getDrawingSnapshot: () => structuredClone(get().drawing),
}));
