import clsx from "clsx";
import { X } from "lucide-react";
import { useMemo } from "react";
import { localPollVote, pollVotePercent } from "../../lib/voicePoll";
import { useAuthStore } from "../../store/useAuthStore";
import { useActiveVoicePoll } from "../../hooks/useActiveVoicePoll";
import { useVoicePollStore } from "../../store/useVoicePollStore";
import { useStore } from "../../store/useStore";

export default function ChatPollVotePanel() {
  const workspaceId = useStore((s) => s.activeRoomId);
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const activePoll = useActiveVoicePoll(workspaceId);
  const closeVotePanel = useVoicePollStore((s) => s.closeVotePanel);
  const vote = useVoicePollStore((s) => s.vote);
  const closePoll = useVoicePollStore((s) => s.closePoll);
  const resetPoll = useVoicePollStore((s) => s.resetPoll);
  const openComposer = useVoicePollStore((s) => s.openComposer);

  const localVote = useMemo(
    () => (activePoll ? localPollVote(activePoll, firebaseUid ?? "local") : null),
    [activePoll, firebaseUid],
  );

  if (!activePoll) return null;

  const isCreator = !!firebaseUid && activePoll.createdByUserId === firebaseUid;
  const hasVoted = localVote !== null;

  return (
    <div className="chat-poll-vote" aria-label="Sondage du groupe">
      <button
        type="button"
        className="chat-poll-vote__close"
        onClick={() => closeVotePanel(workspaceId)}
        aria-label="Fermer"
      >
        <X size={18} aria-hidden />
      </button>

      <div className="chat-poll-composer__body">
        <p className="chat-poll-composer__field chat-poll-composer__field--title">
          {activePoll.question}
        </p>
        <p className="chat-poll-composer__field chat-poll-composer__field--subtitle">
          {activePoll.subtitle || "\u00A0"}
        </p>

        <ul className="chat-poll-composer__options">
          {activePoll.options.map((option) => {
            const percent = pollVotePercent(activePoll, option.id);
            const selected = localVote === option.id;

            return (
              <li key={option.id}>
                <button
                  type="button"
                  className={clsx(
                    "chat-poll-composer__option-row",
                    "chat-connectors-row__connect",
                    "chat-poll-vote__option-row",
                    selected && "chat-poll-vote__option-row--selected",
                  )}
                  onClick={() => vote(workspaceId, option.id)}
                  disabled={activePoll.status !== "open" || hasVoted}
                  aria-pressed={selected}
                >
                  <span
                    className="chat-poll-vote__option-fill"
                    style={{ width: `${percent}%` }}
                    aria-hidden
                  />
                  <span className="chat-poll-vote__option-label">{option.label}</span>
                  <span className="chat-poll-vote__option-percent">{percent}%</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <footer className="chat-poll-vote__footer">
        {isCreator && activePoll.status === "open" && (
          <button
            type="button"
            className="chat-connectors-row__connect chat-poll-vote__action"
            onClick={() => closePoll(workspaceId)}
          >
            Clôturer
          </button>
        )}
        {activePoll.status === "closed" && (
          <button
            type="button"
            className="chat-connectors-row__connect chat-poll-vote__action"
            onClick={() => {
              resetPoll(workspaceId);
              openComposer(workspaceId);
            }}
          >
            Nouveau sondage
          </button>
        )}
      </footer>
    </div>
  );
}
