import { useCallback, useEffect, useRef, useState } from "react";
import { useDrawingStore } from "../../store/useDrawingStore";
import { useStore } from "../../store/useStore";
import { EntityShape } from "./EntityShape";
import {
  PX_PER_MM,
  GRID_MM,
  snapPoint,
  hitTestEntity,
  arcFrom3Points,
  arcPath,
} from "../../lib/drawing/geometry";
import type { Point2 } from "../../lib/drawing/types";
import { useThemePalette } from "../../hooks/useThemePalette";
import type { ThemePalette } from "../../lib/theme";

function worldFromEvent(
  e: React.MouseEvent | MouseEvent,
  rect: DOMRect,
  panX: number,
  panY: number,
  zoom: number,
): Point2 {
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const cx = rect.width / 2 + panX;
  const cy = rect.height / 2 + panY;
  const scale = zoom * PX_PER_MM;
  return {
    x: (sx - cx) / scale,
    y: -(sy - cy) / scale,
  };
}

export default function CadCanvas() {
  const theme = useThemePalette();
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [dragging, setDragging] = useState<
    null | { kind: "pan" | "move"; lastX: number; lastY: number; origin?: Point2; moved?: boolean }
  >(null);

  const drawing = useDrawingStore((s) => s.drawing);
  const entities = drawing.entities;
  const activeTool = useDrawingStore((s) => s.activeTool);
  const toolSession = useDrawingStore((s) => s.toolSession);
  const selectedIds = useDrawingStore((s) => s.selectedIds);
  const snapEnabled = useDrawingStore((s) => s.snapEnabled);
  const showGrid = useDrawingStore((s) => s.showGrid);
  const showReference = useDrawingStore((s) => s.showReference);
  const cursor = useDrawingStore((s) => s.cursor);
  const panX = useDrawingStore((s) => s.panX);
  const panY = useDrawingStore((s) => s.panY);
  const zoom = useDrawingStore((s) => s.zoom);
  const toolHint = useDrawingStore((s) => s.toolHint);

  const pushPoint = useDrawingStore((s) => s.pushPoint);
  const setCursor = useDrawingStore((s) => s.setCursor);
  const panBy = useDrawingStore((s) => s.panBy);
  const zoomAt = useDrawingStore((s) => s.zoomAt);
  const selectIds = useDrawingStore((s) => s.selectIds);
  const toggleSelect = useDrawingStore((s) => s.toggleSelect);
  const deleteSelected = useDrawingStore((s) => s.deleteSelected);
  const cancelTool = useDrawingStore((s) => s.cancelTool);
  const finishPolyline = useDrawingStore((s) => s.finishPolyline);
  const moveSelection = useDrawingStore((s) => s.moveSelection);
  const commitHistory = useDrawingStore((s) => s.commitHistory);

  const visionPreview = useStore((s) => s.visionPreview);

  const scale = zoom * PX_PER_MM;
  const cx = size.w / 2 + panX;
  const cy = size.h / 2 + panY;

  const applySnap = useCallback(
    (p: Point2) => (snapEnabled ? snapPoint(p) : p),
    [snapEnabled],
  );

  const pointerWorld = useCallback(
    (e: React.MouseEvent) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return applySnap(worldFromEvent(e, rect, panX, panY, zoom));
    },
    [applySnap, panX, panY, zoom],
  );

  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") cancelTool();
      if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
      if (e.key === "Enter" && activeTool === "polyline") finishPolyline(false);
      if ((e.key === "c" || e.key === "C") && activeTool === "polyline") finishPolyline(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTool, cancelTool, deleteSelected, finishPolyline]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    zoomAt(factor);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
      setDragging({ kind: "pan", lastX: e.clientX, lastY: e.clientY });
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    const p = pointerWorld(e);
    if (!p) return;

    if (activeTool === "select" || activeTool === "move") {
      const tol = 6 / scale;
      let hit: string | null = null;
      for (let i = entities.length - 1; i >= 0; i--) {
        if (hitTestEntity(entities[i], p, tol)) {
          hit = entities[i].id;
          break;
        }
      }
      if (hit) {
        if (!e.shiftKey && !selectedIds.includes(hit)) selectIds([hit]);
        else if (e.shiftKey) toggleSelect(hit);
        if (activeTool === "move" || activeTool === "select") {
          setDragging({ kind: "move", lastX: e.clientX, lastY: e.clientY, origin: p, moved: false });
        }
      } else if (!e.shiftKey) {
        selectIds([]);
      }
      return;
    }

    if (activeTool === "polyline") {
      pushPoint(p);
      return;
    }

    pushPoint(p);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const p = pointerWorld(e);
    if (p) setCursor(p);

    if (dragging?.kind === "pan") {
      panBy(e.clientX - dragging.lastX, e.clientY - dragging.lastY);
      setDragging({ ...dragging, lastX: e.clientX, lastY: e.clientY });
      return;
    }

    if (dragging?.kind === "move" && dragging.origin && p) {
      const dx = p.x - dragging.origin.x;
      const dy = p.y - dragging.origin.y;
      if (Math.hypot(dx, dy) > 0.5) {
        if (moveSelection(dx, dy)) {
          setDragging({ ...dragging, origin: p, moved: true });
        }
      }
    }
  };

  const handlePointerUp = () => {
    if (dragging?.kind === "move" && dragging.moved) commitHistory();
    setDragging(null);
  };

  const gridLines = [];
  const span = Math.max(size.w, size.h) / scale + GRID_MM * 4;
  const step = GRID_MM;
  const ox = Math.floor(-span / step) * step;
  const oy = Math.floor(-span / step) * step;
  if (showGrid) {
    for (let x = ox; x <= span; x += step) {
      gridLines.push(
        <line
          key={`gx-${x}`}
          x1={x}
          y1={-span}
          x2={x}
          y2={span}
          stroke={Math.abs(x % (step * 5)) < 0.1 ? theme.gridSection : theme.gridCell}
          strokeWidth={0.5}
          vectorEffect="non-scaling-stroke"
        />,
      );
    }
    for (let y = oy; y <= span; y += step) {
      gridLines.push(
        <line
          key={`gy-${y}`}
          x1={-span}
          y1={-y}
          x2={span}
          y2={-y}
          stroke={Math.abs(y % (step * 5)) < 0.1 ? theme.gridSection : theme.gridCell}
          strokeWidth={0.5}
          vectorEffect="non-scaling-stroke"
        />,
      );
    }
  }

  const sessionPoints = toolSession?.points ?? [];
  const preview = cursor && sessionPoints.length > 0 ? renderPreview(activeTool, sessionPoints, cursor, theme) : null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink-900">
      <svg
        ref={svgRef}
        className="h-full w-full touch-none select-none"
        style={{ cursor: dragging?.kind === "pan" ? "grabbing" : "crosshair" }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          setCursor(null);
          setDragging(null);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <g transform={`translate(${cx}, ${cy}) scale(${scale})`}>
          {showReference && visionPreview && (
            <image
              href={visionPreview}
              x={-150}
              y={-100}
              width={300}
              height={200}
              opacity={0.35}
              preserveAspectRatio="xMidYMid meet"
            />
          )}
          {gridLines}
          <line x1={-20} y1={0} x2={20} y2={0} stroke={theme.border} strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
          <line x1={0} y1={-20} x2={0} y2={20} stroke={theme.border} strokeWidth={0.3} vectorEffect="non-scaling-stroke" />

          {entities.map((e) => (
            <g key={e.id}>
              <EntityShape entity={e} selected={selectedIds.includes(e.id)} />
            </g>
          ))}

          {preview}
          {sessionPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={-p.y} r={3 / scale} fill={theme.highlight} />
          ))}
        </g>
      </svg>

      <div className="pointer-events-none absolute left-3 top-2 rounded-md bg-ink-850/90 px-2.5 py-1 text-[11px] text-muted-300 border border-ink-700">
        {toolHint}
      </div>
    </div>
  );
}

function renderPreview(tool: string, points: Point2[], cursor: Point2, theme: ThemePalette) {
  const stroke = theme.highlight;
  const dash = "4 3";

  if (tool === "line" && points.length === 1) {
    const a = points[0];
    return (
      <line
        x1={a.x}
        y1={-a.y}
        x2={cursor.x}
        y2={-cursor.y}
        stroke={stroke}
        strokeDasharray={dash}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (tool === "circle" && points.length === 1) {
    const r = Math.hypot(cursor.x - points[0].x, cursor.y - points[0].y);
    return (
      <circle
        cx={points[0].x}
        cy={-points[0].y}
        r={r}
        fill="none"
        stroke={stroke}
        strokeDasharray={dash}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (tool === "arc") {
    if (points.length === 1) {
      const a = points[0];
      return (
        <line
          x1={a.x}
          y1={-a.y}
          x2={cursor.x}
          y2={-cursor.y}
          stroke={stroke}
          strokeDasharray={dash}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      );
    }
    if (points.length === 2) {
      const arc = arcFrom3Points(points[0], points[1], cursor);
      if (!arc) return null;
      return (
        <path
          d={arcPath(arc.cx, -arc.cy, arc.r, -arc.endAngle, -arc.startAngle)}
          fill="none"
          stroke={stroke}
          strokeDasharray={dash}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      );
    }
  }

  if (tool === "polyline" && points.length >= 1) {
    const last = points[points.length - 1];
    const pts = [...points, cursor].map((p) => `${p.x},${-p.y}`).join(" ");
    return (
      <>
        <polyline
          points={pts}
          fill="none"
          stroke={stroke}
          strokeDasharray={dash}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={last.x}
          y1={-last.y}
          x2={cursor.x}
          y2={-cursor.y}
          stroke={stroke}
          strokeDasharray={dash}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </>
    );
  }

  if (tool === "mirror" || tool === "copy") {
    if (points.length === 1) {
      const a = points[0];
      return (
        <line
          x1={a.x}
          y1={-a.y}
          x2={cursor.x}
          y2={-cursor.y}
          stroke={theme.accentStrong}
          strokeDasharray={dash}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      );
    }
  }

  return null;
}
