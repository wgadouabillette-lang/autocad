import { useEffect, useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import { resolvePersonPhotoURL } from "../../lib/peopleChat";
import { usePeopleStore } from "../../store/usePeopleStore";
import { useStore } from "../../store/useStore";
import { useWorkspacePresenceStore } from "../../store/useWorkspacePresenceStore";
import UserAvatar from "../UserAvatar";

export default function FriendsSettingsSection() {
  const friends = usePeopleStore((s) => s.friends);
  const personPhotoByUserId = usePeopleStore((s) => s.personPhotoByUserId);
  const hydratePersonPhotos = usePeopleStore((s) => s.hydratePersonPhotos);
  const openWorkspaceMemberConversation = usePeopleStore((s) => s.openWorkspaceMemberConversation);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const membersByWorkspace = useWorkspacePresenceStore((s) => s.membersByWorkspace);

  const photoLookup = useMemo(
    () => ({ preferredWorkspaceId: activeRoomId, photoCache: personPhotoByUserId }),
    [activeRoomId, personPhotoByUserId],
  );

  useEffect(() => {
    if (friends.length === 0) return;
    void hydratePersonPhotos(friends.map((friend) => friend.id));
  }, [friends, hydratePersonPhotos]);

  return (
    <section className="settings-section settings-section--card">
      <h3 className="settings-section__label">Amis</h3>

      {friends.length === 0 ? (
        <p className="settings-section__meta mt-4">Aucun ami pour le moment.</p>
      ) : (
        <ul className="settings-friends-list mt-4 border-t border-ink-700 pt-4">
          {friends.map((friend) => (
            <li key={friend.id} className="settings-friends-list__row">
              <UserAvatar
                userId={friend.id}
                name={friend.name}
                photoURL={resolvePersonPhotoURL(friend.id, membersByWorkspace, photoLookup)}
                className="settings-friends-list__avatar"
              />
              <span className="settings-friends-list__main">
                <span className="settings-friends-list__name">{friend.name}</span>
                <span className="settings-friends-list__meta">@{friend.handle}</span>
              </span>
              <button
                type="button"
                className="settings-friends-list__open"
                title={`Ouvrir la conversation avec ${friend.name}`}
                aria-label={`Ouvrir la conversation avec ${friend.name}`}
                onClick={() => openWorkspaceMemberConversation(activeRoomId, friend.id, friend.name)}
              >
                <ArrowUpRight size={14} strokeWidth={2.25} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
