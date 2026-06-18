import { api } from "./api";

export interface RecapComposerDraft {
  kind: "recording" | "import";
  recordingId?: string;
  file?: File;
  label: string;
  durationMs?: number;
}

export interface RecapNoteResult {
  title: string;
  bodyHtml: string;
  transcript?: string;
}

export function isRecapDraftReady(draft: RecapComposerDraft | null): boolean {
  if (!draft) return false;
  if (draft.kind === "recording") return !!draft.recordingId;
  return !!draft.file;
}

export function recapProcessingLabel(fileSizeBytes: number, durationMs?: number): string {
  const minutes = durationMs ? Math.max(1, Math.round(durationMs / 60_000)) : null;
  if (minutes && minutes >= 8) return "Analyzing a long recording — this may take a few minutes…";
  if (fileSizeBytes > 40 * 1024 * 1024) return "Uploading and analyzing your video…";
  if (minutes && minutes >= 3) return "Transcribing and writing your recap…";
  return "Creating your recap note…";
}

export function estimateRecapMinDurationMs(fileSizeBytes: number, durationMs?: number): number {
  const fromSize = Math.min(fileSizeBytes / 80_000, 90_000);
  const fromDuration = durationMs ? Math.min(durationMs / 8, 120_000) : 0;
  return 2_500 + Math.max(fromSize, fromDuration);
}

export async function generateRecapNote(input: {
  blob: Blob;
  filename: string;
  title: string;
  durationMs?: number;
  signal?: AbortSignal;
}): Promise<RecapNoteResult> {
  const started = Date.now();
  const minWait = estimateRecapMinDurationMs(input.blob.size, input.durationMs);

  const result = await api.recap({
    file: input.blob,
    filename: input.filename,
    title: input.title,
    durationMs: input.durationMs ?? 0,
    signal: input.signal,
  });

  const elapsed = Date.now() - started;
  if (elapsed < minWait) {
    await new Promise((resolve) => window.setTimeout(resolve, minWait - elapsed));
  }

  return {
    title: result.title || input.title,
    bodyHtml: result.body_html,
    transcript: result.transcript,
  };
}

export async function resolveRecapBlob(draft: RecapComposerDraft): Promise<{
  blob: Blob;
  filename: string;
  title: string;
  durationMs?: number;
}> {
  if (draft.kind === "import" && draft.file) {
    return {
      blob: draft.file,
      filename: draft.file.name,
      title: draft.label || "Imported recording",
      durationMs: draft.durationMs,
    };
  }
  if (draft.kind === "recording" && draft.recordingId) {
    const { loadRecordingBlob } = await import("./recordingsStorage");
    const blob = await loadRecordingBlob(draft.recordingId);
    if (!blob) throw new Error("Recording not found on this device.");
    const ext = blob.type.includes("webm") ? "webm" : "mp4";
    return {
      blob,
      filename: `${draft.recordingId}.${ext}`,
      title: draft.label,
      durationMs: draft.durationMs,
    };
  }
  throw new Error("No recording selected.");
}
