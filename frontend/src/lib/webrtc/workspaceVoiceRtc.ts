import {
  deleteRtcSignal,
  sendRtcSignal,
  watchIncomingRtcSignals,
  type RtcSignalDoc,
} from "../firebase/webrtcSignaling";
import { createPeerConnection } from "./iceConfig";

export interface RemoteParticipantStreams {
  audioStream: MediaStream | null;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
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
  audioSender: RTCRtpSender | null;
  cameraSender: RTCRtpSender | null;
  screenSender: RTCRtpSender | null;
  remoteMedia: RemoteParticipantStreams;
}

function emptyRemoteMedia(): RemoteParticipantStreams {
  return { audioStream: null, cameraStream: null, screenStream: null };
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
  const stream = new MediaStream();
  stream.addTrack(track);
  return stream;
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

  constructor(
    private workspaceId: string,
    private sessionId: string,
    private localUid: string,
    private onRemoteMedia: (uid: string, media: RemoteParticipantStreams) => void,
    private onRemoteMediaClear: (uid: string) => void,
  ) {}

  start(): void {
    this.signalUnsub = watchIncomingRtcSignals(
      this.workspaceId,
      this.sessionId,
      this.localUid,
      (signal) => {
        void this.handleSignal(signal);
      },
    );
  }

  async setPeerUids(peerUids: string[]): Promise<void> {
    const next = new Set(peerUids);
    for (const uid of [...this.peers.keys()]) {
      if (!next.has(uid)) this.removePeer(uid);
    }
    for (const uid of peerUids) {
      if (!this.peers.has(uid)) {
        await this.addPeer(uid);
      }
    }
    await this.syncLocalMedia(this.localMedia);
  }

  async syncLocalMedia(media: LocalMediaSnapshot): Promise<void> {
    this.localMedia = media;
    await Promise.all(
      [...this.peers.values()].map((peer) => this.applyLocalTracks(peer)),
    );
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
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
    peer.pc.close();
    this.peers.delete(uid);
    this.onRemoteMediaClear(uid);
  }

  private async addPeer(remoteUid: string): Promise<void> {
    const pc = createPeerConnection();
    const audioTransceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
    const peer: PeerState = {
      pc,
      remoteUid,
      polite: this.localUid > remoteUid,
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      pendingCandidates: [],
      audioSender: audioTransceiver.sender,
      cameraSender: null,
      screenSender: null,
      remoteMedia: emptyRemoteMedia(),
    };

    pc.ontrack = (event) => {
      const track = event.track;
      if (track.kind === "audio") {
        peer.remoteMedia.audioStream = ensureStream(peer.remoteMedia.audioStream, track);
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
      this.onRemoteMedia(remoteUid, { ...peer.remoteMedia });
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      void sendRtcSignal(this.workspaceId, this.sessionId, {
        fromUid: this.localUid,
        toUid: remoteUid,
        type: "candidate",
        candidate: event.candidate.toJSON(),
      }).catch(() => {});
    };

    pc.onnegotiationneeded = () => {
      if (this.localUid < remoteUid) {
        void this.negotiate(peer);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        pc.restartIce();
      }
      if (pc.connectionState === "closed" || pc.connectionState === "disconnected") {
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

    if (this.localUid < remoteUid && pc.signalingState === "stable") {
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
    };
    this.onRemoteMedia(peer.remoteUid, { ...peer.remoteMedia });
  }

  private async applyLocalTracks(peer: PeerState): Promise<void> {
    const { localStream, screenShareStream, muted, cameraOn, screenSharing } = this.localMedia;
    const audioTrack =
      localStream?.getAudioTracks().find((track) => track.readyState === "live") ?? null;
    if (audioTrack) audioTrack.enabled = !muted;

    peer.audioSender = await this.setSenderTrack(peer, peer.audioSender, audioTrack);
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
  }

  private async setSenderTrack(
    peer: PeerState,
    sender: RTCRtpSender | null,
    track: MediaStreamTrack | null,
  ): Promise<RTCRtpSender | null> {
    if (track) {
      if (sender) {
        await sender.replaceTrack(track);
        return sender;
      }
      return peer.pc.addTrack(track);
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
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      await sendRtcSignal(this.workspaceId, this.sessionId, {
        fromUid: this.localUid,
        toUid: peer.remoteUid,
        type: "offer",
        sdp: peer.pc.localDescription?.sdp,
      });
    } catch {
      // Renégociation concurrente.
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

  private async processSignal(peer: PeerState, signal: RtcSignalDoc): Promise<void> {
    try {
      if (signal.type === "offer" && signal.sdp) {
        const offerCollision =
          peer.makingOffer || peer.pc.signalingState !== "stable";
        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;

        await peer.pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
        await this.flushPendingCandidates(peer);
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());
        await sendRtcSignal(this.workspaceId, this.sessionId, {
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
      } else if (signal.type === "candidate" && signal.candidate) {
        if (peer.pc.remoteDescription) {
          await peer.pc.addIceCandidate(signal.candidate);
        } else {
          peer.pendingCandidates.push(signal.candidate);
        }
      }
    } catch {
      // Signal périmé.
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
      await deleteRtcSignal(this.workspaceId, this.sessionId, signalId);
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
