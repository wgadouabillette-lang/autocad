import { acquireLocalMedia, getLocalMediaStream } from "./localMedia";
import { hasFormaDesktop } from "./formaDesktop";
import { transcribeLiveAudioChunk } from "./liveTranscription";

export interface VoiceNotesTranscriptChunk {
  text: string;
  isFinal: boolean;
  at: number;
}

type TranscriptListener = (chunk: VoiceNotesTranscriptChunk) => void;
type ErrorListener = (message: string) => void;

const STT_SLICE_MS = 3_500;
const MIN_SLICE_BYTES = 600;

let recognition: SpeechRecognition | null = null;
let recorder: MediaRecorder | null = null;
let sliceRecorder: MediaRecorder | null = null;
let sliceTimer: number | null = null;
let audioChunks: Blob[] = [];
let startedAt = 0;
let transcriptListener: TranscriptListener | null = null;
let errorListener: ErrorListener | null = null;
let running = false;
let sliceEpoch = 0;

function getRecognitionCtor(): (new () => SpeechRecognition) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

function createRecorder(stream: MediaStream): MediaRecorder {
  const mimeType = pickRecorderMime();
  return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
}

export function isVoiceNotesSupported(): boolean {
  return !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

function prefersServerStt(): boolean {
  // Electron ships webkitSpeechRecognition but Google STT is not provisioned,
  // so it immediately fails with error "network".
  return hasFormaDesktop() || !getRecognitionCtor();
}

function serverSttErrorMessage(error: unknown): string {
  const raw =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "";
  const message = raw.replace(/^FirebaseError:\s*/i, "");
  if (/unauthenticated|authentication required/i.test(message)) {
    return "Connectez-vous pour la transcription.";
  }
  if (message.includes("Transcription")) return message;
  return "Transcription indisponible (réseau).";
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

function clearSliceTimer() {
  if (sliceTimer !== null) {
    window.clearTimeout(sliceTimer);
    sliceTimer = null;
  }
}

function stopSliceRecorder() {
  clearSliceTimer();
  const active = sliceRecorder;
  sliceRecorder = null;
  if (active && active.state !== "inactive") {
    try {
      active.stop();
    } catch {
      /* ignore */
    }
  }
}

function startServerStt(stream: MediaStream) {
  const beginSlice = () => {
    if (!running) return;
    const rec = createRecorder(stream);
    sliceRecorder = rec;
    const chunks: Blob[] = [];
    rec.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    rec.onstop = () => {
      if (sliceRecorder === rec) sliceRecorder = null;
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      if (running && blob.size >= MIN_SLICE_BYTES) {
        const epoch = ++sliceEpoch;
        void transcribeLiveAudioChunk(blob)
          .then((text) => {
            if (!running || !text) return;
            transcriptListener?.({ text, isFinal: true, at: Date.now() });
          })
          .catch((error) => {
            if (!running || epoch !== sliceEpoch) return;
            errorListener?.(serverSttErrorMessage(error));
          });
      }
      if (running) beginSlice();
    };
    rec.start();
    sliceTimer = window.setTimeout(() => {
      sliceTimer = null;
      if (rec.state === "recording") {
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
      }
    }, STT_SLICE_MS);
  };
  beginSlice();
}

function stopWebSpeech() {
  if (!recognition) return;
  recognition.onend = null;
  recognition.onerror = null;
  recognition.onresult = null;
  try {
    recognition.stop();
  } catch {
    /* ignore */
  }
  recognition = null;
}

function startWebSpeech(stream: MediaStream) {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    startServerStt(stream);
    return;
  }

  recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "fr-FR";
  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0]?.transcript?.trim();
      if (!text) continue;
      transcriptListener?.({
        text,
        isFinal: result.isFinal,
        at: Date.now(),
      });
    }
  };
  recognition.onerror = (event) => {
    if (event.error === "aborted" || event.error === "no-speech") return;
    if (event.error === "network" || event.error === "service-not-allowed") {
      stopWebSpeech();
      startServerStt(stream);
      return;
    }
    errorListener?.(speechErrorMessage(event.error));
  };
  recognition.onend = () => {
    if (!running || !recognition) return;
    try {
      recognition.start();
    } catch {
      /* already running */
    }
  };
  recognition.start();
}

export async function startVoiceNotesSession(
  onTranscript: TranscriptListener,
  onError: ErrorListener,
): Promise<void> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("La transcription live n'est pas disponible dans ce navigateur.");
  }

  await acquireLocalMedia({ audio: true, video: false });
  const stream = getLocalMediaStream();
  if (!stream) throw new Error("Micro inaccessible.");

  transcriptListener = onTranscript;
  errorListener = onError;
  startedAt = Date.now();
  audioChunks = [];
  running = true;
  sliceEpoch = 0;

  recorder = createRecorder(stream);
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) audioChunks.push(event.data);
  };
  recorder.start(1000);

  if (prefersServerStt()) {
    startServerStt(stream);
  } else {
    startWebSpeech(stream);
  }
}

function cleanupRecognition() {
  running = false;
  stopWebSpeech();
  stopSliceRecorder();
  transcriptListener = null;
  errorListener = null;
}

export function stopVoiceNotesSession(): Promise<{ blob: Blob | null; durationMs: number }> {
  const durationMs = startedAt ? Date.now() - startedAt : 0;
  cleanupRecognition();

  if (!recorder || recorder.state === "inactive") {
    recorder = null;
    audioChunks = [];
    startedAt = 0;
    return Promise.resolve({ blob: null, durationMs });
  }

  const activeRecorder = recorder;
  recorder = null;

  return new Promise((resolve) => {
    activeRecorder.onstop = () => {
      const blob =
        audioChunks.length > 0
          ? new Blob(audioChunks, { type: activeRecorder.mimeType || "audio/webm" })
          : null;
      audioChunks = [];
      startedAt = 0;
      resolve({ blob, durationMs });
    };
    activeRecorder.stop();
  });
}
