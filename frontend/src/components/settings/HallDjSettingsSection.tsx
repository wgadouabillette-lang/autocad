import { Volume2 } from "lucide-react";
import { useStore } from "../../store/useStore";
import { HALL_DJ_GENRES } from "../../lib/hallDjGenres";
import SettingsFieldRow from "./SettingsFieldRow";
import SettingsPicker from "./SettingsControls";

export default function HallDjSettingsSection() {
  const hallDjPreferredGenre = useStore((s) => s.hallDjPreferredGenre);
  const hallDjVolume = useStore((s) => s.hallDjVolume);
  const setHallDjPreferredGenre = useStore((s) => s.setHallDjPreferredGenre);
  const setHallDjVolume = useStore((s) => s.setHallDjVolume);
  const volumePercent = Math.round(hallDjVolume * 100);

  return (
    <>
      <SettingsFieldRow
        id="settings-hall-dj"
        label="Style Meetra DJ"
        description="Style musical du Meetra DJ. Si le DJ tourne, la file est reconstruite avec ce style."
      >
        <SettingsPicker
          value={hallDjPreferredGenre}
          ariaLabel="Style musical Meetra DJ"
          options={HALL_DJ_GENRES.map((genre) => ({
            value: genre.id,
            label: genre.label,
          }))}
          onChange={setHallDjPreferredGenre}
        />
      </SettingsFieldRow>

      <SettingsFieldRow
        id="settings-hall-dj-volume"
        label="Volume Meetra DJ"
        description="Volume de la musique Spotify du Meetra DJ dans l'app."
      >
        <label className="settings-hall-dj-volume">
          <Volume2 size={16} aria-hidden className="settings-hall-dj-volume__icon" />
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={volumePercent}
            aria-label="Volume Meetra DJ"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={volumePercent}
            onChange={(event) => setHallDjVolume(Number(event.target.value) / 100)}
          />
          <span className="settings-hall-dj-volume__value">{volumePercent}%</span>
        </label>
      </SettingsFieldRow>
    </>
  );
}
