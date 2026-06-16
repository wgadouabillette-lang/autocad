import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import clsx from "clsx";
import type { PeopleMessage } from "../../lib/peopleChat";
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
}

function PeopleChatBubble({
  item,
  mine,
  compact,
}: {
  item: PeopleChatRenderItem;
  mine: boolean;
  compact?: boolean;
}) {
  const { message, isFirstInGroup, isLastInGroup } = item;

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
        {!mine && isFirstInGroup && (
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
}

export default function PeopleChatThreadMessages({
  partnerId,
  messages,
  listRef,
  className,
  compact,
}: PeopleChatThreadMessagesProps) {
  const timeline = useMemo(() => buildPeopleChatTimeline(messages), [messages]);
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
            {entry.items.map((item) => (
              <PeopleChatBubble
                key={item.message.id}
                item={item}
                mine={entry.mine}
                compact={compact}
              />
            ))}
          </li>
        );
      })}
    </ul>
  );
}
