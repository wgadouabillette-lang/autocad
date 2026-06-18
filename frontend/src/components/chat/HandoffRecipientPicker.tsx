import clsx from "clsx";
import { UsersRound, UserRound } from "lucide-react";
import { useMemo } from "react";
import {
  buildEligibleGroupChatMembers,
  collectAllWorkspaceMembers,
} from "../../lib/peopleChat";
import type { HandoffTarget } from "../../lib/handoffSkill";
import { usePeopleStore } from "../../store/usePeopleStore";
import { useStore } from "../../store/useStore";
import { useWorkspacePresenceStore } from "../../store/useWorkspacePresenceStore";
import { useAuthStore } from "../../store/useAuthStore";

interface HandoffRecipientPickerProps {
  target: HandoffTarget | null;
  onChange: (target: HandoffTarget | null) => void;
  className?: string;
}

export default function HandoffRecipientPicker({
  target,
  onChange,
  className,
}: HandoffRecipientPickerProps) {
  const friends = usePeopleStore((s) => s.friends);
  const groupThreads = usePeopleStore((s) => s.groupThreads);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const membersByWorkspace = useWorkspacePresenceStore((s) => s.membersByWorkspace);

  const people = useMemo(
    () =>
      buildEligibleGroupChatMembers({
        friends,
        workspaceMembers: collectAllWorkspaceMembers(membersByWorkspace),
        localUserId: firebaseUid,
      }),
    [friends, membersByWorkspace, firebaseUid],
  );

  const groups = useMemo(
    () =>
      groupThreads.map((thread) => ({
        groupId: thread.personId,
        name: thread.groupName || thread.personName,
      })),
    [groupThreads],
  );

  const activeKey = target
    ? target.targetType === "group"
      ? `group:${target.groupId}`
      : `dm:${target.recipientUid}`
    : null;

  return (
    <div className={clsx("handoff-recipient-picker", className)}>
      <p className="handoff-recipient-picker__label">Destinataire</p>
      <div className="handoff-recipient-picker__list" role="listbox" aria-label="Handoff recipient">
        {people.map((person) => {
          const key = `dm:${person.id}`;
          const selected = activeKey === key;
          return (
            <button
              key={key}
              type="button"
              role="option"
              aria-selected={selected}
              className={clsx(
                "handoff-recipient-picker__item",
                selected && "handoff-recipient-picker__item--active",
              )}
              onClick={() =>
                onChange({
                  targetType: "dm",
                  recipientUid: person.id,
                  displayName: person.name,
                })
              }
            >
              <UserRound size={13} aria-hidden />
              <span className="truncate">{person.name}</span>
            </button>
          );
        })}
        {groups.map((group) => {
          const key = `group:${group.groupId}`;
          const selected = activeKey === key;
          return (
            <button
              key={key}
              type="button"
              role="option"
              aria-selected={selected}
              className={clsx(
                "handoff-recipient-picker__item",
                selected && "handoff-recipient-picker__item--active",
              )}
              onClick={() =>
                onChange({
                  targetType: "group",
                  groupId: group.groupId,
                  displayName: group.name,
                })
              }
            >
              <UsersRound size={13} aria-hidden />
              <span className="truncate">{group.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
