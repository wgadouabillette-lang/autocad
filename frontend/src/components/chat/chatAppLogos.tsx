const CONNECTOR_ICONS = {
  calendar: "/icons/connectors/google-calendar.png",
  gmail: "/icons/connectors/gmail.svg",
  notion: "/icons/connectors/notion.png",
  figma: "/icons/connectors/figma.svg",
} as const;

function LogoFrame({ src }: { src: string }) {
  return (
    <span className="chat-app-circle__logo" aria-hidden>
      <img src={src} alt="" className="chat-app-circle__img" draggable={false} />
    </span>
  );
}

/** Google Calendar — icône produit Google (gstatic) */
export function GoogleCalendarLogo() {
  return <LogoFrame src={CONNECTOR_ICONS.calendar} />;
}

/** Gmail — icône produit Google */
export function GmailLogo() {
  return <LogoFrame src={CONNECTOR_ICONS.gmail} />;
}

/** Notion — logo app officiel */
export function NotionLogo() {
  return <LogoFrame src={CONNECTOR_ICONS.notion} />;
}

/** Figma — logo officiel */
export function FigmaLogo() {
  return <LogoFrame src={CONNECTOR_ICONS.figma} />;
}

export type ChatAppLogoComponent = () => JSX.Element;

export const CHAT_APP_LOGOS = {
  calendar: GoogleCalendarLogo,
  gmail: GmailLogo,
  notion: NotionLogo,
  figma: FigmaLogo,
} as const;
