import {
  deleteRtcSignal,
  sendRtcSignal,
  watchIncomingRtcSignals,
  type RtcSignalDoc,
} from "../firebase/webrtcSignaling";
import { createPeerConnection } from "./iceConfig";

export interface RtcSignalTransport {
  send(signal: Omit<RtcSignalDoc, "id" | "createdAt">): Promise<void>;
  subscribe(onSignal: (signal: RtcSignalDoc) => void): () => void;
  remove(signalId: string): Promise<void>;
}

export interface RemoteParticipantStreams {
  audioStream: MediaStream | null;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  /** System / display audio from a remote screen share (separate from mic). */
  screenAudioStream: MediaStream | null;
}

export interface LocalMediaSnapshot {
  localStream: MediaStream | null;
  screenShareStream: MediaStream | null;
  muted: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
}

interface PeerState {
  pc: RTCPeerConnection;
  remoteUid: string;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  everConnected: boolean;
  audioSender: RTCRtpSender | null;
  screenAudioSender: RTCRtpSender | null;
  screenAudioTransceiver: RTCRtpTransceiver | null;
  cameraSender: RTCRtpSender | null;
  screenSender: RTCRtpSender | null;
  remoteMedia: RemoteParticipantStreams;
}

function emptyRemoteMedia(): RemoteParticipantStreams {
  return {
    audioStream: null,
    cameraStream: null,
    screenStream: null,
    screenAudioStream: null,
  };
}

function isScreenVideoTrack(track: MediaStreamTrack): boolean {
  if (track.kind !== "video") return false;
  return /screen|display|window|monitor|web-contents|tab/i.test(track.label);
}

function ensureStream(
  current: MediaStream | null,
  track: MediaStreamTrack,
): MediaStream {
  if (current?.getTrackById(track.id)) return current;
  if (current) {
    current.addTrack(track);
    return current;
  }
  const stream = new MediaStream();
  stream.addTrack(track);
  return stream;
}

function isScreenAudioTransceiver(
  peer: PeerState,
  transceiver: RTCRtpTransceiver | null | undefined,
): boolean {
  if (!transceiver) return false;
  if (transceiver === peer.screenAudioTransceiver) return true;
  const screenMid = peer.screenAudioTransceiver?.mid;
  return Boolean(screenMid && transceiver.mid && transceiver.mid === screenMid);
}

export class WorkspaceVoiceRtcSession {
  private peers = new Map<string, PeerState>();
  private signalUnsub: (() => void) | null = null;
  private processedSignals = new Set<string>();
  private pendingSignalsByUid = new Map<string, RtcSignalDoc[]>();
  private negotiating = new Set<string>();
  private closed = false;
  private localMedia: LocalMediaSnapshot = {
    localStream: null,
    screenShareStream: null,
    muted: false,
    cameraOn: false,
    screenSharing: false,
  };

  private transport: RtcSignalTransport;

  constructor(
    private workspaceId: string,
    private sessionId: string,
    private localUid: string,
    private onRemoteMedia: (uid: string, media: RemoteParticipantStreams) => void,
    private onRemoteMediaClear: (uid: string) => void,
    transport?: RtcSignalTransport,
  ) {
    this.transport = transport ?? {
      send: (signal) => sendRtcSignal(workspaceId, sessionId, signal),
      subscribe: (onSignal) =>
        watchIncomingRtcSignals(workspaceId, sessionId, localUid, onSignal),
      remove: (signalId) => deleteRtcSignal(workspaceId, sessionId, signalId, localUid),
    };
  }

  start(): void {
    this.signalUnsub = this.transport.subscribe((signal) => {
      void this.handleSignal(signal);
    });
  }

  async setPeerUids(peerUids: string[]): Promise<void> {
    await this.enqueuePeerUpdate(() => this.applyPeerUids(peerUids));
  }

  private async applyPeerUids(peerUids: string[]): Promise<void> {
    const next = new Set(peerUids);
    for (const uid of [...this.peers.keys()]) {
      if (!next.has(uid)) this.removePeer(uid);
    }
    for (const uid of peerUids) {
      const existing = this.peers.get(uid);
      if (existing?.pc.connectionState === "closed" || existing?.pc.connectionState === "failed") {
        this.removePeer(uid);
      }
      if (!this.peers.has(uid)) {
        await this.addPeer(uid);
      }
    }
    await this.syncLocalMedia(this.localMedia);
  }

  /** Ferme le pair mort et en ouvre un nouveau qui renégocie tout de suite. */
  private async replacePeer(uid: string): Promise<void> {
    await this.enqueuePeerUpdate(async () => {
      if (this.closed || !this.peers.has(uid)) return;
      const now = Date.now();
      if (now - (this.lastReplaceAt.get(uid) ?? 0) < 400) return;
      this.lastReplaceAt.set(uid, now);
      this.removePeer(uid);
      await this.addPeer(uid);
    });
  }

  async syncLocalMedia(media: LocalMediaSnapshot): Promise<void> {
    const hadAudio =
      this.localMedia.localStream?.getAudioTracks().some((track) => track.readyState === "live") ??
      false;
    this.localMedia = media;
    await Promise.all(
      [...this.peers.values()].map((peer) => this.applyLocalTracks(peer)),
    );
    const hasAudio =
      media.localStream?.getAudioTracks().some((track) => track.readyState === "live") ?? false;
    if (!hadAudio && hasAudio) {
      await Promise.all(
        [...this.peers.values()]
          .filter((peer) => peer.pc.signalingState === "stable")
          .map((peer) => this.negotiate(peer)),
      );
    }
  }

  private iceRecoveryTimers = new Map<RTCPeerConnection, number>();
  private peerUpdateQueue: Promise<void> = Promise.resolve();
  private peerUpdateDepth = 0;
  private lastReplaceAt = new Map<string, number>();

  private enqueuePeerUpdate(task: () => Promise<void>): Promise<void> {
    if (this.peerUpdateDepth > 0) return task();
    const job = this.peerUpdateQueue.then(async () => {
      this.peerUpdateDepth += 1;
      try {
        await task();
      } finally {
        this.peerUpdateDepth -= 1;
      }
    });
    this.peerUpdateQueue = job.catch(() => {});
    return job;
  }

  private uidForPc(pc: RTCPeerConnection): string | null {
    for (const [uid, peer] of this.peers) {
      if (peer.pc === pc) return uid;
    }
    return null;
  }

  private scheduleIceRecovery(pc: RTCPeerConnection): void {
    const state = pc.iceConnectionState;
    const connectionState = pc.connectionState;
    const needsRecovery =
      state === "failed" ||
      state === "disconnected" ||
      connectionState === "failed" ||
      connectionState === "disconnected";
    if (!needsRecovery) {
      const timer = this.iceRecoveryTimers.get(pc);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        this.iceRecoveryTimers.delete(pc);
      }
      return;
    }

    const recover = () => {
      if (pc.connectionState === "closed" || this.closed) return;
      const uid = this.uidForPc(pc);
      if (!uid) return;
      const peer = this.peers.get(uid);
      if (!peer || this.negotiating.has(uid) || peer.pc.signalingState !== "stable") return;
      // Un pair déjà connecté qui tombe, c'est un départ/retour : on refait le lien.
      // Un pair jamais connecté reste sur restartIce pour ne pas boucler.
      if (peer?.everConnected) {
        void this.replacePeer(uid);
        return;
      }
      try {
        pc.restartIce();
      } catch {
        // Peer may already be closing.
      }
    };

    if (state === "failed" || connectionState === "failed") {
      recover();
      return;
    }

    if (this.iceRecoveryTimers.has(pc)) return;
    const timer = window.setTimeout(() => {
      this.iceRecoveryTimers.delete(pc);
      const ice = pc.iceConnectionState;
      const conn = pc.connectionState;
      if (ice === "disconnected" || ice === "failed" || conn === "disconnected" || conn === "failed") {
        recover();
      }
    }, 300);
    this.iceRecoveryTimers.set(pc, timer);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const timer of this.iceRecoveryTimers.values()) {
      window.clearTimeout(timer);
    }
    this.iceRecoveryTimers.clear();
    this.signalUnsub?.();
    this.signalUnsub = null;
    for (const uid of [...this.peers.keys()]) {
      this.removePeer(uid);
    }
    this.processedSignals.clear();
    this.pendingSignalsByUid.clear();
    this.negotiating.clear();
  }

  private removePeer(uid: string): void {
    const peer = this.peers.get(uid);
    if (!peer) return;
    const timer = this.iceRecoveryTimers.get(peer.pc);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      this.iceRecoveryTimers.delete(peer.pc);
    }
    peer.pc.close();
    this.peers.delete(uid);
    this.onRemoteMediaClear(uid);
  }

  private async addPeer(remoteUid: string): Promise<void> {
    const pc = createPeerConnection();
    const peer: PeerState = {
      pc,
      remoteUid,
      polite: this.localUid > remoteUid,
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      pendingCandidates: [],
      everConnected: false,
      audioSender: null,
      screenAudioSender: null,
      screenAudioTransceiver: null,
      cameraSender: null,
      screenSender: null,
      remoteMedia: emptyRemoteMedia(),
    };

    pc.onnegotiationneeded = () => {
      if (peer.pc.signalingState !== "stable" || this.negotiating.has(peer.remoteUid)) return;
      void this.negotiate(peer);
    };

    const audioTransceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
    const screenAudioTransceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
    peer.audioSender = audioTransceiver.sender;
    peer.screenAudioSender = screenAudioTransceiver.sender;
    peer.screenAudioTransceiver = screenAudioTransceiver;

    pc.ontrack = (event) => {
      const track = event.track;
      if (track.kind === "audio") {
        const screenAudio = isScreenAudioTransceiver(peer, event.transceiver);
        if (screenAudio) {
          peer.remoteMedia.screenAudioStream = ensureStream(
            peer.remoteMedia.screenAudioStream,
            track,
          );
        } else {
          peer.remoteMedia.audioStream = ensureStream(peer.remoteMedia.audioStream, track);
        }
      } else if (track.kind === "video") {
        if (isScreenVideoTrack(track)) {
          peer.remoteMedia.screenStream = ensureStream(peer.remoteMedia.screenStream, track);
        } else {
          peer.remoteMedia.cameraStream = ensureStream(peer.remoteMedia.cameraStream, track);
        }
      }
      track.onended = () => {
        this.refreshRemoteMedia(peer);
      };
      track.onunmute = () => {
        this.onRemoteMedia(remoteUid, { ...peer.remoteMedia });
      };
      this.onRemoteMedia(remoteUid, { ...peer.remoteMedia });
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      void this.transport
        .send({
          fromUid: this.localUid,
          toUid: remoteUid,
          type: "candidate",
          candidate: event.candidate.toJSON(),
        })
        .catch(() => {});
    };

    pc.oniceconnectionstatechange = () => {
      this.scheduleIceRecovery(pc);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") peer.everConnected = true;
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        this.scheduleIceRecovery(pc);
      }
      if (pc.connectionState === "closed") {
        this.onRemoteMediaClear(remoteUid);
      }
    };

    this.peers.set(remoteUid, peer);
    await this.applyLocalTracks(peer);

    const pending = this.pendingSignalsByUid.get(remoteUid) ?? [];
    this.pendingSignalsByUid.delete(remoteUid);
    for (const signal of pending) {
      await this.processSignal(peer, signal);
    }

    // Les deux côtés proposent. Celui qui revient annonce tout de suite,
    // même si l'autre a encore l'ancienne connexion. La collision est gérée.
    if (pc.signalingState === "stable") {
      await this.negotiate(peer);
    }
  }

  private refreshRemoteMedia(peer: PeerState): void {
    const prune = (stream: MediaStream | null) => {
      if (!stream) return null;
      const live = stream.getTracks().filter((track) => track.readyState === "live");
      if (live.length === 0) return null;
      const next = new MediaStream();
      live.forEach((track) => next.addTrack(track));
      return next;
    };
    peer.remoteMedia = {
      audioStream: prune(peer.remoteMedia.audioStream),
      cameraStream: prune(peer.remoteMedia.cameraStream),
      screenStream: prune(peer.remoteMedia.screenStream),
      screenAudioStream: prune(peer.remoteMedia.screenAudioStream),
    };
    this.onRemoteMedia(peer.remoteUid, { ...peer.remoteMedia });
  }

  private async applyLocalTracks(peer: PeerState): Promise<void> {
    const { localStream, screenShareStream, muted, cameraOn, screenSharing } = this.localMedia;
    const audioTrack =
      localStream?.getAudioTracks().find((track) => track.readyState === "live") ?? null;
    const previousAudioTrackId = peer.audioSender?.track?.id ?? null;
    if (audioTrack) audioTrack.enabled = !muted;

    peer.audioSender = await this.setSenderTrack(peer, peer.audioSender, audioTrack);
    const audioTrackChanged = (audioTrack?.id ?? null) !== previousAudioTrackId;
    const cameraTrack =
      cameraOn && localStream
        ? (localStream.getVideoTracks().find((track) => track.readyState === "live") ?? null)
        : null;
    peer.cameraSender = await this.setSenderTrack(peer, peer.cameraSender, cameraTrack);
    const screenTrack =
      screenSharing && screenShareStream
        ? (screenShareStream.getVideoTracks().find((track) => track.readyState === "live") ??
          null)
        : null;
    peer.screenSender = await this.setSenderTrack(peer, peer.screenSender, screenTrack);
    const screenAudioTrack =
      screenSharing && screenShareStream
        ? (screenShareStream.getAudioTracks().find((track) => track.readyState === "live") ??
          null)
        : null;
    peer.screenAudioSender = await this.setSenderTrack(
      peer,
      peer.screenAudioSender,
      screenAudioTrack,
    );

    if (
      audioTrackChanged &&
      audioTrack &&
      peer.pc.signalingState === "stable" &&
      !this.negotiating.has(peer.remoteUid)
    ) {
      await this.negotiate(peer);
    }
  }

  private async setSenderTrack(
    peer: PeerState,
    sender: RTCRtpSender | null,
    track: MediaStreamTrack | null,
  ): Promise<RTCRtpSender | null> {
    if (track) {
      const next = sender ?? peer.pc.addTrack(track);
      if (sender) await sender.replaceTrack(track);
      if (track.contentHint === "detail") {
        try {
          const params = next.getParameters();
          params.degradationPreference = "maintain-resolution";
          const encoding = params.encodings?.[0] ?? {};
          encoding.maxBitrate = 4_000_000;
          encoding.scaleResolutionDownBy = 1;
          params.encodings = [encoding];
          await next.setParameters(params);
        } catch {
          // Some stacks reject parameters before the sender is negotiated.
        }
      }
      return next;
    }
    if (sender) {
      await sender.replaceTrack(null);
    }
    return sender;
  }

  private async negotiate(peer: PeerState): Promise<void> {
    if (this.closed || this.negotiating.has(peer.remoteUid)) return;
    this.negotiating.add(peer.remoteUid);
    try {
      peer.makingOffer = true;
      await this.applyLocalTracks(peer);
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      await this.transport.send({
        fromUid: this.localUid,
        toUid: peer.remoteUid,
        type: "offer",
        sdp: peer.pc.localDescription?.sdp,
      });
    } catch (err) {
      console.warn("[webrtc] negotiate failed", peer.remoteUid, err);
    } finally {
      peer.makingOffer = false;
      this.negotiating.delete(peer.remoteUid);
    }
  }

  private async handleSignal(signal: RtcSignalDoc): Promise<void> {
    if (!signal.id || this.processedSignals.has(signal.id)) return;

    const peer = this.peers.get(signal.fromUid);
    if (!peer) {
      if (signal.fromUid) {
        const queue = this.pendingSignalsByUid.get(signal.fromUid) ?? [];
        queue.push(signal);
        this.pendingSignalsByUid.set(signal.fromUid, queue);
      }
      this.processedSignals.add(signal.id);
      await this.safeDeleteSignal(signal.id);
      return;
    }

    this.processedSignals.add(signal.id);
    try {
      await this.processSignal(peer, signal);
    } finally {
      await this.safeDeleteSignal(signal.id);
    }
  }

  private async processSignal(
    peer: PeerState,
    signal: RtcSignalDoc,
    retried = false,
  ): Promise<void> {
    try {
      if (
        !retried &&
        signal.type === "offer" &&
        (peer.pc.connectionState === "failed" || peer.pc.connectionState === "closed")
      ) {
        const uid = peer.remoteUid;
        await this.replacePeer(uid);
        const fresh = this.peers.get(uid);
        if (fresh) await this.processSignal(fresh, signal, true);
        return;
      }
      if (signal.type === "offer" && signal.sdp) {
        const offerCollision =
          peer.makingOffer || peer.pc.signalingState !== "stable";
        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;

        if (offerCollision && peer.polite) {
          try {
            await peer.pc.setLocalDescription({ type: "rollback" });
          } catch {
            return;
          }
        }

        await peer.pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
        // Attach local mic/camera before answering so the SDP is not recvonly/inactive.
        await this.applyLocalTracks(peer);
        await this.flushPendingCandidates(peer);
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());
        await this.transport.send({
          fromUid: this.localUid,
          toUid: peer.remoteUid,
          type: "answer",
          sdp: peer.pc.localDescription?.sdp,
        });
      } else if (signal.type === "answer" && signal.sdp) {
        peer.isSettingRemoteAnswerPending = true;
        await peer.pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        peer.isSettingRemoteAnswerPending = false;
        await this.flushPendingCandidates(peer);
        await this.applyLocalTracks(peer);
      } else if (signal.type === "candidate" && signal.candidate) {
        if (peer.pc.remoteDescription) {
          await peer.pc.addIceCandidate(signal.candidate);
        } else {
          peer.pendingCandidates.push(signal.candidate);
        }
      }
    } catch (err) {
      if (!retried && signal.type === "offer") {
        const uid = peer.remoteUid;
        await this.replacePeer(uid);
        const fresh = this.peers.get(uid);
        if (fresh && fresh !== peer) {
          await this.processSignal(fresh, signal, true);
          return;
        }
      }
      console.warn("[webrtc] signal handling failed", signal.type, err);
    }
  }

  private async flushPendingCandidates(peer: PeerState): Promise<void> {
    const pending = [...peer.pendingCandidates];
    peer.pendingCandidates = [];
    for (const candidate of pending) {
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch {
        // Candidat ignoré.
      }
    }
  }

  private async safeDeleteSignal(signalId: string): Promise<void> {
    try {
      await this.transport.remove(signalId);
    } catch {
      // Déjà supprimé.
    }
  }
}

export function participantVideoStream(
  media: RemoteParticipantStreams | undefined,
  preferScreen = true,
): MediaStream | null {
  if (!media) return null;
  if (preferScreen && media.screenStream) return media.screenStream;
  if (media.cameraStream) return media.cameraStream;
  if (!preferScreen && media.screenStream) return media.screenStream;
  return null;
}

export function buildRemoteMediaFeeds(
  remoteMediaByUid: Record<string, RemoteParticipantStreams>,
  participantNames: Record<string, string>,
): Array<{
  feedId: string;
  participantId: string;
  participantName: string;
  kind: "camera" | "screen";
  isLocal: boolean;
  stream: MediaStream | null;
  hasVideo: boolean;
}> {
  const feeds: Array<{
    feedId: string;
    participantId: string;
    participantName: string;
    kind: "camera" | "screen";
    isLocal: boolean;
    stream: MediaStream | null;
    hasVideo: boolean;
  }> = [];

  for (const [uid, media] of Object.entries(remoteMediaByUid)) {
    const name = participantNames[uid] ?? "Membre";
    if (media.screenStream?.getVideoTracks().some((track) => track.readyState === "live")) {
      feeds.push({
        feedId: `${uid}:screen`,
        participantId: uid,
        participantName: name,
        kind: "screen",
        isLocal: false,
        stream: media.screenStream,
        hasVideo: true,
      });
    }
    if (media.cameraStream?.getVideoTracks().some((track) => track.readyState === "live")) {
      feeds.push({
        feedId: `${uid}:camera`,
        participantId: uid,
        participantName: name,
        kind: "camera",
        isLocal: false,
        stream: media.cameraStream,
        hasVideo: true,
      });
    }
  }

  return feeds;
}
