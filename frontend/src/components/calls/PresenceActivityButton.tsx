import clsx from "clsx";
import { MicOff, MonitorUp, Radio, Video } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { presenceActivityFromModel } from "../../lib/aiModelStroke";
import {
  getPresenceActivityOption,
  isManualPresenceActivity,
  PRESENCE_ACTIVITY_PICKER_OPTIONS,
  type PresenceActivityId,
} from "../../lib/presenceActivity";
import { useAiComposerStore } from "../../store/useAiComposerStore";
import { useCallsStore } from "../../store/useCallsStore";
import { usePresenceActivityStore } from "../../store/usePresenceActivityStore";
import { useStore } from "../../store/useStore";

interface PresenceActivityButtonProps {
  roomId: string;
  userId: string;
  isLocal?: boolean;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
}

const MENU_WIDTH = 168; // 10.5rem

function ActivityGlyph({ activityId }: { activityId: PresenceActivityId }) {
  const option = getPresenceActivityOption(activityId);
  if (option.imageSrc) {
    return <img src={option.imageSrc} alt="" className="call-block__activity-img" draggable={false} />;
  }
  const Icon = option.icon ?? Radio;
  return <Icon size={14} strokeWidth={2} aria-hidden />;
}

function LocalMediaStatusIcons() {
  const muted = useCallsStore((s) => s.muted);
  const cameraOn = useCallsStore((s) => s.cameraOn);
  const screenSharing = useCallsStore((s) => s.screenSharing);

  if (!muted && !cameraOn && !screenSharing) return null;

  return (
    <div className="call-block__media-status" aria-label="État média">
      {screenSharing && (
        <span className="call-block__media-status-item call-block__media-status-item--screen" title="Partage d'écran">
          <MonitorUp size={14} strokeWidth={2} aria-hidden />
        </span>
      )}
      {cameraOn && (
        <span className="call-block__media-status-item call-block__media-status-item--camera" title="Caméra activée">
          <Video size={14} strokeWidth={2} aria-hidden />
        </span>
      )}
      {muted && (
        <span className="call-block__media-status-item call-block__media-status-item--muted" title="Micro coupé">
          <MicOff size={14} strokeWidth={2} aria-hidden />
        </span>
      )}
    </div>
  );
}

export default function PresenceActivityButton({
  roomId,
  userId,
  isLocal = false,
}: PresenceActivityButtonProps) {
  const storedActivity = usePresenceActivityStore((s) => s.getActivity(roomId, userId, isLocal));
  const setActivity = usePresenceActivityStore((s) => s.setActivity);
  const aiComposerEngaged = useAiComposerStore((s) => s.engaged);
  const aiModel = useStore((s) => s.aiModel);
  const aiRun = useStore((s) => s.aiRun);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const aiGenerating = aiRun?.status === "running" && aiRun.runKind === "chat";
  const showAiPresence = isLocal && (aiComposerEngaged || aiGenerating);
  const manualActivity = isManualPresenceActivity(storedActivity) ? storedActivity : null;

  const pickerActivity: PresenceActivityId | "unset" = showAiPresence
    ? presenceActivityFromModel(aiGenerating ? aiRun.aiModel : aiModel)
    : manualActivity ?? "unset";

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const gap = 6;
    let left = rect.right - MENU_WIDTH;
    left = Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8));
    const top = rect.bottom + gap;
    setMenuPos({ top, left, width: MENU_WIDTH });
  }, []);

  useEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
    const onLayout = () => updateMenuPosition();
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const pickerLabel =
    pickerActivity === "unset"
      ? "Choisir une activité"
      : getPresenceActivityOption(pickerActivity).label;

  if (!isLocal) {
    const label = getPresenceActivityOption(storedActivity).label;
    return (
      <span className="call-block__activity call-block__activity--readonly" title={label}>
        <ActivityGlyph activityId={storedActivity} />
      </span>
    );
  }

  const menu =
    open && menuPos
      ? createPortal(
          <>
            <button
              type="button"
              className="call-block__activity-backdrop"
              aria-label="Fermer le menu d'activité"
              onClick={() => setOpen(false)}
            />
            <div
              className="call-block__activity-menu call-block__activity-menu--floating"
              role="menu"
              aria-label="Choisir une activité"
              style={{
                top: menuPos.top,
                left: menuPos.left,
                width: menuPos.width,
              }}
            >
              {PRESENCE_ACTIVITY_PICKER_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="menuitem"
                  className={clsx(
                    "call-block__activity-option",
                    manualActivity === option.id && "call-block__activity-option--active",
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    setActivity(roomId, userId, option.id);
                    setOpen(false);
                  }}
                >
                  <span className="call-block__activity-option-icon" aria-hidden>
                    {option.imageSrc ? (
                      <img
                        src={option.imageSrc}
                        alt=""
                        className="call-block__activity-img"
                        draggable={false}
                      />
                    ) : option.icon ? (
                      <option.icon size={14} strokeWidth={2} />
                    ) : null}
                  </span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <div className="call-block__activity-anchor">
      <LocalMediaStatusIcons />
      <button
        ref={buttonRef}
        type="button"
        className={clsx("call-block__activity", open && "call-block__activity--open")}
        title={`${pickerLabel}. Cliquer pour changer.`}
        aria-label={`${pickerLabel}. Changer.`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {pickerActivity === "unset" ? (
          <Radio size={14} strokeWidth={2} className="text-muted-500" aria-hidden />
        ) : (
          <ActivityGlyph activityId={pickerActivity} />
        )}
      </button>
      {menu}
    </div>
  );
}
