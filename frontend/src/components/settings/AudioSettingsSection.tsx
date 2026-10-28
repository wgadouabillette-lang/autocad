import { useCallback, useEffect, useMemo, useState } from "react";
import {
  audioDeviceLabelsHidden,
  ensureAudioDevicePermission,
  ensureVideoDevicePermission,
  listAudioInputDevices,
  listAudioOutputDevices,
  listVideoInputDevices,
  supportsAudioOutputSelection,
  videoDeviceLabelsHidden,
  type MediaDeviceOption,
} from "../../lib/audioDevices";
import { useCallsStore } from "../../store/useCallsStore";
import { SETTINGS_AI_MODELS, type AiModel } from "../../lib/aiModels";
import { LOCAL_USER_ID, workspaceMembersCanInvite } from "../../lib/workspaces";
import { useAuthStore } from "../../store/useAuthStore";
import { useStore } from "../../store/useStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";
import { AiModelIcon } from "../chat/aiModelLogos";
import HallDjSettingsSection from "./HallDjSettingsSection";
import RecordingSettingsSection from "./RecordingSettingsSection";
import SettingsFieldRow from "./SettingsFieldRow";
import SettingsFieldToggle from "./SettingsFieldToggle";
import SettingsPicker from "./SettingsControls";

function InviteMembersPreference() {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const memberships = useWorkspacesStore((s) => s.memberships);
  const customServers = useWorkspacesStore((s) => s.customServers);
  const roleIn = useWorkspacesStore((s) => s.roleIn);
  const updateWorkspace = useWorkspacesStore((s) => s.updateWorkspace);
  const ownerUserId = firebaseUid ?? LOCAL_USER_ID;

  const activeWorkspace = useMemo(
    () =>
      useWorkspacesStore
        .getState()
        .joinedWorkspaces(ownerUserId)
        .find((workspace) => workspace.id === activeRoomId) ?? null,
    [memberships, customServers, ownerUserId, activeRoomId],
  );

  if (!activeWorkspace || roleIn(activeWorkspace.id, ownerUserId) !== "owner") return null;

  return (
    <section className="settings-preferences__group">
      <h3 className="settings-preferences__title">Invitations</h3>
      <div className="settings-field-list">
        <SettingsFieldToggle
          id="invite-members"
          label="Autoriser les membres à inviter"
          description="Par défaut, tous les membres peuvent copier le lien d'invitation et approuver les demandes d'adhésion. Désactivé : seul le propriétaire peut partager le workspace et valider les demandes."
          checked={workspaceMembersCanInvite(activeWorkspace)}
          onChange={(checked) => {
            updateWorkspace(activeWorkspace.id, { membersCanInvite: checked }, ownerUserId);
            void useAuthStore.getState().syncWorkspacesToCloud();
          }}
        />
      </div>
    </section>
  );
}

export default function AudioSettingsSection() {
  const audioInputDeviceId = useStore((s) => s.audioInputDeviceId);
  const audioOutputDeviceId = useStore((s) => s.audioOutputDeviceId);
  const videoInputDeviceId = useStore((s) => s.videoInputDeviceId);
  const audioEchoCancellation = useStore((s) => s.audioEchoCancellation);
  const audioNoiseSuppression = useStore((s) => s.audioNoiseSuppression);
  const setAudioInputDeviceId = useStore((s) => s.setAudioInputDeviceId);
  const setAudioOutputDeviceId = useStore((s) => s.setAudioOutputDeviceId);
  const setVideoInputDeviceId = useStore((s) => s.setVideoInputDeviceId);
  const setAudioEchoCancellation = useStore((s) => s.setAudioEchoCancellation);
  const setAudioNoiseSuppression = useStore((s) => s.setAudioNoiseSuppression);
  const aiNotesModel = useStore((s) => s.aiNotesModel);
  const setAiNotesModel = useStore((s) => s.setAiNotesModel);
  const notesModel = SETTINGS_AI_MODELS.find((model) => model.id === aiNotesModel);

  const [inputs, setInputs] = useState<MediaDeviceOption[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceOption[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [labelsHidden, setLabelsHidden] = useState(false);
  const [cameraLabelsHidden, setCameraLabelsHidden] = useState(false);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const [requestingCameraPermission, setRequestingCameraPermission] = useState(false);
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
      const [inputDevices, outputDevices, cameraDevices, hiddenLabels, hiddenCameras] =
        await Promise.all([
          listAudioInputDevices(),
          listAudioOutputDevices(),
          listVideoInputDevices(),
          audioDeviceLabelsHidden(),
          videoDeviceLabelsHidden(),
        ]);
      setInputs(inputDevices);
      setOutputs(outputDevices);
      setCameras(cameraDevices);
      setLabelsHidden(hiddenLabels);
      setCameraLabelsHidden(hiddenCameras);
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
    <div className="settings-preferences">
    <section className="settings-preferences__group">
    <h3 className="settings-preferences__title">AI Notes</h3>
    <div className="settings-field-list">
      <SettingsFieldRow
        label="Modèle"
        description="Modèle utilisé pour structurer les notes."
      >
        <SettingsPicker
          value={aiNotesModel}
          ariaLabel="Modèle AI Notes"
          prefix={
            notesModel?.icon ? (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                <AiModelIcon icon={notesModel.icon} />
              </span>
            ) : undefined
          }
          options={SETTINGS_AI_MODELS.map((model) => ({
            value: model.id,
            label: model.label,
          }))}
          onChange={(modelId) => setAiNotesModel(modelId as AiModel)}
        />
      </SettingsFieldRow>
    </div>
    </section>

    <section className="settings-preferences__group">
    <h3 className="settings-preferences__title">Audio et vidéo</h3>
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
        label="Caméra"
        description="Caméra utilisée pour les appels et l'aperçu d'enregistrement."
      >
        <SettingsPicker
          value={videoInputDeviceId}
          ariaLabel="Caméra"
          disabled={loading || cameras.length === 0}
          options={
            loading
              ? [{ value: videoInputDeviceId, label: "Chargement…" }]
              : cameras.map((device) => ({
                  value: device.deviceId,
                  label: device.label,
                }))
          }
          onChange={(deviceId) => {
            setVideoInputDeviceId(deviceId);
            void useCallsStore.getState().applyPreferredCameraDevice();
          }}
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

      {cameraLabelsHidden && !loading && !error && (
        <SettingsFieldRow
          label="Autorisation caméra"
          description="Requis pour lister et utiliser une caméra sous Windows."
        >
          <button
            type="button"
            className="btn w-full"
            disabled={requestingCameraPermission}
            onClick={() => {
              setRequestingCameraPermission(true);
              void ensureVideoDevicePermission()
                .then(() => refreshDevices())
                .catch((err) => {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Impossible d'autoriser la caméra.",
                  );
                })
                .finally(() => setRequestingCameraPermission(false));
            }}
          >
            {requestingCameraPermission ? "Autorisation…" : "Autoriser"}
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
    </div>
    </section>

    <section className="settings-preferences__group">
    <h3 className="settings-preferences__title">Enregistrement</h3>
    <div className="settings-field-list">
      <RecordingSettingsSection />
    </div>
    </section>

    <section className="settings-preferences__group">
    <h3 className="settings-preferences__title">Meetra DJ</h3>
    <div className="settings-field-list">
      <HallDjSettingsSection />
    </div>
    </section>

    <InviteMembersPreference />
    </div>
  );
}
