import { CHAT_APP_LOGOS, type ChatAppLogoComponent } from "./chatAppLogos";

export const CHAT_CONNECTORS = [
  {
    id: "calendar",
    label: "Google Calendar",
    slash: "/calendar",
    Logo: CHAT_APP_LOGOS.calendar,
  },
  {
    id: "spotify",
    label: "Spotify",
    slash: "/play",
    Logo: CHAT_APP_LOGOS.spotify,
  },
  {
    id: "gmail",
    label: "Gmail",
    slash: "/mail",
    Logo: CHAT_APP_LOGOS.gmail,
  },
  {
    id: "outlook",
    label: "Outlook",
    slash: "/outlook",
    Logo: CHAT_APP_LOGOS.outlook,
    comingSoon: true,
  },
  {
    id: "figma",
    label: "Figma",
    slash: "/figma",
    Logo: CHAT_APP_LOGOS.figma,
    comingSoon: true,
  },
  {
    id: "dropbox",
    label: "Dropbox",
    slash: "/dropbox",
    Logo: CHAT_APP_LOGOS.dropbox,
    comingSoon: true,
  },
] as const;

export type ChatConnectorId = (typeof CHAT_CONNECTORS)[number]["id"];

export type ChatConnector = (typeof CHAT_CONNECTORS)[number];

export function isConnectorComingSoon(id: ChatConnectorId): boolean {
  const connector = CHAT_CONNECTORS.find((entry) => entry.id === id);
  return Boolean(connector && "comingSoon" in connector && connector.comingSoon);
}

/** Chat panel list only: OAuth connected and not coming-soon. Settings → Plugins still lists every card. */
export function isVisibleInChatConnectorsList(
  id: ChatConnectorId,
  connectedIds: ReadonlySet<ChatConnectorId>,
): boolean {
  return !isConnectorComingSoon(id) && connectedIds.has(id);
}

export const CHAT_CONNECTOR_PREVIEW_COUNT = 3;

export type ChatConnectorLogo = ChatAppLogoComponent;
