import { hasFormaDesktop } from "./formaDesktop";
import { useAiNotesStore } from "../store/useAiNotesStore";
import { useStore } from "../store/useStore";

const FICTIONAL_STRUCTURED_NOTE_HTML = [
  "<h1>Résumé</h1>",
  "<p>Léa fixe la livraison du prototype et confie le design à <span class=\"note-person\">Marc Dubois</span>. Marc envoie les écrans vendredi.</p>",
  "<h1>Tâches</h1>",
  "<ul><li><strong><span class=\"note-person\">Marc Dubois</span></strong> envoie les écrans.</li><li><strong><span class=\"note-person\">Léa Martin</span></strong> livre le prototype.</li></ul>",
  "<h1>Échéances</h1>",
  "<ul><li>Prototype : <mark>avant le 15 juillet</mark>.</li><li>Écrans : <mark>d'ici vendredi</mark>.</li></ul>",
  "<h1>Points abordés</h1>",
  "<table><thead><tr><th>Personne</th><th>Points</th></tr></thead><tbody>",
  "<tr><td><span class=\"note-person\">Léa Martin</span></td><td>Livraison du prototype <mark>avant le 15 juillet</mark>. Le design est confié à <span class=\"note-person\">Marc Dubois</span>.</td></tr>",
  "<tr><td><span class=\"note-person\">Marc Dubois</span></td><td>Envoi des écrans <mark>d'ici vendredi</mark>.</td></tr>",
  "</tbody></table>",
].join("");

let previewActive = false;

export function fictionalNotesPreviewTitle(): string {
  return previewActive ? "Appel fictif" : "";
}

export function isFictionalNotesPreview(): boolean {
  return previewActive;
}

export function dismissFictionalNotesPreview(): void {
  previewActive = false;
}

/** One look at a finished note, in the real notes panel. Dev Electron only. */
export function showFictionalStructuredNotesOnce(): void {
  if (!import.meta.env.DEV || !hasFormaDesktop() || previewActive) return;
  if (new URLSearchParams(window.location.search).get("notesPreview") !== "1") return;
  previewActive = true;
  useStore.getState().openAiNotesPanel();
  useAiNotesStore.setState({
    structuredHtml: FICTIONAL_STRUCTURED_NOTE_HTML,
    structuring: false,
    structureError: null,
    active: false,
    lines: [],
    interimText: "",
  });
  window.dispatchEvent(new Event("meetra-notes-preview"));
}

export const fictionalStructuredNoteHtml = FICTIONAL_STRUCTURED_NOTE_HTML;
