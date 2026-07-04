import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import { avatarColor, userInitials } from "../../lib/calls";
import { formatDayLabel, toDateKey } from "../../lib/daySchedule";
import {
  createUserCalendarEvents,
  fetchUserCalendarEvents,
  syncUserEventsToGoogle,
} from "../../lib/calendarEventsApi";
import { fetchGoogleCalendarStatus } from "../../lib/calendarSync";
import { notifyCalendarEventsChanged } from "../../hooks/usePersistedCalendarEvents";
import { useCalendarOverlayStore } from "../../store/useCalendarOverlayStore";
import { useCalendarStore } from "../../store/useCalendarStore";
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

export default function CalendarEventComposer() {
  const composerInitialHour = useCalendarOverlayStore((s) => s.composerInitialHour);
  const composerInitialDate = useCalendarOverlayStore((s) => s.composerInitialDate);
  const closeComposer = useCalendarOverlayStore((s) => s.closeComposer);
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
      setError("Donnez un titre à l'événement.");
      return;
    }
    const startMinutes = minutesFromTimeString(startTime);
    const endMinutes = minutesFromTimeString(endTime);
    if (startMinutes === null || endMinutes === null) {
      setError("Heures invalides.");
      return;
    }
    if (endMinutes <= startMinutes) {
      setError("L'heure de fin doit être après l'heure de début.");
      return;
    }

    const detailTrimmed = detail.trim();

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
      .then(async (saved) => {
        let events = saved;
        let googleSynced = saved.some((event) => Boolean(event.googleEventId));
        const googleStatus = await fetchGoogleCalendarStatus();

        if (googleStatus.connected && !googleSynced) {
          try {
            const retro = await syncUserEventsToGoogle();
            events = retro.events;
            googleSynced = retro.synced > 0;
          } catch {
            /* retry sync unavailable */
          }
        }

        useCalendarStore.getState().setUserEvents(
          events.length > 0 ? events : await fetchUserCalendarEvents(),
        );
        notifyCalendarEventsChanged();
        window.dispatchEvent(new CustomEvent("forma-connector-oauth-done"));

        if (googleStatus.configured && googleStatus.connected && !googleSynced) {
          setError(
            "Événement enregistré dans l'app, mais la synchronisation Google a échoué. Reconnectez Google Calendar.",
          );
          return;
        }
        if (googleStatus.configured && !googleStatus.connected && !googleSynced) {
          setError(
            "Événement enregistré dans l'app. Connectez Google Calendar pour synchroniser.",
          );
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

        closeComposer();
      })
      .catch(() => {
        setError("Impossible d'enregistrer l'événement.");
      });
  };

  return (
    <div className="calendar-event-composer chat-poll-composer" aria-label="Créer un événement">
      <button
        type="button"
        className="chat-poll-composer__close"
        onClick={closeComposer}
        aria-label="Fermer"
      >
        <X size={18} aria-hidden />
      </button>

      <div className="chat-poll-composer__body">
        <input
          className="chat-poll-composer__field chat-poll-composer__field--title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (error) setError(null);
          }}
          placeholder="Titre de l'événement"
          autoFocus
        />
        <input
          className="chat-poll-composer__field chat-poll-composer__field--subtitle"
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          placeholder="Lieu ou notes (optionnel)"
        />

        <label className="calendar-event-composer__date-field">
          <span className="calendar-event-composer__time-label">Journée</span>
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
            <span className="calendar-event-composer__time-label">Début</span>
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
            <span className="calendar-event-composer__time-label">Fin</span>
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

        {error && <p className="chat-poll-composer__error">{error}</p>}
      </div>

      <footer className="chat-poll-composer__footer">
        <button
          type="button"
          className="chat-poll-composer__publish"
          onClick={handleCreate}
        >
          Créer
        </button>
      </footer>
    </div>
  );
}
