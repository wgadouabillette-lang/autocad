import { useStore } from "../../store/useStore";
import SettingsFieldToggle from "./SettingsFieldToggle";

export default function RecordingSettingsSection() {
  const recordingCameraPreview = useStore((s) => s.recordingCameraPreview);
  const setRecordingCameraPreview = useStore((s) => s.setRecordingCameraPreview);
  const recordingCameraMirrorPreview = useStore((s) => s.recordingCameraMirrorPreview);
  const setRecordingCameraMirrorPreview = useStore((s) => s.setRecordingCameraMirrorPreview);

  return (
    <>
      <SettingsFieldToggle
        label="Aperçu caméra"
        description="Mini aperçu arrondi pendant l'enregistrement."
        checked={recordingCameraPreview}
        onChange={setRecordingCameraPreview}
      />
      <SettingsFieldToggle
        label="Orientation caméra"
        description="Miroir horizontal pour que gauche et droite correspondent."
        checked={recordingCameraMirrorPreview}
        onChange={setRecordingCameraMirrorPreview}
      />
    </>
  );
}
