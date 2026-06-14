let recordingCameraStream: MediaStream | null = null;

function requireMediaDevices() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Accès caméra non disponible dans ce navigateur.");
  }
}

export function getRecordingCameraStream(): MediaStream | null {
  return recordingCameraStream;
}

export async function startRecordingCamera(): Promise<MediaStream> {
  requireMediaDevices();
  if (recordingCameraStream) return recordingCameraStream;

  recordingCameraStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false,
  });
  return recordingCameraStream;
}

export function stopRecordingCamera() {
  recordingCameraStream?.getTracks().forEach((track) => track.stop());
  recordingCameraStream = null;
}
