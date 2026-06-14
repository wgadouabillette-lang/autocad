import clsx from "clsx";
import { Circle, LayoutGrid, Mic, MicOff } from "lucide-react";
import { APP_SHORTCUTS } from "../../lib/keyboardShortcuts";
import { useCallsStore } from "../../store/useCallsStore";
import { useStore } from "../../store/useStore";

const ACTION_ICONS = {
  recording: Circle,
  mute: Mic,
  panel: LayoutGrid,
} as const;

export default function ChatMobileQuickActions() {
  const recording = useCallsStore((s) => s.recording);
  const muted = useCallsStore((s) => s.muted);
  const toggleRecording = useCallsStore((s) => s.toggleRecording);
  const toggleMuted = useCallsStore((s) => s.toggleMuted);
  const cycleChatPanelMode = useStore((s) => s.cycleChatPanelMode);

  const handlers = {
    recording: () => void toggleRecording(),
    mute: () => void toggleMuted(),
    panel: () => cycleChatPanelMode(),
  } as const;

  return (
    <section className="chat-mobile-quick-actions" aria-label="Actions rapides">
      <ul className="chat-mobile-quick-actions__list">
        {APP_SHORTCUTS.map((shortcut) => {
          const Icon = ACTION_ICONS[shortcut.id];
          const active =
            shortcut.id === "recording" ? recording : shortcut.id === "mute" ? muted : false;

          return (
            <li key={shortcut.id}>
              <button
                type="button"
                className={clsx("chat-mobile-quick-actions__btn", active && "is-active")}
                onClick={handlers[shortcut.id]}
              >
                <span className="chat-mobile-quick-actions__icon" aria-hidden>
                  {shortcut.id === "mute" && muted ? (
                    <MicOff size={14} />
                  ) : (
                    <Icon
                      size={14}
                      className={clsx(shortcut.id === "recording" && recording && "fill-current")}
                    />
                  )}
                </span>
                <span className="chat-mobile-quick-actions__label">{shortcut.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
