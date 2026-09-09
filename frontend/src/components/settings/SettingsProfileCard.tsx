import { useEffect, useMemo, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useTranslation } from "react-i18next";
import UserAvatar from "../UserAvatar";
import { ACCENT_COLOR_OPTIONS, type AccentColorPreference } from "../../lib/accentColor";
import { intlLocaleForAppLocale, resolveAppLocale } from "../../lib/appLocale";
import { auth } from "../../lib/firebase/client";
import { googleProviderPhotoURL } from "../../lib/firebase/profilePhoto";
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
  const restoreGoogleProfilePhoto = useAuthStore((s) => s.restoreGoogleProfilePhoto);
  const removeAndSyncProfilePhoto = useAuthStore((s) => s.removeAndSyncProfilePhoto);

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

  const googlePhotoURL = googleProviderPhotoURL(auth.currentUser);
  const showGooglePhoto =
    Boolean(googlePhotoURL) && googlePhotoURL !== (photoURL ?? "").trim();
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

  async function handleRemovePhoto() {
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      await removeAndSyncProfilePhoto();
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : t("settings.profile.removeError"));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleGooglePhoto() {
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      await restoreGoogleProfilePhoto();
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : t("settings.profile.googleError"));
    } finally {
      setPhotoBusy(false);
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
    <article className="settings-profile-card">
      <div className="settings-profile-card__hero">
        <div className="settings-profile-card__backdrop" aria-hidden>
          <UserAvatar
            userId="local"
            name={userDisplayName}
            isLocal
            className="settings-profile-card__backdrop-avatar"
          />
        </div>
        <div className="settings-profile-card__identity">
          <div className="settings-profile-photo">
            <button
              type="button"
              className="settings-profile-photo__trigger settings-profile-card__avatar-btn"
              disabled={photoBusy || !isAuthenticated}
              onClick={() => fileInputRef.current?.click()}
              aria-label={photoURL ? t("settings.profile.photoAriaChange") : t("settings.profile.photoAriaAdd")}
            >
              <UserAvatar
                userId="local"
                name={userDisplayName}
                isLocal
                className="settings-profile-card__avatar"
              />
              <span className="settings-profile-card__avatar-cam" aria-hidden>
                <Camera size={14} strokeWidth={2.25} />
              </span>
            </button>
            <div className="settings-profile-photo__actions">
              <button
                type="button"
                className="btn btn-ghost shrink-0"
                disabled={photoBusy || !isAuthenticated}
                onClick={() => fileInputRef.current?.click()}
              >
                {t("settings.profile.changePhoto")}
              </button>
              {showGooglePhoto ? (
                <button
                  type="button"
                  className="btn btn-ghost shrink-0"
                  disabled={photoBusy || !isAuthenticated}
                  onClick={() => void handleGooglePhoto()}
                >
                  {t("settings.profile.googlePhoto")}
                </button>
              ) : null}
              {photoURL ? (
                <button
                  type="button"
                  className="btn btn-ghost shrink-0"
                  disabled={photoBusy || !isAuthenticated}
                  onClick={() => void handleRemovePhoto()}
                >
                  {t("settings.profile.removePhoto")}
                </button>
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              className="sr-only"
              disabled={photoBusy || !isAuthenticated}
              onChange={(event) => void handlePhotoSelected(event.target.files?.[0])}
            />
          </div>
          {photoError ? <p className="settings-profile-card__error">{photoError}</p> : null}

          <label className="settings-profile-card__name-wrap" id="account-name">
            <span className="sr-only">{t("settings.profile.namePlaceholder")}</span>
            <input
              type="text"
              className="settings-profile-card__name"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={commitDisplayName}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              placeholder={t("settings.profile.namePlaceholder")}
            />
          </label>
          <p className="settings-profile-card__email" id="account-email">
            {userEmail || "—"}
          </p>
        </div>
      </div>

      <div className="settings-profile-card__rule" role="presentation" />

      <section className="settings-profile-card__block" id="accent-color">
        <div className="settings-profile-card__block-head">
          <h3 className="settings-profile-card__label">{t("settings.profile.color")}</h3>
          <p className="settings-profile-card__hint">{t("settings.profile.colorHint")}</p>
        </div>
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
      </section>

      <div className="settings-profile-card__rule" role="presentation" />

      <section className="settings-profile-card__block" id="availability-hours">
        <div className="settings-profile-card__block-head">
          <h3 className="settings-profile-card__label">{t("settings.profile.availability")}</h3>
          <p className="settings-profile-card__hint">{t("settings.profile.availabilityHint")}</p>
        </div>
        <div className="settings-profile-card__days" role="group" aria-label={t("settings.profile.availability")}>
          {weekdayLabels.map((entry) => {
            const on = availabilityDays.includes(entry.day);
            return (
              <button
                key={entry.day}
                type="button"
                className={
                  on
                    ? "settings-profile-card__day settings-profile-card__day--on"
                    : "settings-profile-card__day"
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
        <div className="settings-profile-card__hours">
          <label className="settings-profile-card__time">
            <span>{t("settings.profile.from")}</span>
            <SettingsTimeInput
              value={startTime}
              ariaLabel={t("settings.profile.from")}
              onChange={handleStartChange}
            />
          </label>
          <label className="settings-profile-card__time">
            <span>{t("settings.profile.to")}</span>
            <SettingsTimeInput
              value={endTime}
              ariaLabel={t("settings.profile.to")}
              onChange={handleEndChange}
            />
          </label>
        </div>
        {startError ? <p className="settings-profile-card__error">{startError}</p> : null}
        {endError ? <p className="settings-profile-card__error">{endError}</p> : null}
      </section>
    </article>
  );
}
