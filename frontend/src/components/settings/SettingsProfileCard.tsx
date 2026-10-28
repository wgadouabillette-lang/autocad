import { useEffect, useMemo, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useTranslation } from "react-i18next";
import UserAvatar from "../UserAvatar";
import { ACCENT_COLOR_OPTIONS, type AccentColorPreference } from "../../lib/accentColor";
import { intlLocaleForAppLocale, resolveAppLocale } from "../../lib/appLocale";
import {
  AVAILABILITY_WEEKDAY_ORDER,
  formatCalendarWorkTime,
  normalizeAvailabilityDays,
  parseCalendarWorkTimeInput,
  resolveCalendarWorkingHours,
  toggleAvailabilityDay,
} from "../../lib/userPreferences";
import { useAuthStore } from "../../store/useAuthStore";
import { useStore } from "../../store/useStore";
import SettingsPicker, { SettingsTimeInput } from "./SettingsControls";
import SettingsFieldRow from "./SettingsFieldRow";

const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp";

function weekdayChipLabels(locale: string): { day: number; label: string; full: string }[] {
  const resolved = locale.trim() || "en-US";
  const sunday = new Date(Date.UTC(2024, 0, 7));
  return AVAILABILITY_WEEKDAY_ORDER.map((day) => {
    const date = new Date(sunday);
    date.setUTCDate(sunday.getUTCDate() + day);
    try {
      const full = new Intl.DateTimeFormat(resolved, {
        weekday: "long",
        timeZone: "UTC",
      }).format(date);
      const short = new Intl.DateTimeFormat(resolved, {
        weekday: "short",
        timeZone: "UTC",
      }).format(date);
      const label = short.replace(/\.$/, "").trim();
      const fullLabel = full.trim();
      return {
        day,
        label: label ? label.charAt(0).toUpperCase() + label.slice(1) : String(day),
        full: fullLabel ? fullLabel.charAt(0).toUpperCase() + fullLabel.slice(1) : String(day),
      };
    } catch {
      return { day, label: String(day), full: String(day) };
    }
  });
}

export default function SettingsProfileCard() {
  const { t } = useTranslation();
  const localePref = useStore((s) => s.locale);
  const intlLocale = intlLocaleForAppLocale(resolveAppLocale(localePref));
  const weekdayLabels = useMemo(() => weekdayChipLabels(intlLocale), [intlLocale]);

  const userDisplayName = useStore((s) => s.userDisplayName);
  const setUserDisplayName = useStore((s) => s.setUserDisplayName);
  const userEmail = useStore((s) => s.userEmail);
  const photoURL = useStore((s) => s.photoURL);
  const accentColor = useStore((s) => s.accentColor);
  const setAccentColor = useStore((s) => s.setAccentColor);
  const calendarWorkStartMinutes = useStore((s) => s.calendarWorkStartMinutes);
  const calendarWorkEndMinutes = useStore((s) => s.calendarWorkEndMinutes);
  const setCalendarWorkingHours = useStore((s) => s.setCalendarWorkingHours);
  const storedAvailabilityDays = useStore((s) => s.availabilityDays);
  const setAvailabilityDays = useStore((s) => s.setAvailabilityDays);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const uploadAndSyncProfilePhoto = useAuthStore((s) => s.uploadAndSyncProfilePhoto);

  const [draftName, setDraftName] = useState(userDisplayName);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [endError, setEndError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { startMinutes, endMinutes } = useMemo(
    () => resolveCalendarWorkingHours(calendarWorkStartMinutes, calendarWorkEndMinutes),
    [calendarWorkStartMinutes, calendarWorkEndMinutes],
  );
  // Normalize outside the Zustand selector — a fresh array each snapshot infinite-loops.
  const availabilityDays = useMemo(
    () => normalizeAvailabilityDays(storedAvailabilityDays),
    [storedAvailabilityDays],
  );

  const selectedAccent =
    ACCENT_COLOR_OPTIONS.find((option) => option.id === accentColor) ?? ACCENT_COLOR_OPTIONS[0]!;

  useEffect(() => {
    setDraftName(userDisplayName);
  }, [userDisplayName]);

  function commitDisplayName() {
    const trimmed = draftName.trim();
    if (!trimmed) {
      setDraftName(userDisplayName);
      return;
    }
    if (trimmed !== userDisplayName) {
      setUserDisplayName(trimmed);
    }
  }

  async function handlePhotoSelected(file: File | undefined) {
    if (!file) return;
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      await uploadAndSyncProfilePhoto(file);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : t("settings.profile.photoError"));
    } finally {
      setPhotoBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleStartChange(value: string) {
    setStartError(null);
    setEndError(null);
    const parsed = parseCalendarWorkTimeInput(value, startMinutes);
    const next = resolveCalendarWorkingHours(parsed, endMinutes);
    if (next.endMinutes <= next.startMinutes) {
      setStartError(t("settings.profile.startBeforeEnd"));
      return;
    }
    setCalendarWorkingHours(next.startMinutes, next.endMinutes);
  }

  function handleEndChange(value: string) {
    setStartError(null);
    setEndError(null);
    const parsed = parseCalendarWorkTimeInput(value, endMinutes);
    const next = resolveCalendarWorkingHours(startMinutes, parsed);
    if (next.endMinutes <= next.startMinutes) {
      setEndError(t("settings.profile.endAfterStart"));
      return;
    }
    setCalendarWorkingHours(next.startMinutes, next.endMinutes);
  }

  const startTime = formatCalendarWorkTime(startMinutes);
  const endTime = formatCalendarWorkTime(endMinutes);

  return (
    <>
      <section className="settings-preferences__group">
        <h3 className="settings-preferences__title">Profil</h3>
        <div className="settings-field-list">
          <SettingsFieldRow
            label="Photo"
            description="Image affichée sur votre profil."
            error={photoError}
            controlClassName="settings-field-row__control--end"
          >
            <button
              type="button"
              className="settings-profile-photo__trigger settings-profile-card__avatar-btn"
              disabled={photoBusy || !isAuthenticated}
              onClick={() => fileInputRef.current?.click()}
              aria-label={t("settings.profile.photoAriaChange")}
            >
              <UserAvatar
                userId="local"
                name={userDisplayName}
                isLocal
                className="settings-profile-card__avatar"
              />
              <span className="settings-profile-card__avatar-cam" aria-hidden>
                <Camera size={12} strokeWidth={2.25} />
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              className="sr-only"
              disabled={photoBusy || !isAuthenticated}
              onChange={(event) => void handlePhotoSelected(event.target.files?.[0])}
            />
          </SettingsFieldRow>

          <SettingsFieldRow id="account-name" label="Nom">
            <input
              type="text"
              className="settings-picker__select"
              value={draftName}
              aria-label={t("settings.profile.namePlaceholder")}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={commitDisplayName}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              placeholder={t("settings.profile.namePlaceholder")}
            />
          </SettingsFieldRow>

          <SettingsFieldRow id="account-email" label="Courriel">
            <p className="settings-field-row__value">{userEmail || "—"}</p>
          </SettingsFieldRow>
        </div>
      </section>

      <section className="settings-preferences__group">
        <h3 className="settings-preferences__title">Apparence</h3>
        <div className="settings-field-list">
          <SettingsFieldRow
            id="accent-color"
            label={t("settings.profile.color")}
            description={t("settings.profile.colorHint")}
          >
            <SettingsPicker
              value={accentColor}
              ariaLabel={t("settings.profile.colorAria")}
              prefix={
                <span
                  className="settings-picker__swatch"
                  style={{ backgroundColor: selectedAccent.swatch }}
                />
              }
              options={ACCENT_COLOR_OPTIONS.map((option) => ({
                value: option.id,
                label: t(`settings.profile.accent.${option.id}`),
              }))}
              onChange={(value) => setAccentColor(value as AccentColorPreference)}
            />
          </SettingsFieldRow>
        </div>
      </section>

      <section className="settings-preferences__group">
        <h3 className="settings-preferences__title">{t("settings.profile.availability")}</h3>
        <div className="settings-field-list">
          <div className="settings-availability" id="availability-hours">
            <p className="settings-availability__hint">{t("settings.profile.availabilityHint")}</p>
            <div
              className="settings-availability__days"
              role="group"
              aria-label={t("settings.profile.availability")}
            >
              {weekdayLabels.map((entry) => {
                const on = availabilityDays.includes(entry.day);
                return (
                  <button
                    key={entry.day}
                    type="button"
                    className={
                      on
                        ? "settings-availability__day settings-availability__day--on"
                        : "settings-availability__day"
                    }
                    aria-pressed={on}
                    aria-label={t("settings.profile.dayAria", { label: entry.full })}
                    onClick={() =>
                      setAvailabilityDays(toggleAvailabilityDay(availabilityDays, entry.day))
                    }
                  >
                    {entry.label}
                  </button>
                );
              })}
            </div>
            <div className="settings-availability__hours">
              <label className="settings-availability__time">
                <span>{t("settings.profile.from")}</span>
                <SettingsTimeInput
                  value={startTime}
                  ariaLabel={t("settings.profile.from")}
                  onChange={handleStartChange}
                />
              </label>
              <label className="settings-availability__time">
                <span>{t("settings.profile.to")}</span>
                <SettingsTimeInput
                  value={endTime}
                  ariaLabel={t("settings.profile.to")}
                  onChange={handleEndChange}
                />
              </label>
            </div>
            {startError || endError ? (
              <p className="settings-profile-card__error">{startError || endError}</p>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
