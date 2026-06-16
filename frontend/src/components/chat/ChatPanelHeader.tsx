import clsx from "clsx";
import { useMemo } from "react";
import { ArrowLeft, Calendar, History, Maximize2, Minimize2, Plus, Users } from "lucide-react";
import { useMobileLayout } from "../../hooks/useMobileLayout";
import { isVoiceAssistPanelMode } from "../../lib/voiceAssistPanel";
import { resolvePersonPhotoURL } from "../../lib/peopleChat";
import { usePeopleStore } from "../../store/usePeopleStore";
import { useStore } from "../../store/useStore";
import { useWorkspacePresenceStore } from "../../store/useWorkspacePresenceStore";
import UserAvatar from "../UserAvatar";

export default function ChatPanelHeader() {
  const isMobileLayout = useMobileLayout();
  const startNewChat = useStore((s) => s.startNewChat);
  const startNewManualNote = useStore((s) => s.startNewManualNote);
  const showChatHistory = useStore((s) => s.showChatHistory);
  const toggleChatHistory = useStore((s) => s.toggleChatHistory);
  const chatPanelMode = useStore((s) => s.chatPanelMode);
  const toggleFriendsChatMode = useStore((s) => s.toggleFriendsChatMode);
  const chatPanelExpanded = useStore((s) => s.chatPanelExpanded);
  const toggleChatPanelExpanded = useStore((s) => s.toggleChatPanelExpanded);
  const activeFriendThreadId = usePeopleStore((s) => s.activeFriendThreadId);
  const friendThreads = usePeopleStore((s) => s.friendThreads);
  const colleagueThreadsByWorkspace = usePeopleStore((s) => s.colleagueThreadsByWorkspace);
  const personPhotoByUserId = usePeopleStore((s) => s.personPhotoByUserId);
  const setActiveFriendThread = usePeopleStore((s) => s.setActiveFriendThread);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const membersByWorkspace = useWorkspacePresenceStore((s) => s.membersByWorkspace);
  const activeFriendThread = useMemo(() => {
    if (!activeFriendThreadId) return undefined;
    const friend = friendThreads.find((thread) => thread.id === activeFriendThreadId);
    if (friend) return friend;
    for (const threads of Object.values(colleagueThreadsByWorkspace)) {
      const found = threads.find((thread) => thread.id === activeFriendThreadId);
      if (found) return found;
    }
    return undefined;
  }, [activeFriendThreadId, friendThreads, colleagueThreadsByWorkspace]);
  const friendsMode = chatPanelMode === "friends";
  const inFriendThread = friendsMode && !!activeFriendThread;
  const theaterMode = chatPanelMode === "theater";
  const calendarMode = chatPanelMode === "calendar";
  const voiceAssistMode = isVoiceAssistPanelMode(chatPanelMode);
  const aiNotesMode = chatPanelMode === "ai-notes";
  const agentMode = chatPanelMode === "agent";
  const showAgentTools = agentMode;
  const showNotesTools = aiNotesMode;

  return (
    <div className="chat-panel-header grid w-full min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-1">
      <div className="flex items-center gap-0.5 justify-self-start">
        {inFriendThread ? (
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => setActiveFriendThread(null)}
            title="Back to messages"
            aria-label="Back to messages"
          >
            <ArrowLeft size={14} />
          </button>
        ) : null}
        {showAgentTools && (
          <>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => startNewChat()}
              title="New conversation"
              aria-label="New conversation"
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              className={clsx("toolbar-btn", showChatHistory && "is-active")}
              onClick={() => toggleChatHistory()}
              title="Discussions"
              aria-label="Discussions"
              aria-pressed={showChatHistory}
            >
              <History size={14} />
            </button>
          </>
        )}
        {showNotesTools && (
          <>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => startNewManualNote()}
              title="New note"
              aria-label="New note"
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              className={clsx("toolbar-btn", showChatHistory && "is-active")}
              onClick={() => toggleChatHistory()}
              title="Saved notes"
              aria-label="Saved notes"
              aria-pressed={showChatHistory}
            >
              <History size={14} />
            </button>
          </>
        )}
      </div>

      <h2 className="chat-panel-header__title pointer-events-none min-w-0 select-none text-xs font-semibold tracking-wide text-muted-200">
        {inFriendThread && activeFriendThread ? (
          <span className="chat-panel-header__thread-identity">
            <UserAvatar
              userId={activeFriendThread.personId}
              name={activeFriendThread.personName}
              photoURL={resolvePersonPhotoURL(
                activeFriendThread.personId,
                membersByWorkspace,
                { preferredWorkspaceId: activeRoomId, photoCache: personPhotoByUserId },
              )}
              className="chat-panel-header__thread-avatar"
            />
            <span className="chat-panel-header__thread-name">{activeFriendThread.personName}</span>
          </span>
        ) : friendsMode ? (
          "Friends"
        ) : theaterMode ? (
          "Theater chat"
        ) : calendarMode ? (
          <span className="inline-flex items-center gap-1.5">
            <Calendar size={13} className="text-muted-400" aria-hidden />
            Calendar
          </span>
        ) : voiceAssistMode ? (
          chatPanelMode === "follow-up" ? "Follow-up" : "AI Notes"
        ) : (
          "XYZ Superagent"
        )}
      </h2>

      <div className="flex items-center gap-0.5 justify-self-end">
        <button
          type="button"
          className={clsx("toolbar-btn", friendsMode && "is-active")}
          onClick={() => toggleFriendsChatMode()}
          title={friendsMode ? "Back to agent" : "Friends and colleagues messages"}
          aria-label={friendsMode ? "Back to agent" : "Friends and colleagues messages"}
          aria-pressed={friendsMode}
        >
          <Users size={14} />
        </button>
        {!isMobileLayout && (
          <button
            type="button"
            className={clsx("toolbar-btn", chatPanelExpanded && "is-active")}
            onClick={() => toggleChatPanelExpanded()}
            title={chatPanelExpanded ? "Collapse panel" : "Expand panel"}
            aria-label={chatPanelExpanded ? "Collapse panel" : "Expand panel"}
            aria-pressed={chatPanelExpanded}
          >
            {chatPanelExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}
