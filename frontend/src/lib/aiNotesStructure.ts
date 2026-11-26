import { api } from "./api";
import { normalizeAiNotesModel } from "./aiModels";
import { useAuthStore } from "../store/useAuthStore";
import { useStore } from "../store/useStore";
import { useWorkspacePresenceStore } from "../store/useWorkspacePresenceStore";

function normalizePersonLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

/** Another workspace member whose name is written in the note. The local user is excluded. */
export function workspaceMemberByNoteName(
  workspaceId: string | undefined,
  label: string,
): { id: string; name: string } | null {
  const wanted = normalizePersonLabel(label);
  if (!workspaceId || !wanted) return null;
  const localId = useAuthStore.getState().firebaseUid;
  const members = useWorkspacePresenceStore.getState().membersByWorkspace[workspaceId] ?? {};
  const people = Object.entries(members)
    .filter(([id]) => id && id !== localId)
    .map(([id, entry]) => ({ id, name: entry.displayName.trim() }))
    .filter((person) => person.name);

  const exact = people.filter((person) => normalizePersonLabel(person.name) === wanted);
  if (exact.length === 1) return exact[0];

  const byToken = people.filter((person) =>
    normalizePersonLabel(person.name).split(" ").includes(wanted),
  );
  return byToken.length === 1 ? byToken[0] : null;
}

export function annotateNotePeople(editor: HTMLElement, workspaceId: string | undefined): void {
  editor.querySelectorAll(".note-person").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const person = workspaceMemberByNoteName(workspaceId, node.textContent ?? "");
    if (!person) {
      node.classList.remove("note-person--link");
      node.removeAttribute("title");
      node.removeAttribute("role");
      return;
    }
    node.classList.add("note-person--link");
    node.title = person.name;
    node.setAttribute("role", "link");
  });
}

/** Every person in the workspace, exact display names, including people not in the call. */
export function workspacePeopleNames(workspaceId: string | undefined): string[] {
  if (!workspaceId) return [];
  const members = useWorkspacePresenceStore.getState().membersByWorkspace[workspaceId] ?? {};
  const names = new Set<string>();
  for (const entry of Object.values(members)) {
    const name = entry.displayName?.trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "fr"));
}

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
  const people = workspacePeopleNames(input.workspaceId);
  const prompt = [
    "Structure or restructure these meeting notes from the full transcript so far.",
    "Refine the previous structure when new content arrives — keep useful sections and update them.",
    "Respond ONLY with HTML (no markdown, no code fences, no plain-text line breaks between blocks).",
    "",
    "Formatting rules:",
    "- <h1> for major sections; <h2> for sub-sections; <h3> only for a third level.",
    "- <p> body paragraphs: group related sentences in ONE <p> (do not put each sentence in its own <p>).",
    "- Keep paragraph spacing tight — no empty <p>, no <br><br>, no extra blank lines.",
    "- Use <strong> for tasks, owners, and key labels.",
    "- Use <em> sparingly for context, caveats, or quoted emphasis.",
    "- Use <u> sparingly for explicit commitments that are not deadlines.",
    "- <ul><li> bullet lists for enumerations.",
    "- When comparing 2+ items, options, pros/cons, or before/after: use a <table> with <thead>, <th>, <tbody>, <td>.",
    "- Do not repeat the note's overall document title — the user adds it separately.",
    "- Never return the transcript unchanged. Use only these sections, in this order, titled in the transcript language: summary, tasks, deadlines, then a table of what each speaker covered.",
    "- Never add a decisions section. Never write « dit par », « said by », or any phrase that labels who spoke outside the table.",
    "- Omit a section when the call has nothing for it. Do not invent missing information.",
    "",
    "Language:",
    "- Write the entire note in the one language of the transcript.",
    "- English speech stays English. French speech stays French. The same rule applies to every language.",
    "- Do not mix languages, do not translate, and do not add titles in another language.",
    "- Keep the speaker's own words. Do not substitute a translation.",
    "- A line that starts with a name and a colon is that person speaking.",
    "- After the other sections, add one table. Columns: the person, then the points they raised.",
    "- One row per person who actually spoke. Group that person's points in their cell.",
    "- A person who never spoke has no row. In a theater, a listener who stays a listener the whole time has no row.",
    "- The note-taker has no row in their own notes when other people spoke and they did not.",
    "- A task can still name someone who was given the work, even if that person did not speak.",
    "- Speech recognition errors: infer the intended word inside that same language.",
    "",
    ...(people.length
      ? [
          "Workspace people:",
          "These are all the people in this workspace. Use this list to know exactly who is meant.",
          ...people.map((name) => `- ${name}`),
          "- When the transcript assigns something to a person, or talks about a person, and that person is on this list, tag them: <span class=\"note-person\">Exact Name</span>.",
          "- Use the exact name from the list. A first name, a last name, or a misheard name that matches only one person becomes that exact name.",
          "- Tag them in the summary, in tasks, and in the speaker table.",
          "- If two people on the list could match, keep the spoken words and do not pick one.",
          "- Leave a name untagged when it matches nobody on the list.",
          "",
        ]
      : []),
    "Highlighting (<mark>) — STRICT, use sparingly (max ~1 highlight per paragraph, often zero):",
    "- ONLY highlight what the speaker explicitly treats as critical in the audio: urgency, priority, blocking, must-do, decision finalisée.",
    "- ALWAYS highlight deadline phrases when spoken: dates, times, « avant le … », « d'ici … », « pour … », « échéance », « due by », « no later than », etc.",
    "- Highlight the task/action AND its deadline together when linked (ex. « <mark>Livrer le prototype avant le 15 juillet</mark> »).",
    "- Do NOT highlight with <mark>: names, filler words, every noun, every number, topic labels, or words that are merely mentioned without emphasis. Names of workspace people use <span class=\"note-person\"> instead.",
    "- If nothing in a section is truly urgent or dated, use NO <mark> in that section.",
    "- Prefer <strong> inside action-item lists for the verb/task; reserve <mark> for urgency/deadline/importance explicitly stated.",
    "",
    "Allowed tags: h1, h2, h3, p, ul, ol, li, mark, u, strong, em, span, table, thead, tbody, tr, th, td.",
    "The only allowed span is <span class=\"note-person\">Exact Name</span>.",
    ...(instructions ? ["", "User instructions:", instructions] : []),
    ...(input.previousHtml?.trim()
      ? ["", "Previous structured draft to refine:", input.previousHtml.trim(), ""]
      : []),
    "Full transcript so far:",
    input.transcript.trim(),
  ].join("\n");

  const response = await api.chat(
    prompt,
    normalizeAiNotesModel(useStore.getState().aiNotesModel),
    [],
    input.signal,
    undefined,
    input.workspaceId,
    "note_html",
  );

  return normalizeStructuredHtml(stripMarkdownFence(response.message));
}
