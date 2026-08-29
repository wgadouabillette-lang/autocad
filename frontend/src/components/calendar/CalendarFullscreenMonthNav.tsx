import { useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  formatMonthYearLabel,
  isTodayKey,
  miniMonthGrid,
  upcomingMonthStarts,
  weekdayNarrowLabels,
} from "../../lib/daySchedule";
import { useCalendarOverlayStore } from "../../store/useCalendarOverlayStore";
import { useStore } from "../../store/useStore";

const WEEK_STARTS_ON = 1;
const WEEKDAY_LABELS = weekdayNarrowLabels("fr-FR", WEEK_STARTS_ON);

export default function CalendarFullscreenMonthNav() {
  const chatPanelExpanded = useStore((s) => s.chatPanelExpanded);
  const chatPanelLeaveAnimating = useStore((s) => s.chatPanelLeaveAnimating);
  const chatPanelMode = useStore((s) => s.chatPanelMode);
  const selectedDate = useCalendarOverlayStore((s) => s.selectedDate);
  const setSelectedDate = useCalendarOverlayStore((s) => s.setSelectedDate);
  const navRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrolledFromTop, setScrolledFromTop] = useState(false);

  const months = useMemo(() => upcomingMonthStarts(), []);

  const visible =
    chatPanelExpanded &&
    !chatPanelLeaveAnimating &&
    chatPanelMode === "calendar";

  useLayoutEffect(() => {
    if (!visible) return;
    const nav = navRef.current;
    if (!nav) return;
    const panel = nav.closest(".chat-panel");
    if (!(panel instanceof HTMLElement)) return;

    const syncTop = () => {
      const timeline = panel.querySelector(".calendar-panel__timeline");
      if (!(timeline instanceof HTMLElement)) {
        nav.style.removeProperty("top");
        return;
      }
      const top =
        timeline.getBoundingClientRect().top - panel.getBoundingClientRect().top;
      nav.style.top = `${Math.max(0, top)}px`;
    };

    syncTop();
    const observer = new ResizeObserver(syncTop);
    observer.observe(panel);
    const timeline = panel.querySelector(".calendar-panel__timeline");
    const toolbar = panel.querySelector(".calendar-panel__toolbar");
    if (timeline instanceof HTMLElement) observer.observe(timeline);
    if (toolbar instanceof HTMLElement) observer.observe(toolbar);
    window.addEventListener("resize", syncTop);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncTop);
    };
  }, [visible, selectedDate]);

  useLayoutEffect(() => {
    if (!visible) {
      setScrolledFromTop(false);
      return;
    }
    const el = scrollerRef.current;
    if (!el) return;
    const selected = el.querySelector("[data-selected-month='true']");
    if (selected instanceof HTMLElement) {
      selected.scrollIntoView({ block: "nearest" });
    }
    const syncTopFade = () => setScrolledFromTop(el.scrollTop > 0);
    syncTopFade();
    el.addEventListener("scroll", syncTopFade, { passive: true });
    return () => el.removeEventListener("scroll", syncTopFade);
  }, [selectedDate, visible]);

  if (!visible) return null;

  return (
    <aside
      ref={navRef}
      className="calendar-fullscreen-month-nav"
      aria-label="Choisir une date"
    >
      <div
        ref={scrollerRef}
        className={clsx(
          "calendar-fullscreen-month-nav__card",
          scrolledFromTop && "calendar-fullscreen-month-nav__card--scrolled",
        )}
      >
        <div className="calendar-fullscreen-month-nav__stack">
          {months.map((monthStart) => {
            const year = monthStart.getFullYear();
            const monthIndex = monthStart.getMonth();
            const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
            const selectedInMonth = selectedDate.startsWith(monthKey);
            const cells = miniMonthGrid(year, monthIndex, WEEK_STARTS_ON);
            return (
              <section
                key={monthKey}
                className="calendar-fullscreen-month-nav__month"
                data-selected-month={selectedInMonth ? "true" : undefined}
                aria-label={formatMonthYearLabel(monthStart)}
              >
                <div className="calendar-fullscreen-month-nav__frame">
                  <h3 className="calendar-fullscreen-month-nav__title">
                    {formatMonthYearLabel(monthStart)}
                  </h3>
                  <div
                    className="calendar-fullscreen-month-nav__divider"
                    role="presentation"
                  />
                  <div className="calendar-fullscreen-month-nav__weekdays" aria-hidden>
                    {WEEKDAY_LABELS.map((label, index) => (
                      <span key={`${label}-${index}`}>{label}</span>
                    ))}
                  </div>
                  <div className="calendar-fullscreen-month-nav__grid">
                    {cells.map((cell, index) => {
                      if (!cell.dateKey) {
                        return (
                          <span
                            key={`${monthKey}-empty-${index}`}
                            className="calendar-fullscreen-month-nav__day calendar-fullscreen-month-nav__day--empty"
                          />
                        );
                      }
                      const dateKey = cell.dateKey;
                      const selected = dateKey === selectedDate;
                      const today = isTodayKey(dateKey);
                      const dayNumber = Number(dateKey.slice(-2));
                      return (
                        <button
                          key={dateKey}
                          type="button"
                          className={clsx(
                            "calendar-fullscreen-month-nav__day",
                            selected && "calendar-fullscreen-month-nav__day--selected",
                            today && "calendar-fullscreen-month-nav__day--today",
                          )}
                          aria-label={dateKey}
                          aria-current={selected ? "date" : undefined}
                          onClick={() => setSelectedDate(dateKey)}
                        >
                          {dayNumber}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
