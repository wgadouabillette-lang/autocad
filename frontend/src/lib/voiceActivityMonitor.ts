type VoiceActivityCallback = (active: boolean) => void;

interface VoiceActivityOptions {
  threshold?: number;
  holdMs?: number;
}

export function monitorStreamVoiceActivity(
  stream: MediaStream,
  onChange: VoiceActivityCallback,
  options?: VoiceActivityOptions,
): () => void {
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) return () => {};

  const threshold = options?.threshold ?? 0.045;
  const holdMs = options?.holdMs ?? 450;

  const AudioCtx =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return () => {};

  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.65;
  source.connect(analyser);

  const bins = new Uint8Array(analyser.frequencyBinCount);
  let active = false;
  let lastActiveAt = 0;
  let raf = 0;

  const tick = () => {
    analyser.getByteFrequencyData(bins);
    let sum = 0;
    for (let i = 0; i < bins.length; i++) sum += bins[i];
    const level = sum / (bins.length * 255);
    const now = performance.now();

    if (level > threshold) {
      lastActiveAt = now;
      if (!active) {
        active = true;
        onChange(true);
      }
    } else if (active && now - lastActiveAt > holdMs) {
      active = false;
      onChange(false);
    }

    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(raf);
    source.disconnect();
    void ctx.close();
    if (active) onChange(false);
  };
}
