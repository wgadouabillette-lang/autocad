import { api } from "./api";
import { aiNotesStructureModel } from "./aiModels";
import { useStore } from "../store/useStore";

function stripMarkdownFence(text: string): string {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function markdownInlineToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<u>$1</u>")
    .replace(/==(.+?)==/g, "<mark>$1</mark>")
    .replace(/(^|[\s(])\*([^*\n]+?)\*(?=$|[\s).,;:!?])/g, "$1<em>$2</em>");
}

/** Keeps notes styled even if a provider unexpectedly returns Markdown. */
function markdownToNoteHtml(markdown: string): string {
  const blocks: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];
  let paragraph: string[] = [];

  const flushList = () => {
    if (!listType || listItems.length === 0) return;
    blocks.push(`<${listType}>${listItems.map((item) => `<li>${item}</li>`).join("")}</${listType}>`);
    listType = null;
    listItems = [];
  };
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(`<p>${paragraph.join(" ")}</p>`);
    paragraph = [];
  };

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const tag = heading[1].length === 1 ? "h1" : heading[1].length === 2 ? "h2" : "h3";
      blocks.push(`<${tag}>${markdownInlineToHtml(heading[2])}</${tag}>`);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (bullet || numbered) {
      flushParagraph();
      const nextType = bullet ? "ul" : "ol";
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push(markdownInlineToHtml((bullet ?? numbered)![1]));
      continue;
    }
    flushList();
    paragraph.push(markdownInlineToHtml(line));
  }
  flushParagraph();
  flushList();
  return blocks.join("");
}

function normalizeStructuredHtml(raw: string): string {
  const html = /<(?:h[1-4]|p|ul|ol|table|blockquote)\b/i.test(raw)
    ? raw
    : markdownToNoteHtml(raw);
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
    "- <h1> for major sections; <h2> for sub-sections; <h3> only for a third level.",
    "- <p> body paragraphs: group related sentences in ONE <p> (do not put each sentence in its own <p>).",
    "- Keep paragraph spacing tight — no empty <p>, no <br><br>, no extra blank lines.",
    "- Use <strong> for tasks, owners, decisions, and key labels.",
    "- Use <em> sparingly for context, caveats, or quoted emphasis.",
    "- Use <u> sparingly for explicit commitments that are not deadlines.",
    "- <ul><li> bullet lists for enumerations.",
    "- When comparing 2+ items, options, pros/cons, or before/after: use a <table> with <thead>, <th>, <tbody>, <td>.",
    "- Do not repeat the note's overall document title — the user adds it separately.",
    "- Never return the transcript unchanged. Organize it into meaningful sections such as summary, decisions, tasks, and schedule/deadlines when those topics exist.",
    "- Do not add empty boilerplate sections and never invent missing information.",
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
    "Allowed tags: h1, h2, h3, p, ul, ol, li, mark, u, strong, em, table, thead, tbody, tr, th, td.",
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
    "note_html",
  );

  return normalizeStructuredHtml(stripMarkdownFence(response.message));
}
