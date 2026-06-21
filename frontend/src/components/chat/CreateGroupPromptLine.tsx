import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { User } from "lucide-react";
import type { Person } from "../../lib/peopleChat";
import {
  filterCreateGroupMentionMenu,
  type CreateGroupSkillDraft,
} from "../../lib/createGroupSkill";

interface CreateGroupPromptLineProps {
  draft: CreateGroupSkillDraft;
  members: Person[];
  lockedMemberIds?: string[];
  chipLabel?: string;
  onChange: (draft: CreateGroupSkillDraft) => void;
  onDismiss: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
}

export default function CreateGroupPromptLine({
  draft,
  members,
  lockedMemberIds = [],
  chipLabel = "Créer un groupe",
  onChange,
  onDismiss,
  onSubmit,
  canSubmit,
}: CreateGroupPromptLineProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const didAutoFocusRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);

  const selectedMembers = useMemo(
    () =>
      draft.selectedMemberIds
        .map((id) => members.find((member) => member.id === id))
        .filter((member): member is Person => !!member),
    [draft.selectedMemberIds, members],
  );

  const menuOptions = useMemo(
    () => filterCreateGroupMentionMenu(draft.query, members, draft.selectedMemberIds),
    [draft.query, members, draft.selectedMemberIds],
  );

  useEffect(() => {
    if (didAutoFocusRef.current) return;
    didAutoFocusRef.current = true;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const pending = pendingSelectionRef.current;
    if (!input || !pending) return;
    pendingSelectionRef.current = null;
    const start = Math.min(pending.start, draft.query.length);
    const end = Math.min(pending.end, draft.query.length);
    input.setSelectionRange(start, end);
  }, [draft.query]);

  useEffect(() => {
    setMenuIndex(0);
  }, [menuOptions.length, draft.query]);

  useEffect(() => {
    setMenuOpen(menuOptions.length > 0);
  }, [menuOptions.length]);

  const addMember = (member: Person) => {
    if (draft.selectedMemberIds.includes(member.id)) return;
    onChange({
      selectedMemberIds: [...draft.selectedMemberIds, member.id],
      query: "",
    });
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const removeMember = (memberId: string) => {
    if (lockedMemberIds.includes(memberId)) return;
    onChange({
      ...draft,
      selectedMemberIds: draft.selectedMemberIds.filter((id) => id !== memberId),
    });
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="create-group-prompt-line">
      <div className="create-group-prompt-chip" aria-label={chipLabel}>
        {selectedMembers.map((member) => (
          <span key={member.id} className="create-group-prompt-chip__member">
            <span>{member.name}</span>
          </span>
        ))}
        <span className="create-group-prompt-chip__prefix" aria-hidden>
          @
        </span>
        <input
          ref={inputRef}
          type="text"
          value={draft.query}
          onChange={(event) => {
            pendingSelectionRef.current = {
              start: event.target.selectionStart ?? event.target.value.length,
              end: event.target.selectionEnd ?? event.target.value.length,
            };
            onChange({ ...draft, query: event.target.value });
          }}
          className="create-group-prompt-chip__input"
          aria-label="Ajouter un membre"
          autoComplete="off"
          spellCheck={false}
          onKeyDown={(event) => {
            if (menuOpen && menuOptions.length > 0) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setMenuIndex((index) => (index + 1) % menuOptions.length);
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setMenuIndex(
                  (index) => (index - 1 + menuOptions.length) % menuOptions.length,
                );
                return;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                addMember(menuOptions[menuIndex]!);
                return;
              }
            if (event.key === "Escape") {
              event.preventDefault();
              setMenuOpen(false);
              return;
            }
          }
          if (event.key === "Enter" && !event.shiftKey && canSubmit) {
            event.preventDefault();
            onSubmit();
          }
          if (event.key === "Backspace") {
            const input = event.currentTarget;
            const currentValue = input.value;
            const selectionStart = input.selectionStart ?? 0;
            const selectionEnd = input.selectionEnd ?? 0;
            const hasSelection = selectionStart !== selectionEnd;

            if (hasSelection || (currentValue.length > 0 && selectionStart > 0)) {
              return;
            }

            if (currentValue.length > 0) {
              return;
            }

            event.preventDefault();
            if (draft.selectedMemberIds.length > 0) {
              const removable = [...draft.selectedMemberIds].reverse().find(
                (id) => !lockedMemberIds.includes(id),
              );
              if (removable) {
                removeMember(removable);
                return;
              }
            }
            onDismiss();
          }
          }}
        />
      </div>

      {menuOpen && menuOptions.length > 0 ? (
        <div
          className="create-group-prompt-line__menu"
          role="listbox"
          aria-label="Membres éligibles"
        >
          {menuOptions.map((member, index) => (
            <button
              key={member.id}
              type="button"
              role="option"
              aria-selected={index === menuIndex}
              onMouseEnter={() => setMenuIndex(index)}
              onClick={() => addMember(member)}
              className={clsx(
                "create-group-prompt-line__menu-item",
                index === menuIndex && "create-group-prompt-line__menu-item--active",
              )}
            >
              <User size={14} className="shrink-0 text-muted-300" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium text-muted-100">
                  {member.name}
                </span>
                <span className="block truncate text-[10px] text-muted-500">{member.handle}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
