import { hasFormaDesktop } from "./formaDesktop";
import { isScreenCapturePermissionError } from "./screenCapturePermission";

const MIN_RECORDING_MS = 2000;

let recorder: MediaRecorder | null = null;
let captureStream: MediaStream | null = null;
let chunks: Blob[] = [];
let startedAt = 0;
let trackEndedHandler: (() => void) | null = null;

function requireDisplayMedia() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("L'enregistrement d'écran n'est pas disponible dans ce navigateur.");
  }
}

async function acquireViaDesktopSourceId(sourceId: string): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: false,
    video: {
      // @ts-expect-error — contraintes Chromium / Electron
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId,
      },
    },
  };
  return navigator.mediaDevices.getUserMedia(constraints);
}

function assertLiveVideoTrack(stream: MediaStream): MediaStream {
  const track = stream.getVideoTracks()[0];
  if (!track || track.readyState === "ended") {
    stream.getTracks().forEach((item) => item.stop());
    throw new Error(
      "La capture d'écran s'est arrêtée immédiatement. Vérifiez la permission d'enregistrement d'écran.",
    );
  }
  return stream;
}

async function acquireViaDisplayMedia(): Promise<MediaStream> {
  requireDisplayMedia();

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
    ...(hasFormaDesktop()
      ? {}
      : {
          preferCurrentTab: true,
          selfBrowserSurface: "include",
          surfaceSwitching: "exclude",
          monitorTypeSurfaces: "exclude",
        }),
  } as DisplayMediaStreamOptions);

  return assertLiveVideoTrack(stream);
}

async function acquireViaElectronDesktop(): Promise<MediaStream> {
  const sourceId = await window.formaDesktop!.getAppWindowSourceId();
  if (!sourceId) {
    throw new Error(
      "Fenêtre Lyte introuvable. Autorisez Lyte (ou Electron) dans l'enregistrement d'écran.",
    );
  }

  try {
    return assertLiveVideoTrack(await acquireViaDesktopSourceId(sourceId));
  } catch (error) {
    if (isScreenCapturePermissionError(error)) throw error;
    return acquireViaDisplayMedia();
  }
}

async function acquireAppCaptureStream(): Promise<MediaStream> {
  if (hasFormaDesktop()) {
    return acquireViaElectronDesktop();
  }
  return acquireViaDisplayMedia();
}

function pickMimeType(): string | undefined {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function isAppScreenRecording(): boolean {
  return recorder?.state === "recording";
}

export function getRecordingElapsedMs(): number {
  if (!startedAt) return 0;
  return Math.max(0, Date.now() - startedAt);
}

function releaseCaptureStream() {
  const track = captureStream?.getVideoTracks()[0];
  if (track && trackEndedHandler) {
    track.removeEventListener("ended", trackEndedHandler);
  }
  trackEndedHandler = null;
  captureStream?.getTracks().forEach((item) => item.stop());
  captureStream = null;
}

function dispatchCaptureEnded() {
  window.dispatchEvent(new CustomEvent("forma-app-recording-ended"));
}

function dispatchCaptureLost() {
  window.dispatchEvent(new CustomEvent("forma-app-recording-lost"));
}

export async function startAppScreenRecording(): Promise<void> {
  if (isAppScreenRecording()) return;

  captureStream = await acquireAppCaptureStream();
  chunks = [];
  startedAt = Date.now();

  const mimeType = pickMimeType();
  recorder = new MediaRecorder(
    captureStream,
    mimeType ? { mimeType } : undefined,
  );

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const track = captureStream.getVideoTracks()[0];
  trackEndedHandler = () => {
    if (getRecordingElapsedMs() < MIN_RECORDING_MS) {
      dispatchCaptureLost();
      return;
    }
    dispatchCaptureEnded();
  };
  track?.addEventListener("ended", trackEndedHandler);

  recorder.start(1000);
}

export async function abortAppScreenRecording(): Promise<void> {
  if (recorder && recorder.state !== "inactive") {
    try {
      recorder.stop();
    } catch {
      // ignore
    }
  }
  recorder = null;
  chunks = [];
  startedAt = 0;
  releaseCaptureStream();
}

export async function stopAppScreenRecording(): Promise<{
  blob: Blob;
  durationMs: number;
}> {
  if (!recorder) {
    throw new Error("Aucun enregistrement en cours.");
  }

  const durationMs = getRecordingElapsedMs();

  const blob = await new Promise<Blob>((resolve, reject) => {
    const active = recorder;
    if (!active) {
      reject(new Error("Enregistreur indisponible."));
      return;
    }

    active.onstop = () => {
      const type = active.mimeType || "video/webm";
      resolve(new Blob(chunks, { type }));
    };
    active.onerror = () => reject(new Error("Erreur pendant l'enregistrement."));

    if (active.state === "inactive") {
      const type = active.mimeType || "video/webm";
      resolve(new Blob(chunks, { type }));
      return;
    }

    active.stop();
  });

  recorder = null;
  chunks = [];
  startedAt = 0;
  releaseCaptureStream();

  return { blob, durationMs };
}

export function isRecordingTooShort(durationMs: number, blob: Blob): boolean {
  return durationMs < MIN_RECORDING_MS || blob.size < 1024;
}
