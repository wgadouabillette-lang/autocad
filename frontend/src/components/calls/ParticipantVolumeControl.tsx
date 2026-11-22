import { Volume1, Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCallsStore } from "../../store/useCallsStore";

interface ParticipantVolumeControlProps {
  uid: string;
  name: string;
}

/** Icône en bout de barre de nom. Le curseur s'ouvre au survol. */
export default function ParticipantVolumeControl({ uid, name }: ParticipantVolumeControlProps) {
  const { t } = useTranslation();
  const volume = useCallsStore((s) => s.remoteVolumeByUid[uid] ?? 1);
  const setVolume = useCallsStore((s) => s.setRemoteParticipantVolume);
  const label = t("calls.participantVolume", { name });
  const Icon = volume <= 0.001 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      className="participant-volume"
      title={label}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <label className="participant-volume__slider">
        <span className="sr-only">{label}</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(volume * 100)}
          aria-label={label}
          onChange={(event) => setVolume(uid, Number(event.target.value) / 100)}
        />
      </label>
      <span className="participant-volume__icon" aria-hidden>
        <Icon size={14} strokeWidth={2.25} />
      </span>
    </div>
  );
}
