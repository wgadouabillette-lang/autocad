import { buildAudioInputConstraints } from "./audioDevices";
import { readUserPreferences } from "./userPreferences";

let stream: MediaStream | null = null;
let onAudioTrackLostHandler: (() => void) | null = null;
const boundAudioTrackIds = new Set<string>();

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
      video: options.video,
    });
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

  if (!stream) {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: buildAudioInputConstraints(readUserPreferences()),
      video: true,
    });
    stream.getAudioTracks().forEach(bindAudioTrackRecovery);
    return stream;
  }

  const liveVideo = stream.getVideoTracks().find((track) => track.readyState === "live");
  if (liveVideo) {
    liveVideo.enabled = true;
    return stream;
  }

  const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
  videoStream.getVideoTracks().forEach((track) => stream!.addTrack(track));
  return stream;
}

export function disableCamera() {
  stream?.getVideoTracks().forEach((track) => {
    track.stop();
    stream!.removeTrack(track);
  });
}

export function stopLocalMedia() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  boundAudioTrackIds.clear();
}
