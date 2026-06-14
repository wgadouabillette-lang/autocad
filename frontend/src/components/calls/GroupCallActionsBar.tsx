import clsx from "clsx";
import type { ReactNode } from "react";
import { MicOff } from "lucide-react";
import { useCallsStore } from "../../store/useCallsStore";
import { useStore } from "../../store/useStore";

const ICON_SIZE = 17;

function GroupCallActionButton({
  label,
  onClick,
  active,
  danger,
  children,
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={clsx(
        "group-call-action-btn",
        active && "is-active",
        danger && "is-danger",
      )}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

export default function GroupCallActionsBar() {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const viewMode = useCallsStore((s) => s.getCallsViewMode(activeRoomId));
  const inTheaterCall = useCallsStore((s) => s.isLocalInTheaterCall(activeRoomId));
  const theater = useCallsStore((s) => s.theaterByWorkspace[activeRoomId]);
  const muteOthers = useCallsStore((s) => s.muteOthers);
  const toggleMuteOthers = useCallsStore((s) => s.toggleMuteOthers);

  const isSpeaker = theater?.localRole === "speaker";

  if (viewMode !== "theater" || !inTheaterCall || !isSpeaker) return null;

  return (
    <div className="group-call-actions" role="toolbar" aria-label="Actions théâtre vocal">
      <GroupCallActionButton
        label={muteOthers ? "Réactiver les autres" : "Couper les autres"}
        onClick={toggleMuteOthers}
        active={muteOthers}
      >
        <MicOff size={ICON_SIZE} />
      </GroupCallActionButton>
    </div>
  );
}
