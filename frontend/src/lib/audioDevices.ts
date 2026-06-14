export interface MediaDeviceOption {
  deviceId: string;
  label: string;
}

const DEFAULT_INPUT: MediaDeviceOption = {
  deviceId: "",
  label: "Micro par défaut du système",
};

const DEFAULT_OUTPUT: MediaDeviceOption = {
  deviceId: "",
  label: "Sortie par défaut du système",
};

function normalizeLabel(device: MediaDeviceInfo, fallback: string): string {
  const label = device.label?.trim();
  return label || fallback;
}

export function supportsAudioOutputSelection(): boolean {
  return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
}

/** Request mic permission so device labels are populated (browser privacy). */
export async function ensureAudioDevicePermission(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => track.stop());
}

export async function listAudioInputDevices(): Promise<MediaDeviceOption[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [DEFAULT_INPUT];
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices
    .filter((device) => device.kind === "audioinput")
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: normalizeLabel(device, `Micro ${index + 1}`),
    }));
  return [DEFAULT_INPUT, ...inputs];
}

export async function listAudioOutputDevices(): Promise<MediaDeviceOption[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [DEFAULT_OUTPUT];
  const devices = await navigator.mediaDevices.enumerateDevices();
  const outputs = devices
    .filter((device) => device.kind === "audiooutput")
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: normalizeLabel(device, `Sortie ${index + 1}`),
    }));
  return [DEFAULT_OUTPUT, ...outputs];
}

export function buildAudioInputConstraints(prefs: {
  audioInputDeviceId: string;
  audioEchoCancellation: boolean;
  audioNoiseSuppression: boolean;
}): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {
    echoCancellation: prefs.audioEchoCancellation,
    noiseSuppression: prefs.audioNoiseSuppression,
  };
  if (prefs.audioInputDeviceId) {
    constraints.deviceId = { exact: prefs.audioInputDeviceId };
  }
  return constraints;
}
