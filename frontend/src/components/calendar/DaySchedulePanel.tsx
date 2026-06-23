import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronDown, Plus, X } from "lucide-react";
import {
  eventStatusForDay,
  formatDayLabel,
  formatScheduleTime,
  isTodayKey,
} from "../../lib/daySchedule";
import { useGoogleCalendarSync } from "../../hooks/useGoogleCalendarSync";
import { useOutlookCalendarSync } from "../../hooks/useOutlookCalendarSync";
import { usePersistedCalendarEvents } from "../../hooks/usePersistedCalendarEvents";
import { useCalendarOverlayStore } from "../../store/useCalendarOverlayStore";
import { useCalendarStore } from "../../store/useCalendarStore";
import { useStore } from "../../store/useStore";
import { deleteCalendarEventById } from "../../lib/calendarEventDelete";
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
  const outlookEvents = useCalendarStore((s) => s.outlookEvents);
  useGoogleCalendarSync(selectedDate);
  useOutlookCalendarSync(selectedDate);
  usePersistedCalendarEvents();
  const events = useMemo(
    () => useCalendarStore.getState().calendarEventsForDate(selectedDate),
    [selectedDate, userEvents, googleEvents, outlookEvents],
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

  const handleDateInputClick = (event: React.MouseEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    if (typeof input.showPicker !== "function") return;
    try {
      input.showPicker();
    } catch {
      /* already open or unsupported */
    }
  };

  const handleSlotClick = (hour: number) => {
    openComposer(hour);
  };

  const handleDeleteEvent = (eventId: string) => {
    void deleteCalendarEventById(eventId);
  };

  return (
    <div className="calendar-panel">
      <div className="calendar-panel__toolbar">
        <p className="calendar-panel__date">{formatDayLabel(selectedDate)}</p>

        <div className="calendar-panel__today-wrap">
          <div className="calendar-panel__today-row">
            <div className="calendar-panel__today-picker">
              <span className="calendar-panel__today-btn" aria-hidden>
                Today
                <ChevronDown size={11} strokeWidth={2.25} className="shrink-0 opacity-80" />
              </span>
              <input
                ref={dateInputRef}
                type="date"
                className="calendar-panel__date-input"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                onClick={handleDateInputClick}
                aria-label="Choisir une date"
              />
            </div>
          </div>
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
                  "calendar-panel__event group",
                  status === "now" && "calendar-panel__event--now",
                  status === "past" && "calendar-panel__event--past",
                )}
                style={{ top, height }}
              >
                <button
                  type="button"
                  className="calendar-panel__event-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteEvent(event.id);
                  }}
                  aria-label={`Supprimer ${event.title}`}
                  title="Supprimer"
                >
                  <X size={11} strokeWidth={2.25} aria-hidden />
                </button>
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
