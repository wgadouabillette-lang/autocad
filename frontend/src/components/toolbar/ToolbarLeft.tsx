import { Redo2, Undo2 } from "lucide-react";
import ImportPartButton from "./ImportPartButton";
import { useDrawingStore } from "../../store/useDrawingStore";

export default function ToolbarLeft() {
  const undo = useDrawingStore((s) => s.undo);
  const redo = useDrawingStore((s) => s.redo);
  const canUndo = useDrawingStore((s) => s.canUndo);
  const canRedo = useDrawingStore((s) => s.canRedo);

  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-1">
      <div className="flex items-center gap-0.5">
        <button className="toolbar-btn" onClick={() => undo()} disabled={!canUndo()} title="Undo">
          <Undo2 size={14} />
        </button>
        <button className="toolbar-btn" onClick={() => redo()} disabled={!canRedo()} title="Redo">
          <Redo2 size={14} />
        </button>
      </div>
      <ImportPartButton />
    </div>
  );
}
