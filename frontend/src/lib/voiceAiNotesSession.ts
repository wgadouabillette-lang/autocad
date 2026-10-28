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
let sliceStream: MediaStream | null = null;
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

function pickRecorderMimeCandidates(): string[] {
  if (typeof MediaRecorder === "undefined") return [];
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
  ];
  return candidates.filter((mime) => {
    try {
      return MediaRecorder.isTypeSupported(mime);
    } catch {
      return false;
    }
  });
}

function audioOnlyLiveStream(stream: MediaStream): MediaStream {
  const tracks = stream
    .getAudioTracks()
    .filter((track) => track.readyState === "live")
    .map((track) => track.clone());
  if (tracks.length === 0) {
    throw new Error("Micro inaccessible.");
  }
  return new MediaStream(tracks);
}

function createRecorder(stream: MediaStream, mimeType?: string): MediaRecorder {
  return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
}

function startRecorder(stream: MediaStream, timesliceMs: number): MediaRecorder {
  const mimes = [...pickRecorderMimeCandidates(), ""];
  let lastError: unknown = null;
  for (const mime of mimes) {
    try {
      const recorder = createRecorder(stream, mime || undefined);
      recorder.start(timesliceMs);
      return recorder;
    } catch (error) {
      lastError = error;
      // audio/mp4 + timeslice is flaky on some Chromium builds — retry without timeslice.
      if (mime.startsWith("audio/mp4")) {
        try {
          const recorder = createRecorder(stream, mime);
          recorder.start();
          return recorder;
        } catch (inner) {
          lastError = inner;
        }
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Impossible de démarrer l'enregistrement audio.");
}

export function isVoiceNotesSupported(): boolean {
  return !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

function prefersServerStt(): boolean {
  // Electron ships webkitSpeechRecognition but Google STT is not provisioned,
  // so it immediately fails with error "network".
  return hasFormaDesktop() || !getRecognitionCtor();
}

function cloneAudioStream(stream: MediaStream): MediaStream {
  return audioOnlyLiveStream(stream);
}

function stopClonedSliceStream() {
  sliceStream?.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  });
  sliceStream = null;
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
    let rec: MediaRecorder;
    try {
      rec = startRecorder(stream, 250);
    } catch (error) {
      errorListener?.(
        error instanceof Error ? error.message : "Impossible de démarrer l'enregistrement audio.",
      );
      return;
    }
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

  // Never feed the shared A/V call stream into MediaRecorder — Mac Chromium
  // rejects audio mimeTypes when video tracks are present (camera on).
  const recordStream = audioOnlyLiveStream(stream);

  transcriptListener = onTranscript;
  errorListener = onError;
  startedAt = Date.now();
  audioChunks = [];
  running = true;
  sliceEpoch = 0;

  recorder = startRecorder(recordStream, 1000);
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) audioChunks.push(event.data);
  };
  recorder.addEventListener("stop", () => {
    recordStream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    });
  });

  if (prefersServerStt()) {
    stopClonedSliceStream();
    sliceStream = cloneAudioStream(stream);
    startServerStt(sliceStream);
  } else {
    startWebSpeech(stream);
  }
}

function cleanupRecognition() {
  running = false;
  stopWebSpeech();
  stopSliceRecorder();
  stopClonedSliceStream();
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
