import { CHAT_APP_LOGOS, type ChatAppLogoComponent } from "./chatAppLogos";

export const CHAT_CONNECTORS = [
  {
    id: "calendar",
    label: "Google Calendar",
    slash: "/calendar",
    Logo: CHAT_APP_LOGOS.calendar,
  },
  {
    id: "gmail",
    label: "Gmail",
    slash: "/gmail",
    Logo: CHAT_APP_LOGOS.gmail,
  },
  {
    id: "outlook",
    label: "Outlook",
    slash: "/outlook",
    Logo: CHAT_APP_LOGOS.outlook,
  },
  {
    id: "notion",
    label: "Notion",
    slash: "/notion",
    Logo: CHAT_APP_LOGOS.notion,
  },
  {
    id: "figma",
    label: "Figma",
    slash: "/figma",
    Logo: CHAT_APP_LOGOS.figma,
  },
  {
    id: "spotify",
    label: "Spotify",
    slash: "/play",
    Logo: CHAT_APP_LOGOS.spotify,
  },
] as const;

export type ChatConnectorId = (typeof CHAT_CONNECTORS)[number]["id"];

export type ChatConnector = (typeof CHAT_CONNECTORS)[number];

export const CHAT_CONNECTOR_PREVIEW_COUNT = 3;

export type ChatConnectorLogo = ChatAppLogoComponent;
