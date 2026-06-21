import { api } from "./api";
import { aiNotesStructureModel } from "./aiModels";
import { useStore } from "../store/useStore";

export const AI_NOTES_STRUCTURE_INTERVAL_MS = 5_000;

function stripMarkdownFence(text: string): string {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

function normalizeStructuredHtml(html: string): string {
  return html
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/(<br\s*\/?>\s*){2,}/gi, "<br>")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function structureAiNotesTranscript(input: {
  transcript: string;
  previousHtml?: string;
  workspaceId?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const instructions = useStore.getState().agentAiNotesInstructions.trim();
  const prompt = [
    "Structure or restructure these meeting notes from the full transcript so far.",
    "Refine the previous structure when new content arrives — keep useful sections and update them.",
    "Respond ONLY with HTML (no markdown, no code fences, no plain-text line breaks between blocks).",
    "",
    "Formatting rules:",
    "- <h2> section titles; <h3> sub-titles under a section.",
    "- <p> body paragraphs: group related sentences in ONE <p> (do not put each sentence in its own <p>).",
    "- Keep paragraph spacing tight — no empty <p>, no <br><br>, no extra blank lines.",
    "- <u>text</u> only when the speaker clearly stresses something that is NOT a deadline (rare).",
    "- <ul><li> bullet lists for enumerations.",
    "- When comparing 2+ items, options, pros/cons, or before/after: use a <table> with <thead>, <th>, <tbody>, <td>.",
    "- Do not include a document title (<h1>) — the user adds the title separately.",
    "",
    "Language & wording (transcript may be French, English, or mixed — e.g. Quebec French):",
    "- Match how people actually spoke; do NOT normalize or translate their word choices.",
    "- Keep common anglicisms and tech terms as in the audio: backend, frontend, deploy, meeting, deadline, sprint, etc.",
    "- Understand informal Quebec French: « y faut », « checker », « caller », code-switching FR/EN mid-sentence.",
    "- If a term is more natural in English in context (backend vs « arrière-plan »), keep the English term used.",
    "- Section titles may follow the dominant language of that section; body stays faithful to the transcript.",
    "- Speech recognition errors: infer the intended word from context (homophones, partial English words).",
    "",
    "Highlighting (<mark>) — STRICT, use sparingly (max ~1 highlight per paragraph, often zero):",
    "- ONLY highlight what the speaker explicitly treats as critical in the audio: urgency, priority, blocking, must-do, decision finalisée.",
    "- ALWAYS highlight deadline phrases when spoken: dates, times, « avant le … », « d'ici … », « pour … », « échéance », « due by », « no later than », etc.",
    "- Highlight the task/action AND its deadline together when linked (ex. « <mark>Livrer le prototype avant le 15 juillet</mark> »).",
    "- Do NOT highlight: ordinary names, filler words, every noun, every number, topic labels, or words that are merely mentioned without emphasis.",
    "- If nothing in a section is truly urgent or dated, use NO <mark> in that section.",
    "- Prefer <strong> inside action-item lists for the verb/task; reserve <mark> for urgency/deadline/importance explicitly stated.",
    "",
    "Allowed tags: h2, h3, p, ul, ol, li, mark, u, strong, em, table, thead, tbody, tr, th, td.",
    ...(instructions ? ["", "User instructions:", instructions] : []),
    ...(input.previousHtml?.trim()
      ? ["", "Previous structured draft to refine:", input.previousHtml.trim(), ""]
      : []),
    "Full transcript so far:",
    input.transcript.trim(),
  ].join("\n");

  const response = await api.chat(
    prompt,
    aiNotesStructureModel(false),
    [],
    input.signal,
    undefined,
    input.workspaceId,
  );

  return normalizeStructuredHtml(stripMarkdownFence(response.message));
}
