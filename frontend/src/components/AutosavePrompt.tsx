import { useStore } from "../store/useStore";

export default function AutosavePrompt() {
  const pending = useStore((s) => s.pendingAutosave);
  const restore = useStore((s) => s.restoreAutosave);
  const dismiss = useStore((s) => s.dismissAutosave);

  if (!pending) return null;

  const date = new Date(pending.savedAt).toLocaleString("en-US");
  const name = pending.document.name || "Untitled";
  const count = pending.document.features.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="panel w-full max-w-sm p-4 shadow-2xl">
        <h2 className="text-sm font-semibold text-muted-100">Resume session?</h2>
        <p className="mt-2 text-xs text-muted-400">
          An autosave was found ({date}).
        </p>
        <p className="mt-1 text-xs text-muted-300">
          <span className="font-medium">{name}</span> — {count} feature{count !== 1 ? "s" : ""}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost text-xs" onClick={dismiss}>
            New session
          </button>
          <button type="button" className="btn btn-primary text-xs" onClick={() => void restore()}>
            Resume
          </button>
        </div>
      </div>
    </div>
  );
}
