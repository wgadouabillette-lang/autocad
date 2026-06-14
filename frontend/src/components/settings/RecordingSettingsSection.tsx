import { useStore } from "../../store/useStore";

export default function RecordingSettingsSection() {
  const recordingCameraPreview = useStore((s) => s.recordingCameraPreview);
  const setRecordingCameraPreview = useStore((s) => s.setRecordingCameraPreview);

  return (
    <section className="settings-section">
      <h3 className="settings-section__label">Aperçu caméra</h3>
      <p className="settings-section__hint">
        Affichage pendant un enregistrement d&apos;écran.
      </p>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={recordingCameraPreview}
          onChange={(e) => setRecordingCameraPreview(e.target.checked)}
          className="settings-toggle__input"
        />
        <span className="settings-toggle__text">
          <span className="settings-toggle__title">Aperçu caméra</span>
          <span className="settings-toggle__desc">
            Affiche un carré arrondi avec une webcam dédiée en bas à gauche pendant
            l&apos;enregistrement (indépendante de la caméra d&apos;appel).
          </span>
        </span>
      </label>
    </section>
  );
}
