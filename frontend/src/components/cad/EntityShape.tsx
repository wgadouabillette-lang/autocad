import type { DrawingEntity } from "../../lib/drawing/types";
import { arcPath } from "../../lib/drawing/geometry";
import { useThemePalette } from "../../hooks/useThemePalette";

interface Props {
  entity: DrawingEntity;
  selected: boolean;
}

export function EntityShape({ entity, selected }: Props) {
  const theme = useThemePalette();
  const stroke = selected ? theme.highlight : theme.textBright;
  const sw = selected ? 2 : 1.2;

  switch (entity.type) {
    case "line":
      return (
        <line
          x1={entity.x1}
          y1={-entity.y1}
          x2={entity.x2}
          y2={-entity.y2}
          stroke={stroke}
          strokeWidth={sw}
          vectorEffect="non-scaling-stroke"
        />
      );
    case "circle":
      return (
        <circle
          cx={entity.cx}
          cy={-entity.cy}
          r={entity.r}
          fill="none"
          stroke={stroke}
          strokeWidth={sw}
          vectorEffect="non-scaling-stroke"
        />
      );
    case "arc":
      return (
        <path
          d={arcPath(entity.cx, -entity.cy, entity.r, -entity.endAngle, -entity.startAngle)}
          fill="none"
          stroke={stroke}
          strokeWidth={sw}
          vectorEffect="non-scaling-stroke"
        />
      );
    case "polyline": {
      const pts = entity.points
        .map((v: number, i: number) => (i % 2 === 0 ? `${v},${-entity.points[i + 1]}` : ""))
        .filter(Boolean)
        .join(" ");
      if (entity.closed) {
        return (
          <polygon
            points={pts}
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            vectorEffect="non-scaling-stroke"
          />
        );
      }
      return (
        <polyline
          points={pts}
          fill="none"
          stroke={stroke}
          strokeWidth={sw}
          vectorEffect="non-scaling-stroke"
        />
      );
    }
  }
}
