import { useState } from "react";
import {
  formatCalendarWorkTime,
  parseCalendarWorkTimeInput,
  resolveCalendarWorkingHours,
} from "../../lib/userPreferences";
import { useStore } from "../../store/useStore";
import { SettingsTimeInput } from "./SettingsControls";
import SettingsFieldRow from "./SettingsFieldRow";

export default function CalendarWorkingHoursSettingsSection() {
  const calendarWorkStartMinutes = useStore((s) => s.calendarWorkStartMinutes);
  const calendarWorkEndMinutes = useStore((s) => s.calendarWorkEndMinutes);
  const setCalendarWorkingHours = useStore((s) => s.setCalendarWorkingHours);
  const [startError, setStartError] = useState<string | null>(null);
  const [endError, setEndError] = useState<string | null>(null);

  const startTime = formatCalendarWorkTime(calendarWorkStartMinutes);
  const endTime = formatCalendarWorkTime(calendarWorkEndMinutes);

  function handleStartChange(value: string) {
    setStartError(null);
    setEndError(null);
    const parsed = parseCalendarWorkTimeInput(value, calendarWorkStartMinutes);
    const next = resolveCalendarWorkingHours(parsed, calendarWorkEndMinutes);
    if (next.endMinutes <= next.startMinutes) {
      setStartError("Doit être avant l'heure de fermeture.");
      return;
    }
    setCalendarWorkingHours(next.startMinutes, next.endMinutes);
  }

  function handleEndChange(value: string) {
    setStartError(null);
    setEndError(null);
    const parsed = parseCalendarWorkTimeInput(value, calendarWorkEndMinutes);
    const next = resolveCalendarWorkingHours(calendarWorkStartMinutes, parsed);
    if (next.endMinutes <= next.startMinutes) {
      setEndError("Doit être après l'heure d'ouverture.");
      return;
    }
    setCalendarWorkingHours(next.startMinutes, next.endMinutes);
  }

  return (
    <>
      <SettingsFieldRow
        label="Heure d'ouverture"
        description="Début de la journée dans le calendrier."
        error={startError}
      >
        <SettingsTimeInput
          value={startTime}
          ariaLabel="Heure d'ouverture"
          onChange={handleStartChange}
        />
      </SettingsFieldRow>

      <SettingsFieldRow
        label="Heure de fermeture"
        description="Fin de la journée dans le calendrier."
        error={endError}
      >
        <SettingsTimeInput
          value={endTime}
          ariaLabel="Heure de fermeture"
          onChange={handleEndChange}
        />
      </SettingsFieldRow>
    </>
  );
}
