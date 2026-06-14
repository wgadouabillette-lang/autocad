import type { DrawingEntity, Point2 } from "./types";

export const PX_PER_MM = 2.5;
export const GRID_MM = 5;

export function snap(v: number, step = GRID_MM) {
  return Math.round(v / step) * step;
}

export function snapPoint(p: Point2, step = GRID_MM): Point2 {
  return { x: snap(p.x, step), y: snap(p.y, step) };
}

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function dist(a: Point2, b: Point2) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Arc passant par 3 points (a, b sur l'arc, c). */
export function arcFrom3Points(a: Point2, b: Point2, c: Point2) {
  const d =
    2 *
    (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;

  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;

  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  const r = Math.hypot(a.x - cx, a.y - cy);
  let startAngle = Math.atan2(a.y - cy, a.x - cx);
  const midAngle = Math.atan2(b.y - cy, b.x - cx);
  let endAngle = Math.atan2(c.y - cy, c.x - cx);

  const sweep = ((endAngle - startAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const midRel = ((midAngle - startAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  if (midRel > sweep) {
    const tmp = startAngle;
    startAngle = endAngle;
    endAngle = tmp;
  }

  return { cx, cy, r, startAngle, endAngle };
}

export function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  let sweep = end - start;
  if (sweep < 0) sweep += 2 * Math.PI;
  const large = sweep > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

export function cloneEntity(e: DrawingEntity, id: string): DrawingEntity {
  return structuredClone({ ...e, id });
}

export function translateEntity(e: DrawingEntity, dx: number, dy: number): DrawingEntity {
  const c = structuredClone(e);
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

/** Symétrie par rapport à la droite (a → b). */
export function mirrorEntity(e: DrawingEntity, a: Point2, b: Point2, id: string): DrawingEntity {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const mirror = (p: Point2): Point2 => {
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    return { x: 2 * px - p.x, y: 2 * py - p.y };
  };

  const c = cloneEntity(e, id);
  switch (c.type) {
    case "line": {
      const p1 = mirror({ x: c.x1, y: c.y1 });
      const p2 = mirror({ x: c.x2, y: c.y2 });
      c.x1 = p1.x;
      c.y1 = p1.y;
      c.x2 = p2.x;
      c.y2 = p2.y;
      break;
    }
    case "circle": {
      const p = mirror({ x: c.cx, y: c.cy });
      c.cx = p.x;
      c.cy = p.y;
      break;
    }
    case "arc": {
      const p = mirror({ x: c.cx, y: c.cy });
      c.cx = p.x;
      c.cy = p.y;
      const ang = 2 * Math.atan2(dy, dx);
      c.startAngle = ang - c.startAngle;
      c.endAngle = ang - c.endAngle;
      [c.startAngle, c.endAngle] = [Math.min(c.startAngle, c.endAngle), Math.max(c.startAngle, c.endAngle)];
      break;
    }
    case "polyline": {
      const pts: number[] = [];
      for (let i = 0; i < c.points.length; i += 2) {
        const p = mirror({ x: c.points[i], y: c.points[i + 1] });
        pts.push(p.x, p.y);
      }
      c.points = pts;
      break;
    }
  }
  return c;
}

export function entityBounds(e: DrawingEntity) {
  switch (e.type) {
    case "line":
      return {
        minX: Math.min(e.x1, e.x2),
        minY: Math.min(e.y1, e.y2),
        maxX: Math.max(e.x1, e.x2),
        maxY: Math.max(e.y1, e.y2),
      };
    case "circle":
      return {
        minX: e.cx - e.r,
        minY: e.cy - e.r,
        maxX: e.cx + e.r,
        maxY: e.cy + e.r,
      };
    case "arc":
      return {
        minX: e.cx - e.r,
        minY: e.cy - e.r,
        maxX: e.cx + e.r,
        maxY: e.cy + e.r,
      };
    case "polyline": {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (let i = 0; i < e.points.length; i += 2) {
        minX = Math.min(minX, e.points[i]);
        maxX = Math.max(maxX, e.points[i]);
        minY = Math.min(minY, e.points[i + 1]);
        maxY = Math.max(maxY, e.points[i + 1]);
      }
      return { minX, minY, maxX, maxY };
    }
  }
}

export function hitTestEntity(e: DrawingEntity, p: Point2, tol = 4): boolean {
  switch (e.type) {
    case "line": {
      const dx = e.x2 - e.x1;
      const dy = e.y2 - e.y1;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - e.x1) * dx + (p.y - e.y1) * dy) / len2));
      const px = e.x1 + t * dx;
      const py = e.y1 + t * dy;
      return dist(p, { x: px, y: py }) <= tol;
    }
    case "circle":
      return Math.abs(dist(p, { x: e.cx, y: e.cy }) - e.r) <= tol;
    case "arc": {
      const d = dist(p, { x: e.cx, y: e.cy });
      if (Math.abs(d - e.r) > tol) return false;
      const ang = Math.atan2(p.y - e.cy, p.x - e.cx);
      let s = e.startAngle;
      let en = e.endAngle;
      if (en < s) en += 2 * Math.PI;
      let a = ang;
      if (a < s) a += 2 * Math.PI;
      return a >= s && a <= en;
    }
    case "polyline": {
      for (let i = 0; i < e.points.length - 2; i += 2) {
        const seg: DrawingEntity = {
          id: "",
          type: "line",
          layer: "",
          x1: e.points[i],
          y1: e.points[i + 1],
          x2: e.points[i + 2],
          y2: e.points[i + 3],
        };
        if (hitTestEntity(seg, p, tol)) return true;
      }
      if (e.closed && e.points.length >= 4) {
        const n = e.points.length;
        const seg: DrawingEntity = {
          id: "",
          type: "line",
          layer: "",
          x1: e.points[n - 2],
          y1: e.points[n - 1],
          x2: e.points[0],
          y2: e.points[1],
        };
        if (hitTestEntity(seg, p, tol)) return true;
      }
      return false;
    }
  }
}
