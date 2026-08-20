import clsx from "clsx";
import { Download, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { loadRecordingBlob } from "../../lib/recordingsStorage";
import { useStore } from "../../store/useStore";

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function extensionForBlob(blob: Blob): string {
  const type = blob.type.toLowerCase();
  if (type.includes("mp4")) return "mp4";
  if (type.includes("quicktime") || type.includes("mov")) return "mov";
  return "webm";
}

function safeFilename(title: string | undefined, ext: string): string {
  const base = (title || "Meetra-recording")
    .replace(/[^\w\s\-().]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "Meetra-recording"}.${ext}`;
}

export default function RecordingPlaybackView() {
  const activeChatTabId = useStore((s) => s.activeChatTabId);
  const openChatTabs = useStore((s) => s.openChatTabs);
  const chatSessions = useStore((s) => s.chatSessions);
  const deleteRecordingSession = useStore((s) => s.deleteRecordingSession);

  const session =
    openChatTabs.find((t) => t.id === activeChatTabId) ??
    chatSessions.find((s) => s.id === activeChatTabId);

  const recordingId = session?.recordingId;
  const sessionId = session?.id;
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!recordingId) {
      setUrl(null);
      setBlob(null);
      setError("Enregistrement introuvable.");
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    void loadRecordingBlob(recordingId)
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded) {
          setError(
            "Fichier vidéo introuvable. Réenregistrez si l'enregistrement date d'avant la synchronisation cloud.",
          );
          setUrl(null);
          setBlob(null);
          return;
        }
        objectUrl = URL.createObjectURL(loaded);
        setBlob(loaded);
        setUrl(objectUrl);
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [recordingId]);

  const handleDelete = async () => {
    if (!sessionId || deleting) return;
    setDeleting(true);
    try {
      await deleteRecordingSession(sessionId);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleDownload = () => {
    if (!blob || !url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = safeFilename(session?.title, extensionForBlob(blob));
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="recording-playback">
      <header className="recording-playback__header">
        <div className="recording-playback__meta min-w-0">
          <h2 className="truncate text-sm font-medium text-muted-100">
            {session?.title ?? "Recording"}
          </h2>
          {session?.durationMs != null && (
            <p className="mt-0.5 text-[11px] text-muted-500">
              Duration {formatDuration(session.durationMs)}
            </p>
          )}
        </div>
        <button
          type="button"
          className="recording-playback__delete"
          onClick={() => setConfirmDelete(true)}
          aria-label="Delete recording"
          title="Delete recording"
          disabled={!sessionId || deleting}
        >
          <Trash2 size={14} strokeWidth={2} aria-hidden />
        </button>
      </header>

      <div className="recording-playback__body">
        {error && <p className="text-xs text-muted-500">{error}</p>}
        {!error && !url && (
          <p className="text-xs text-muted-500">Loading recording…</p>
        )}
        {url && (
          <>
            <video
              className="recording-playback__video w-full rounded-xl bg-ink-900"
              src={url}
              controls
              playsInline
            />
            <button
              type="button"
              className="recording-playback__download"
              onClick={handleDownload}
              disabled={!blob}
            >
              <Download size={14} strokeWidth={2.25} aria-hidden />
              Download
            </button>
          </>
        )}
      </div>

      {confirmDelete && (
        <div className="recording-playback__confirm" role="dialog" aria-modal="true">
          <p className="recording-playback__confirm-title">Delete this recording?</p>
          <p className="recording-playback__confirm-body">
            This will permanently delete the recording from your account. This cannot be undone.
          </p>
          <div className="recording-playback__confirm-actions">
            <button
              type="button"
              className="recording-playback__confirm-btn"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className={clsx(
                "recording-playback__confirm-btn",
                "recording-playback__confirm-btn--danger",
              )}
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
