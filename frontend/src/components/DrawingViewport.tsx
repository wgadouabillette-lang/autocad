import { ScanLine } from "lucide-react";
import { useStore } from "../store/useStore";

export default function DrawingViewport() {
  const visionPreview = useStore((s) => s.visionPreview);
  const importReport = useStore((s) => s.importReport);
  const document = useStore((s) => s.document);

  return (
    <div className="relative flex h-full w-full flex-col bg-ink-900">
      {visionPreview ? (
        <div className="flex flex-1 min-h-0 flex-col items-center justify-center overflow-auto p-6">
          <img
            src={visionPreview}
            alt="Analyzed drawing"
            className="max-h-full max-w-full rounded-lg border border-ink-700 object-contain shadow-lg"
          />
          {importReport && (
            <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-muted-400">
              <span>
                {importReport.detected_size_mm.map((d) => d.toFixed(0)).join(" × ")} mm
              </span>
              <span>{importReport.profile_points} vertices</span>
              <span>{importReport.holes} hole{importReport.holes !== 1 ? "s" : ""}</span>
              <span>{importReport.scale_mm_per_px.toFixed(3)} mm/px</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-ink-700 bg-ink-850">
            <ScanLine size={28} className="text-muted-500" />
          </div>
          <p className="text-sm text-muted-300">No drawing open</p>
          <p className="mt-2 max-w-sm text-xs text-muted-500">
            Import a PDF, image, or scan via the panel on the right to analyze your
            2D technical drawing.
          </p>
          {document.name !== "Untitled" && (
            <p className="mt-3 text-[11px] text-muted-500">{document.name}</p>
          )}
        </div>
      )}
    </div>
  );
}
