import { buildAudioInputConstraints } from "./audioDevices";
import { getLocalMediaStream } from "./localMedia";
import { hasFormaDesktop } from "./formaDesktop";
import { isScreenCapturePermissionError } from "./screenCapturePermission";
import { readUserPreferences } from "./userPreferences";

const MIN_RECORDING_MS = 2000;

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
      "Screen capture stopped immediately. Check screen recording permissions.",
    );
  }
  return stream;
}

async function acquireViaDisplayMedia(): Promise<MediaStream> {
  requireDisplayMedia();

  // Fenêtre complète (pas seulement l'onglet / la surface in-app).
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
  });

  return assertLiveVideoTrack(stream);
}

async function acquireDisplayStream(): Promise<MediaStream> {
  if (hasFormaDesktop()) {
    requireDisplayMedia();
    try {
      return assertLiveVideoTrack(
        await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        }),
      );
    } catch (error) {
      if (isScreenCapturePermissionError(error)) throw error;
      return acquireViaElectronDesktop();
    }
  }
  return acquireViaDisplayMedia();
}
async function acquireViaElectronDesktop(): Promise<MediaStream> {
  const sourceId = await window.formaDesktop!.getAppWindowSourceId();
  if (!sourceId) {
    throw new Error(
      "Hall window not found. Allow Hall (or Electron) in screen recording settings.",
    );
  }

  try {
    return assertLiveVideoTrack(await acquireViaDesktopSourceId(sourceId));
  } catch (error) {
    if (isScreenCapturePermissionError(error)) throw error;
    return acquireViaDisplayMedia();
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
