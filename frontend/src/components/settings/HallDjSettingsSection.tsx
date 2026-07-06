import { useStore } from "../../store/useStore";
import { HALL_DJ_GENRES, hallDjGenreLabel } from "../../lib/hallDjGenres";

export default function HallDjSettingsSection() {
  const hallDjPreferredGenre = useStore((s) => s.hallDjPreferredGenre);
  const setHallDjPreferredGenre = useStore((s) => s.setHallDjPreferredGenre);

  return (
    <div id="settings-hall-dj" className="settings-subsection">
      <p className="settings-subsection__label">Hall DJ</p>
      <p className="settings-section__hint">
        DJ automatique basé sur vos écoutes des <strong>7 derniers jours</strong> : reprises des
        titres les plus joués et suggestions dans le même style. Style par défaut si peu
        d&apos;historique : {hallDjGenreLabel(hallDjPreferredGenre)}.
      </p>

      <label className="settings-audio-field">
        <span className="settings-audio-field__label">Style musical par défaut</span>
        <select
          className="input w-full"
          value={hallDjPreferredGenre}
          onChange={(event) => setHallDjPreferredGenre(event.target.value)}
        >
          {HALL_DJ_GENRES.map((genre) => (
            <option key={genre.id} value={genre.id}>
              {genre.label}
            </option>
          ))}
        </select>
      </label>

      <p className="settings-section__meta">
        Plus vous écoutez un style, plus le DJ s&apos;aligne dessus. Reconnectez Spotify dans
        Plugins si le DJ ne trouve pas vos écoutes récentes.
      </p>
    </div>
  );
}
