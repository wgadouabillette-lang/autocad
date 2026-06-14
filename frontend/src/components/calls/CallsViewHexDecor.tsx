import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";

const EXP_K = 2.6;
const CURVE_TOP = 0.4;
const COORD_SCALE = 100;
const CURVE_SAMPLES = 140;

type Point = [number, number];
type Edge = [number, number, number, number];

function expHeight(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return CURVE_TOP;
  const ceiling = Math.exp(EXP_K);
  return (CURVE_TOP * (Math.exp(EXP_K * t) - 1)) / (ceiling - 1);
}

function expHeightDeriv(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  const ceiling = Math.exp(EXP_K);
  return (CURVE_TOP * EXP_K * Math.exp(EXP_K * t)) / (ceiling - 1);
}

function snapCoord(value: number): number {
  return Math.round(value * COORD_SCALE) / COORD_SCALE;
}

function vertexKey(x: number, y: number): string {
  return `${snapCoord(x)},${snapCoord(y)}`;
}

function edgeKey(x1: number, y1: number, x2: number, y2: number): string {
  const p1 = vertexKey(x1, y1);
  const p2 = vertexKey(x2, y2);
  return p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
}

function smoothstep(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

interface HexGrid {
  r: number;
  colStep: number;
  rowStep: number;
  leftInset: number;
}

function createHexGrid(width: number, height: number): HexGrid {
  const r = Math.max(10, Math.min(width, height) * 0.024);
  const colStep = Math.sqrt(3) * r;
  return {
    r,
    colStep,
    rowStep: 1.5 * r,
    leftInset: colStep / 2,
  };
}

function pointyTopVertices(cx: number, cy: number, r: number): Point[] {
  const hw = (Math.sqrt(3) / 2) * r;
  const hh = r / 2;
  return [
    [cx, cy - r],
    [cx + hw, cy - hh],
    [cx + hw, cy + hh],
    [cx, cy + r],
    [cx - hw, cy + hh],
    [cx - hw, cy - hh],
  ];
}

function curveLimitBottomLeft(x: number, width: number, height: number): number {
  const t = Math.min(1, Math.max(0, x / width));
  return expHeight(t) * height;
}

function curveLimitTopLeft(x: number, width: number, height: number): number {
  const t = Math.min(1, Math.max(0, 1 - x / width));
  return expHeight(t) * height;
}

function curvePointBottomLeft(i: number, width: number, height: number) {
  const t = i / CURVE_SAMPLES;
  return {
    x: t * width,
    y: height - expHeight(t) * height,
  };
}

function curvePointTopLeft(i: number, width: number, height: number) {
  const t = 1 - i / CURVE_SAMPLES;
  return {
    x: (1 - t) * width,
    y: expHeight(t) * height,
  };
}

function inwardNormalBottomLeft(i: number, width: number, height: number) {
  const t = i / CURVE_SAMPLES;
  const dxdt = width / CURVE_SAMPLES;
  const dydt = (-height * expHeightDeriv(t)) / CURVE_SAMPLES;
  let nx = -dydt;
  let ny = dxdt;
  const len = Math.hypot(nx, ny) || 1;
  nx /= len;
  ny /= len;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { nx, ny };
}

function inwardNormalTopLeft(i: number, width: number, height: number) {
  const t = 1 - i / CURVE_SAMPLES;
  const dxdt = width / CURVE_SAMPLES;
  const dydt = (height * expHeightDeriv(t)) / CURVE_SAMPLES;
  let nx = -dydt;
  let ny = dxdt;
  const len = Math.hypot(nx, ny) || 1;
  nx /= len;
  ny /= len;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return { nx, ny };
}

function buildHoneycombMeshBottom(width: number, height: number): Edge[] {
  if (width <= 0 || height <= 0) return [];

  const grid = createHexGrid(width, height);
  const vertices = new Map<string, Point>();
  const edges = new Map<string, Edge>();

  const getVertex = (x: number, y: number): Point => {
    const key = vertexKey(x, y);
    const existing = vertices.get(key);
    if (existing) return existing;
    const point: Point = [snapCoord(x), snapCoord(y)];
    vertices.set(key, point);
    return point;
  };

  const addEdge = (x1: number, y1: number, x2: number, y2: number) => {
    const key = edgeKey(x1, y1, x2, y2);
    if (edges.has(key)) return;
    const [sx1, sy1] = getVertex(x1, y1);
    const [sx2, sy2] = getVertex(x2, y2);
    edges.set(key, [sx1, sy1, sx2, sy2]);
  };

  const addHex = (cx: number, cy: number) => {
    const ring = pointyTopVertices(cx, cy, grid.r);
    for (let j = 0; j < ring.length; j++) {
      const [x1, y1] = ring[j];
      const [x2, y2] = ring[(j + 1) % ring.length];
      addEdge(x1, y1, x2, y2);
    }
  };

  const colCount = Math.ceil(width / grid.colStep) + 2;
  const rowCount = Math.ceil(height / grid.rowStep) + 2;

  for (let row = 0; row < rowCount; row++) {
    const cy = height - grid.r - row * grid.rowStep;
    if (cy + grid.r < 0) break;

    for (let col = -1; col < colCount; col++) {
      const cx = grid.colStep * (col + 0.5 * (row % 2)) + grid.leftInset;
      if (cx < -grid.colStep || cx > width + grid.colStep) continue;

      const topFromBottom = height - (cy - grid.r);
      if (topFromBottom > curveLimitBottomLeft(cx, width, height) + 0.5) continue;

      addHex(cx, cy);
    }
  }

  return [...edges.values()];
}

function buildHoneycombMeshTop(width: number, height: number): Edge[] {
  if (width <= 0 || height <= 0) return [];

  const grid = createHexGrid(width, height);
  const vertices = new Map<string, Point>();
  const edges = new Map<string, Edge>();

  const getVertex = (x: number, y: number): Point => {
    const key = vertexKey(x, y);
    const existing = vertices.get(key);
    if (existing) return existing;
    const point: Point = [snapCoord(x), snapCoord(y)];
    vertices.set(key, point);
    return point;
  };

  const addEdge = (x1: number, y1: number, x2: number, y2: number) => {
    const key = edgeKey(x1, y1, x2, y2);
    if (edges.has(key)) return;
    const [sx1, sy1] = getVertex(x1, y1);
    const [sx2, sy2] = getVertex(x2, y2);
    edges.set(key, [sx1, sy1, sx2, sy2]);
  };

  const addHex = (cx: number, cy: number) => {
    const ring = pointyTopVertices(cx, cy, grid.r);
    for (let j = 0; j < ring.length; j++) {
      const [x1, y1] = ring[j];
      const [x2, y2] = ring[(j + 1) % ring.length];
      addEdge(x1, y1, x2, y2);
    }
  };

  const colCount = Math.ceil(width / grid.colStep) + 2;
  const rowCount = Math.ceil(height / grid.rowStep) + 2;

  for (let row = 0; row < rowCount; row++) {
    const cy = grid.r + row * grid.rowStep;
    if (cy - grid.r > height) break;

    for (let col = -1; col < colCount; col++) {
      const cx = grid.colStep * (col + 0.5 * (row % 2)) + grid.leftInset;
      if (cx < -grid.colStep || cx > width + grid.colStep) continue;

      const bottomFromTop = cy + grid.r;
      if (bottomFromTop > curveLimitTopLeft(cx, width, height) + 0.5) continue;

      addHex(cx, cy);
    }
  }

  return [...edges.values()];
}

function edgesToPath(edges: Edge[]): string {
  return edges
    .map(([x1, y1, x2, y2]) => `M${x1},${y1}L${x2},${y2}`)
    .join("");
}

function polylineToPath(points: Point[]): string {
  return points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${snapCoord(x)},${snapCoord(y)}`)
    .join("");
}

function buildOffsetPolylineBottom(
  distance: number,
  width: number,
  height: number,
): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    const { x, y } = curvePointBottomLeft(i, width, height);
    const { nx, ny } = inwardNormalBottomLeft(i, width, height);
    points.push([x + nx * distance, y + ny * distance]);
  }
  return points;
}

function buildOffsetPolylineTop(
  distance: number,
  width: number,
  height: number,
): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    const { x, y } = curvePointTopLeft(i, width, height);
    const { nx, ny } = inwardNormalTopLeft(i, width, height);
    points.push([x + nx * distance, y + ny * distance]);
  }
  return points;
}

function buildAnnulusPath(outer: Point[], inner: Point[]): string {
  const forward = polylineToPath(outer);
  const backward = [...inner]
    .reverse()
    .map(([x, y]) => `L${snapCoord(x)},${snapCoord(y)}`)
    .join("");
  return `${forward}${backward}Z`;
}

interface MaskStrip {
  path: string;
  opacity: number;
}

function buildCurveGradientMaskBottom(
  width: number,
  height: number,
  fadeRange: number,
): MaskStrip[] {
  const stripStep = Math.max(3, fadeRange / 28);
  const distances: number[] = [];
  for (let d = 0; d < fadeRange; d += stripStep) {
    distances.push(d);
  }
  distances.push(fadeRange);

  const strips: MaskStrip[] = [];

  for (let i = 0; i < distances.length - 1; i++) {
    const d0 = distances[i];
    const d1 = distances[i + 1];
    const outer = buildOffsetPolylineBottom(d0, width, height);
    const inner = buildOffsetPolylineBottom(d1, width, height);
    const mid = (d0 + d1) / 2;
    strips.push({
      path: buildAnnulusPath(outer, inner),
      opacity: smoothstep(mid / fadeRange),
    });
  }

  const lastOffset = buildOffsetPolylineBottom(fadeRange, width, height);
  strips.push({
    path: `${polylineToPath(lastOffset)} L${snapCoord(width)},${snapCoord(height)} L0,${snapCoord(height)} Z`,
    opacity: 1,
  });

  return strips;
}

function buildCurveGradientMaskTop(
  width: number,
  height: number,
  fadeRange: number,
): MaskStrip[] {
  const stripStep = Math.max(3, fadeRange / 28);
  const distances: number[] = [];
  for (let d = 0; d < fadeRange; d += stripStep) {
    distances.push(d);
  }
  distances.push(fadeRange);

  const strips: MaskStrip[] = [];

  for (let i = 0; i < distances.length - 1; i++) {
    const d0 = distances[i];
    const d1 = distances[i + 1];
    const outer = buildOffsetPolylineTop(d0, width, height);
    const inner = buildOffsetPolylineTop(d1, width, height);
    const mid = (d0 + d1) / 2;
    strips.push({
      path: buildAnnulusPath(outer, inner),
      opacity: smoothstep(mid / fadeRange),
    });
  }

  const lastOffset = buildOffsetPolylineTop(fadeRange, width, height);
  strips.push({
    path: `${polylineToPath(lastOffset)} L${snapCoord(width)},0 L0,0 Z`,
    opacity: 1,
  });

  return strips;
}

export default function CallsViewHexDecor() {
  const decorRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const uid = useId().replace(/:/g, "");
  const maskBottomId = `calls-hex-mask-bottom-${uid}`;
  const maskTopId = `calls-hex-mask-top-${uid}`;

  useLayoutEffect(() => {
    const host = decorRef.current?.parentElement;
    if (!host) return;

    const update = () => {
      const rect = host.getBoundingClientRect();
      setSize({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const decor = useMemo(() => {
    const width = size.width;
    const height = size.height;
    const grid = createHexGrid(width, height);
    const fadeRange = grid.rowStep * 7;

    return {
      bottomPath: edgesToPath(buildHoneycombMeshBottom(width, height)),
      topPath: edgesToPath(buildHoneycombMeshTop(width, height)),
      bottomMask: buildCurveGradientMaskBottom(width, height, fadeRange),
      topMask: buildCurveGradientMaskTop(width, height, fadeRange),
    };
  }, [size.width, size.height]);

  return (
    <div ref={decorRef} className="calls-view__hex-decor" aria-hidden>
      {size.width > 0 && size.height > 0 && (
        <svg
          className="calls-view__hex-svg"
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
        >
          <defs>
            <mask id={maskBottomId}>
              {decor.bottomMask.map((strip, index) => (
                <path
                  key={`bottom-${index}`}
                  d={strip.path}
                  fill="white"
                  fillOpacity={strip.opacity}
                />
              ))}
            </mask>
            <mask id={maskTopId}>
              {decor.topMask.map((strip, index) => (
                <path
                  key={`top-${index}`}
                  d={strip.path}
                  fill="white"
                  fillOpacity={strip.opacity}
                />
              ))}
            </mask>
          </defs>
          {decor.bottomPath && (
            <path
              className="calls-view__hex-mesh"
              d={decor.bottomPath}
              mask={`url(#${maskBottomId})`}
            />
          )}
          {decor.topPath && (
            <path
              className="calls-view__hex-mesh"
              d={decor.topPath}
              mask={`url(#${maskTopId})`}
            />
          )}
        </svg>
      )}
    </div>
  );
}
