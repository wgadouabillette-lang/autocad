import clsx from "clsx";
import { Paperclip, X } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent, type MutableRefObject, type Ref } from "react";
import type { MailPromptDraft } from "../../lib/mailSkill";
import HighlightedPromptInput from "./HighlightedPromptInput";

interface MailPromptLineProps {
  draft: MailPromptDraft;
  onChange?: (draft: MailPromptDraft) => void;
  peopleHandles?: string[];
  readOnly?: boolean;
  onDismiss?: () => void;
  recipientsRef?: MutableRefObject<HTMLTextAreaElement | null>;
  onRecipientsSync?: (caret: number) => void;
  onRecipientsKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  attachments?: File[];
  onAttachmentsChange?: (files: File[]) => void;
}

function assignRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(node);
  else (ref as MutableRefObject<T | null>).current = node;
}

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const ref of refs) assignRef(ref, node);
  };
}

export default function MailPromptLine({
  draft,
  onChange,
  peopleHandles = [],
  readOnly = false,
  onDismiss,
  recipientsRef,
  onRecipientsSync,
  onRecipientsKeyDown,
  attachments = [],
  onAttachmentsChange,
}: MailPromptLineProps) {
  const localRecipientsRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (readOnly) return;
    const input = recipientsRef?.current ?? localRecipientsRef.current;
    input?.focus();
  }, [readOnly, recipientsRef]);

  const patch = (partial: Partial<MailPromptDraft>) => {
    onChange?.({ ...draft, ...partial });
  };

  const addFiles = (files: FileList | null) => {
    if (!files?.length || readOnly) return;
    const next = [...attachments, ...Array.from(files)].slice(0, 10);
    onAttachmentsChange?.(next);
    patch({ attachmentNames: next.map((f) => f.name) });
  };

  const removeAttachment = (index: number) => {
    const next = attachments.filter((_, i) => i !== index);
    onAttachmentsChange?.(next);
    patch({ attachmentNames: next.map((f) => f.name) });
  };

  return (
    <div className={clsx("mail-prompt-line", readOnly && "mail-prompt-line--readonly")}>
      <div className="mail-prompt-line__header">
        <span className="mail-prompt-line__slash">/mail</span>
        {!readOnly && onDismiss ? (
          <button
            type="button"
            className="mail-prompt-line__dismiss"
            onClick={onDismiss}
            aria-label="Annuler le skill mail"
          >
            <X size={14} aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="mail-prompt-line__recipients">
        {readOnly ? (
          <p className="mail-prompt-line__readonly-recipients">{draft.recipients.trim()}</p>
        ) : (
          <HighlightedPromptInput
            ref={mergeRefs(localRecipientsRef, recipientsRef)}
            value={draft.recipients}
            onChange={(value) => {
              patch({ recipients: value });
              const caret = localRecipientsRef.current?.selectionStart ?? value.length;
              onRecipientsSync?.(caret);
            }}
            onClick={() => {
              const caret = localRecipientsRef.current?.selectionStart ?? draft.recipients.length;
              onRecipientsSync?.(caret);
            }}
            onKeyUp={() => {
              const caret = localRecipientsRef.current?.selectionStart ?? draft.recipients.length;
              onRecipientsSync?.(caret);
            }}
            onFocus={() => {
              const caret = localRecipientsRef.current?.selectionStart ?? draft.recipients.length;
              onRecipientsSync?.(caret);
            }}
            onKeyDown={onRecipientsKeyDown}
            peopleHandles={peopleHandles}
            placeholder="@nom du workspace ou email@exemple.com"
            className="mail-prompt-line__recipients-input"
          />
        )}
      </div>

      {readOnly ? (
        <p className="mail-prompt-line__readonly-subject">
          {draft.subject.trim() || "(Sans objet)"}
        </p>
      ) : (
        <input
          type="text"
          className="mail-prompt-line__subject"
          value={draft.subject}
          onChange={(event) => patch({ subject: event.target.value })}
          placeholder="Objet"
          aria-label="Objet de l'email"
        />
      )}

      {readOnly ? (
        <p className="mail-prompt-line__readonly-body">{draft.body}</p>
      ) : (
        <textarea
          className="mail-prompt-line__body"
          value={draft.body}
          onChange={(event) => patch({ body: event.target.value })}
          placeholder="Contenu de l'email"
          rows={4}
          aria-label="Contenu de l'email"
        />
      )}

      {(attachments.length > 0 || draft.attachmentNames.length > 0) && (
        <ul className="mail-prompt-line__attachments">
          {readOnly
            ? draft.attachmentNames.map((name) => (
                <li key={name} className="mail-prompt-line__attachment">
                  <Paperclip size={12} aria-hidden />
                  <span>{name}</span>
                </li>
              ))
            : attachments.map((file, index) => (
                <li key={`${file.name}-${index}`} className="mail-prompt-line__attachment">
                  <Paperclip size={12} aria-hidden />
                  <span>{file.name}</span>
                  <button
                    type="button"
                    className="mail-prompt-line__attachment-remove"
                    onClick={() => removeAttachment(index)}
                    aria-label={`Retirer ${file.name}`}
                  >
                    <X size={12} aria-hidden />
                  </button>
                </li>
              ))}
        </ul>
      )}

      {!readOnly ? (
        <div className="mail-prompt-line__footer">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className="mail-prompt-line__attach-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={14} aria-hidden />
            Ajouter des fichiers
          </button>
        </div>
      ) : null}
    </div>
  );
}
