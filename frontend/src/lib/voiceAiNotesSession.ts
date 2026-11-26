import { acquireLocalMedia, getLocalMediaStream } from "./localMedia";
import { hasFormaDesktop } from "./formaDesktop";
import { transcribeLiveAudioChunk } from "./liveTranscription";

export interface VoiceNotesTranscriptChunk {
  text: string;
  isFinal: boolean;
  at: number;
  /** Présent dès qu'une autre personne est dans le même appel. */
  speakerId?: string;
  speakerName?: string;
}

export interface CallSpeakerSource {
  id: string;
  name: string;
  stream: MediaStream;
}

export interface CallSpeakersUpdate {
  localId: string;
  localName: string;
  /** Vrai dès qu'une autre personne partage l'appel. */
  multi: boolean;
  remotes: CallSpeakerSource[];
  /** Noms du workspace, pour écrire les personnes telles qu'elles s'appellent. */
  nameHint?: string;
}

export type WatchCallSpeakers = (listener: (update: CallSpeakersUpdate) => void) => () => void;

type TranscriptListener = (chunk: VoiceNotesTranscriptChunk) => void;
type ErrorListener = (message: string) => void;

const STT_SLICE_MS = 3_500;
const MIN_SLICE_BYTES = 600;

const LOCAL_TAP_ID = "local";

interface SpeakerTap {
  id: string;
  name: string;
  /** Piste d'origine. On ne l'arrête jamais : c'est le micro de l'appel. */
  source: MediaStream;
  stream: MediaStream;
  sourceKey: string;
  recorder: MediaRecorder | null;
  timer: number | null;
  reportedStartError: boolean;
}

let recognition: SpeechRecognition | null = null;
let recorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let startedAt = 0;
let transcriptListener: TranscriptListener | null = null;
let errorListener: ErrorListener | null = null;
let running = false;
let lockedLanguage: string | null = null;
let pendingLanguage: string | null = null;
let attributeSpeakers = false;
let localSpeakerId = LOCAL_TAP_ID;
let localSpeakerName = "Vous";
let nameHint = "";
const taps = new Map<string, SpeakerTap>();
let stopWatchingCall: (() => void) | null = null;

function resetSpokenLanguage() {
  lockedLanguage = null;
  pendingLanguage = null;
}

/** Lock the notes to one spoken language once the same one is heard clearly. */
function noteSpokenLanguage(code: string | undefined, text: string): boolean {
  if (!code || lockedLanguage) return false;
  const solid = text.trim().length >= 12;
  if (pendingLanguage === code || solid) {
    lockedLanguage = code;
    pendingLanguage = null;
    return true;
  }
  pendingLanguage = code;
  return false;
}

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

function audioSourceKey(stream: MediaStream): string {
  const ids = stream
    .getAudioTracks()
    .filter((track) => track.readyState === "live")
    .map((track) => track.id)
    .join(",");
  return `${stream.id}:${ids}`;
}

function sourceLive(stream: MediaStream | null): boolean {
  return stream?.getAudioTracks().some((track) => track.readyState === "live") ?? false;
}

/** Le micro coupé ou silencieux n'est pas une prise de parole dans l'appel. */
function sourceAudible(stream: MediaStream | null): boolean {
  return (
    stream?.getAudioTracks().some(
      (track) => track.readyState === "live" && track.enabled && !track.muted,
    ) ?? false
  );
}

function emitTranscript(tap: SpeakerTap, text: string, at: number) {
  const named = attributeSpeakers;
  const speaker =
    tap.id === LOCAL_TAP_ID
      ? { id: localSpeakerId, name: localSpeakerName }
      : { id: tap.id, name: tap.name };
  transcriptListener?.({
    text,
    isFinal: true,
    at,
    ...(named
      ? {
          speakerId: speaker.id,
          speakerName: speaker.name.trim() || "Participant",
        }
      : {}),
  });
}

function stopTap(id: string) {
  const tap = taps.get(id);
  if (!tap) return;
  taps.delete(id);
  if (tap.timer !== null) window.clearTimeout(tap.timer);
  tap.timer = null;
  const active = tap.recorder;
  tap.recorder = null;
  if (active && active.state !== "inactive") {
    try {
      active.stop();
    } catch {
      /* ignore */
    }
  }
  tap.stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  });
}

function beginSlice(tap: SpeakerTap) {
  if (!running || taps.get(tap.id) !== tap) return;
  if (!sourceAudible(tap.source)) {
    tap.timer = window.setTimeout(() => beginSlice(tap), 700);
    return;
  }

  let rec: MediaRecorder;
  try {
    rec = startRecorder(tap.stream, 250);
  } catch (error) {
    if (!tap.reportedStartError) {
      tap.reportedStartError = true;
      errorListener?.(
        error instanceof Error ? error.message : "Impossible de démarrer l'enregistrement audio.",
      );
    }
    tap.timer = window.setTimeout(() => beginSlice(tap), 3_000);
    return;
  }

  tap.recorder = rec;
  const started = Date.now();
  const chunks: Blob[] = [];
  rec.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  rec.onstop = () => {
    if (tap.recorder === rec) tap.recorder = null;
    const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
    if (running && blob.size >= MIN_SLICE_BYTES) {
      void transcribeLiveAudioChunk(blob, 12_000, {
        language: lockedLanguage ?? undefined,
        prompt: nameHint || undefined,
      })
        .then(async (result) => {
          if (!running) return "";
          let text = result.text.trim();
          const hinted = Boolean(lockedLanguage);
          const lockedNow = noteSpokenLanguage(result.language, text);
          if (lockedNow && !hinted && lockedLanguage) {
            const fixed = await transcribeLiveAudioChunk(blob, 12_000, {
              language: lockedLanguage,
              prompt: nameHint || undefined,
            });
            if (fixed.text.trim()) text = fixed.text.trim();
          }
          return text;
        })
        .then((text) => {
          if (!running || !text) return;
          emitTranscript(tap, text, started);
        })
        .catch((error) => {
          if (!running) return;
          errorListener?.(serverSttErrorMessage(error));
        });
    }
    if (running && taps.get(tap.id) === tap) beginSlice(tap);
  };
  tap.timer = window.setTimeout(() => {
    tap.timer = null;
    if (rec.state === "recording") {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
  }, STT_SLICE_MS);
}

function startTap(id: string, name: string, source: MediaStream, sourceKey: string) {
  let stream: MediaStream;
  try {
    stream = audioOnlyLiveStream(source);
  } catch {
    return;
  }
  const tap: SpeakerTap = {
    id,
    name,
    source,
    stream,
    sourceKey,
    recorder: null,
    timer: null,
    reportedStartError: false,
  };
  taps.set(id, tap);
  beginSlice(tap);
}

function ensureLocalServerTap() {
  const source = getLocalMediaStream();
  if (!source) return;
  const sourceKey = audioSourceKey(source);
  const existing = taps.get(LOCAL_TAP_ID);
  if (existing && existing.sourceKey === sourceKey) {
    existing.name = localSpeakerName;
    existing.source = source;
    return;
  }
  if (existing) stopTap(LOCAL_TAP_ID);
  stopWebSpeech();
  startTap(LOCAL_TAP_ID, localSpeakerName, source, sourceKey);
}

function applyCallSpeakers(update: CallSpeakersUpdate) {
  if (!running) return;
  localSpeakerId = update.localId || LOCAL_TAP_ID;
  localSpeakerName = update.localName.trim() || "Vous";
  nameHint = update.nameHint?.trim() ?? "";
  const seen = new Set<string>();

  for (const remote of update.remotes) {
    if (!sourceLive(remote.stream) || remote.id === localSpeakerId) continue;
    seen.add(remote.id);
    const sourceKey = audioSourceKey(remote.stream);
    const existing = taps.get(remote.id);
    if (existing && existing.sourceKey === sourceKey) {
      existing.name = remote.name;
      existing.source = remote.stream;
      continue;
    }
    if (existing) stopTap(remote.id);
    startTap(remote.id, remote.name, remote.stream, sourceKey);
  }

  for (const id of [...taps.keys()]) {
    if (id === LOCAL_TAP_ID) continue;
    if (!seen.has(id)) stopTap(id);
  }

  if (update.multi || seen.size > 0) attributeSpeakers = true;
  if (attributeSpeakers || prefersServerStt()) ensureLocalServerTap();
}

function stopAllTaps() {
  for (const id of [...taps.keys()]) stopTap(id);
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

function startWebSpeech() {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    ensureLocalServerTap();
    return;
  }

  recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  if (lockedLanguage) recognition.lang = lockedLanguage;
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
      ensureLocalServerTap();
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
  watchSpeakers?: WatchCallSpeakers,
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
  attributeSpeakers = false;
  localSpeakerId = LOCAL_TAP_ID;
  localSpeakerName = "Vous";
  nameHint = "";
  resetSpokenLanguage();

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

  if (watchSpeakers) {
    stopWatchingCall = watchSpeakers(applyCallSpeakers);
  }
  if (!taps.has(LOCAL_TAP_ID) && prefersServerStt()) ensureLocalServerTap();
  if (!taps.has(LOCAL_TAP_ID)) startWebSpeech();
}

function cleanupRecognition() {
  running = false;
  stopWatchingCall?.();
  stopWatchingCall = null;
  stopWebSpeech();
  stopAllTaps();
  transcriptListener = null;
  errorListener = null;
  attributeSpeakers = false;
  localSpeakerId = LOCAL_TAP_ID;
  localSpeakerName = "Vous";
  nameHint = "";
  resetSpokenLanguage();
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
