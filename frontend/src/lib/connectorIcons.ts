/** Public connector icons (respect Vite base path, e.g. /app/). */
export function connectorIconPath(filename: string): string {
  return `${import.meta.env.BASE_URL}icons/connectors/${filename}`;
}

export const CONNECTOR_ICON_FILES = {
  calendar: "google-calendar.svg",
  gmail: "gmail.svg",
  outlook: "outlook.svg",
  notion: "notion.svg",
  figma: "figma.svg",
} as const;
