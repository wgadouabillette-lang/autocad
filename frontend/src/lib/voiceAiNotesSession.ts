import { acquireLocalMedia, getLocalMediaStream } from "./localMedia";

export interface VoiceNotesTranscriptChunk {
  text: string;
  isFinal: boolean;
  at: number;
}

type TranscriptListener = (chunk: VoiceNotesTranscriptChunk) => void;
type ErrorListener = (message: string) => void;

let recognition: SpeechRecognition | null = null;
let recorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let startedAt = 0;
let transcriptListener: TranscriptListener | null = null;
let errorListener: ErrorListener | null = null;
let running = false;

function getRecognitionCtor(): (new () => SpeechRecognition) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isVoiceNotesSupported(): boolean {
  return !!getRecognitionCtor() && !!navigator.mediaDevices?.getUserMedia;
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

export async function startVoiceNotesSession(
  onTranscript: TranscriptListener,
  onError: ErrorListener,
): Promise<void> {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
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

  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "";
  recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) audioChunks.push(event.data);
  };
  recorder.start(1000);

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

function cleanupRecognition() {
  running = false;
  if (recognition) {
    recognition.onend = null;
    try {
      recognition.stop();
    } catch {
      /* ignore */
    }
    recognition = null;
  }
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
