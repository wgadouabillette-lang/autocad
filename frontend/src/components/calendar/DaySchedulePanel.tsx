import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronDown, Plus } from "lucide-react";
import {
  eventStatusForDay,
  formatDayLabel,
  formatScheduleTime,
  isTodayKey,
} from "../../lib/daySchedule";
import { useGoogleCalendarSync } from "../../hooks/useGoogleCalendarSync";
import { useConnectors } from "../../hooks/useConnectors";
import { useCalendarOverlayStore } from "../../store/useCalendarOverlayStore";
import { useCalendarStore } from "../../store/useCalendarStore";
import { useStore } from "../../store/useStore";
import CalendarEventComposer from "./CalendarEventComposer";

const HOUR_HEIGHT = 48;
const TOTAL_HOURS = 24;
const HOURS = Array.from({ length: TOTAL_HOURS }, (_, i) => i);
const DEFAULT_SCROLL_HOUR = 8;

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export default function DaySchedulePanel() {
  const selectedDate = useCalendarOverlayStore((s) => s.selectedDate);
  const setSelectedDate = useCalendarOverlayStore((s) => s.setSelectedDate);
  const goToToday = useCalendarOverlayStore((s) => s.goToToday);
  const composerOpen = useCalendarOverlayStore((s) => s.composerOpen);
  const openComposer = useCalendarOverlayStore((s) => s.openComposer);
  const chatPanelExpanded = useStore((s) => s.chatPanelExpanded);
  const chatPanelLeaveAnimating = useStore((s) => s.chatPanelLeaveAnimating);
  const showInlineComposer =
    composerOpen && !chatPanelExpanded && !chatPanelLeaveAnimating;

  const dateInputRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const userEvents = useCalendarStore((s) => s.userEvents);
  const googleEvents = useCalendarStore((s) => s.googleEvents);
  const { status: googleStatus, loading: googleLoading, error: googleError, refresh: refreshGoogle } =
    useGoogleCalendarSync(selectedDate);
  const { connect, connectingId } = useConnectors();
  const events = useMemo(
    () => useCalendarStore.getState().eventsForDate(selectedDate),
    [selectedDate, userEvents, googleEvents],
  );
  const viewingToday = isTodayKey(selectedDate);

  const [nowMinutes, setNowMinutes] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  useEffect(() => {
    if (!viewingToday) return;
    const tick = () => {
      const d = new Date();
      setNowMinutes(d.getHours() * 60 + d.getMinutes());
    };
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [viewingToday]);

  useLayoutEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const targetMinutes = viewingToday ? nowMinutes : DEFAULT_SCROLL_HOUR * 60;
    const top = (targetMinutes / 60) * HOUR_HEIGHT - HOUR_HEIGHT * 1.5;
    el.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    // intentionally only on date change, not every minute
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const openDatePicker = () => {
    dateInputRef.current?.showPicker?.();
    dateInputRef.current?.click();
  };

  const handleSlotClick = (hour: number) => {
    openComposer(hour);
  };

  return (
    <div className="calendar-panel">
      <div className="calendar-panel__toolbar">
        <p className="calendar-panel__date">{formatDayLabel(selectedDate)}</p>

        <div className="calendar-panel__today-wrap">
          <div className="calendar-panel__today-row">
            <button
              type="button"
              className="calendar-panel__today-btn calendar-panel__today-btn--icon"
              onClick={() => openComposer()}
              aria-label="Nouvel événement"
              title="Nouvel événement"
            >
              <Plus size={12} strokeWidth={2.25} className="shrink-0" aria-hidden />
            </button>
            <button
              type="button"
              className="calendar-panel__today-btn"
              onClick={openDatePicker}
              aria-label="Choisir une date"
            >
              Today
              <ChevronDown size={11} strokeWidth={2.25} className="shrink-0 opacity-80" aria-hidden />
            </button>
          </div>
          <input
            ref={dateInputRef}
            type="date"
            className="calendar-overlay__date-input"
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) setSelectedDate(e.target.value);
            }}
            tabIndex={-1}
            aria-hidden
          />
          {!viewingToday && (
            <button
              type="button"
              className="calendar-panel__today-reset"
              onClick={goToToday}
            >
              Revenir à aujourd'hui
            </button>
          )}
        </div>
      </div>

      {googleStatus && !googleStatus.configured && (
        <p className="calendar-panel__sync-banner calendar-panel__sync-banner--warn">
          Google Calendar n&apos;est pas configuré sur le serveur (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).
        </p>
      )}

      {googleStatus?.configured && !googleStatus.connected && (
        <div className="calendar-panel__sync-banner">
          <span>Liez Google Calendar pour afficher et synchroniser vos événements.</span>
          <button
            type="button"
            className="calendar-panel__sync-connect"
            onClick={() => void connect("calendar")}
            disabled={connectingId === "calendar"}
          >
            {connectingId === "calendar" ? "Connexion…" : "Connecter Google Calendar"}
          </button>
        </div>
      )}

      {googleStatus?.connected && (
        <div className="calendar-panel__sync-banner calendar-panel__sync-banner--connected">
          <span>
            Synchronisé avec Google Calendar
            {googleStatus.accountEmail ? ` · ${googleStatus.accountEmail}` : ""}
          </span>
          <button
            type="button"
            className="calendar-panel__sync-refresh"
            onClick={() => void refreshGoogle()}
            disabled={googleLoading}
          >
            {googleLoading ? "Sync…" : "Actualiser"}
          </button>
        </div>
      )}

      {googleError && (
        <p className="calendar-panel__sync-banner calendar-panel__sync-banner--warn">{googleError}</p>
      )}

      <div className="calendar-panel__body">
        <div className="calendar-panel__timeline" ref={timelineRef}>
        <div
          className="calendar-panel__timeline-inner"
          style={{ height: HOUR_HEIGHT * TOTAL_HOURS }}
        >
          {HOURS.map((hour) => (
            <button
              key={hour}
              type="button"
              className="calendar-panel__hour-row"
              style={{ height: HOUR_HEIGHT }}
              onClick={() => handleSlotClick(hour)}
              aria-label={`Ajouter un événement à ${formatHourLabel(hour)}`}
            >
              <span className="calendar-panel__hour-label">
                {formatHourLabel(hour)}
              </span>
              <span className="calendar-panel__hour-line" aria-hidden />
              <span className="calendar-panel__hour-plus" aria-hidden>
                <Plus size={11} strokeWidth={2.25} />
              </span>
            </button>
          ))}

          {events.map((event) => {
            const status = eventStatusForDay(
              selectedDate,
              event.startMinutes,
              event.endMinutes,
            );
            const top = (event.startMinutes / 60) * HOUR_HEIGHT;
            const height = Math.max(
              22,
              ((event.endMinutes - event.startMinutes) / 60) * HOUR_HEIGHT - 2,
            );
            return (
              <div
                key={event.id}
                className={clsx(
                  "calendar-panel__event",
                  status === "now" && "calendar-panel__event--now",
                  status === "past" && "calendar-panel__event--past",
                )}
                style={{ top, height }}
              >
                <div className="calendar-panel__event-time">
                  {formatScheduleTime(event.startMinutes)} –{" "}
                  {formatScheduleTime(event.endMinutes)}
                </div>
                <div className="calendar-panel__event-title">{event.title}</div>
                {event.detail && (
                  <div className="calendar-panel__event-detail">{event.detail}</div>
                )}
                {status === "now" && (
                  <span className="calendar-panel__event-live">En cours</span>
                )}
              </div>
            );
          })}

          {viewingToday && (
            <div
              className="calendar-panel__now"
              style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
              aria-hidden
            >
              <span className="calendar-panel__now-dot" />
              <span className="calendar-panel__now-line" />
            </div>
          )}
        </div>
        </div>

        {showInlineComposer && (
          <div className="calendar-panel__composer-overlay">
            <div className="calendar-panel__composer-morph">
              <CalendarEventComposer />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
