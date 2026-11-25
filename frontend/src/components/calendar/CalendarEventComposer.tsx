import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { X } from "lucide-react";
import { avatarColor, userInitials } from "../../lib/calls";
import { formatDayLabel, toDateKey } from "../../lib/daySchedule";
import {
  createUserCalendarEvents,
  fetchUserCalendarEvents,
  syncUserEventsToGoogle,
  syncUserEventsToOutlook,
} from "../../lib/calendarEventsApi";
import { fetchGoogleCalendarStatus } from "../../lib/calendarSync";
import { fetchOutlookCalendarStatus } from "../../lib/outlookCalendarSync";
import { notifyCalendarEventsChanged } from "../../hooks/usePersistedCalendarEvents";
import { useCalendarOverlayStore } from "../../store/useCalendarOverlayStore";
import { useStore } from "../../store/useStore";
import { useCalendarStore } from "../../store/useCalendarStore";
import { isMarketingPreview } from "../../lib/marketingPreview";
import { usePeopleStore } from "../../store/usePeopleStore";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function buildTimeString(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

function parseTimeString(value: string): { hour: number; minute: number } | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
}

function minutesFromTimeString(value: string): number | null {
  const parsed = parseTimeString(value);
  if (!parsed) return null;
  return parsed.hour * 60 + parsed.minute;
}

function defaultStartTime(initialHour: number | null): string {
  if (initialHour !== null) return buildTimeString(initialHour, 0);
  const now = new Date();
  return buildTimeString(now.getHours(), 0);
}

function defaultEndTime(initialHour: number | null): string {
  if (initialHour !== null) {
    return buildTimeString(Math.min(23, initialHour + 1), 0);
  }
  const now = new Date();
  return buildTimeString(Math.min(23, now.getHours() + 1), 0);
}

export default function CalendarEventComposer({
  onDismiss,
  plain = false,
}: {
  onDismiss?: () => void;
  plain?: boolean;
}) {
  const { t } = useTranslation();
  const composerInitialHour = useCalendarOverlayStore((s) => s.composerInitialHour);
  const composerInitialDate = useCalendarOverlayStore((s) => s.composerInitialDate);
  const closeComposer = useCalendarOverlayStore((s) => s.closeComposer);
  const dismiss = () => {
    if (onDismiss) onDismiss();
    else closeComposer();
  };
  const showCreatedCall = (dateKey: string, eventId: string | undefined) => {
    if (!plain || !eventId) return;
    useCalendarOverlayStore.getState().revealAddedEvent(dateKey, eventId);
    useStore.getState().openCalendarPanel();
  };
  const friends = usePeopleStore((s) => s.friends);
  const sendMessage = usePeopleStore((s) => s.sendMessage);

  const sortedFriends = useMemo(
    () => [...friends].sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [friends],
  );

  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [eventDate, setEventDate] = useState(
    () => composerInitialDate ?? toDateKey(new Date()),
  );
  const [startTime, setStartTime] = useState(() => defaultStartTime(composerInitialHour));
  const [endTime, setEndTime] = useState(() => defaultEndTime(composerInitialHour));
  const [invitedIds, setInvitedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEventDate(composerInitialDate ?? toDateKey(new Date()));
    setStartTime(defaultStartTime(composerInitialHour));
    setEndTime(defaultEndTime(composerInitialHour));
  }, [composerInitialDate, composerInitialHour]);

  const toggleFriend = (id: string) => {
    setInvitedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t("calendarUi.needTitle"));
      return;
    }
    const startMinutes = minutesFromTimeString(startTime);
    const endMinutes = minutesFromTimeString(endTime);
    if (startMinutes === null || endMinutes === null) {
      setError(t("calendarUi.invalidTimes"));
      return;
    }
    if (endMinutes <= startMinutes) {
      setError(t("calendarUi.endAfterStart"));
      return;
    }

    const detailTrimmed = detail.trim();

    if (isMarketingPreview()) {
      const invitedNames = sortedFriends
        .filter((friend) => invitedIds.has(friend.id))
        .map((friend) => friend.name)
        .join(" · ");
      const previewDetail = [detailTrimmed, invitedNames].filter(Boolean).join(" · ");
      void createUserCalendarEvents(
        [
          {
            title: trimmedTitle,
            detail: previewDetail || undefined,
            dateKey: eventDate,
            startMinutes,
            endMinutes,
          },
        ],
        "user",
      ).then((created) => {
        showCreatedCall(eventDate, created.events[0]?.id);
        dismiss();
      });
      return;
    }

    void createUserCalendarEvents(
      [
        {
          title: trimmedTitle,
          detail: detailTrimmed || undefined,
          dateKey: eventDate,
          startMinutes,
          endMinutes,
        },
      ],
      "user",
    )
      .then(async (created) => {
        const createdEventId = created.events[0]?.id;
        let events = created.events;
        let googleSynced =
          created.googleSynced > 0 ||
          created.events.some((event) => Boolean(event.googleEventId));
        let outlookSynced =
          created.outlookSynced > 0 ||
          created.events.some((event) => Boolean(event.outlookEventId));
        const [googleStatus, outlookStatus] = await Promise.all([
          fetchGoogleCalendarStatus(),
          fetchOutlookCalendarStatus(),
        ]);

        if (googleStatus.connected && !googleSynced) {
          try {
            const retro = await syncUserEventsToGoogle();
            events = retro.events;
            googleSynced = retro.synced > 0 || events.some((event) => Boolean(event.googleEventId));
          } catch {
            /* retry sync unavailable */
          }
        }

        if (outlookStatus.connected && !outlookSynced) {
          try {
            const retro = await syncUserEventsToOutlook();
            events = retro.events;
            outlookSynced =
              retro.synced > 0 || events.some((event) => Boolean(event.outlookEventId));
          } catch {
            /* retry sync unavailable */
          }
        }

        useCalendarStore.getState().setUserEvents(
          events.length > 0 ? events : await fetchUserCalendarEvents(),
        );
        notifyCalendarEventsChanged();
        window.dispatchEvent(new CustomEvent("forma-connector-oauth-done"));

        const syncErrors = [
          googleStatus.configured && googleStatus.connected && !googleSynced
            ? t("calendarUi.savedGoogleFailed")
            : "",
          outlookStatus.configured && outlookStatus.connected && !outlookSynced
            ? t("calendarUi.savedOutlookFailed")
            : "",
        ].filter(Boolean);
        if (syncErrors.length > 0) {
          setError(syncErrors.join(" "));
          return;
        }

        if (invitedIds.size > 0) {
          const dayLabel = formatDayLabel(eventDate);
          const timeLabel = `${startTime} – ${endTime}`;
          const invitationText = `Invitation : ${trimmedTitle}\n${dayLabel} · ${timeLabel}${
            detailTrimmed ? `\n${detailTrimmed}` : ""
          }`;
          for (const friendId of invitedIds) {
            sendMessage(`friend-${friendId}`, invitationText);
          }
        }

        showCreatedCall(eventDate, createdEventId);
        dismiss();
      })
      .catch(() => {
        setError(t("calendarUi.saveFailed"));
      });
  };

  return (
    <div
      className={
        plain
          ? "calendar-event-composer calendar-event-composer--plain chat-poll-composer"
          : "calendar-event-composer chat-poll-composer"
      }
      aria-label={t("calendarUi.create")}
    >
      {plain ? null : (
        <button
          type="button"
          className="chat-poll-composer__close"
          onClick={dismiss}
          aria-label={t("common.close")}
        >
          <X size={18} aria-hidden />
        </button>
      )}

      <div className="chat-poll-composer__body">
        <input
          className="chat-poll-composer__field chat-poll-composer__field--title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (error) setError(null);
          }}
          placeholder={t("calendarUi.title")}
          autoFocus
        />
        <input
          className="chat-poll-composer__field chat-poll-composer__field--subtitle"
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          placeholder={t("calendarUi.notes")}
        />

        <label className="calendar-event-composer__date-field">
          <span className="calendar-event-composer__time-label">{t("calendarUi.allDay")}</span>
          <input
            type="date"
            className="calendar-event-composer__time-input"
            value={eventDate}
            onChange={(event) => {
              if (event.target.value) setEventDate(event.target.value);
              if (error) setError(null);
            }}
          />
        </label>

        <div className="calendar-event-composer__times">
          <label className="calendar-event-composer__time-field">
            <span className="calendar-event-composer__time-label">{t("calendarUi.start")}</span>
            <input
              type="time"
              className="calendar-event-composer__time-input"
              value={startTime}
              onChange={(event) => {
                setStartTime(event.target.value);
                if (error) setError(null);
              }}
              step={300}
            />
          </label>
          <span className="calendar-event-composer__time-sep" aria-hidden>
            →
          </span>
          <label className="calendar-event-composer__time-field">
            <span className="calendar-event-composer__time-label">{t("calendarUi.end")}</span>
            <input
              type="time"
              className="calendar-event-composer__time-input"
              value={endTime}
              onChange={(event) => {
                setEndTime(event.target.value);
                if (error) setError(null);
              }}
              step={300}
            />
          </label>
        </div>

        {plain ? null : (
        <div className="calendar-event-composer__participants">
          <p className="calendar-event-composer__section-title">
            Participants
            {invitedIds.size > 0 && (
              <span className="calendar-event-composer__section-count">
                · {invitedIds.size}
              </span>
            )}
          </p>
          {sortedFriends.length === 0 ? (
            <p className="calendar-event-composer__empty">
              Ajoutez des amis pour les inviter à vos événements.
            </p>
          ) : (
            <ul className="calendar-event-composer__friends">
              {sortedFriends.map((friend) => {
                const selected = invitedIds.has(friend.id);
                return (
                  <li key={friend.id}>
                    <button
                      type="button"
                      className={clsx(
                        "calendar-event-composer__friend",
                        selected && "calendar-event-composer__friend--selected",
                      )}
                      onClick={() => toggleFriend(friend.id)}
                      aria-pressed={selected}
                    >
                      <span
                        className="calendar-event-composer__avatar"
                        style={{ backgroundColor: avatarColor(friend.id) }}
                        aria-hidden
                      >
                        {userInitials(friend.name)}
                      </span>
                      <span className="calendar-event-composer__friend-name">
                        {friend.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        )}

        {error && <p className="chat-poll-composer__error">{error}</p>}
      </div>

      <footer className="chat-poll-composer__footer">
        <button
          type="button"
          className="chat-poll-composer__publish"
          onClick={handleCreate}
        >
          {t("calendarUi.createAction")}
        </button>
      </footer>
    </div>
  );
}
