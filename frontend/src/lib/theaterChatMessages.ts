import type { TheaterChatMessage } from "../store/useTheaterChatStore";

export function theaterHandRaiseNoticeText(
  message: TheaterChatMessage,
  viewer: "raiser" | "speaker",
): string {
  const name = message.author.trim() || "Quelqu'un";
  return viewer === "raiser" ? `${name} a levé la main` : `${name} a une question`;
}

export function isTheaterHandRaiseNotice(message: TheaterChatMessage): boolean {
  return message.kind === "hand_raise";
}
