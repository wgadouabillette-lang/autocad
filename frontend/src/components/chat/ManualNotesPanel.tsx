import {
  Bold,
  Heading1,
  Heading2,
  Highlighter,
  Italic,
  Sparkles,
  Text as TextIcon,
  Underline as UnderlineIcon,
  ArrowRightLeft,
} from "lucide-react";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { hasAiNotesAccess } from "../../lib/subscriptionPlans";
import { useAiNotesStore } from "../../store/useAiNotesStore";
import { useRecapStore } from "../../store/useRecapStore";
import { useHandoffStore } from "../../store/useHandoffStore";
import { useStore } from "../../store/useStore";
import HandoffNoteOverlay from "./HandoffNoteOverlay";

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

export default function ManualNotesPanel() {
  const saveManualNote = useStore((s) => s.saveManualNote);
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const openSettingsTab = useStore((s) => s.openSettingsTab);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const activeManualNoteId = useStore((s) => s.activeManualNoteId);
  const chatSessions = useStore((s) => s.chatSessions);
  const aiNotesActive = useAiNotesStore((s) => s.active);
  const aiNotesBusy = useAiNotesStore((s) => s.busy);
  const toggleAiNotes = useAiNotesStore((s) => s.toggle);
  const recapGenerating = useRecapStore((s) => s.generating);
  const recapLabel = useRecapStore((s) => s.generatingLabel);
  const recapError = useRecapStore((s) => s.error);
  const noteHandoffOpen = useHandoffStore((s) => s.noteHandoffOpen);
  const handoffTarget = useHandoffStore((s) => s.target);
  const handoffSubmitting = useHandoffStore((s) => s.submitting);
  const handoffError = useHandoffStore((s) => s.error);
  const openNoteHandoff = useHandoffStore((s) => s.openNoteHandoff);
  const closeNoteHandoff = useHandoffStore((s) => s.closeNoteHandoff);
  const setHandoffTarget = useHandoffStore((s) => s.setTarget);
  const submitNoteHandoff = useHandoffStore((s) => s.submitNoteHandoff);
  const initialNote = activeManualNoteId
    ? chatSessions.find((session) => session.id === activeManualNoteId) ?? null
    : null;
  const initialTitle = initialNote?.manualNoteTitle ?? "";
  const initialBody =
    initialNote?.manualNoteBody ?? initialNote?.messages?.[0]?.text ?? "";
  const [title, setTitle] = useState(initialTitle);
  const editorRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(activeManualNoteId);
  const initializedRef = useRef(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const canUseAiNotes = hasAiNotesAccess(
    subscriptionPlan,
    billingManaged,
    workspaceEnterpriseActive,
  );

  useEffect(() => {
    if (initializedRef.current) return;
    if (editorRef.current) {
      editorRef.current.innerHTML = initialBody;
      initializedRef.current = true;
    }
  }, [initialBody]);

  const handleAiToggle = () => {
    if (!canUseAiNotes) {
      openSettingsTab("usage");
      return;
    }
    void toggleAiNotes(activeRoomId);
  };

  useEffect(() => {
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

  const handleFormat = (action: FormatAction) => {
    const editor = editorRef.current;
    if (!editor) return;
    runFormat(action, editor);
    setEditorVersion((v) => v + 1);
  };

  const handleHandoffNote = () => {
    const html = editorRef.current?.innerHTML ?? "";
    openNoteHandoff(title, html);
  };

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
            disabled={recapGenerating}
          >
            <Icon size={14} strokeWidth={2} aria-hidden />
          </button>
        ))}
        <button
          type="button"
          className="manual-notes-panel__tool"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleHandoffNote}
          aria-label="Handoff note"
          title="Handoff note"
          disabled={recapGenerating}
        >
          <ArrowRightLeft size={14} strokeWidth={2} aria-hidden />
        </button>
        <button
          type="button"
          className={`manual-notes-panel__tool manual-notes-panel__tool--ai${aiNotesActive ? " is-active" : ""}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleAiToggle}
          aria-pressed={aiNotesActive}
          aria-label={
            canUseAiNotes
              ? aiNotesActive
                ? "Stop AI recording"
                : "Start AI recording"
              : "Upgrade to use AI mode"
          }
          title={
            canUseAiNotes
              ? aiNotesActive
                ? "Stop AI recording"
                : "Start AI recording"
              : "Upgrade to use AI mode"
          }
          disabled={aiNotesBusy || recapGenerating}
        >
          <Sparkles size={14} strokeWidth={2} aria-hidden />
        </button>
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
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title"
            aria-label="Note title"
          />

          <div
            ref={editorRef}
            className="manual-notes-panel__editor"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Note content"
            data-placeholder="Write your note here…"
            onInput={() => setEditorVersion((v) => v + 1)}
          />
        </>
      )}

      {recapError && !recapGenerating ? (
        <p className="recap-generating__error" role="alert">
          {recapError}
        </p>
      ) : null}

      <HandoffNoteOverlay
        open={noteHandoffOpen}
        noteTitle={title}
        target={handoffTarget}
        submitting={handoffSubmitting}
        error={handoffError}
        onTargetChange={setHandoffTarget}
        onClose={closeNoteHandoff}
        onSubmit={() => void submitNoteHandoff()}
      />
    </div>
  );
}
