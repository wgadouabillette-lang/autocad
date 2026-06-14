import { Crosshair } from "lucide-react";
import { useDrawingStore } from "../store/useDrawingStore";

export default function StatusBar() {
  const cursor = useDrawingStore((s) => s.cursor);
  const entities = useDrawingStore((s) => s.drawing.entities);
  const selectedIds = useDrawingStore((s) => s.selectedIds);
  const activeTool = useDrawingStore((s) => s.activeTool);
  const snapEnabled = useDrawingStore((s) => s.snapEnabled);

  const toolLabels: Record<string, string> = {
    select: "Select",
    line: "Line",
    circle: "Circle",
    arc: "Arc",
    polyline: "Polyline",
    move: "Move",
    copy: "Copy",
    mirror: "Mirror",
  };

  return (
    <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex items-center gap-4 bg-gradient-to-t from-ink-900/95 to-transparent px-4 py-2 text-[11px] text-muted-300">
      <span className="font-medium text-muted-200">{toolLabels[activeTool] ?? activeTool}</span>
      {cursor && (
        <span className="flex items-center gap-1.5 font-mono">
          <Crosshair size={12} />
          X {cursor.x.toFixed(1)} · Y {cursor.y.toFixed(1)} mm
        </span>
      )}
      <span className="text-muted-400">
        {entities.length} entit{entities.length !== 1 ? "ies" : "y"}
        {selectedIds.length > 0 && ` · ${selectedIds.length} selected`}
      </span>
      <span className="ml-auto font-mono opacity-60">
        mm {snapEnabled ? "· snap" : ""}
      </span>
    </div>
  );
}
