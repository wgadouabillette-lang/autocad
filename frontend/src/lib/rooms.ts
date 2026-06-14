/** Salons textuels à l'intérieur d'un workspace (comme les channels Discord). */
export type RoomKind = "text" | "group";

export interface RoomChannel {
  id: string;
  kind: RoomKind;
  name: string;
  unread?: number;
}

export const TEXT_CHANNELS: RoomChannel[] = [
  { id: "general", kind: "text", name: "general" },
  { id: "annonces", kind: "text", name: "annonces" },
  { id: "random", kind: "text", name: "random" },
];

/** @deprecated Ancien modèle — les workspaces sont des serveurs (`lib/workspaces.ts`). */
export const GROUP_CHATS: RoomChannel[] = [];

export const ALL_ROOMS: RoomChannel[] = [...TEXT_CHANNELS];

export function findRoom(id: string): RoomChannel | undefined {
  return ALL_ROOMS.find((room) => room.id === id);
}

export function roomAddress(id: string): string {
  const room = findRoom(id);
  if (!room) return "about:blank";
  return room.kind === "text" ? `#${room.name}` : room.name;
}
