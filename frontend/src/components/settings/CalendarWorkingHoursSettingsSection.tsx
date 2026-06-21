import { useState } from "react";
import {
  formatCalendarWorkTime,
  parseCalendarWorkTimeInput,
  resolveCalendarWorkingHours,
} from "../../lib/userPreferences";
import { useStore } from "../../store/useStore";

export default function CalendarWorkingHoursSettingsSection() {
  const calendarWorkStartMinutes = useStore((s) => s.calendarWorkStartMinutes);
  const calendarWorkEndMinutes = useStore((s) => s.calendarWorkEndMinutes);
  const setCalendarWorkingHours = useStore((s) => s.setCalendarWorkingHours);
  const [error, setError] = useState<string | null>(null);

  const startTime = formatCalendarWorkTime(calendarWorkStartMinutes);
  const endTime = formatCalendarWorkTime(calendarWorkEndMinutes);

  function handleStartChange(value: string) {
    setError(null);
    const parsed = parseCalendarWorkTimeInput(value, calendarWorkStartMinutes);
    const next = resolveCalendarWorkingHours(parsed, calendarWorkEndMinutes);
    if (next.endMinutes <= next.startMinutes) {
      setError("L'heure de fin doit être après l'heure de début.");
      return;
    }
    setCalendarWorkingHours(next.startMinutes, next.endMinutes);
  }

  function handleEndChange(value: string) {
    setError(null);
    const parsed = parseCalendarWorkTimeInput(value, calendarWorkEndMinutes);
    const next = resolveCalendarWorkingHours(calendarWorkStartMinutes, parsed);
    if (next.endMinutes <= next.startMinutes) {
      setError("L'heure de fin doit être après l'heure de début.");
      return;
    }
    setCalendarWorkingHours(next.startMinutes, next.endMinutes);
  }

  return (
    <section className="settings-section">
      <h3 className="settings-section__label">Heures d&apos;ouverture du calendrier</h3>
      <p className="settings-section__hint">
        Plage horaire utilisée par <span className="font-medium text-muted-300">/manage</span> pour
        planifier vos tâches dans le calendrier.
      </p>

      <div className="settings-section__stack mt-3">
        <div className="flex items-end gap-3">
          <label className="settings-audio-field flex-1">
            <span className="settings-audio-field__label">Début</span>
            <input
              type="time"
              className="input w-full"
              value={startTime}
              step={300}
              onChange={(event) => handleStartChange(event.target.value)}
            />
          </label>
          <span className="pb-2 text-muted-500" aria-hidden>
            →
          </span>
          <label className="settings-audio-field flex-1">
            <span className="settings-audio-field__label">Fin</span>
            <input
              type="time"
              className="input w-full"
              value={endTime}
              step={300}
              onChange={(event) => handleEndChange(event.target.value)}
            />
          </label>
        </div>
      </div>

      {error && <p className="settings-section__error">{error}</p>}

      <p className="settings-section__meta">
        Plage active :{" "}
        <span className="text-muted-300">
          {startTime} – {endTime}
        </span>
      </p>
    </section>
  );
}
