import { pcmToWavBlob } from "./audioWav";
import { hasFormaDesktop } from "./formaDesktop";
import { transcribeLiveAudioChunk } from "./liveTranscription";
import { readUserPreferences } from "./userPreferences";

export interface ComposerDictationChunk {
  text: string;
  isFinal: boolean;
}

type TranscriptListener = (chunk: ComposerDictationChunk) => void;
type ErrorListener = (message: string) => void;
type IdleListener = () => void;

const SLICE_MS = 2_400;
const MIN_FLUSH_MS = 350;
const PAUSE_FLUSH_MS = 780;
const MIN_PAUSE_AUDIO_MS = 1_200;
const SPEECH_RMS = 0.004;
const SILENCE_RMS = 0.0008;
const OVERLAP_MS = 550;

const SPEECH_LANG: Record<string, string> = {
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
  de: "de-DE",
  pt: "pt-BR",
  it: "it-IT",
  ja: "ja-JP",
  zh: "zh-CN",
};

let recognition: SpeechRecognition | null = null;
let stream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let processor: ScriptProcessorNode | null = null;
let sliceTimer: number | null = null;
let pcmChunks: Float32Array[] = [];
let pcmSamples = 0;
let running = false;
let session = 0;
let transcribeChain: Promise<void> = Promise.resolve();
let transcriptListener: TranscriptListener | null = null;
let errorListener: ErrorListener | null = null;
let idleListener: IdleListener | null = null;
let silenceNoted = false;
let sentAudio = false;
let speechHeard = false;
let silenceMs = 0;
let overlapTail: Float32Array | null = null;
let emittedTail = "";
let captureLanguage = "fr";
const inflight = new Set<Promise<void>>();
const readyTexts = new Map<number, string>();
let emitSeq = 0;
let emitCursor = 0;

function speechLanguage(locale: string): string {
  const base = locale.slice(0, 2).toLowerCase();
  return SPEECH_LANG[base] ?? "en-US";
}

function getRecognitionCtor(): (new () => SpeechRecognition) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isFatalDictationError(message: string): boolean {
  return /permission|connectez-vous|micro inaccessible|indisponible \(service\)|n'est pas disponible/i.test(
    message,
  );
}

function speechErrorMessage(error: string): string {
  switch (error) {
    case "not-allowed":
      return "Permission micro refusée pour la transcription.";
    case "audio-capture":
      return "Micro inaccessible pour la transcription.";
    case "network":
      return "Transcription indisponible (réseau).";
    case "service-not-allowed":
      return "Service de transcription non autorisé.";
    default:
      return `Erreur transcription : ${error}`;
  }
}

function serverSttErrorMessage(error: unknown): string {
  const raw =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "";
  const message = raw.replace(/^FirebaseError:\s*/i, "").replace(/^Error:\s*/i, "");
  if (/unauthenticated|authentication required|functions\/unauthenticated/i.test(message)) {
    return "Connectez-vous pour la transcription.";
  }
  if (/permission|notallowed|not allowed/i.test(message)) {
    return "Permission micro refusée pour la transcription.";
  }
  if (message.includes("Transcription") || message.includes("Micro")) return message;
  return "Transcription indisponible (réseau).";
}

function stopStream() {
  stream?.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  });
  stream = null;
}

function clearSliceTimer() {
  if (sliceTimer !== null) {
    window.clearInterval(sliceTimer);
    sliceTimer = null;
  }
}

function stopWebSpeech() {
  const current = recognition;
  recognition = null;
  if (!current) return;
  current.onresult = null;
  current.onerror = null;
  current.onend = null;
  try {
    current.stop();
  } catch {
    /* ignore */
  }
}

function releaseListeners() {
  transcriptListener = null;
  errorListener = null;
}

function teardownPcm() {
  clearSliceTimer();
  if (processor) {
    processor.onaudioprocess = null;
    try {
      processor.disconnect();
    } catch {
      /* ignore */
    }
    processor = null;
  }
  if (audioContext) {
    const ctx = audioContext;
    audioContext = null;
    void ctx.close().catch(() => undefined);
  }
  pcmChunks = [];
  pcmSamples = 0;
  overlapTail = null;
}

function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i] ?? 0;
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length);
}

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,!?;:…'"«»()]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

function withoutRepeatedStart(previous: string, next: string): string {
  const prev = wordsOf(previous);
  const raw = next.trim().split(/\s+/).filter(Boolean);
  const nextWords = wordsOf(next);
  const max = Math.min(12, prev.length, nextWords.length);
  let cut = 0;
  for (let count = max; count >= 1; count -= 1) {
    if (prev.slice(-count).join(" ") === nextWords.slice(0, count).join(" ")) {
      cut = count;
      break;
    }
  }
  return raw.slice(cut).join(" ");
}

function rememberEmitted(text: string) {
  emittedTail = `${emittedTail} ${text}`.trim().split(/\s+/).slice(-24).join(" ");
}

function takePendingWav(minMs: number): Blob | null {
  const rate = audioContext?.sampleRate || 48_000;
  const ms = (pcmSamples / rate) * 1000;
  if (pcmSamples === 0 || ms < minMs) return null;
  const merged = new Float32Array(pcmSamples);
  let offset = 0;
  for (const chunk of pcmChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  pcmChunks = [];
  pcmSamples = 0;
  if (rms(merged) < SILENCE_RMS) {
    if (!sentAudio && !silenceNoted && ms >= SLICE_MS - 250) {
      silenceNoted = true;
      errorListener?.("Aucun son reçu du micro.");
    }
    return null;
  }
  silenceNoted = false;
  const tailCount = Math.min(merged.length, Math.round((OVERLAP_MS / 1000) * rate));
  const nextTail = merged.slice(merged.length - tailCount);
  let audio = merged;
  if (overlapTail && overlapTail.length > 0) {
    audio = new Float32Array(overlapTail.length + merged.length);
    audio.set(overlapTail, 0);
    audio.set(merged, overlapTail.length);
  }
  overlapTail = nextTail;
  return pcmToWavBlob(audio, rate);
}

function enqueueTranscribe(wav: Blob, epoch: number) {
  sentAudio = true;
  const id = emitSeq;
  emitSeq += 1;
  const job = (async () => {
    try {
      const text = (
        await transcribeLiveAudioChunk(wav, 12_000, {
          language: captureLanguage,
          prompt: emittedTail.slice(-180),
        })
      ).trim();
      if (epoch !== session) return;
      readyTexts.set(id, text);
    } catch (error) {
      if (epoch !== session) return;
      readyTexts.set(id, "");
      errorListener?.(serverSttErrorMessage(error));
    } finally {
      if (epoch !== session) return;
      while (readyTexts.has(emitCursor)) {
        const text = readyTexts.get(emitCursor) ?? "";
        readyTexts.delete(emitCursor);
        emitCursor += 1;
        if (!text) continue;
        const fresh = withoutRepeatedStart(emittedTail, text);
        if (!fresh) continue;
        rememberEmitted(fresh);
        transcriptListener?.({ text: fresh, isFinal: true });
      }
    }
  })();
  inflight.add(job);
  void job.finally(() => inflight.delete(job));
}

function flushSlice(epoch: number, minMs: number) {
  const wav = takePendingWav(minMs);
  speechHeard = false;
  silenceMs = 0;
  if (wav) enqueueTranscribe(wav, epoch);
}

function settle(epoch: number) {
  const pending = Promise.allSettled([...inflight]);
  transcribeChain = pending.then(() => {
    if (running || session !== epoch) return;
    session += 1;
    const done = idleListener;
    idleListener = null;
    releaseListeners();
    done?.();
  });
}

function startPcmCapture(ctx: AudioContext, media: MediaStream, epoch: number) {
  const source = ctx.createMediaStreamSource(media);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  processor = node;
  node.onaudioprocess = (event) => {
    if (!running || epoch !== session) return;
    const input = event.inputBuffer.getChannelData(0);
    const output = event.outputBuffer.getChannelData(0);
    output.set(input);
    pcmChunks.push(new Float32Array(input));
    pcmSamples += input.length;
    const chunkMs = (input.length / (ctx.sampleRate || 48_000)) * 1000;
    const level = rms(input);
    if (level >= SPEECH_RMS) {
      speechHeard = true;
      silenceMs = 0;
    } else if (speechHeard) {
      silenceMs += chunkMs;
      const bufferedMs = (pcmSamples / (ctx.sampleRate || 48_000)) * 1000;
      if (silenceMs >= PAUSE_FLUSH_MS && bufferedMs >= MIN_PAUSE_AUDIO_MS) {
        flushSlice(epoch, MIN_PAUSE_AUDIO_MS);
      }
    }
  };
  source.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);
  sliceTimer = window.setInterval(() => {
    if (!running || epoch !== session) return;
    flushSlice(epoch, SLICE_MS - 180);
  }, SLICE_MS);
}

async function openDictationMic(): Promise<MediaStream> {
  const deviceId = readUserPreferences().audioInputDeviceId.trim();
  const clean: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: true,
    channelCount: 1,
  };
  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { ...clean, deviceId: { exact: deviceId } },
        video: false,
      });
    } catch {
      /* le micro choisi n'est plus disponible */
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio: clean, video: false });
}

async function startServerCapture(epoch: number) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("La transcription live n'est pas disponible dans ce navigateur.");
  }
  const ctx = new AudioContext();
  audioContext = ctx;
  void ctx.resume();
  let media: MediaStream;
  try {
    media = await openDictationMic();
  } catch (error) {
    teardownPcm();
    throw error;
  }
  if (!running || epoch !== session) {
    media.getTracks().forEach((track) => track.stop());
    teardownPcm();
    return;
  }
  stream = media;
  await ctx.resume();
  if (ctx.state !== "running") {
    teardownPcm();
    stopStream();
    throw new Error("Micro inaccessible pour la transcription.");
  }
  if (typeof ctx.createScriptProcessor !== "function") {
    teardownPcm();
    throw new Error("La transcription live n'est pas disponible dans ce navigateur.");
  }
  startPcmCapture(ctx, media, epoch);
}

function startWebSpeech(epoch: number, locale: string) {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    void startServerCapture(epoch).catch((error) => {
      if (epoch !== session) return;
      running = false;
      errorListener?.(error instanceof Error ? error.message : "Micro inaccessible.");
      settle(epoch);
    });
    return;
  }

  const current = new Ctor();
  recognition = current;
  current.continuous = true;
  current.interimResults = true;
  current.lang = speechLanguage(locale);
  current.onresult = (event) => {
    if (epoch !== session) return;
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result?.[0]?.transcript?.trim();
      if (!text) continue;
      transcriptListener?.({ text, isFinal: result.isFinal });
    }
  };
  current.onerror = (event) => {
    if (epoch !== session || event.error === "aborted" || event.error === "no-speech") return;
    if (event.error === "network" || event.error === "service-not-allowed") {
      stopWebSpeech();
      void startServerCapture(epoch).catch((error) => {
        if (epoch !== session) return;
        running = false;
        errorListener?.(error instanceof Error ? error.message : "Micro inaccessible.");
        settle(epoch);
      });
      return;
    }
    errorListener?.(speechErrorMessage(event.error));
  };
  current.onend = () => {
    if (!running || epoch !== session || recognition !== current) return;
    try {
      current.start();
    } catch {
      /* already running */
    }
  };
  try {
    current.start();
  } catch (error) {
    recognition = null;
    void startServerCapture(epoch).catch((fallback) => {
      if (epoch !== session) return;
      running = false;
      errorListener?.(
        fallback instanceof Error
          ? fallback.message
          : error instanceof Error
            ? error.message
            : "Micro inaccessible.",
      );
      settle(epoch);
    });
  }
}

export function isComposerDictationActive(): boolean {
  return running;
}

export async function startComposerDictation(input: {
  locale: string;
  onTranscript: TranscriptListener;
  onError: ErrorListener;
  onIdle?: IdleListener;
}): Promise<void> {
  if (running) return;
  session += 1;
  const epoch = session;
  running = true;
  transcriptListener = input.onTranscript;
  errorListener = input.onError;
  idleListener = input.onIdle ?? null;
  pcmChunks = [];
  pcmSamples = 0;
  silenceNoted = false;
  sentAudio = false;
  speechHeard = false;
  silenceMs = 0;
  overlapTail = null;
  emittedTail = "";
  captureLanguage = speechLanguage(input.locale).slice(0, 2);
  emitSeq = 0;
  emitCursor = 0;
  readyTexts.clear();

  if (hasFormaDesktop() || !getRecognitionCtor()) {
    await startServerCapture(epoch);
    return;
  }
  startWebSpeech(epoch, input.locale);
}

export function stopComposerDictation(options?: { flush?: boolean }): void {
  const flush = options?.flush !== false && running;
  const epoch = session;
  const wasRunning = running;
  running = false;
  stopWebSpeech();
  const wav = flush ? takePendingWav(MIN_FLUSH_MS) : null;
  teardownPcm();
  stopStream();
  if (!wasRunning) {
    if (!flush) {
      session += 1;
      const done = idleListener;
      idleListener = null;
      releaseListeners();
      done?.();
    }
    return;
  }
  if (!flush) {
    session += 1;
    const done = idleListener;
    idleListener = null;
    releaseListeners();
    done?.();
    return;
  }
  if (wav) enqueueTranscribe(wav, epoch);
  settle(epoch);
}
