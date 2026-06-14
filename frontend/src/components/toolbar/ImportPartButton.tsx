import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { useStore } from "../../store/useStore";

const ACCEPT = ".stl,.obj,.ply,.off,.glb,.gltf,.3mf";

export default function ImportPartButton() {
  const importPartFile = useStore((s) => s.importPartFile);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await importPartFile(file);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const title = error
    ? `Error: ${error}`
    : "Import 3D part (STL, OBJ, PLY, GLB, 3MF…)";

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="toolbar-btn shrink-0"
        title={title}
        aria-label="Import 3D part"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
      </button>
    </>
  );
}
