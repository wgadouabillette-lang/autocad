import { useEffect, useMemo, useRef, useState } from "react";
import { Camera } from "lucide-react";
import UserAvatar from "../UserAvatar";
import { ACCENT_COLOR_OPTIONS, type AccentColorPreference } from "../../lib/accentColor";
import { resolveClientLocale } from "../../lib/billingCurrency";
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

function isFrenchLocale(locale: string): boolean {
  return locale.toLowerCase().startsWith("fr");
}

function profileCopy(locale: string) {
  const fr = isFrenchLocale(locale);
  return {
    changePhoto: fr ? "Changer" : "Change",
    removePhoto: fr ? "Retirer" : "Remove",
    googlePhoto: fr ? "Photo Google" : "Google photo",
    namePlaceholder: fr ? "Votre nom" : "Your name",
    color: fr ? "Couleur" : "Color",
    colorHint: fr
      ? "Accent du profil, des boutons et des contrôles."
      : "Profile accent, buttons, and primary controls.",
    colorAria: fr ? "Couleur d'accent" : "Accent color",
    availability: fr ? "Disponibilité" : "Availability",
    availabilityHint: fr
      ? "Jours et heures où vous êtes disponible."
      : "Days and hours you are available.",
    from: fr ? "De" : "From",
    to: fr ? "À" : "To",
    photoAriaAdd: fr ? "Ajouter une photo de profil" : "Add a profile photo",
    photoAriaChange: fr ? "Changer la photo de profil" : "Change profile photo",
    startBeforeEnd: fr ? "Doit être avant l'heure de fin." : "Must be before the end time.",
    endAfterStart: fr ? "Doit être après l'heure de début." : "Must be after the start time.",
    photoError: fr ? "Impossible d'enregistrer la photo." : "Could not save the photo.",
    removeError: fr ? "Impossible de retirer la photo." : "Could not remove the photo.",
    googleError: fr ? "Impossible d'utiliser la photo Google." : "Could not use the Google photo.",
    dayAria: (label: string) =>
      fr ? `Disponible ${label}` : `Available ${label}`,
  };
}

function accentTitle(id: AccentColorPreference, fr: boolean): string {
  if (!fr) {
    return ACCENT_COLOR_OPTIONS.find((option) => option.id === id)?.title ?? id;
  }
  const titles: Record<AccentColorPreference, string> = {
    blue: "Bleu",
    emerald: "Émeraude",
    amber: "Ambre",
    cyan: "Cyan",
  };
  return titles[id];
}

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
  const locale = resolveClientLocale();
  const copy = useMemo(() => profileCopy(locale), [locale]);
  const fr = isFrenchLocale(locale);
  const weekdayLabels = useMemo(() => weekdayChipLabels(locale), [locale]);

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
      setPhotoError(error instanceof Error ? error.message : copy.photoError);
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
      setPhotoError(error instanceof Error ? error.message : copy.removeError);
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
      setPhotoError(error instanceof Error ? error.message : copy.googleError);
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
      setStartError(copy.startBeforeEnd);
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
      setEndError(copy.endAfterStart);
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
              aria-label={photoURL ? copy.photoAriaChange : copy.photoAriaAdd}
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
                {copy.changePhoto}
              </button>
              {showGooglePhoto ? (
                <button
                  type="button"
                  className="btn btn-ghost shrink-0"
                  disabled={photoBusy || !isAuthenticated}
                  onClick={() => void handleGooglePhoto()}
                >
                  {copy.googlePhoto}
                </button>
              ) : null}
              {photoURL ? (
                <button
                  type="button"
                  className="btn btn-ghost shrink-0"
                  disabled={photoBusy || !isAuthenticated}
                  onClick={() => void handleRemovePhoto()}
                >
                  {copy.removePhoto}
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
            <span className="sr-only">{copy.namePlaceholder}</span>
            <input
              type="text"
              className="settings-profile-card__name"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={commitDisplayName}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              placeholder={copy.namePlaceholder}
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
          <h3 className="settings-profile-card__label">{copy.color}</h3>
          <p className="settings-profile-card__hint">{copy.colorHint}</p>
        </div>
        <SettingsPicker
          value={accentColor}
          ariaLabel={copy.colorAria}
          prefix={
            <span
              className="settings-picker__swatch"
              style={{ backgroundColor: selectedAccent.swatch }}
            />
          }
          options={ACCENT_COLOR_OPTIONS.map((option) => ({
            value: option.id,
            label: accentTitle(option.id, fr),
          }))}
          onChange={(value) => setAccentColor(value as AccentColorPreference)}
        />
      </section>

      <div className="settings-profile-card__rule" role="presentation" />

      <section className="settings-profile-card__block" id="availability-hours">
        <div className="settings-profile-card__block-head">
          <h3 className="settings-profile-card__label">{copy.availability}</h3>
          <p className="settings-profile-card__hint">{copy.availabilityHint}</p>
        </div>
        <div className="settings-profile-card__days" role="group" aria-label={copy.availability}>
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
                aria-label={copy.dayAria(entry.full)}
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
            <span>{copy.from}</span>
            <SettingsTimeInput
              value={startTime}
              ariaLabel={copy.from}
              onChange={handleStartChange}
            />
          </label>
          <label className="settings-profile-card__time">
            <span>{copy.to}</span>
            <SettingsTimeInput
              value={endTime}
              ariaLabel={copy.to}
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
