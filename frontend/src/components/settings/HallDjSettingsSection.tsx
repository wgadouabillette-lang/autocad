import { useStore } from "../../store/useStore";
import { HALL_DJ_GENRES } from "../../lib/hallDjGenres";
import SettingsFieldRow from "./SettingsFieldRow";
import SettingsPicker from "./SettingsControls";

export default function HallDjSettingsSection() {
  const hallDjPreferredGenre = useStore((s) => s.hallDjPreferredGenre);
  const setHallDjPreferredGenre = useStore((s) => s.setHallDjPreferredGenre);

  return (
    <SettingsFieldRow
      id="settings-hall-dj"
      label="Style Hall DJ"
      description="Style par défaut si peu d'historique d'écoute récent."
    >
      <SettingsPicker
        value={hallDjPreferredGenre}
        ariaLabel="Style musical Hall DJ"
        options={HALL_DJ_GENRES.map((genre) => ({
          value: genre.id,
          label: genre.label,
        }))}
        onChange={setHallDjPreferredGenre}
      />
    </SettingsFieldRow>
  );
}
