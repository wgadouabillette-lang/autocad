import {
  Bold,
  Heading1,
  Heading2,
  Highlighter,
  Italic,
  Loader2,
  Square,
  Text as TextIcon,
  Underline as UnderlineIcon,
  Download,
  ArrowUpRight,
} from "lucide-react";
import clsx from "clsx";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { useAiNotesEditorSync } from "../../hooks/useAiNotesEditorSync";
import {
  dismissFictionalNotesPreview,
  fictionalNotesPreviewTitle,
  isFictionalNotesPreview,
} from "../../lib/fictionalStructuredNote";
import {
  clearNotesEditorDraft,
  plainTextFromNoteHtml,
  publishNotesEditorDraft,
} from "../../lib/notesFullscreenPromo";
import { downloadNotePdf } from "../../lib/notePdf";
import { annotateNotePeople, workspaceMemberByNoteName } from "../../lib/aiNotesStructure";
import { sanitizeNoteHtml } from "../../lib/sanitizeHtml";
import { hasAiNotesAccess } from "../../lib/subscriptionPlans";
import { useAiNotesStore } from "../../store/useAiNotesStore";
import { usePeopleStore } from "../../store/usePeopleStore";
import { useWorkspacePresenceStore } from "../../store/useWorkspacePresenceStore";
import { useRecapStore } from "../../store/useRecapStore";
import { useStore } from "../../store/useStore";

const AUTO_SAVE_DEBOUNCE_MS = 500;
const HIGHLIGHT_COLOR = "rgba(250, 204, 21, 0.35)";

type FormatAction =
  | { kind: "block"; tag: "H1" | "H2" | "P" }
  | { kind: "inline"; command: "bold" | "italic" | "underline" }
  | { kind: "highlight" };

type ToolbarItem = {
  id: string;
  label: string;
  Icon: typeof Bold;
  action: FormatAction;
};

const TOOLBAR_ITEMS: ToolbarItem[] = [
  { id: "headline", label: "Heading", Icon: Heading1, action: { kind: "block", tag: "H1" } },
  { id: "subtitle", label: "Subheading", Icon: Heading2, action: { kind: "block", tag: "H2" } },
  { id: "body", label: "Body", Icon: TextIcon, action: { kind: "block", tag: "P" } },
  { id: "bold", label: "Bold", Icon: Bold, action: { kind: "inline", command: "bold" } },
  { id: "italic", label: "Italic", Icon: Italic, action: { kind: "inline", command: "italic" } },
  {
    id: "underline",
    label: "Underline",
    Icon: UnderlineIcon,
    action: { kind: "inline", command: "underline" },
  },
  { id: "highlight", label: "Highlight", Icon: Highlighter, action: { kind: "highlight" } },
];

function runFormat(action: FormatAction, editor: HTMLDivElement) {
  editor.focus();
  if (action.kind === "inline") {
    document.execCommand(action.command, false);
    return;
  }
  if (action.kind === "block") {
    document.execCommand("formatBlock", false, action.tag);
    return;
  }
  if (action.kind === "highlight") {
    document.execCommand("hiliteColor", false, HIGHLIGHT_COLOR);
  }
}

function publishLiveNoteDraft(title: string, editor: HTMLDivElement | null, fallbackHtml = "") {
  const fromEditor = editor?.innerText ?? "";
  publishNotesEditorDraft({
    title,
    bodyPlain: fromEditor || plainTextFromNoteHtml(fallbackHtml),
  });
}

export default function ManualNotesPanel() {
  const saveManualNote = useStore((s) => s.saveManualNote);
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const openSettingsTab = useStore((s) => s.openSettingsTab);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const workspaceMembers = useWorkspacePresenceStore((s) => s.membersByWorkspace[activeRoomId]);
  const activeManualNoteId = useStore((s) => s.activeManualNoteId);
  const chatSessions = useStore((s) => s.chatSessions);
  const aiNotesActive = useAiNotesStore((s) => s.active);
  const aiNotesBusy = useAiNotesStore((s) => s.busy);
  const aiNotesError = useAiNotesStore((s) => s.error);
  const aiNotesStructureError = useAiNotesStore((s) => s.structureError);
  const toggleAiNotes = useAiNotesStore((s) => s.toggle);
  const stopAiNotes = useAiNotesStore((s) => s.stop);
  const structureText = useAiNotesStore((s) => s.structureText);
  const recapGenerating = useRecapStore((s) => s.generating);
  const recapLabel = useRecapStore((s) => s.generatingLabel);
  const recapError = useRecapStore((s) => s.error);
  const initialNote = activeManualNoteId
    ? chatSessions.find((session) => session.id === activeManualNoteId) ?? null
    : null;
  const initialTitle = initialNote?.manualNoteTitle ?? "";
  const initialBody =
    initialNote?.manualNoteBody ?? initialNote?.messages?.[0]?.text ?? "";
  const [title, setTitle] = useState(() => fictionalNotesPreviewTitle() || initialTitle);

  useEffect(() => {
    const onPreview = () => {
      const previewTitle = fictionalNotesPreviewTitle();
      if (previewTitle) setTitle(previewTitle);
    };
    window.addEventListener("meetra-notes-preview", onPreview);
    return () => window.removeEventListener("meetra-notes-preview", onPreview);
  }, []);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(activeManualNoteId);
  const initializedRef = useRef(false);
  const prevAiNotesActiveRef = useRef(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const canUseAiNotes = hasAiNotesAccess(
    subscriptionPlan,
    billingManaged,
    workspaceEnterpriseActive,
  );

  const bumpEditor = useCallback(() => {
    setEditorVersion((v) => v + 1);
    requestAnimationFrame(() => {
      const scrollEl = editorScrollRef.current;
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    });
  }, []);
  const { structuring } = useAiNotesEditorSync(editorRef, bumpEditor);

  useEffect(() => {
    if (!structuring) return;
    const scrollEl = editorScrollRef.current;
    if (!scrollEl) return;
    scrollEl.scrollTop = scrollEl.scrollHeight;
  }, [structuring, editorVersion]);

  useLayoutEffect(() => {
    if (!initializedRef.current && editorRef.current) {
      editorRef.current.innerHTML = sanitizeNoteHtml(initialBody);
      initializedRef.current = true;
    }
    if (editorRef.current) annotateNotePeople(editorRef.current, activeRoomId);
    publishLiveNoteDraft(title, editorRef.current, initialBody);
  }, [title, editorVersion, initialBody, activeRoomId, workspaceMembers]);

  const openNotedPerson = (event: MouseEvent<HTMLElement>) => {
    const chip = (event.target as HTMLElement).closest?.(".note-person");
    if (!(chip instanceof HTMLElement)) return;
    const person = workspaceMemberByNoteName(activeRoomId, chip.textContent ?? "");
    if (!person) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.type !== "mousedown" || event.button !== 0) return;
    usePeopleStore.getState().openWorkspaceMemberConversation(
      activeRoomId,
      person.id,
      person.name,
    );
  };

  useEffect(() => {
    return () => clearNotesEditorDraft();
  }, []);

  useEffect(() => {
    sessionIdRef.current = activeManualNoteId;
  }, [activeManualNoteId]);

  const handleAiToggle = () => {
    if (!canUseAiNotes) {
      openSettingsTab("usage");
      return;
    }
    dismissFictionalNotesPreview();
    void toggleAiNotes(activeRoomId, sessionIdRef.current);
  };

  const handleStopRecording = () => {
    void stopAiNotes();
  };

  const handleStructure = () => {
    if (!canUseAiNotes) {
      openSettingsTab("usage");
      return;
    }
    dismissFictionalNotesPreview();
    const text = editorRef.current?.innerText.trim() ?? "";
    if (!text || structuring) return;
    void (async () => {
      if (useAiNotesStore.getState().active) {
        await stopAiNotes();
      }
      await structureText(text);
    })();
  };

  useEffect(() => {
    if (isFictionalNotesPreview()) return;
    const trimmedTitle = title.trim();
    const html = editorRef.current?.innerHTML ?? "";
    const plain = editorRef.current?.innerText.trim() ?? "";
    if (!trimmedTitle && !plain) return;
    const handle = window.setTimeout(() => {
      const session = saveManualNote({
        id: sessionIdRef.current,
        title: trimmedTitle,
        body: html,
      });
      if (session) sessionIdRef.current = session.id;
    }, AUTO_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [title, editorVersion, saveManualNote]);

  useEffect(() => {
    const wasActive = prevAiNotesActiveRef.current;
    prevAiNotesActiveRef.current = aiNotesActive;

    if (isFictionalNotesPreview()) return;
    if (wasActive && !aiNotesActive && !aiNotesBusy) {
      const html = editorRef.current?.innerHTML ?? "";
      const plain = editorRef.current?.innerText.trim() ?? "";
      if (plain) {
        const session = saveManualNote({
          id: sessionIdRef.current,
          title: title.trim(),
          body: html,
        });
        if (session) sessionIdRef.current = session.id;
      }
    }
  }, [aiNotesActive, aiNotesBusy, saveManualNote, title]);

  const handleFormat = (action: FormatAction) => {
    const editor = editorRef.current;
    if (!editor) return;
    runFormat(action, editor);
    publishLiveNoteDraft(title, editor, initialBody);
    setEditorVersion((v) => v + 1);
  };

  const handleDownloadPdf = async () => {
    const html = editorRef.current?.innerHTML ?? "";
    setPdfError(null);
    try {
      await downloadNotePdf(title, html);
    } catch (error) {
      setPdfError(
        error instanceof Error ? error.message : "Impossible de télécharger le PDF.",
      );
    }
  };

  const editorLocked = aiNotesActive || structuring || recapGenerating;

  return (
    <div className={clsx("manual-notes-panel", recapGenerating && "manual-notes-panel--recap")}>
      <div className="manual-notes-panel__toolbar" role="toolbar" aria-label="Formatting">
        {TOOLBAR_ITEMS.map(({ id, label, Icon, action }) => (
          <button
            key={id}
            type="button"
            className="manual-notes-panel__tool"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleFormat(action)}
            aria-label={label}
            title={label}
            disabled={recapGenerating || aiNotesActive}
          >
            <Icon size={14} strokeWidth={2} aria-hidden />
          </button>
        ))}
        <button
          type="button"
          className="manual-notes-panel__tool"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void handleDownloadPdf()}
          aria-label="Télécharger en PDF"
          title="Télécharger en PDF"
          disabled={recapGenerating || aiNotesActive}
        >
          <Download size={14} strokeWidth={2} aria-hidden />
        </button>
        {aiNotesActive ? (
          <button
            type="button"
            className="manual-notes-panel__tool manual-notes-panel__tool--stop"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleStopRecording}
            disabled={aiNotesBusy}
            aria-label="Arrêter l'enregistrement"
            title="Arrêter l'enregistrement"
          >
            <Square size={12} fill="currentColor" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            className="manual-notes-panel__ai-capsule"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleAiToggle}
            aria-pressed={aiNotesActive}
            aria-label={
              canUseAiNotes ? "Démarrer l'enregistrement AI Notes" : "Upgrade to use AI mode"
            }
            title={
              canUseAiNotes ? "Démarrer l'enregistrement AI Notes" : "Upgrade to use AI mode"
            }
            disabled={aiNotesBusy || recapGenerating}
          >
            <span className="manual-notes-panel__ai-capsule-label">AI Notes</span>
          </button>
        )}
      </div>

      {recapGenerating ? (
        <div className="recap-generating" aria-live="polite" aria-busy="true">
          <p className="recap-generating__status">
            <span className="text-shimmer">{recapLabel}</span>
          </p>
          <div className="recap-generating__skeleton" aria-hidden>
            <div className="recap-generating-shimmer recap-generating-shimmer--title" />
            <div className="recap-generating-shimmer recap-generating-shimmer--line recap-generating-shimmer--w90" />
            <div className="recap-generating-shimmer recap-generating-shimmer--line recap-generating-shimmer--w100" />
            <div className="recap-generating-shimmer recap-generating-shimmer--line recap-generating-shimmer--w75" />
            <div className="recap-generating-shimmer recap-generating-shimmer--heading" />
            <div className="recap-generating-shimmer recap-generating-shimmer--line recap-generating-shimmer--w85" />
            <div className="recap-generating-shimmer recap-generating-shimmer--line recap-generating-shimmer--w60" />
          </div>
        </div>
      ) : (
        <>
          <input
            type="text"
            className="manual-notes-panel__title-input"
            value={title}
            onChange={(event) => {
              const next = event.target.value;
              setTitle(next);
              publishLiveNoteDraft(next, editorRef.current, initialBody);
            }}
            placeholder="Add Title"
            aria-label="Note title"
          />

          <div className="manual-notes-panel__editor-wrap">
            <div ref={editorScrollRef} className="manual-notes-panel__editor-scroll">
              <div
                ref={editorRef}
                className={clsx(
                  "manual-notes-panel__editor",
                  editorLocked && "manual-notes-panel__editor--locked",
                )}
                contentEditable={!editorLocked}
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                aria-label="Note content"
                aria-busy={structuring}
                onMouseDown={openNotedPerson}
                onClick={openNotedPerson}
                data-placeholder={
                  aiNotesActive
                    ? "Écoute en cours — la transcription apparaît ici…"
                    : "Write your note here…"
                }
                onInput={() => {
                  dismissFictionalNotesPreview();
                  publishLiveNoteDraft(title, editorRef.current, initialBody);
                  setEditorVersion((v) => v + 1);
                }}
              />
              {structuring && (
                <div
                  className="manual-notes-panel__structuring"
                  aria-live="polite"
                  aria-busy="true"
                >
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                  <span className="text-shimmer">Structuration…</span>
                </div>
              )}
            </div>
          </div>

          <div className="manual-notes-panel__bottom">
          {(aiNotesError || aiNotesStructureError || pdfError) && (
            <div className="manual-notes-panel__footer">
              {aiNotesError && (
                <p className="manual-notes-panel__ai-error" role="alert">
                  {aiNotesError}
                </p>
              )}
              {aiNotesStructureError && (
                <p
                  className="manual-notes-panel__ai-error manual-notes-panel__ai-error--soft"
                  role="status"
                >
                  {aiNotesStructureError}
                </p>
              )}
              {pdfError && (
                <p className="manual-notes-panel__ai-error" role="alert">
                  {pdfError}
                </p>
              )}
            </div>
          )}
          <button
            type="button"
            className="manual-notes-panel__structure-btn"
            onClick={handleStructure}
            disabled={structuring || aiNotesBusy || !(editorRef.current?.innerText.trim())}
          >
            <span className="manual-notes-panel__structure-btn-label">
              {structuring ? "Structuration…" : "Structurer"}
              <ArrowUpRight size={14} strokeWidth={2} aria-hidden />
            </span>
          </button>
          </div>
        </>
      )}

      {recapError && !recapGenerating ? (
        <p className="recap-generating__error" role="alert">
          {recapError}
        </p>
      ) : null}

    </div>
  );
}
