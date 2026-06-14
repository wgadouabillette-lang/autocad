import { buildAudioInputConstraints } from "./audioDevices";
import { readUserPreferences } from "./userPreferences";

let stream: MediaStream | null = null;

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

export async function acquireLocalMedia(options: { audio: boolean; video: boolean }): Promise<MediaStream> {
  requireMediaDevices();
  const audioConstraints = buildAudioInputConstraints(readUserPreferences());

  if (!stream) {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: options.audio ? audioConstraints : false,
      video: options.video,
    });
    return stream;
  }

  if (options.audio && stream.getAudioTracks().length === 0) {
    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    audioStream.getAudioTracks().forEach((track) => stream!.addTrack(track));
  }

  if (options.video && stream.getVideoTracks().length === 0) {
    await enableCamera();
  }

  return stream;
}

export function setMicrophoneEnabled(enabled: boolean) {
  stream?.getAudioTracks().forEach((track) => {
    track.enabled = enabled;
  });
}

export async function enableCamera(): Promise<MediaStream> {
  requireMediaDevices();

  if (!stream) {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: buildAudioInputConstraints(readUserPreferences()),
      video: true,
    });
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
}
