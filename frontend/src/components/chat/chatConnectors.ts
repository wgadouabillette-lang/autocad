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
] as const;

export type ChatConnectorId = (typeof CHAT_CONNECTORS)[number]["id"];

export type ChatConnector = (typeof CHAT_CONNECTORS)[number];

export function isConnectorComingSoon(id: ChatConnectorId): boolean {
  const connector = CHAT_CONNECTORS.find((entry) => entry.id === id);
  return Boolean(connector && "comingSoon" in connector && connector.comingSoon);
}

export const CHAT_CONNECTOR_PREVIEW_COUNT = 3;

export type ChatConnectorLogo = ChatAppLogoComponent;
