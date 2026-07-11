import { UserPlus } from "lucide-react";
import { useMemo } from "react";
import UserAvatar from "../UserAvatar";
import { usePeopleStore } from "../../store/usePeopleStore";

const FRIEND_REQUEST_NAME_RE = /^(.+?)\s+veut vous ajouter/i;

function parseFriendRequestName(body: string): string {
  const match = body.match(FRIEND_REQUEST_NAME_RE);
  return match?.[1]?.trim() || "Ami";
}

interface FriendRequestNotificationVisualProps {
  friendRequestId?: string;
  body: string;
}

export default function FriendRequestNotificationVisual({
  friendRequestId,
  body,
}: FriendRequestNotificationVisualProps) {
  const friendRequest = usePeopleStore((state) =>
    friendRequestId
      ? state.friendRequests.find(
          (request) => request.id === friendRequestId && !request.outgoing,
        )
      : undefined,
  );

  const requester = useMemo(() => {
    if (friendRequest) {
      return {
        id: friendRequest.from.id,
        name: friendRequest.from.name,
      };
    }
    const name = parseFriendRequestName(body);
    return {
      id: friendRequestId ?? `friend-preview-${name.toLowerCase()}`,
      name,
    };
  }, [body, friendRequest, friendRequestId]);

  return (
    <div className="notifications-panel__friend-request">
      <UserAvatar
        userId="local-user"
        name="You"
        isLocal
        className="notifications-panel__friend-request-avatar notifications-panel__friend-request-avatar--left"
      />
      <span className="notifications-panel__friend-request-plus" aria-hidden>
        <UserPlus size={17} strokeWidth={2.25} />
      </span>
      <UserAvatar
        userId={requester.id}
        name={requester.name}
        className="notifications-panel__friend-request-avatar notifications-panel__friend-request-avatar--right"
      />
    </div>
  );
}
