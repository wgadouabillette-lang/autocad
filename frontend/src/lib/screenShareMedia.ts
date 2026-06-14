let screenShareStream: MediaStream | null = null;

function requireMediaDevices() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Le partage d'écran n'est pas disponible dans ce navigateur.");
  }
}

export function getScreenShareStream(): MediaStream | null {
  return screenShareStream;
}

export async function startScreenShare(): Promise<MediaStream> {
  requireMediaDevices();
  stopScreenShare();

  screenShareStream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
  });
  return screenShareStream;
}

export function stopScreenShare() {
  screenShareStream?.getTracks().forEach((track) => track.stop());
  screenShareStream = null;
}
