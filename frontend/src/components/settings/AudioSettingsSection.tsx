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
    <section className="settings-section">
      <h3 className="settings-section__label">Audio</h3>
      <p className="settings-section__hint">
        Micro et haut-parleurs pour les appels vocaux, le théâtre et les enregistrements.
      </p>

      {error && <p className="settings-section__error">{error}</p>}
      {loading && !error && <p className="settings-section__meta">Chargement des périphériques…</p>}
      {labelsHidden && !loading && !error && (
        <div className="settings-section__inline-form">
          <p className="settings-section__meta">
            Les noms des micros et haut-parleurs sont masqués tant que l&apos;accès au micro
            n&apos;est pas autorisé.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={requestingPermission}
            onClick={() => void refreshDevices(true)}
          >
            {requestingPermission ? "Autorisation…" : "Afficher les périphériques"}
          </button>
        </div>
      )}

      <div className="settings-section__stack">
        <label className="settings-audio-field">
          <span className="settings-audio-field__label">Microphone</span>
          <select
            className="input w-full"
            value={audioInputDeviceId}
            disabled={loading || inputs.length === 0}
            onChange={(event) => setAudioInputDeviceId(event.target.value)}
          >
            {inputs.map((device) => (
              <option key={device.deviceId || "default-input"} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </label>

        <label className="settings-audio-field">
          <span className="settings-audio-field__label">Sortie audio</span>
          <select
            className="input w-full"
            value={audioOutputDeviceId}
            disabled={loading || outputs.length === 0 || !outputSupported}
            onChange={(event) => setAudioOutputDeviceId(event.target.value)}
          >
            {outputs.map((device) => (
              <option key={device.deviceId || "default-output"} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
          {!outputSupported && (
            <span className="settings-audio-field__hint">
              Le choix du haut-parleur n&apos;est pas pris en charge par ce navigateur.
            </span>
          )}
        </label>
      </div>

      <div className="settings-section__stack mt-4">
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={audioEchoCancellation}
            onChange={(event) => setAudioEchoCancellation(event.target.checked)}
            className="settings-toggle__input"
          />
          <span className="settings-toggle__text">
            <span className="settings-toggle__title">Annulation d&apos;écho</span>
            <span className="settings-toggle__desc">
              Réduit la réverbération dans les salons vocaux.
            </span>
          </span>
        </label>

        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={audioNoiseSuppression}
            onChange={(event) => setAudioNoiseSuppression(event.target.checked)}
            className="settings-toggle__input"
          />
          <span className="settings-toggle__text">
            <span className="settings-toggle__title">Réduction du bruit</span>
            <span className="settings-toggle__desc">
              Atténue les bruits de fond autour du micro.
            </span>
          </span>
        </label>
      </div>

      <p className="settings-section__meta">
        Les changements s&apos;appliquent au prochain appel vocal ou à la prochaine activation du micro.
      </p>

      <section className="settings-section settings-section--nested">
        <h3 className="settings-section__label">Spotify</h3>
        <p className="settings-section__hint">
          Hall DJ remplace la file d&apos;attente : le bouton liste dans la barre du bas lance la
          lecture automatique.
        </p>
        <HallDjSettingsSection />
      </section>
    </section>
  );
}
