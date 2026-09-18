import { buildAudioInputConstraints, buildVideoInputConstraints } from "./audioDevices";
import {
  destroyCameraBackgroundProcessor,
  getCameraBackgroundProcessor,
  type CameraBackgroundMode,
} from "./cameraBackgroundProcessor";
import { loadCameraBackgroundImage } from "./cameraBackgroundStorage";
import { readUserPreferences } from "./userPreferences";

let stream: MediaStream | null = null;
let onAudioTrackLostHandler: (() => void) | null = null;
const boundAudioTrackIds = new Set<string>();
let backgroundMode: CameraBackgroundMode = "none";

function requireMediaDevices() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Accès micro/caméra non disponible dans ce navigateur.");
  }
}

export function getLocalMediaStream(): MediaStream | null {
  return stream;
}

export function hasLocalMediaStream(): boolean {
  return stream !== null;
}

export function hasLiveAudioTrack(target: MediaStream | null = stream): boolean {
  return target?.getAudioTracks().some((track) => track.readyState === "live") ?? false;
}

export function setLocalMediaAudioRecoveryHandler(handler: (() => void) | null): void {
  onAudioTrackLostHandler = handler;
}

function bindAudioTrackRecovery(track: MediaStreamTrack): void {
  if (boundAudioTrackIds.has(track.id)) return;
  boundAudioTrackIds.add(track.id);
  track.addEventListener("ended", () => {
    boundAudioTrackIds.delete(track.id);
    onAudioTrackLostHandler?.();
  });
}

function pruneDeadAudioTracks(): void {
  stream?.getAudioTracks().forEach((track) => {
    if (track.readyState !== "ended") return;
    stream!.removeTrack(track);
    boundAudioTrackIds.delete(track.id);
  });
}

function rebuildStreamWithVideo(videoTrack: MediaStreamTrack | null): MediaStream {
  const audioTracks = stream?.getAudioTracks().filter((t) => t.readyState === "live") ?? [];
  const tracks: MediaStreamTrack[] = [...audioTracks];
  if (videoTrack && videoTrack.readyState === "live") {
    tracks.push(videoTrack);
  }
  stream = new MediaStream(tracks);
  stream.getAudioTracks().forEach(bindAudioTrackRecovery);
  return stream;
}

async function restoreBackgroundImageIfNeeded(): Promise<void> {
  if (backgroundMode !== "image") return;
  try {
    const blob = await loadCameraBackgroundImage();
    if (blob) {
      await getCameraBackgroundProcessor().setBackgroundImage(blob);
    }
  } catch (error) {
    console.warn("[cameraBackground] restore image failed", error);
  }
}

async function publishProcessedCamera(rawTrack: MediaStreamTrack): Promise<MediaStream> {
  const processor = getCameraBackgroundProcessor();
  await restoreBackgroundImageIfNeeded();
  await processor.setMode(backgroundMode);
  const output = await processor.attachRawTrack(rawTrack);
  return rebuildStreamWithVideo(output);
}

export async function applyCameraBackgroundSettings(
  mode: CameraBackgroundMode,
): Promise<void> {
  backgroundMode = mode;
  await getCameraBackgroundProcessor().setMode(mode);
}

export async function refreshCameraBackgroundOutput(): Promise<MediaStream | null> {
  if (!stream) return null;
  const processor = getCameraBackgroundProcessor();
  await restoreBackgroundImageIfNeeded();

  let raw = processor.getRawTrack();
  if (!raw || raw.readyState !== "live") {
    if (backgroundMode === "none") {
      const live =
        stream.getVideoTracks().find((track) => track.readyState === "live") ?? null;
      return live ? rebuildStreamWithVideo(live) : stream;
    }
    // Output-only track on stream — reacquire a raw camera track for processing.
    const videoStream = await navigator.mediaDevices.getUserMedia({
      video: buildVideoInputConstraints(readUserPreferences()),
    });
    raw = videoStream.getVideoTracks()[0] ?? null;
    if (!raw) return stream;
  }

  await processor.setMode(backgroundMode);
  const output = await processor.attachRawTrack(raw);
  return rebuildStreamWithVideo(output);
}

export async function ensureLiveAudioTrack(): Promise<MediaStream> {
  requireMediaDevices();
  pruneDeadAudioTracks();
  if (hasLiveAudioTrack()) {
    stream!.getAudioTracks().forEach(bindAudioTrackRecovery);
    return stream!;
  }

  const audioConstraints = buildAudioInputConstraints(readUserPreferences());
  const audioStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
  if (!stream) {
    stream = audioStream;
  } else {
    audioStream.getAudioTracks().forEach((track) => {
      stream!.addTrack(track);
      bindAudioTrackRecovery(track);
    });
  }
  stream.getAudioTracks().forEach(bindAudioTrackRecovery);
  return stream;
}

export async function acquireLocalMedia(options: { audio: boolean; video: boolean }): Promise<MediaStream> {
  requireMediaDevices();

  if (options.audio) {
    await ensureLiveAudioTrack();
  }

  if (!stream) {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: options.video ? buildVideoInputConstraints(readUserPreferences()) : false,
    });
    if (options.video) {
      const raw = stream.getVideoTracks()[0];
      if (raw) {
        return publishProcessedCamera(raw);
      }
    }
    return stream;
  }

  if (options.video && stream.getVideoTracks().length === 0) {
    await enableCamera();
  }

  return stream;
}

export function setMicrophoneEnabled(enabled: boolean) {
  stream?.getAudioTracks().forEach((track) => {
    if (track.readyState === "live") {
      track.enabled = enabled;
    }
  });
}

export async function enableCamera(): Promise<MediaStream> {
  requireMediaDevices();

  const videoConstraints = buildVideoInputConstraints(readUserPreferences());
  const processor = getCameraBackgroundProcessor();

  if (!stream) {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: buildAudioInputConstraints(readUserPreferences()),
      video: videoConstraints,
    });
    stream.getAudioTracks().forEach(bindAudioTrackRecovery);
    const raw = stream.getVideoTracks()[0];
    if (raw) {
      return publishProcessedCamera(raw);
    }
    return stream;
  }

  const existingRaw = processor.getRawTrack();
  if (existingRaw && existingRaw.readyState === "live") {
    existingRaw.enabled = true;
    await restoreBackgroundImageIfNeeded();
    const output = await processor.attachRawTrack(existingRaw);
    return rebuildStreamWithVideo(output);
  }

  const liveVideo = stream.getVideoTracks().find((track) => track.readyState === "live");
  if (liveVideo && backgroundMode === "none") {
    liveVideo.enabled = true;
    return stream;
  }

  const videoStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
  const raw = videoStream.getVideoTracks()[0];
  if (!raw) return stream;
  return publishProcessedCamera(raw);
}

/** Swap the live camera to the preferred device and return a new stream reference. */
export async function replaceCameraTrack(): Promise<MediaStream> {
  requireMediaDevices();
  const videoStream = await navigator.mediaDevices.getUserMedia({
    video: buildVideoInputConstraints(readUserPreferences()),
  });
  const raw = videoStream.getVideoTracks()[0];
  if (!raw) {
    return stream ?? videoStream;
  }

  const processor = getCameraBackgroundProcessor();
  const prevRaw = processor.getRawTrack();
  if (prevRaw && prevRaw !== raw) {
    prevRaw.stop();
  }
  stream?.getVideoTracks().forEach((track) => {
    if (track !== prevRaw) {
      track.stop();
    }
    stream!.removeTrack(track);
  });

  return publishProcessedCamera(raw);
}

export function disableCamera() {
  const processor = getCameraBackgroundProcessor();
  processor.detach();
  stream?.getVideoTracks().forEach((track) => {
    track.stop();
    stream!.removeTrack(track);
  });
  if (stream) {
    stream = new MediaStream(stream.getAudioTracks());
  }
}

export function stopLocalMedia() {
  destroyCameraBackgroundProcessor();
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  boundAudioTrackIds.clear();
}
