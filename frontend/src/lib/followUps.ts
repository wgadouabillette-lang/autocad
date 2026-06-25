import { api } from "./api";
import { useStore } from "../store/useStore";
import { toDateKey } from "./daySchedule";
import { isLocalInGroupCall } from "./calls";
import { useCallsStore } from "../store/useCallsStore";
import { workspaceLabel } from "../store/useWorkspacesStore";

export interface FollowUpActionDraft {
  id: string;
  title: string;
  detail?: string;
  dueDate: string;
  startMinutes: number;
  endMinutes: number;
  selected: boolean;
}

export interface FollowUpEmailDraft {
  id: string;
  to: string;
  subject: string;
  body: string;
  selected: boolean;
}

export interface FollowUpDraft {
  id: string;
  roomId: string;
  recap: string;
  actions: FollowUpActionDraft[];
  emails: FollowUpEmailDraft[];
  createdAt: number;
}

export interface CallFollowUpContext {
  roomId: string;
  participantCount: number;
  recording: boolean;
  groupCall: boolean;
}

export interface CallFollowUpInput extends CallFollowUpContext {
  transcript?: string;
  durationMs?: number;
}

export function buildCallFollowUpContext(roomId: string): CallFollowUpContext {
  const state = useCallsStore.getState().callsByRoom[roomId];
  const blocks = state?.blocks ?? [];
  const participantCount = blocks.reduce((sum, block) => sum + block.participants.length, 0) || 1;
  const groupCall = isLocalInGroupCall(blocks) || participantCount >= 3;
  return {
    roomId,
    participantCount,
    recording: false,
    groupCall,
  };
}

function offsetDateKey(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

function extractEmails(text: string): string[] {
  const matches = text.match(/[\w.+-]+@[\w.-]+\.\w+/gi) ?? [];
  return [...new Set(matches.map((e) => e.toLowerCase()))];
}

function parseJsonFromLlm(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1].trim() : text.trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("JSON introuvable");
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeDraftFromLlm(
  data: Record<string, unknown>,
  ctx: CallFollowUpInput,
): FollowUpDraft {
  const now = Date.now();
  const actionsRaw = Array.isArray(data.actions) ? data.actions : [];
  const emailsRaw = Array.isArray(data.emails) ? data.emails : [];

  const actions: FollowUpActionDraft[] = actionsRaw.map((item, index) => {
    const row = item as Record<string, unknown>;
    const dueDate = asString(row.dueDate, offsetDateKey(1));
    const startMinutes = asNumber(row.startMinutes, 10 * 60);
    const endMinutes = asNumber(row.endMinutes, startMinutes + 30);
    return {
      id: `fu-a-${now}-${index}`,
      title: asString(row.title, "Action à faire"),
      detail: asString(row.detail) || undefined,
      dueDate,
      startMinutes,
      endMinutes: endMinutes > startMinutes ? endMinutes : startMinutes + 30,
      selected: true,
    };
  });

  const emails: FollowUpEmailDraft[] = emailsRaw.map((item, index) => {
    const row = item as Record<string, unknown>;
    return {
      id: `fu-e-${now}-${index}`,
      to: asString(row.to, ""),
      subject: asString(row.subject, "Suivi d'appel"),
      body: asString(row.body, ""),
      selected: Boolean(row.to),
    };
  }).filter((e) => e.to);

  return {
    id: `fu-${now}`,
    roomId: ctx.roomId,
    recap: asString(data.recap, "Récap de l'appel."),
    actions,
    emails,
    createdAt: now,
  };
}

function mockFollowUpDraft(ctx: CallFollowUpInput): FollowUpDraft {
  const workspace = workspaceLabel(ctx.roomId);
  const participants =
    ctx.participantCount <= 1
      ? "appel 1:1"
      : `appel à ${ctx.participantCount} participants`;

  const transcriptSnippet = ctx.transcript?.trim();
  const foundEmails = transcriptSnippet ? extractEmails(transcriptSnippet) : [];

  const recapParts = [
    `Récap pour le ${participants} (${workspace}).`,
    ctx.recording
      ? "L'enregistrement audio de l'appel a été analysé."
      : "Synthèse basée sur le contexte de l'appel.",
  ];
  if (transcriptSnippet) {
    recapParts.push(transcriptSnippet.slice(0, 480));
  }
  recapParts.push("Validez les actions et les e-mails avant enregistrement.");

  const dueTomorrow = offsetDateKey(1);
  const dueInTwoDays = offsetDateKey(2);

  const actions: FollowUpActionDraft[] = [
    {
      id: `fu-a-${Date.now()}-1`,
      title: "Envoyer le compte-rendu",
      detail: workspace,
      dueDate: dueTomorrow,
      startMinutes: 10 * 60,
      endMinutes: 10 * 60 + 30,
      selected: true,
    },
    {
      id: `fu-a-${Date.now()}-2`,
      title: "Valider les actions discutées",
      detail: "Suivi équipe",
      dueDate: dueInTwoDays,
      startMinutes: 14 * 60,
      endMinutes: 15 * 60,
      selected: true,
    },
  ];

  if (ctx.groupCall) {
    actions.push({
      id: `fu-a-${Date.now()}-3`,
      title: "Planifier le prochain point",
      detail: "Réunion de suivi",
      dueDate: dueInTwoDays,
      startMinutes: 16 * 60 + 30,
      endMinutes: 17 * 60,
      selected: true,
    });
  }

  const emails: FollowUpEmailDraft[] = foundEmails.map((to, index) => ({
    id: `fu-e-${Date.now()}-${index}`,
    to,
    subject: `Suivi — ${workspace}`,
    body: transcriptSnippet
      ? `Bonjour,\n\nVoici le suivi de notre appel :\n${transcriptSnippet.slice(0, 600)}\n\nCordialement`
      : `Bonjour,\n\nVoici le suivi de notre appel (${workspace}).\n\nCordialement`,
    selected: true,
  }));

  return {
    id: `fu-${Date.now()}`,
    roomId: ctx.roomId,
    recap: recapParts.join(" "),
    actions,
    emails,
    createdAt: Date.now(),
  };
}

export async function generateFollowUpDraft(ctx: CallFollowUpInput): Promise<FollowUpDraft> {
  const transcript = ctx.transcript?.trim();

  if (transcript) {
    const prompt = [
      "Tu analyses la transcription d'un appel vocal d'équipe.",
      "Réponds UNIQUEMENT avec un JSON valide (pas de markdown autour) de la forme :",
      '{"recap":"...","actions":[{"title":"...","detail":"...","dueDate":"YYYY-MM-DD","startMinutes":600,"endMinutes":630}],"emails":[{"to":"email@exemple.com","subject":"...","body":"..."}]}',
      "actions : tâches à faire avec date/heure si mentionnées dans l'appel (startMinutes/endMinutes = minutes depuis minuit).",
      "emails : uniquement si une adresse ou un envoi est mentionné.",
      "Langue : français.",
      "",
      ...(useStore.getState().agentFollowUpInstructions.trim()
        ? [
            "Instructions supplémentaires :",
            useStore.getState().agentFollowUpInstructions.trim(),
            "",
          ]
        : []),
      `Workspace : ${workspaceLabel(ctx.roomId)}`,
      `Participants : ${ctx.participantCount}`,
      "",
      "Transcription :",
      transcript,
    ].join("\n");

    try {
      const response = await api.chat(prompt, "auto", [], undefined, undefined, ctx.roomId);
      const parsed = parseJsonFromLlm(response.message);
      const draft = normalizeDraftFromLlm(parsed, ctx);
      if (draft.actions.length > 0 || draft.emails.length > 0 || draft.recap) {
        return draft;
      }
    } catch {
      /* fallback mock */
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 900));
  return mockFollowUpDraft(ctx);
}
