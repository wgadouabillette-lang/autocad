import { buildAudioInputConstraints } from "./audioDevices";
import { getLocalMediaStream } from "./localMedia";
import { hasFormaDesktop } from "./formaDesktop";
import {
  getScreenCaptureAccessInfo,
  isScreenCapturePermissionError,
  openScreenCaptureSettings,
  screenCaptureSettingsHint,
} from "./screenCapturePermission";
import { ensureDesktopScreenCaptureAllowed } from "./screenShareMedia";
import { readUserPreferences } from "./userPreferences";

const MIN_RECORDING_MS = 2000;

/**
 * Recording must capture the full desktop/monitor so other apps (Chrome, Finder…)
 * stay in the video when the user leaves Meetra. Never fall back to Meetra-window-only.
 */

let recorder: MediaRecorder | null = null;
let captureStream: MediaStream | null = null;
let displayStream: MediaStream | null = null;
let micStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let chunks: Blob[] = [];
let startedAt = 0;
let trackEndedHandler: (() => void) | null = null;

function requireDisplayMedia() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Screen recording is not available in this browser.");
  }
}

async function acquireViaDesktopSourceId(sourceId: string): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: false,
    video: {
      // @ts-expect-error — Chromium / Electron constraints
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
      "La capture d'écran s'est arrêtée immédiatement. Vérifiez les autorisations d'enregistrement d'écran.",
    );
  }
  return stream;
}

/** Reject window/tab picks so recording always follows the whole screen. */
function assertFullScreenCapture(stream: MediaStream): MediaStream {
  const track = assertLiveVideoTrack(stream).getVideoTracks()[0];
  if (!track) return stream;
  const surface = track.getSettings().displaySurface;
  if (surface === "window" || surface === "browser" || surface === "application") {
    stream.getTracks().forEach((item) => item.stop());
    throw new Error(
      "Choisissez « Écran entier » (pas une fenêtre ni un onglet) pour enregistrer tout ce que vous ouvrez.",
    );
  }
  return stream;
}

async function acquireViaDisplayMedia(): Promise<MediaStream> {
  requireDisplayMedia();

  // Full desktop / monitor — not a single app tab or Meetra window.
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      // Chromium may ignore unknown keys; keep displaySurface as a soft hint.
      displaySurface: "monitor",
    } as MediaTrackConstraints,
    audio: true,
    preferCurrentTab: false,
    // Chromium: discourage current-tab / window-only picks.
    selfBrowserSurface: "exclude",
    surfaceSwitching: "exclude",
    monitorTypeSurfaces: "include",
  } as DisplayMediaStreamOptions);

  return assertFullScreenCapture(stream);
}

async function acquireDisplayStream(): Promise<MediaStream> {
  await ensureDesktopScreenCaptureAllowed();

  if (hasFormaDesktop()) {
    requireDisplayMedia();
    try {
      // Desktop main process auto-grants the primary monitor (full desktop).
      return assertFullScreenCapture(
        await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: "monitor",
          } as MediaTrackConstraints,
          audio: true,
          preferCurrentTab: false,
        } as DisplayMediaStreamOptions),
      );
    } catch (error) {
      if (isScreenCapturePermissionError(error)) {
        void openScreenCaptureSettings();
        const info = await getScreenCaptureAccessInfo();
        throw new Error(
          info
            ? screenCaptureSettingsHint(info.platform)
            : "Autorisez l'enregistrement d'écran pour Meetra dans les réglages système.",
        );
      }
      return acquireViaElectronDesktop();
    }
  }
  return acquireViaDisplayMedia();
}

async function acquireViaElectronDesktop(): Promise<MediaStream> {
  // Screen only — never Meetra window. Window capture would freeze on Meetra when
  // the user switches to Chrome / another app.
  const sourceId = await window.formaDesktop?.getPreferredScreenSourceId?.();
  if (!sourceId || !sourceId.startsWith("screen:")) {
    throw new Error(
      "Aucun écran disponible. Autorisez Meetra dans les réglages d'enregistrement d'écran.",
    );
  }

  try {
    return assertLiveVideoTrack(await acquireViaDesktopSourceId(sourceId));
  } catch (error) {
    if (isScreenCapturePermissionError(error)) {
      void openScreenCaptureSettings();
      const info = await getScreenCaptureAccessInfo();
      throw new Error(
        info
          ? screenCaptureSettingsHint(info.platform)
          : "Autorisez l'enregistrement d'écran pour Meetra dans les réglages système.",
      );
    }
    throw error;
  }
}

async function acquireMicrophoneStream(): Promise<MediaStream | null> {
  const shared = getLocalMediaStream();
  const liveTrack = shared?.getAudioTracks().find((track) => track.readyState === "live");
  if (liveTrack) {
    return new MediaStream([liveTrack]);
  }

  if (!navigator.mediaDevices?.getUserMedia) return null;
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: buildAudioInputConstraints(readUserPreferences()),
      video: false,
    });
  } catch {
    return null;
  }
}

async function buildRecordingStream(): Promise<MediaStream> {
  displayStream = await acquireDisplayStream();
  micStream = await acquireMicrophoneStream();

  const videoTracks = displayStream.getVideoTracks();
  const audioTracks = [
    ...displayStream.getAudioTracks(),
    ...(micStream?.getAudioTracks() ?? []),
  ];

  if (audioTracks.length === 0) {
    captureStream = displayStream;
    return captureStream;
  }

  audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();

  for (const track of audioTracks) {
    const source = audioContext.createMediaStreamSource(new MediaStream([track]));
    source.connect(destination);
  }

  captureStream = new MediaStream([...videoTracks, ...destination.stream.getAudioTracks()]);
  return captureStream;
}

function pickMimeType(hasAudio: boolean): string | undefined {
  const candidates = hasAudio
    ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
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
  const track = captureStream?.getVideoTracks()[0] ?? displayStream?.getVideoTracks()[0];
  if (track && trackEndedHandler) {
    track.removeEventListener("ended", trackEndedHandler);
  }
  trackEndedHandler = null;

  captureStream?.getTracks().forEach((item) => item.stop());
  captureStream = null;

  displayStream?.getTracks().forEach((item) => item.stop());
  displayStream = null;

  micStream?.getTracks().forEach((item) => {
    const shared = getLocalMediaStream();
    if (shared?.getTrackById(item.id)) return;
    item.stop();
  });
  micStream = null;

  if (audioContext) {
    void audioContext.close();
    audioContext = null;
  }
}

function dispatchCaptureEnded() {
  window.dispatchEvent(new CustomEvent("forma-app-recording-ended"));
}

function dispatchCaptureLost() {
  window.dispatchEvent(new CustomEvent("forma-app-recording-lost"));
}

export async function startAppScreenRecording(): Promise<void> {
  if (isAppScreenRecording()) return;

  const stream = await buildRecordingStream();
  chunks = [];
  startedAt = Date.now();

  const hasAudio = stream.getAudioTracks().length > 0;
  const mimeType = pickMimeType(hasAudio);
  recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const track = stream.getVideoTracks()[0];
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
    throw new Error("No recording in progress.");
  }

  const durationMs = getRecordingElapsedMs();

  const blob = await new Promise<Blob>((resolve, reject) => {
    const active = recorder;
    if (!active) {
      reject(new Error("Recorder unavailable."));
      return;
    }

    active.onstop = () => {
      const type = active.mimeType || "video/webm";
      resolve(new Blob(chunks, { type }));
    };
    active.onerror = () => reject(new Error("Error while recording."));

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
