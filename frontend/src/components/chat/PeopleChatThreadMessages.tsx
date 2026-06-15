import { useMemo, type RefObject } from "react";
import clsx from "clsx";
import type { PeopleMessage } from "../../lib/peopleChat";
import {
  buildPeopleChatTimeline,
  type PeopleChatRenderItem,
} from "../../lib/peopleChatGrouping";
import UserAvatar from "../UserAvatar";

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
  partnerName,
  partnerId,
  partnerPhotoURL,
  item,
  mine,
  compact,
}: {
  partnerName: string;
  partnerId: string;
  partnerPhotoURL?: string;
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
      {!mine && isLastInGroup && (
        <UserAvatar
          userId={partnerId}
          name={partnerName}
          photoURL={partnerPhotoURL}
          className="people-chat-bubble-wrap__avatar"
        />
      )}
      {!mine && !isLastInGroup && <span className="people-chat-bubble-wrap__avatar-spacer" aria-hidden />}

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
  partnerName,
  partnerId,
  partnerPhotoURL,
  messages,
  listRef,
  className,
  compact,
}: PeopleChatThreadMessagesProps) {
  const timeline = useMemo(() => buildPeopleChatTimeline(messages), [messages]);

  return (
    <ul ref={listRef} className={clsx("people-chat-thread", className)}>
      {timeline.map((entry) => (
          <li
            key={entry.key}
            className={clsx(
              "people-chat-thread__group",
              entry.mine && "people-chat-thread__group--mine",
            )}
          >
            {entry.items.map((item) => (
              <PeopleChatBubble
                key={item.message.id}
                partnerName={partnerName}
                partnerId={partnerId}
                partnerPhotoURL={partnerPhotoURL}
                item={item}
                mine={entry.mine}
                compact={compact}
              />
            ))}
          </li>
      ))}
    </ul>
  );
}
