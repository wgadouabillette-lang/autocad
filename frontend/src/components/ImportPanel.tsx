import { useState } from "react";
import { Upload, ScanLine, FileImage, Loader2 } from "lucide-react";
import { useStore } from "../store/useStore";
import { api } from "../lib/api";

export default function ImportPanel() {
  const { applyImport, material } = useStore();
  const [file, setFile] = useState<File | null>(null);
  const [realWidth, setRealWidth] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.importDrawing(
        file,
        realWidth ? parseFloat(realWidth) : null,
        6,
        material
      );
      applyImport(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3 gap-3">
      <div className="text-xs text-muted-400">
        Drop a <b>PDF, image, or scan</b>. Lyte detects outlines, holes, and
        displays the annotated 2D drawing.
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          drag ? "border-muted-400 bg-ink-750" : "border-ink-600 hover:border-ink-500"
        }`}
      >
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.bmp,.webp,.tif,.tiff"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        {file ? <FileImage className="text-muted-300" /> : <Upload className="text-muted-500" />}
        <div className="text-sm">
          {file ? file.name : "Click or drag a file here"}
        </div>
        <div className="text-[11px] text-muted-500">PDF · PNG · JPG · scan</div>
      </label>

      <label className="text-xs text-muted-400">
        Actual width (mm)
        <input
          className="input mt-1"
          placeholder="auto"
          value={realWidth}
          onChange={(e) => setRealWidth(e.target.value)}
        />
      </label>

      <button onClick={run} disabled={!file || busy} className="btn btn-primary justify-center">
        {busy ? <Loader2 className="animate-spin" size={16} /> : <ScanLine size={16} />}
        Analyze drawing
      </button>

      {error && (
        <div className="rounded-lg border border-ink-500 bg-ink-800 p-2 text-xs text-muted-200">
          {error}
        </div>
      )}
    </div>
  );
}
