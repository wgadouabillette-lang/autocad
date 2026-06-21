import type { TheaterChatMessage } from "../store/useTheaterChatStore";

export function theaterHandRaiseNoticeText(message: TheaterChatMessage): string {
  return message.mine ? "J'ai une question" : `${message.author} a une question`;
}

export function isTheaterHandRaiseNotice(message: TheaterChatMessage): boolean {
  return message.kind === "hand_raise";
}
