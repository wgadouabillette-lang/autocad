import { useEffect, useRef, useState } from "react";
import UserAvatar from "../UserAvatar";
import { useAuthStore } from "../../store/useAuthStore";
import { useStore } from "../../store/useStore";
import SettingsFieldRow from "./SettingsFieldRow";

const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp";

export default function AccountSettingsSection() {
  const userDisplayName = useStore((s) => s.userDisplayName);
  const setUserDisplayName = useStore((s) => s.setUserDisplayName);
  const userEmail = useStore((s) => s.userEmail);
  const photoURL = useStore((s) => s.photoURL);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const uploadAndSyncProfilePhoto = useAuthStore((s) => s.uploadAndSyncProfilePhoto);
  const removeAndSyncProfilePhoto = useAuthStore((s) => s.removeAndSyncProfilePhoto);
  const [draftName, setDraftName] = useState(userDisplayName);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const message =
        error instanceof Error ? error.message : "Impossible d'enregistrer la photo.";
      setPhotoError(message);
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
      const message =
        error instanceof Error ? error.message : "Impossible de retirer la photo.";
      setPhotoError(message);
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <>
      <SettingsFieldRow
        label="Photo de profil"
        description="Visible dans les appels et les messages."
        error={photoError}
      >
        <div className="settings-profile-photo settings-profile-photo--row">
          <button
            type="button"
            className="settings-profile-photo__trigger"
            disabled={photoBusy || !isAuthenticated}
            onClick={() => fileInputRef.current?.click()}
            aria-label={photoURL ? "Changer la photo de profil" : "Ajouter une photo de profil"}
          >
            <UserAvatar
              userId="local"
              name={userDisplayName}
              isLocal
              className="settings-profile-photo__preview"
            />
          </button>
          {photoURL && (
            <button
              type="button"
              className="btn btn-ghost shrink-0"
              disabled={photoBusy || !isAuthenticated}
              onClick={() => void handleRemovePhoto()}
            >
              Retirer
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            className="sr-only"
            disabled={photoBusy || !isAuthenticated}
            onChange={(event) => void handlePhotoSelected(event.target.files?.[0])}
          />
        </div>
      </SettingsFieldRow>

      <SettingsFieldRow
        label="Nom affiché"
        description="Comment les autres vous voient dans Hall."
      >
        <input
          type="text"
          className="input w-full"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={commitDisplayName}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          placeholder="Votre nom"
        />
      </SettingsFieldRow>

      <SettingsFieldRow
        label="Email"
        description="Lié à votre compte. Non modifiable."
      >
        <p className="settings-field-row__value">{userEmail || "—"}</p>
      </SettingsFieldRow>
    </>
  );
}
