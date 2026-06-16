import { useStore } from "../../store/useStore";

export default function RecordingSettingsSection() {
  const recordingCameraPreview = useStore((s) => s.recordingCameraPreview);
  const setRecordingCameraPreview = useStore((s) => s.setRecordingCameraPreview);
  const recordingCameraMirrorPreview = useStore((s) => s.recordingCameraMirrorPreview);
  const setRecordingCameraMirrorPreview = useStore((s) => s.setRecordingCameraMirrorPreview);

  return (
    <section className="settings-section">
      <h3 className="settings-section__label">Recording</h3>
      <p className="settings-section__hint">
        Options for screen and audio recordings started from the bottom bar.
      </p>

      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={recordingCameraPreview}
          onChange={(event) => setRecordingCameraPreview(event.target.checked)}
          className="settings-toggle__input"
        />
        <span className="settings-toggle__text">
          <span className="settings-toggle__title">Camera preview</span>
          <span className="settings-toggle__desc">
            Show a rounded camera preview in the bottom-left corner while recording.
          </span>
        </span>
      </label>

      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={recordingCameraMirrorPreview}
          onChange={(event) => setRecordingCameraMirrorPreview(event.target.checked)}
          className="settings-toggle__input"
        />
        <span className="settings-toggle__text">
          <span className="settings-toggle__title">Correct camera orientation</span>
          <span className="settings-toggle__desc">
            Flip the preview horizontally so left and right match your movements. Turn off if the
            preview still looks reversed.
          </span>
        </span>
      </label>
    </section>
  );
}
