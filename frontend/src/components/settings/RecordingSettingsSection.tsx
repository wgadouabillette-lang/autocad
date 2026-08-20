import { useCallback, useEffect, useState } from "react";
import { hasFormaDesktop } from "../../lib/formaDesktop";
import {
  getScreenCaptureAccessInfo,
  isScreenCaptureAccessDenied,
  openScreenCaptureSettings,
} from "../../lib/screenCapturePermission";
import { useStore } from "../../store/useStore";
import SettingsFieldRow from "./SettingsFieldRow";
import SettingsFieldToggle from "./SettingsFieldToggle";

export default function RecordingSettingsSection() {
  const recordingCameraPreview = useStore((s) => s.recordingCameraPreview);
  const setRecordingCameraPreview = useStore((s) => s.setRecordingCameraPreview);
  const recordingCameraMirrorPreview = useStore((s) => s.recordingCameraMirrorPreview);
  const setRecordingCameraMirrorPreview = useStore((s) => s.setRecordingCameraMirrorPreview);
  const isDesktop = hasFormaDesktop();
  const platform = window.formaDesktop?.platform;
  const [screenStatus, setScreenStatus] = useState<string | null>(null);
  const [openingScreenSettings, setOpeningScreenSettings] = useState(false);

  const refreshScreenAccess = useCallback(async () => {
    if (!isDesktop) return;
    const info = await getScreenCaptureAccessInfo();
    setScreenStatus(info?.status ?? "unknown");
  }, [isDesktop]);

  useEffect(() => {
    void refreshScreenAccess();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshScreenAccess();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshScreenAccess]);

  const screenDenied = screenStatus ? isScreenCaptureAccessDenied(screenStatus as never) : false;
  const screenGranted = screenStatus === "granted";
  const screenDescription = !isDesktop
    ? "Le navigateur demandera l'autorisation au moment du partage."
    : screenGranted
      ? "Meetra peut capturer l'écran pour le partage et l'enregistrement."
      : screenDenied && platform === "win32"
        ? "Windows bloque Meetra. Autorisez l'app dans Confidentialité → Enregistrement d'écran, puis relancez Meetra."
        : platform === "win32"
          ? "Autorisez Meetra dans Windows (Confidentialité → Enregistrement d'écran) pour le partage et l'enregistrement."
          : "Autorisez l'enregistrement d'écran pour Meetra dans les réglages de confidentialité.";
  const screenButtonLabel =
    platform === "darwin"
      ? "Ouvrir les réglages macOS"
      : platform === "linux"
        ? "Ouvrir les réglages"
        : "Autoriser dans Windows";

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
      {isDesktop ? (
        <SettingsFieldRow
          id="screen-capture-permission"
          label="Partage d'écran"
          description={screenDescription}
        >
          <button
            type="button"
            className="btn w-full"
            disabled={openingScreenSettings}
            onClick={() => {
              setOpeningScreenSettings(true);
              void openScreenCaptureSettings()
                .then(() => refreshScreenAccess())
                .finally(() => setOpeningScreenSettings(false));
            }}
          >
            {openingScreenSettings ? "Ouverture…" : screenButtonLabel}
          </button>
        </SettingsFieldRow>
      ) : null}
    </>
  );
}
