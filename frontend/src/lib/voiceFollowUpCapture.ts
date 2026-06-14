import { acquireLocalMedia, getLocalMediaStream } from "./localMedia";

type FinalTranscriptListener = (line: string) => void;

let recognition: SpeechRecognition | null = null;
let recorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let startedAt = 0;
let running = false;
let onFinalLine: FinalTranscriptListener | null = null;

function getRecognitionCtor(): (new () => SpeechRecognition) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isFollowUpCaptureSupported(): boolean {
  return !!navigator.mediaDevices?.getUserMedia;
}

export async function startFollowUpCapture(
  onFinalTranscript: FinalTranscriptListener,
): Promise<void> {
  await acquireLocalMedia({ audio: true, video: false });
  const stream = getLocalMediaStream();
  if (!stream) throw new Error("Micro inaccessible.");

  onFinalLine = onFinalTranscript;
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

  const Ctor = getRecognitionCtor();
  if (Ctor) {
    recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "fr-FR";
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        const text = result[0]?.transcript?.trim();
        if (text) onFinalLine?.(text);
      }
    };
    recognition.onerror = () => {
      /* transcription optionnelle — l'audio est toujours enregistré */
    };
    recognition.onend = () => {
      if (!running || !recognition) return;
      try {
        recognition.start();
      } catch {
        /* already running */
      }
    };
    try {
      recognition.start();
    } catch {
      recognition = null;
    }
  }
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
  onFinalLine = null;
}

export function stopFollowUpCapture(): Promise<{
  blob: Blob | null;
  durationMs: number;
}> {
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
