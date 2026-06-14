import type { CallsGridColumnCount } from "./callsLayout";
import type { HandRaiseRequest } from "./theater";
import { isLegacyMockMemberId, workspaceMembers } from "./workspaceMembers";

export interface CallUser {
  id: string;
  name: string;
  isLocal?: boolean;
  photoURL?: string;
}

export interface CallBlock {
  id: string;
  roomId: string;
  participants: CallUser[];
  /** Présent dans le salon sans être en appel vocal actif. */
  inCall?: boolean;
}

export interface JoinRequest {
  id: string;
  roomId: string;
  fromBlockId: string;
  toBlockId: string;
  status: "pending" | "accepted" | "declined";
}

/** Salon vocal ouvert — rejoindre directement, sans demande. */
export interface OpenVoiceChannel {
  id: string;
  roomId: string;
  name: string;
  participants: CallUser[];
  inCall?: boolean;
  /** Brouillon en cours de nommage avant confirmation. */
  isDraft?: boolean;
  /** Horodatage du passage en salon vide (suppression auto après 6 h). */
  vacantSinceAt?: number;
}

export interface RoomCallsState {
  blocks: CallBlock[];
  openChannels: OpenVoiceChannel[];
  requests: JoinRequest[];
  handRaises: HandRaiseRequest[];
}

const LOCAL_USER: CallUser = { id: "local", name: "Vous", isLocal: true };

function blockId(roomId: string, userId: string) {
  return `${roomId}-${userId}`;
}

function withoutLegacyMockBlocks(blocks: CallBlock[]): CallBlock[] {
  return blocks.filter((block) =>
    block.participants.every(
      (participant) => participant.isLocal || !isLegacyMockMemberId(participant.id),
    ),
  );
}

function withoutLegacyMockUsers<T extends { id: string }>(users: T[]): T[] {
  return users.filter((user) => !isLegacyMockMemberId(user.id));
}

function localMemberBlock(roomId: string): CallBlock {
  return {
    id: blockId(roomId, LOCAL_USER.id),
    roomId,
    participants: [{ ...LOCAL_USER }],
    inCall: false,
  };
}

export function isLocalOnlyBlock(block: CallBlock): boolean {
  return block.participants.some((participant) => participant.isLocal) && block.participants.length === 1;
}

export function isRemoteMemberBlock(block: CallBlock): boolean {
  return block.participants.every((participant) => !participant.isLocal);
}

export function hasRemoteMemberBlocks(blocks: CallBlock[]): boolean {
  return blocks.some(isRemoteMemberBlock);
}

export function createRoomCallsState(roomId: string): RoomCallsState {
  const peers = withoutLegacyMockUsers(workspaceMembers(roomId));
  const blocks: CallBlock[] = withoutLegacyMockBlocks([
    localMemberBlock(roomId),
    ...peers.map((user, index) => ({
      id: blockId(roomId, user.id),
      roomId,
      participants: [user],
      inCall: index < 2,
    })),
  ]);

  if (!blocks.some((block) => block.participants.some((participant) => participant.isLocal))) {
    blocks.unshift(localMemberBlock(roomId));
  }

  const inCallPeers = peers.filter((_, index) => index < 2);

  return {
    blocks,
    openChannels: [
      {
        id: `${roomId}-open-main`,
        roomId,
        name: "Salon vocal",
        participants: inCallPeers,
        inCall: inCallPeers.length > 0,
      },
    ],
    requests: [],
    handRaises: [],
  };
}

/** Réaligne l'état vocal sur les membres réels — conserve les blocs offline. */
export function syncRoomCallsWithMembers(
  roomId: string,
  existing?: RoomCallsState,
  localFirebaseUid?: string | null,
): RoomCallsState {
  const fresh = createRoomCallsState(roomId);
  if (!existing) {
    return {
      ...fresh,
      blocks: removeDuplicateRemoteSelfBlocks(fresh.blocks, localFirebaseUid),
    };
  }

  const freshRemoteIds = new Set(
    fresh.blocks
      .filter((block) => block.participants.every((participant) => !participant.isLocal))
      .map((block) => block.id),
  );

  const preservedRemoteBlocks = existing.blocks
    .filter(
      (block) =>
        block.participants.every((participant) => !participant.isLocal) &&
        !block.participants.some((participant) => isLegacyMockMemberId(participant.id)) &&
        !freshRemoteIds.has(block.id) &&
        (!localFirebaseUid || !isDuplicateRemoteSelfBlock(block, localFirebaseUid)),
    )
    .map((block) => ({ ...block, inCall: false }));

  const mergedBlocks = removeDuplicateRemoteSelfBlocks(
    withoutLegacyMockBlocks([...fresh.blocks, ...preservedRemoteBlocks]),
    localFirebaseUid,
  );

  const validBlockIds = new Set(mergedBlocks.map((block) => block.id));
  const validUserIds = new Set(
    mergedBlocks.flatMap((block) => block.participants.map((participant) => participant.id)),
  );
  const existingLocal = existing.blocks.find((block) =>
    block.participants.some((participant) => participant.isLocal),
  );

  const blocks = mergedBlocks.map((block) => {
    if (!block.participants.some((participant) => participant.isLocal)) return block;
    if (!existingLocal) return block;
    return { ...block, inCall: existingLocal.inCall };
  });

  const openChannels = mapOpenChannelsVacancy(
    (existing.openChannels ?? []).map((channel) => {
      const participants = channel.participants.filter((participant) =>
        validUserIds.has(participant.id),
      );
      return {
        ...channel,
        participants,
        inCall: participants.length > 0 ? channel.inCall : false,
      };
    }),
  );

  return {
    blocks: withoutLegacyMockBlocks(blocks),
    openChannels:
      openChannels.length > 0
        ? openChannels.map((channel) => ({
            ...channel,
            participants: withoutLegacyMockUsers(channel.participants),
            inCall:
              channel.participants.some(
                (participant) => !isLegacyMockMemberId(participant.id),
              ) && channel.inCall,
          }))
        : mapOpenChannelsVacancy(fresh.openChannels),
    requests: existing.requests.filter(
      (request) =>
        validBlockIds.has(request.fromBlockId) && validBlockIds.has(request.toBlockId),
    ),
    handRaises: (existing.handRaises ?? []).filter((request) =>
      validUserIds.has(request.userId),
    ),
  };
}

export function memberBlocksSignature(blocks: CallBlock[]): string {
  return blocks
    .map((block) =>
      [
        block.id,
        block.inCall ? "1" : "0",
        ...block.participants.map(
          (participant) =>
            `${participant.id}:${participant.name}:${participant.photoURL ?? ""}:${participant.isLocal ? "1" : "0"}`,
        ),
      ].join("|"),
    )
    .sort()
    .join(";");
}

function isDuplicateRemoteSelfBlock(
  block: CallBlock,
  localFirebaseUid: string,
): boolean {
  return (
    block.participants.length === 1 &&
    !block.participants[0]?.isLocal &&
    block.participants[0]?.id === localFirebaseUid
  );
}

/** Retire le bloc distant dupliqué du compte local — on garde uniquement « Vous ». */
export function removeDuplicateRemoteSelfBlocks(
  blocks: CallBlock[],
  localFirebaseUid?: string | null,
): CallBlock[] {
  if (!localFirebaseUid) return blocks;
  return blocks.filter((block) => !isDuplicateRemoteSelfBlock(block, localFirebaseUid));
}

/** Ajoute ou met à jour les blocs membres vus via la présence workspace. */
export function mergePresenceMemberBlocks(
  roomId: string,
  blocks: CallBlock[],
  members: Array<{ id: string; name: string; photoURL?: string }>,
  localFirebaseUid?: string | null,
): CallBlock[] {
  if (members.length === 0) return blocks;

  const selfMember =
    localFirebaseUid != null
      ? members.find((member) => member.id === localFirebaseUid)
      : undefined;

  const next = blocks
    .filter(
      (block) =>
        !localFirebaseUid || !isDuplicateRemoteSelfBlock(block, localFirebaseUid),
    )
    .map((block) => ({
      ...block,
      participants: block.participants.map((participant) => {
        if (participant.isLocal && selfMember) {
          return {
            ...participant,
            photoURL: selfMember.photoURL,
          };
        }
        const remoteMember = members.find((member) => member.id === participant.id);
        if (!remoteMember || participant.isLocal) return participant;
        return {
          ...participant,
          name: remoteMember.name,
          photoURL: remoteMember.photoURL,
        };
      }),
    }));

  const seenUserIds = new Set(
    next.flatMap((block) => block.participants.map((participant) => participant.id)),
  );

  for (const member of members) {
    if (!member.id || member.id === "local" || isLegacyMockMemberId(member.id)) continue;
    if (localFirebaseUid && member.id === localFirebaseUid) continue;
    if (seenUserIds.has(member.id)) continue;
    seenUserIds.add(member.id);
    next.push({
      id: `${roomId}-${member.id}`,
      roomId,
      participants: [
        {
          id: member.id,
          name: member.name,
          photoURL: member.photoURL,
        },
      ],
      inCall: false,
    });
  }

  return withoutLegacyMockBlocks(
    removeDuplicateRemoteSelfBlocks(next, localFirebaseUid),
  );
}

export function pendingVoiceHandRaises(handRaises: HandRaiseRequest[]): HandRaiseRequest[] {
  return handRaises.filter((request) => request.status === "pending");
}

export function participantHasHandRaised(
  handRaises: HandRaiseRequest[],
  participantId: string,
): boolean {
  return handRaises.some(
    (request) => request.userId === participantId && request.status === "pending",
  );
}

export function createOpenChannel(roomId: string, name: string): OpenVoiceChannel {
  const trimmedName = name.trim();
  return {
    id: `${roomId}-open-${Date.now()}`,
    roomId,
    name: trimmedName || "Salon vocal",
    participants: [],
    inCall: false,
  };
}

export function createDraftOpenChannel(roomId: string): OpenVoiceChannel {
  return {
    id: `${roomId}-open-draft-${Date.now()}`,
    roomId,
    name: "",
    participants: [],
    inCall: false,
    isDraft: true,
  };
}

export function isDraftOpenChannel(channel: OpenVoiceChannel): boolean {
  return channel.isDraft === true;
}

export function defaultOpenChannelId(roomId: string): string {
  return `${roomId}-open-main`;
}

export function isDefaultOpenChannel(roomId: string, channelId: string): boolean {
  return channelId === defaultOpenChannelId(roomId);
}

export const OPEN_CHANNEL_IDLE_TTL_MS = 6 * 60 * 60 * 1000;

export function syncOpenChannelVacancy(
  channel: OpenVoiceChannel,
  now = Date.now(),
): OpenVoiceChannel {
  if (channel.isDraft) return channel;
  if (channel.participants.length > 0) {
    const { vacantSinceAt: _vacantSinceAt, ...rest } = channel;
    return rest;
  }
  return {
    ...channel,
    vacantSinceAt: channel.vacantSinceAt ?? now,
  };
}

export function isOpenChannelIdleExpired(
  channel: OpenVoiceChannel,
  now = Date.now(),
): boolean {
  if (channel.isDraft) return false;
  if (channel.participants.length > 0) return false;
  const vacantSince = channel.vacantSinceAt;
  if (vacantSince == null) return false;
  return now - vacantSince >= OPEN_CHANNEL_IDLE_TTL_MS;
}

export function mapOpenChannelsVacancy(
  channels: OpenVoiceChannel[],
  now = Date.now(),
): OpenVoiceChannel[] {
  return channels.map((channel) => syncOpenChannelVacancy(channel, now));
}

/** Répartit les blocs membres dans N colonnes à gauche et N à droite (N = 1 ou 2). */
export function distributeMemberBlocks(
  blocks: CallBlock[],
  columnsPerSide: 1 | 2 = 2,
): {
  left: [CallBlock[], CallBlock[]];
  right: [CallBlock[], CallBlock[]];
} {
  const left: [CallBlock[], CallBlock[]] = [[], []];
  const right: [CallBlock[], CallBlock[]] = [[], []];
  const mid = Math.ceil(blocks.length / 2);
  blocks.slice(0, mid).forEach((block, i) => left[i % columnsPerSide].push(block));
  blocks.slice(mid).forEach((block, i) => right[i % columnsPerSide].push(block));
  return { left, right };
}

export interface CallsMemberGridSlots {
  left: [CallBlock[], CallBlock[]];
  right: [CallBlock[], CallBlock[]];
  center: CallBlock[];
}

function splitHalf(blocks: CallBlock[]): [CallBlock[], CallBlock[]] {
  const mid = Math.ceil(blocks.length / 2);
  return [blocks.slice(0, mid), blocks.slice(mid)];
}

function intoColumns(items: CallBlock[], columnCount: 1 | 2): CallBlock[][] {
  const columns: CallBlock[][] = Array.from({ length: columnCount }, () => []);
  items.forEach((block, i) => columns[i % columnCount].push(block));
  return columns;
}

/**
 * Répartit les blocs selon le nombre total de colonnes de la grille :
 * 5 → 2|2 autour du centre, 4 → 1|2, 3 → 1|1, 2 → 1 colonne latérale, 1 → tout au centre.
 */
export function distributeMemberBlocksForGrid(
  blocks: CallBlock[],
  columnCount: CallsGridColumnCount,
): CallsMemberGridSlots {
  const empty: CallsMemberGridSlots = {
    left: [[], []],
    right: [[], []],
    center: [],
  };

  if (blocks.length === 0) return empty;

  // Salons privés (blocs membres) → colonnes latérales 1, 2, 4, 5.
  // Le centre reste réservé au théâtre et aux salons vocaux publics (géré dans CallsVoiceGrid).
  // En une seule colonne (mobile), tout est empilé au centre.
  const [leftHalf, rightHalf] = splitHalf(blocks);

  switch (columnCount) {
    case 5: {
      const { left, right } = distributeMemberBlocks(blocks, 2);
      return { left, right, center: [] };
    }
    case 4: {
      const rightCols = intoColumns(rightHalf, 2);
      return {
        left: [leftHalf, []],
        right: [rightCols[0], rightCols[1]],
        center: [],
      };
    }
    case 3:
      return {
        left: [leftHalf, []],
        right: [rightHalf, []],
        center: [],
      };
    case 2:
      return {
        left: [blocks, []],
        right: [[], []],
        center: [],
      };
    case 1:
      return {
        left: [[], []],
        right: [[], []],
        center: blocks,
      };
  }
}

export function isBlockInCall(
  block: CallBlock,
  localInCall: boolean,
): boolean {
  if (block.participants.some((p) => p.isLocal)) return localInCall;
  if (block.participants.length > 1) return true;
  return block.inCall ?? false;
}

export function blockStatusLabel(block: CallBlock, localInCall: boolean): string {
  const isLocal = block.participants.some((p) => p.isLocal);
  const isMerged = block.participants.length > 1;
  const active = isBlockInCall(block, localInCall);

  if (isLocal && !localInCall) return "Connecté";
  if (isMerged) return "Vocal groupé";
  if (active) return "En appel";
  return "Connecté";
}

export function findLocalBlock(blocks: CallBlock[]): CallBlock | undefined {
  return blocks.find((block) => block.participants.some((p) => p.isLocal));
}

/** Bloc solo local — absent si fusionné dans un autre bloc vocal. */
export function findLocalSoloBlock(blocks: CallBlock[]): CallBlock | undefined {
  return blocks.find(
    (block) =>
      block.participants.some((p) => p.isLocal) && block.participants.length === 1,
  );
}

/** Masque le bloc solo local quand l'utilisateur est dans un autre vocal (salon ouvert, etc.). */
export function memberBlocksForVoiceGrid(
  blocks: CallBlock[],
  localOpenChannelId: string | null,
): CallBlock[] {
  if (!localOpenChannelId) return blocks;
  return blocks.filter(
    (block) =>
      !block.participants.some((p) => p.isLocal) || block.participants.length > 1,
  );
}

/** Participants actifs dans l'appel vocal (bloc local, blocs distants ou salon ouvert). */
export function inCallParticipants(
  blocks: CallBlock[],
  openChannels: OpenVoiceChannel[],
  localInCall: boolean,
  localOpenChannelId: string | null,
): CallUser[] {
  if (!localInCall) return [];

  if (localOpenChannelId) {
    const channel = openChannels.find((c) => c.id === localOpenChannelId);
    return channel ? [...channel.participants] : [];
  }

  const users: CallUser[] = [];
  const seen = new Set<string>();

  const localBlock = findLocalBlock(blocks);
  if (localBlock) {
    for (const participant of localBlock.participants) {
      if (seen.has(participant.id)) continue;
      seen.add(participant.id);
      users.push(participant);
    }
  }

  for (const block of blocks) {
    if (!isBlockInCall(block, localInCall)) continue;
    for (const participant of block.participants) {
      if (seen.has(participant.id)) continue;
      seen.add(participant.id);
      users.push(participant);
    }
  }

  return users;
}

/** Appel vocal groupé : le bloc local contient plusieurs participants. */
export function isLocalInGroupCall(blocks: CallBlock[]): boolean {
  const localBlock = findLocalBlock(blocks);
  return (localBlock?.participants.length ?? 0) > 1;
}

/** Participants actifs dans l'appel vocal (blocs ou salon ouvert). */
export function countBlockCallParticipants(
  blocks: CallBlock[],
  openChannels: OpenVoiceChannel[],
  localInCall: boolean,
  localOpenChannelId: string | null,
): number {
  if (!localInCall) return 0;

  if (localOpenChannelId) {
    const channel = openChannels.find((c) => c.id === localOpenChannelId);
    if (channel) return channel.participants.length;
  }

  const localBlock = findLocalBlock(blocks);
  if (localBlock && localBlock.participants.length > 1) {
    return localBlock.participants.length;
  }

  const ids = new Set<string>();
  for (const block of blocks) {
    if (!isBlockInCall(block, localInCall)) continue;
    for (const participant of block.participants) ids.add(participant.id);
  }
  return ids.size;
}

/** Participant affiché en visio 1:1 (groupe local ou premier pair du salon). */
export function activeCallPartner(
  blocks: CallBlock[],
  localBlock: CallBlock | undefined,
): CallUser | null {
  if (!localBlock) return null;
  if (localBlock.participants.length > 1) {
    return localBlock.participants.find((p) => !p.isLocal) ?? null;
  }
  const remoteBlock = blocks.find((b) => !b.participants.some((p) => p.isLocal));
  return remoteBlock?.participants[0] ?? null;
}

export function blockLabel(block: CallBlock): string {
  return block.participants.map((p) => p.name).join(" · ");
}

/** Titre du bloc (row 1, leading) : nom utilisateur ou salon. */
export function blockHeaderTitle(block: CallBlock): string {
  if (block.participants.length === 1) return block.participants[0].name;
  return block.participants.map((p) => p.name).join(" · ");
}

export function blockActivityUser(block: CallBlock): { userId: string; isLocal: boolean } {
  const local = block.participants.find((p) => p.isLocal);
  if (local) return { userId: local.id, isLocal: true };
  const primary = block.participants[0];
  return { userId: primary?.id ?? "unknown", isLocal: false };
}

export function canRequestJoin(
  blocks: CallBlock[],
  requests: JoinRequest[],
  fromBlockId: string,
  toBlockId: string,
): boolean {
  if (fromBlockId === toBlockId) return false;

  const from = blocks.find((b) => b.id === fromBlockId);
  const to = blocks.find((b) => b.id === toBlockId);
  if (!from || !to) return false;
  if (!from.participants.some((p) => p.isLocal)) return false;
  if (from.participants.length !== 1 || to.participants.length !== 1) return false;
  if (to.participants.some((p) => p.isLocal)) return false;
  if (!to.inCall) return false;

  const pending = requests.some(
    (r) =>
      r.status === "pending" &&
      ((r.fromBlockId === fromBlockId && r.toBlockId === toBlockId) ||
        (r.fromBlockId === toBlockId && r.toBlockId === fromBlockId)),
  );
  return !pending;
}

export function mergeCallBlocks(blocks: CallBlock[], fromBlockId: string, toBlockId: string): CallBlock[] {
  const from = blocks.find((b) => b.id === fromBlockId);
  const to = blocks.find((b) => b.id === toBlockId);
  if (!from || !to) return blocks;

  const merged: CallBlock = {
    id: toBlockId,
    roomId: to.roomId,
    participants: [...to.participants, ...from.participants],
    inCall: true,
  };

  return blocks.filter((b) => b.id !== fromBlockId).map((b) => (b.id === toBlockId ? merged : b));
}

/** Retire l'utilisateur local d'un bloc fusionné et recrée des blocs solo. */
export function splitLocalFromBlock(blocks: CallBlock[], mergedBlockId: string): CallBlock[] {
  const block = blocks.find((b) => b.id === mergedBlockId);
  if (!block) return blocks;

  const local = block.participants.find((p) => p.isLocal);
  const others = block.participants.filter((p) => !p.isLocal);
  if (!local || others.length === 0) return blocks;

  const withoutMerged = blocks.filter((b) => b.id !== mergedBlockId);
  const localBlock: CallBlock = {
    id: blockId(block.roomId, local.id),
    roomId: block.roomId,
    participants: [local],
    inCall: false,
  };
  const remoteBlocks: CallBlock[] = others.map((user) => ({
    id: blockId(block.roomId, user.id),
    roomId: block.roomId,
    participants: [user],
    inCall: true,
  }));

  return [...withoutMerged, localBlock, ...remoteBlocks];
}

const AVATAR_COLORS = ["#525252", "#666666", "#737373", "#858585", "#999999", "#b3b3b3"];

export function avatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash + userId.charCodeAt(i) * 17) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash];
}

/** Fond de tuile vocale — teinte dérivée de la couleur avatar. */
export function avatarTileTint(userId: string): string {
  return avatarColor(userId);
}

export function userInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
