import { useRef, useState } from "react";
import UserAvatar from "../UserAvatar";
import { useAuthStore } from "../../store/useAuthStore";
import { useStore } from "../../store/useStore";
import SettingsComingSoon from "./SettingsComingSoon";

const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp";

export default function AccountSettingsSection() {
  const userDisplayName = useStore((s) => s.userDisplayName);
  const setUserDisplayName = useStore((s) => s.setUserDisplayName);
  const userEmail = useStore((s) => s.userEmail);
  const setUserEmail = useStore((s) => s.setUserEmail);
  const photoURL = useStore((s) => s.photoURL);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const uploadAndSyncProfilePhoto = useAuthStore((s) => s.uploadAndSyncProfilePhoto);
  const removeAndSyncProfilePhoto = useAuthStore((s) => s.removeAndSyncProfilePhoto);
  const [draftName, setDraftName] = useState(userDisplayName);
  const [draftEmail, setDraftEmail] = useState(userEmail);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      <section className="settings-section">
        <h3 className="settings-section__label">Photo de profil</h3>
        <p className="settings-section__hint">
          Enregistrée dans le cloud et réutilisée dans les appels vocaux et les messages.
        </p>
        <div className="settings-profile-photo">
          <UserAvatar
            userId="local"
            name={userDisplayName}
            isLocal
            className="settings-profile-photo__preview"
          />
          <div className="settings-profile-photo__actions">
            <button
              type="button"
              className="btn shrink-0"
              disabled={photoBusy || !isAuthenticated}
              onClick={() => fileInputRef.current?.click()}
            >
              {photoBusy ? "Enregistrement…" : photoURL ? "Changer la photo" : "Ajouter une photo"}
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
        </div>
        {!isAuthenticated && (
          <p className="settings-section__hint">
            Connectez-vous pour enregistrer une photo dans Firebase Storage.
          </p>
        )}
        {photoError && <p className="settings-section__error">{photoError}</p>}
      </section>

      <section className="settings-section">
        <h3 className="settings-section__label">Nom affiché</h3>
        <p className="settings-section__hint">
          Visible dans le workspace et auprès de vos amis.
        </p>
        <form
          className="settings-section__inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            setUserDisplayName(draftName);
          }}
        >
          <input
            type="text"
            className="input min-w-0 flex-1"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Votre nom"
          />
          <button type="submit" className="btn shrink-0" disabled={!draftName.trim()}>
            Enregistrer
          </button>
        </form>
      </section>

      <section className="settings-section">
        <h3 className="settings-section__label">Email</h3>
        <p className="settings-section__hint">Adresse affichée dans les paramètres.</p>
        <form
          className="settings-section__inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            setUserEmail(draftEmail);
          }}
        >
          <input
            type="email"
            className="input min-w-0 flex-1"
            value={draftEmail}
            onChange={(e) => setDraftEmail(e.target.value)}
            placeholder="vous@exemple.com"
          />
          <button type="submit" className="btn shrink-0" disabled={!draftEmail.trim()}>
            Enregistrer
          </button>
        </form>
      </section>

      <SettingsComingSoon detail="Thème et personnalisation visuelle." />
    </>
  );
}