import { useCallback, useEffect, useState } from "react";
import {
  audioDeviceLabelsHidden,
  ensureAudioDevicePermission,
  listAudioInputDevices,
  listAudioOutputDevices,
  supportsAudioOutputSelection,
  type MediaDeviceOption,
} from "../../lib/audioDevices";
import { useStore } from "../../store/useStore";
import HallDjSettingsSection from "./HallDjSettingsSection";
import RecordingSettingsSection from "./RecordingSettingsSection";
import SettingsFieldRow from "./SettingsFieldRow";
import SettingsFieldToggle from "./SettingsFieldToggle";
import SettingsPicker from "./SettingsControls";

export default function AudioSettingsSection() {
  const audioInputDeviceId = useStore((s) => s.audioInputDeviceId);
  const audioOutputDeviceId = useStore((s) => s.audioOutputDeviceId);
  const audioEchoCancellation = useStore((s) => s.audioEchoCancellation);
  const audioNoiseSuppression = useStore((s) => s.audioNoiseSuppression);
  const setAudioInputDeviceId = useStore((s) => s.setAudioInputDeviceId);
  const setAudioOutputDeviceId = useStore((s) => s.setAudioOutputDeviceId);
  const setAudioEchoCancellation = useStore((s) => s.setAudioEchoCancellation);
  const setAudioNoiseSuppression = useStore((s) => s.setAudioNoiseSuppression);

  const [inputs, setInputs] = useState<MediaDeviceOption[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [labelsHidden, setLabelsHidden] = useState(false);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const outputSupported = supportsAudioOutputSelection();

  const refreshDevices = useCallback(async (requestPermission = false) => {
    if (requestPermission) {
      setRequestingPermission(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      if (requestPermission) {
        await ensureAudioDevicePermission();
      }
      const [inputDevices, outputDevices, hiddenLabels] = await Promise.all([
        listAudioInputDevices(),
        listAudioOutputDevices(),
        audioDeviceLabelsHidden(),
      ]);
      setInputs(inputDevices);
      setOutputs(outputDevices);
      setLabelsHidden(hiddenLabels);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de lister les périphériques audio.",
      );
    } finally {
      setLoading(false);
      setRequestingPermission(false);
    }
  }, []);

  useEffect(() => {
    void refreshDevices();
    const onDeviceChange = () => {
      void refreshDevices();
    };
    navigator.mediaDevices?.addEventListener("devicechange", onDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener("devicechange", onDeviceChange);
    };
  }, [refreshDevices]);

  return (
    <div className="settings-field-list">
      <SettingsFieldRow
        label="Microphone"
        description="Micro utilisé pour les appels et l'enregistrement."
        error={error}
      >
        <SettingsPicker
          value={audioInputDeviceId}
          ariaLabel="Microphone"
          disabled={loading || inputs.length === 0}
          options={
            loading
              ? [{ value: audioInputDeviceId, label: "Chargement…" }]
              : inputs.map((device) => ({
                  value: device.deviceId,
                  label: device.label,
                }))
          }
          onChange={setAudioInputDeviceId}
        />
      </SettingsFieldRow>

      <SettingsFieldRow
        label="Sortie audio"
        description={
          outputSupported
            ? "Haut-parleur pour les appels et la musique."
            : "Non pris en charge par ce navigateur."
        }
      >
        <SettingsPicker
          value={audioOutputDeviceId}
          ariaLabel="Sortie audio"
          disabled={loading || outputs.length === 0 || !outputSupported}
          options={
            loading
              ? [{ value: audioOutputDeviceId, label: "Chargement…" }]
              : outputs.map((device) => ({
                  value: device.deviceId,
                  label: device.label,
                }))
          }
          onChange={setAudioOutputDeviceId}
        />
      </SettingsFieldRow>

      {labelsHidden && !loading && !error && (
        <SettingsFieldRow
          label="Autorisation micro"
          description="Requis pour afficher les noms des périphériques."
        >
          <button
            type="button"
            className="btn w-full"
            disabled={requestingPermission}
            onClick={() => void refreshDevices(true)}
          >
            {requestingPermission ? "Autorisation…" : "Autoriser"}
          </button>
        </SettingsFieldRow>
      )}

      <SettingsFieldToggle
        label="Annulation d'écho"
        description="Réduit la réverbération dans les salons vocaux."
        checked={audioEchoCancellation}
        onChange={setAudioEchoCancellation}
      />

      <SettingsFieldToggle
        label="Réduction du bruit"
        description="Atténue les bruits de fond autour du micro."
        checked={audioNoiseSuppression}
        onChange={setAudioNoiseSuppression}
      />

      <div className="settings-field-list__divider" role="presentation" />

      <RecordingSettingsSection />

      <div className="settings-field-list__divider" role="presentation" />

      <HallDjSettingsSection />
    </div>
  );
}
