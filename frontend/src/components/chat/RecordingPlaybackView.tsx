import { useEffect, useState } from "react";
import { loadRecordingBlob } from "../../lib/recordingsStorage";
import { useStore } from "../../store/useStore";

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export default function RecordingPlaybackView() {
  const activeChatTabId = useStore((s) => s.activeChatTabId);
  const openChatTabs = useStore((s) => s.openChatTabs);
  const chatSessions = useStore((s) => s.chatSessions);

  const session =
    openChatTabs.find((t) => t.id === activeChatTabId) ??
    chatSessions.find((s) => s.id === activeChatTabId);

  const recordingId = session?.recordingId;
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recordingId) {
      setUrl(null);
      setError("Enregistrement introuvable.");
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    void loadRecordingBlob(recordingId)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setError("Fichier d'enregistrement introuvable.");
          setUrl(null);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
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

  return (
    <div className="recording-playback flex h-full min-h-0 flex-col">
      <header className="recording-playback__header shrink-0 border-b border-ink-700 px-3 py-2.5">
        <h2 className="truncate text-sm font-medium text-muted-100">{session?.title ?? "Enregistrement"}</h2>
        {session?.durationMs != null && (
          <p className="mt-0.5 text-[11px] text-muted-500">
            Durée {formatDuration(session.durationMs)}
          </p>
        )}
      </header>

      <div className="recording-playback__body flex min-h-0 flex-1 items-center justify-center p-3">
        {error && <p className="text-center text-xs text-muted-500">{error}</p>}
        {!error && !url && (
          <p className="text-center text-xs text-muted-500">Chargement de l&apos;enregistrement…</p>
        )}
        {url && (
          <video
            className="recording-playback__video max-h-full w-full rounded-xl bg-ink-900"
            src={url}
            controls
            playsInline
          />
        )}
      </div>
    </div>
  );
}
