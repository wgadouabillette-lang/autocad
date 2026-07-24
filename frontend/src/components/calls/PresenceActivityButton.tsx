import clsx from "clsx";
import { MicOff, MonitorUp, Radio, Video } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getLocalBlockPresenceActivityDisplay } from "../../lib/localPresenceActivity";
import {
  getPresenceActivityOption,
  isManualPresenceActivity,
  PRESENCE_ACTIVITY_PICKER_OPTIONS,
  type PresenceActivityId,
} from "../../lib/presenceActivity";
import { useAiComposerStore } from "../../store/useAiComposerStore";
import { usePresenceActivityStore } from "../../store/usePresenceActivityStore";
import { useSpotifyPlayerStore } from "../../store/useSpotifyPlayerStore";
import { useCallsStore } from "../../store/useCallsStore";
import { useAuthStore } from "../../store/useAuthStore";
import { useStore } from "../../store/useStore";
import { pushWorkspacePresenceActivity } from "../../lib/firebase/workspacePresence";
import { spotifyNowPlayingFromTrack, type SpotifyNowPlayingSnapshot } from "../../lib/spotifyNowPlaying";

interface PresenceActivityButtonProps {
  roomId: string;
  userId: string;
  isLocal?: boolean;
  layout?: "corner" | "inline";
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
}

const MENU_WIDTH = 168; // 10.5rem

function ActivityNowPlayingTooltip({
  nowPlaying,
  children,
  className,
}: {
  nowPlaying: SpotifyNowPlayingSnapshot | null;
  children: ReactNode;
  className?: string;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(null);

  const updateTipPosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setTipPos({
      top: rect.top - 8,
      left: rect.right,
    });
  }, []);

  useEffect(() => {
    if (!visible || !nowPlaying) return;
    updateTipPosition();
    const onLayout = () => updateTipPosition();
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [visible, nowPlaying, updateTipPosition]);

  if (!nowPlaying) return <>{children}</>;

  const showTip = () => {
    updateTipPosition();
    setVisible(true);
  };

  const hideTip = () => setVisible(false);

  return (
    <>
      <span
        ref={anchorRef}
        className={clsx("call-block__activity-now-playing", className)}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onFocus={showTip}
        onBlur={hideTip}
      >
        {children}
      </span>
      {visible && tipPos
        ? createPortal(
            <span
              className="call-block__activity-now-playing-tip call-block__activity-now-playing-tip--floating"
              role="tooltip"
              style={{
                top: tipPos.top,
                left: tipPos.left,
              }}
            >
              <span className="call-block__activity-now-playing-tip__content">
                {nowPlaying.imageUrl ? (
                  <img
                    src={nowPlaying.imageUrl}
                    alt=""
                    className="call-block__activity-now-playing-tip__cover"
                    draggable={false}
                  />
                ) : (
                  <span
                    className="call-block__activity-now-playing-tip__cover call-block__activity-now-playing-tip__cover--empty"
                    aria-hidden
                  />
                )}
                <span className="call-block__activity-now-playing-tip__text">{nowPlaying.label}</span>
              </span>
            </span>,
            document.body,
          )
        : null}
    </>
  );
}

function ActivityGlyph({ activityId, large = false }: { activityId: PresenceActivityId; large?: boolean }) {
  const option = getPresenceActivityOption(activityId);

  let glyph: React.ReactNode;
  if (option.imageSrc) {
    glyph = (
      <img
        src={option.imageSrc}
        alt=""
        className={large ? "call-block__activity-glyph" : "call-block__activity-img"}
        draggable={false}
      />
    );
  } else {
    const Icon = option.icon ?? Radio;
    glyph = (
      <Icon
        size={large ? 64 : 14}
        strokeWidth={2}
        aria-hidden
        className={large ? "call-block__activity-glyph call-block__activity-glyph--icon" : undefined}
      />
    );
  }

  if (large) {
    return <span className="call-block__activity-glyph-shell">{glyph}</span>;
  }

  return glyph;
}

export function CallBlockMediaStatusIcons({ userId, isLocal }: { userId: string; isLocal: boolean }) {
  return <MediaStatusIcons userId={userId} isLocal={isLocal} />;
}

function MediaStatusIcons({ userId, isLocal }: { userId: string; isLocal: boolean }) {
  const localMuted = useCallsStore((s) => s.muted);
  const localCameraOn = useCallsStore((s) => s.cameraOn);
  const localScreenSharing = useCallsStore((s) => s.screenSharing);
  const remoteMuted = useCallsStore((s) => s.mutedByParticipant[userId] === true);

  const muted = isLocal ? localMuted : remoteMuted;
  const cameraOn = isLocal ? localCameraOn : false;
  const screenSharing = isLocal ? localScreenSharing : false;

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
  layout = "inline",
}: PresenceActivityButtonProps) {
  const storedActivity = usePresenceActivityStore((s) => s.getActivity(roomId, userId, isLocal));
  const remoteSpotifyNowPlaying = usePresenceActivityStore((s) =>
    isLocal ? null : s.getSpotifyNowPlaying(roomId, userId),
  );
  const localCurrentTrack = useSpotifyPlayerStore((s) => (isLocal ? s.currentTrack : null));
  const localPlaying = useSpotifyPlayerStore((s) => (isLocal ? s.playing : false));
  const setActivity = usePresenceActivityStore((s) => s.setActivity);
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const userDisplayName = useStore((s) => s.userDisplayName);
  const photoURL = useStore((s) => s.photoURL);
  const aiComposerEngaged = useAiComposerStore((s) => s.engaged);
  const aiRun = useStore((s) => s.aiRun);
  useCallsStore((s) => s.getCallsViewMode(roomId));
  useCallsStore((s) => s.localOpenChannelByRoom[roomId]);
  useCallsStore((s) => s.isLocalInTheaterCall(roomId));
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const manualActivity = isManualPresenceActivity(storedActivity) ? storedActivity : null;

  const pickerActivity: PresenceActivityId | "unset" = isLocal
    ? getLocalBlockPresenceActivityDisplay(roomId)
    : storedActivity === "none"
      ? "unset"
      : storedActivity;

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

  const displayedActivity = isLocal ? pickerActivity : storedActivity;
  const spotifyNowPlaying: SpotifyNowPlayingSnapshot | null =
    displayedActivity === "spotify"
      ? isLocal
        ? localPlaying && localCurrentTrack
          ? spotifyNowPlayingFromTrack(localCurrentTrack)
          : null
        : remoteSpotifyNowPlaying
      : null;

  if (!isLocal) {
    const label = getPresenceActivityOption(storedActivity).label;
    return (
      <ActivityNowPlayingTooltip nowPlaying={spotifyNowPlaying}>
        <span
          className="call-block__activity call-block__activity--readonly"
          title={spotifyNowPlaying?.label ?? label}
          aria-label={spotifyNowPlaying?.label ?? label}
        >
          <ActivityGlyph activityId={storedActivity} large={layout === "corner"} />
        </span>
      </ActivityNowPlayingTooltip>
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
                    if (firebaseUid) {
                      void pushWorkspacePresenceActivity(
                        roomId,
                        firebaseUid,
                        {
                          displayName: userDisplayName.trim() || "Membre",
                          photoURL: photoURL ?? undefined,
                        },
                        option.id,
                      );
                    }
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

  const activityButton = (
    <ActivityNowPlayingTooltip nowPlaying={spotifyNowPlaying}>
      <button
        ref={buttonRef}
        type="button"
        className={clsx("call-block__activity", open && "call-block__activity--open")}
        title={
          spotifyNowPlaying
            ? spotifyNowPlaying.label
            : `${pickerLabel}. Cliquer pour changer.`
        }
        aria-label={
          spotifyNowPlaying
            ? `En écoute : ${spotifyNowPlaying.label}. Changer l'activité.`
            : `${pickerLabel}. Changer.`
        }
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {pickerActivity === "unset" ? (
          layout === "corner" ? (
            <span className="call-block__activity-glyph-shell">
              <Radio
                size={64}
                strokeWidth={2}
                className="call-block__activity-glyph call-block__activity-glyph--icon text-muted-500"
                aria-hidden
              />
            </span>
          ) : (
            <Radio size={14} strokeWidth={2} className="text-muted-500" aria-hidden />
          )
        ) : (
          <ActivityGlyph activityId={pickerActivity} large={layout === "corner"} />
        )}
      </button>
    </ActivityNowPlayingTooltip>
  );

  if (layout === "corner") {
    return (
      <>
        {activityButton}
        {menu}
      </>
    );
  }

  return (
    <div className="call-block__activity-anchor">
      <MediaStatusIcons userId={userId} isLocal={isLocal} />
      {activityButton}
      {menu}
    </div>
  );
}
