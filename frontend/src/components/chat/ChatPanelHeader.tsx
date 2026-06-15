import clsx from "clsx";
import { Calendar, History, Maximize2, Minimize2, Plus, Users } from "lucide-react";
import { useMobileLayout } from "../../hooks/useMobileLayout";
import { isVoiceAssistPanelMode } from "../../lib/voiceAssistPanel";
import { useStore } from "../../store/useStore";

export default function ChatPanelHeader() {
  const isMobileLayout = useMobileLayout();
  const startNewChat = useStore((s) => s.startNewChat);
  const showChatHistory = useStore((s) => s.showChatHistory);
  const toggleChatHistory = useStore((s) => s.toggleChatHistory);
  const chatPanelMode = useStore((s) => s.chatPanelMode);
  const toggleFriendsChatMode = useStore((s) => s.toggleFriendsChatMode);
  const chatPanelExpanded = useStore((s) => s.chatPanelExpanded);
  const toggleChatPanelExpanded = useStore((s) => s.toggleChatPanelExpanded);
  const friendsMode = chatPanelMode === "friends";
  const theaterMode = chatPanelMode === "theater";
  const calendarMode = chatPanelMode === "calendar";
  const voiceAssistMode = isVoiceAssistPanelMode(chatPanelMode);
  const agentMode = chatPanelMode === "agent";
  const showAgentTools = agentMode;

  return (
    <div className="chat-panel-header grid w-full min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-1">
      <div className="flex items-center gap-0.5 justify-self-start">
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
      </div>

      <h2 className="chat-panel-header__title pointer-events-none select-none text-xs font-semibold tracking-wide text-muted-200">
        {friendsMode ? (
          "Amis"
        ) : theaterMode ? (
          "Chat théâtre"
        ) : calendarMode ? (
          <span className="inline-flex items-center gap-1.5">
            <Calendar size={13} className="text-muted-400" aria-hidden />
            Calendrier
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
          title={friendsMode ? "Retour à l'agent" : "Messages amis et collègues"}
          aria-label={friendsMode ? "Retour à l'agent" : "Messages amis et collègues"}
          aria-pressed={friendsMode}
        >
          <Users size={14} />
        </button>
        {!isMobileLayout && (
          <button
            type="button"
            className={clsx("toolbar-btn", chatPanelExpanded && "is-active")}
            onClick={() => toggleChatPanelExpanded()}
            title={chatPanelExpanded ? "Réduire le panneau" : "Agrandir le panneau"}
            aria-label={chatPanelExpanded ? "Réduire le panneau" : "Agrandir le panneau"}
            aria-pressed={chatPanelExpanded}
          >
            {chatPanelExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}
