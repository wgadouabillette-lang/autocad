import {
  fetchGmailPreview,
  fetchOutlookPreview,
  fetchSpotifyPreview,
  type ConnectorPreviewMessage,
  type SpotifyPreviewResult,
} from "./connectorsApi";
import {
  fetchGoogleCalendarEvents,
  type GoogleCalendarEvent,
} from "./calendarSync";
import { formatScheduleTime, toDateKey } from "./daySchedule";

/**
 * Connecteurs déclenchables comme un skill « slash » dans le chat IA.
 * Chacun va fetcher les données fraîches de l'API, formatter un bloc de
 * contexte et le glisser dans le prompt envoyé au modèle, pour que la
 * réponse soit basée sur les données réelles du compte.
 */
export type ConnectorSkillId =
  | "calendar"
  | "gmail"
  | "outlook"
  | "spotify";

interface ConnectorSkillDef {
  id: ConnectorSkillId;
  slash: string;
  label: string;
  /** Préfixe humain affiché dans le bloc contexte injecté au prompt. */
  contextLabel: string;
}

export const CONNECTOR_SKILL_DEFS: ConnectorSkillDef[] = [
  { id: "calendar", slash: "/calendar", label: "Google Calendar", contextLabel: "Today's Google Calendar events" },
  { id: "gmail", slash: "/gmail", label: "Gmail", contextLabel: "Recent Gmail messages" },
  { id: "outlook", slash: "/outlook", label: "Outlook", contextLabel: "Recent Outlook messages" },
  { id: "spotify", slash: "/spotify", label: "Spotify", contextLabel: "Spotify playback state" },
];

const CONNECTOR_BY_SLASH = new Map<string, ConnectorSkillDef>(
  CONNECTOR_SKILL_DEFS.map((def) => [def.slash, def]),
);

export interface ParsedConnectorSlashCommand {
  def: ConnectorSkillDef;
  /** Texte utilisateur après le slash (peut être vide si l'utilisateur veut juste un résumé). */
  query: string;
}

/**
 * Détecte si le message commence par un slash de connecteur (`/gmail`, `/outlook`, …)
 * et renvoie la définition + la question utilisateur restante.
 */
export function parseConnectorSlashCommand(
  text: string,
): ParsedConnectorSlashCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const match = trimmed.match(/^(\/[a-zA-Z]+)(\s+([\s\S]+))?$/);
  if (!match) return null;
  const slash = match[1]!.toLowerCase();
  const def = CONNECTOR_BY_SLASH.get(slash);
  if (!def) return null;
  return { def, query: (match[3] ?? "").trim() };
}

function formatGmailPreview(messages: ConnectorPreviewMessage[]): string {
  if (messages.length === 0) return "(no recent messages)";
  return messages
    .map((m, i) => {
      const lines = [
        `${i + 1}. ${m.subject || "(no subject)"}`,
        `   From: ${m.from}`,
        `   Date: ${m.date}`,
      ];
      if (m.snippet) lines.push(`   Snippet: ${m.snippet}`);
      return lines.join("\n");
    })
    .join("\n");
}

function formatSpotifyPreview(data: SpotifyPreviewResult): string {
  if (!data.track) return data.playing ? "(playing, unknown track)" : "(no track playing)";
  const status = data.playing ? "Now playing" : "Last played";
  const device = data.device ? ` on ${data.device}` : "";
  return `${status}: ${data.track.name} — ${data.track.artists} (${data.track.album})${device}`;
}

function formatCalendarEvents(events: GoogleCalendarEvent[]): string {
  if (events.length === 0) return "(no events today)";
  return events
    .map(
      (e) =>
        `- ${formatScheduleTime(e.startMinutes)}–${formatScheduleTime(e.endMinutes)} ${e.title}${
          e.detail ? ` — ${e.detail}` : ""
        }`,
    )
    .join("\n");
}

async function fetchConnectorContext(
  id: ConnectorSkillId,
): Promise<string> {
  switch (id) {
    case "gmail":
      return formatGmailPreview(await fetchGmailPreview(8));
    case "outlook":
      return formatGmailPreview(await fetchOutlookPreview(8));
    case "spotify":
      return formatSpotifyPreview(await fetchSpotifyPreview());
    case "calendar": {
      const todayKey = toDateKey(new Date());
      const events = await fetchGoogleCalendarEvents(todayKey);
      return `Date: ${todayKey}\n${formatCalendarEvents(events)}`;
    }
    default:
      return "(no data)";
  }
}

export interface ConnectorAugmentedPrompt {
  /** Prompt envoyé au modèle (inclut le contexte du connecteur). */
  apiPrompt: string;
  /** Texte affiché à l'utilisateur dans la bulle (inchangé). */
  displayText: string;
  /** Le bloc contexte brut pour debug / logs. */
  contextBlock: string;
}

/**
 * Récupère les données du connecteur et construit un prompt enrichi pour le LLM.
 * Si le connecteur n'est pas connecté ou que le fetch échoue, on lève une erreur
 * avec un message explicatif que l'appelant pourra afficher à l'utilisateur.
 */
export async function buildConnectorAugmentedPrompt(
  parsed: ParsedConnectorSlashCommand,
  rawUserText: string,
): Promise<ConnectorAugmentedPrompt> {
  let contextBody: string;
  try {
    contextBody = await fetchConnectorContext(parsed.def.id);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error";
    if (/not[_\s-]?connected/i.test(reason)) {
      throw new Error(
        `Le connecteur ${parsed.def.label} n'est pas connecté. Ouvrez Paramètres → Plugins puis cliquez sur Connecter pour ${parsed.def.label}, et réessayez ${parsed.def.slash}.`,
      );
    }
    throw new Error(
      `Impossible de récupérer les données ${parsed.def.label} (${reason}). Vérifiez que ce connecteur est bien connecté dans Paramètres → Plugins.`,
    );
  }

  const userQuestion = parsed.query.length > 0 ? parsed.query : `Summarize the latest ${parsed.def.label} information.`;

  const apiPrompt = [
    `The user invoked the ${parsed.def.label} connector skill (${parsed.def.slash}).`,
    `Use the data block below as the source of truth and answer in the user's language.`,
    "",
    `User question:`,
    userQuestion,
    "",
    `${parsed.def.contextLabel}:`,
    contextBody,
  ].join("\n");

  return {
    apiPrompt,
    displayText: rawUserText,
    contextBlock: contextBody,
  };
}
