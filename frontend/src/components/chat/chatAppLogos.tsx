import { CONNECTOR_ICON_FILES, connectorIconPath } from "../../lib/connectorIcons";

function LogoFrame({ src }: { src: string }) {
  return (
    <span className="chat-app-circle__logo" aria-hidden>
      <img src={src} alt="" className="chat-app-circle__img" draggable={false} />
    </span>
  );
}

/** Google Calendar */
export function GoogleCalendarLogo() {
  return <LogoFrame src={connectorIconPath(CONNECTOR_ICON_FILES.calendar)} />;
}

/** Gmail */
export function GmailLogo() {
  return <LogoFrame src={connectorIconPath(CONNECTOR_ICON_FILES.gmail)} />;
}

/** Outlook */
export function OutlookLogo() {
  return <LogoFrame src={connectorIconPath(CONNECTOR_ICON_FILES.outlook)} />;
}

/** Notion */
export function NotionLogo() {
  return <LogoFrame src={connectorIconPath(CONNECTOR_ICON_FILES.notion)} />;
}

/** Figma */
export function FigmaLogo() {
  return <LogoFrame src={connectorIconPath(CONNECTOR_ICON_FILES.figma)} />;
}

/** Spotify */
export function SpotifyLogo() {
  return <LogoFrame src={connectorIconPath(CONNECTOR_ICON_FILES.spotify)} />;
}

export type ChatAppLogoComponent = () => JSX.Element;

export const CHAT_APP_LOGOS = {
  calendar: GoogleCalendarLogo,
  gmail: GmailLogo,
  outlook: OutlookLogo,
  notion: NotionLogo,
  figma: FigmaLogo,
  spotify: SpotifyLogo,
} as const;
