import { useMemo, type ReactNode, type RefObject } from "react";
import clsx from "clsx";
import type { PeopleMessage } from "../../lib/peopleChat";
import { parseManageComposerText } from "../../lib/manageSchedulePrompt";
import { parsePromptDisplaySegments } from "../../lib/promptMentions";
import ManageSchedulePromptLine from "./ManageSchedulePromptLine";
import WorkspaceInviteInboxCard from "./WorkspaceInviteInboxCard";
import UserAvatar from "../UserAvatar";
import { useAuthStore } from "../../store/useAuthStore";
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
  showAvatars?: boolean;
  getAuthorPhotoURL?: (authorUid: string, authorName: string) => string | undefined;
  onOpenAuthor?: (authorUid: string, authorName: string) => void;
  tailContent?: ReactNode;
  mentionHighlightHandles?: string[];
}

function PeopleChatBubbleAvatar({
  showAvatars,
  mine,
  isFirstInGroup,
  authorUid,
  authorName,
  getAuthorPhotoURL,
  onOpenAuthor,
}: {
  showAvatars?: boolean;
  mine: boolean;
  isFirstInGroup: boolean;
  authorUid?: string;
  authorName: string;
  getAuthorPhotoURL?: (authorUid: string, authorName: string) => string | undefined;
  onOpenAuthor?: (authorUid: string, authorName: string) => void;
}) {
  if (!showAvatars) return null;

  if (isFirstInGroup) {
    const userId = authorUid?.trim() || authorName;
    const avatar = (
      <UserAvatar
        userId={userId}
        name={authorName}
        photoURL={getAuthorPhotoURL?.(userId, authorName)}
        isLocal={mine}
        className="people-chat-bubble-wrap__avatar"
      />
    );
    if (mine || !onOpenAuthor || !authorUid?.trim() || !authorName.trim()) return avatar;
    return (
      <button
        type="button"
        className="people-chat-bubble-wrap__avatar-btn"
        data-name={authorName}
        title={authorName}
        aria-label={authorName}
        onClick={() => onOpenAuthor(authorUid.trim(), authorName.trim())}
      >
        {avatar}
        <span className="people-chat-bubble-wrap__avatar-name">{authorName}</span>
      </button>
    );
  }

  return <span className="people-chat-bubble-wrap__avatar-spacer" aria-hidden />;
}

function formatAttachmentSize(size: number): string {
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

function PeopleChatAttachments({
  attachments,
}: {
  attachments: NonNullable<PeopleMessage["attachments"]>;
}) {
  return (
    <div className="people-chat-attachments">
      {attachments.map((attachment) =>
        attachment.isImage ? (
          <a
            key={attachment.id}
            className="people-chat-attachment__image-link"
            href={attachment.url}
            target="_blank"
            rel="noreferrer"
          >
            <img
              className="people-chat-attachment__image"
              src={attachment.url}
              alt={attachment.name}
            />
          </a>
        ) : (
          <a
            key={attachment.id}
            className="people-chat-attachment__file"
            href={attachment.url}
            target="_blank"
            rel="noreferrer"
            download={attachment.name}
          >
            <span className="people-chat-attachment__file-name">{attachment.name}</span>
            {attachment.size > 0 ? (
              <span className="people-chat-attachment__file-size">
                {formatAttachmentSize(attachment.size)}
              </span>
            ) : null}
          </a>
        ),
      )}
    </div>
  );
}

function renderMessageText(text: string, mentionHighlightHandles?: string[]) {
  if (!mentionHighlightHandles?.length) {
    return text;
  }
  const segments = parsePromptDisplaySegments(text, mentionHighlightHandles);
  return segments.map((segment, index) =>
    segment.mention ? (
      <span key={index} className="prompt-mention">
        {segment.text}
      </span>
    ) : (
      segment.text
    ),
  );
}

function PeopleChatBubble({
  item,
  mine,
  compact,
  showAuthors,
  showAvatars,
  getAuthorPhotoURL,
  onOpenAuthor,
  mentionHighlightHandles,
}: {
  item: PeopleChatRenderItem;
  mine: boolean;
  compact?: boolean;
  showAuthors?: boolean;
  showAvatars?: boolean;
  getAuthorPhotoURL?: (authorUid: string, authorName: string) => string | undefined;
  onOpenAuthor?: (authorUid: string, authorName: string) => void;
  mentionHighlightHandles?: string[];
}) {
  const { message, isFirstInGroup, isLastInGroup } = item;
  const shownMessage =
    message.kind === "handoff"
      ? {
          ...message,
          text:
            message.text?.trim() ||
            [message.handoffTitle, message.handoffPreview].filter(Boolean).join("\n"),
        }
      : message;

  if (message.kind === "workspace_invite" && message.workspaceInviteId) {
    return (
      <div
        className={clsx(
          "people-chat-bubble-wrap",
          mine && "people-chat-bubble-wrap--mine",
          showAvatars && "people-chat-bubble-wrap--with-avatar",
          isFirstInGroup && "people-chat-bubble-wrap--first",
          isLastInGroup && "people-chat-bubble-wrap--last",
        )}
      >
        <PeopleChatBubbleAvatar
          showAvatars={showAvatars}
          mine={mine}
          isFirstInGroup={isFirstInGroup}
          authorUid={message.authorUid}
          authorName={message.author}
          getAuthorPhotoURL={getAuthorPhotoURL}
          onOpenAuthor={onOpenAuthor}
        />
        <WorkspaceInviteInboxCard
          workspaceId={message.workspaceInviteId}
          workspaceName={message.workspaceInviteName}
          senderName={message.author}
          mine={mine}
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
          showAvatars && "people-chat-bubble-wrap--with-avatar",
          isFirstInGroup && "people-chat-bubble-wrap--first",
          isLastInGroup && "people-chat-bubble-wrap--last",
        )}
      >
        <PeopleChatBubbleAvatar
          showAvatars={showAvatars}
          mine={mine}
          isFirstInGroup={isFirstInGroup}
          authorUid={message.authorUid}
          authorName={message.author}
          getAuthorPhotoURL={getAuthorPhotoURL}
          onOpenAuthor={onOpenAuthor}
        />
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
        showAvatars && "people-chat-bubble-wrap--with-avatar",
        isFirstInGroup && "people-chat-bubble-wrap--first",
        isLastInGroup && "people-chat-bubble-wrap--last",
      )}
    >
      <PeopleChatBubbleAvatar
        showAvatars={showAvatars}
        mine={mine}
        isFirstInGroup={isFirstInGroup}
        authorUid={message.authorUid}
        authorName={message.author}
        getAuthorPhotoURL={getAuthorPhotoURL}
        onOpenAuthor={onOpenAuthor}
      />
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
          {shownMessage.text ? (
            <p className="people-chat-bubble__text">
              {renderMessageText(shownMessage.text, mentionHighlightHandles)}
            </p>
          ) : null}
          {shownMessage.attachments?.length ? (
            <PeopleChatAttachments attachments={shownMessage.attachments} />
          ) : null}
        </div>
      </div>
    </div>
  );

  return bubble;
}

export default function PeopleChatThreadMessages({
  messages,
  listRef,
  className,
  compact,
  showAuthors = false,
  showAvatars = false,
  getAuthorPhotoURL,
  onOpenAuthor,
  tailContent,
  mentionHighlightHandles,
}: PeopleChatThreadMessagesProps) {
  const localUserId = useAuthStore((s) => s.firebaseUid);
  const timeline = useMemo(
    () => buildPeopleChatTimeline(messages, localUserId),
    [messages, localUserId],
  );

  return (
    <ul ref={listRef} className={clsx("people-chat-thread", className)}>
      <li className="people-chat-thread__spacer" aria-hidden />
      {timeline.map((entry) => {
        return (
          <li
            key={entry.key}
            className={clsx(
              "people-chat-thread__group",
              entry.mine
                ? "people-chat-thread__group--mine"
                : "people-chat-thread__group--theirs",
            )}
          >
            {entry.items.map((item) => (
              <PeopleChatBubble
                key={item.message.id}
                item={item}
                mine={entry.mine}
                compact={compact}
                showAuthors={showAuthors}
                showAvatars={showAvatars}
                getAuthorPhotoURL={getAuthorPhotoURL}
                onOpenAuthor={onOpenAuthor}
                mentionHighlightHandles={mentionHighlightHandles}
              />
            ))}
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
