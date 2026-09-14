/** Decode a MediaRecorder blob and re-encode as WAV (xAI STT rejects WebM). */
export async function audioBlobToWav(blob: Blob): Promise<Blob> {
  if (blob.type.toLowerCase().includes("wav")) return blob;

  const context = new AudioContext();
  try {
    const raw = await blob.arrayBuffer();
    const audio = await context.decodeAudioData(raw.slice(0));
    return new Blob([encodeWav(audio)], { type: "audio/wav" });
  } finally {
    void context.close();
  }
}

function encodeWav(audio: AudioBuffer): ArrayBuffer {
  const channels = Math.min(audio.numberOfChannels, 2);
  const { sampleRate, length } = audio;
  const blockAlign = channels * 2;
  const dataSize = length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, audio.getChannelData(channel)[i] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return buffer;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}
