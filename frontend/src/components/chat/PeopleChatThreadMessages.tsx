import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import clsx from "clsx";
import type { PeopleMessage } from "../../lib/peopleChat";
import { parseManageComposerText } from "../../lib/manageSchedulePrompt";
import HandoffInboxCard from "./HandoffInboxCard";
import ManageSchedulePromptLine from "./ManageSchedulePromptLine";
import { useHandoffStore } from "../../store/useHandoffStore";
import {
  buildPeopleChatTimeline,
  type PeopleChatRenderItem,
} from "../../lib/peopleChatGrouping";

interface PeopleChatThreadMessagesProps {
  partnerName: string;
  partnerId: string;
  partnerPhotoURL?: string;
  messages: PeopleMessage[];
  listRef?: RefObject<HTMLUListElement>;
  className?: string;
  compact?: boolean;
  showAuthors?: boolean;
  handoffSelectionMode?: boolean;
  handoffSelectedIndices?: Set<number>;
  onToggleHandoffIndex?: (index: number) => void;
  tailContent?: ReactNode;
}

function PeopleChatBubble({
  item,
  mine,
  compact,
  showAuthors,
  messageIndex,
  handoffSelectionMode,
  handoffSelected,
  onToggleHandoffIndex,
}: {
  item: PeopleChatRenderItem;
  mine: boolean;
  compact?: boolean;
  showAuthors?: boolean;
  messageIndex: number;
  handoffSelectionMode?: boolean;
  handoffSelected?: boolean;
  onToggleHandoffIndex?: (index: number) => void;
}) {
  const { message, isFirstInGroup, isLastInGroup } = item;
  const openHandoffPreview = useHandoffStore((s) => s.openPreview);

  if (message.kind === "handoff" && message.handoffId) {
    return (
      <div
        className={clsx(
          "people-chat-bubble-wrap",
          mine && "people-chat-bubble-wrap--mine",
          isFirstInGroup && "people-chat-bubble-wrap--first",
          isLastInGroup && "people-chat-bubble-wrap--last",
        )}
      >
        <HandoffInboxCard
          senderName={message.author}
          title={message.handoffTitle}
          preview={message.handoffPreview}
          onOpen={() => void openHandoffPreview(message.handoffId!)}
        />
      </div>
    );
  }

  if (message.kind === "manage") {
    const manageDraft = parseManageComposerText(message.manageDisplayText ?? message.text);

    return (
      <div
        className={clsx(
          "people-chat-bubble-wrap",
          mine && "people-chat-bubble-wrap--mine",
          isFirstInGroup && "people-chat-bubble-wrap--first",
          isLastInGroup && "people-chat-bubble-wrap--last",
        )}
      >
        <div className="people-chat-bubble-stack">
          {!mine && isFirstInGroup && showAuthors && (
            <span className="people-chat-bubble-stack__author">{message.author}</span>
          )}
          <div
            className={clsx(
              "people-chat-bubble people-chat-bubble--manage",
              mine ? "people-chat-bubble--outgoing" : "people-chat-bubble--incoming",
              isFirstInGroup && "people-chat-bubble--first",
              isLastInGroup && "people-chat-bubble--last",
              compact && "people-chat-bubble--compact",
            )}
          >
            {manageDraft ? (
              <ManageSchedulePromptLine draft={manageDraft} readOnly />
            ) : (
              <p className="people-chat-bubble__text">{message.manageDisplayText ?? message.text}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const bubble = (
    <div
      className={clsx(
        "people-chat-bubble-wrap",
        mine && "people-chat-bubble-wrap--mine",
        isFirstInGroup && "people-chat-bubble-wrap--first",
        isLastInGroup && "people-chat-bubble-wrap--last",
      )}
    >
      <div className="people-chat-bubble-stack">
        {!mine && isFirstInGroup && showAuthors && (
          <span className="people-chat-bubble-stack__author">{message.author}</span>
        )}

        <div
          className={clsx(
            "people-chat-bubble",
            mine ? "people-chat-bubble--outgoing" : "people-chat-bubble--incoming",
            isFirstInGroup && "people-chat-bubble--first",
            isLastInGroup && "people-chat-bubble--last",
            compact && "people-chat-bubble--compact",
          )}
        >
          <p className="people-chat-bubble__text">{message.text}</p>
        </div>
      </div>
    </div>
  );

  if (!handoffSelectionMode || !onToggleHandoffIndex) return bubble;

  return (
    <div
      className={clsx(
        "handoff-select-row",
        "handoff-select-row--active",
        handoffSelected && "handoff-select-row--selected",
      )}
    >
      <button
        type="button"
        className={clsx("handoff-select-row__check", handoffSelected && "is-checked")}
        aria-pressed={handoffSelected}
        aria-label={handoffSelected ? "Deselect message" : "Select message"}
        onClick={() => onToggleHandoffIndex(messageIndex)}
      />
      <div className="handoff-select-row__bubble">{bubble}</div>
    </div>
  );
}

export default function PeopleChatThreadMessages({
  partnerId,
  messages,
  listRef,
  className,
  compact,
  showAuthors = false,
  handoffSelectionMode = false,
  handoffSelectedIndices,
  onToggleHandoffIndex,
  tailContent,
}: PeopleChatThreadMessagesProps) {
  const timeline = useMemo(() => buildPeopleChatTimeline(messages), [messages]);
  const messageIndexById = useMemo(
    () => new Map(messages.map((message, index) => [message.id, index])),
    [messages],
  );
  const prevLastMessageIdRef = useRef<string | undefined>();
  const [risingMessageId, setRisingMessageId] = useState<string | null>(null);

  const lastMessageId = messages[messages.length - 1]?.id;

  useEffect(() => {
    prevLastMessageIdRef.current = lastMessageId;
    setRisingMessageId(null);
  }, [partnerId]);

  useEffect(() => {
    if (!lastMessageId || lastMessageId === prevLastMessageIdRef.current) return;
    prevLastMessageIdRef.current = lastMessageId;
    setRisingMessageId(lastMessageId);
    const timer = window.setTimeout(() => setRisingMessageId(null), 360);
    return () => window.clearTimeout(timer);
  }, [lastMessageId]);

  return (
    <ul ref={listRef} className={clsx("people-chat-thread", className)}>
      <li className="people-chat-thread__spacer" aria-hidden />
      {timeline.map((entry) => {
        const hasRisingMessage = entry.items.some(
          (item) => item.message.id === risingMessageId,
        );
        return (
          <li
            key={entry.key}
            className={clsx(
              "people-chat-thread__group",
              entry.mine && "people-chat-thread__group--mine",
              hasRisingMessage && "people-chat-thread__group--rise",
            )}
          >
            {entry.items.map((item) => {
              const messageIndex = messageIndexById.get(item.message.id) ?? -1;
              return (
              <PeopleChatBubble
                key={item.message.id}
                item={item}
                mine={entry.mine}
                compact={compact}
                showAuthors={showAuthors}
                messageIndex={messageIndex}
                handoffSelectionMode={handoffSelectionMode}
                handoffSelected={
                  messageIndex >= 0 && (handoffSelectedIndices?.has(messageIndex) ?? false)
                }
                onToggleHandoffIndex={onToggleHandoffIndex}
              />
              );
            })}
          </li>
        );
      })}
      {tailContent ? (
        <li className="people-chat-thread__tail people-chat-thread__group--mine">
          {tailContent}
        </li>
      ) : null}
    </ul>
  );
}
