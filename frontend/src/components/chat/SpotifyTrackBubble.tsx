import { Pause, Play } from "lucide-react";
import type { SpotifyPlayState, SpotifyTrackCard } from "../../lib/connectorsApi";
import { connectorIconPath, CONNECTOR_ICON_FILES } from "../../lib/connectorIcons";
import { useSpotifyPlayerStore } from "../../store/useSpotifyPlayerStore";

export default function SpotifyTrackBubble({
  track,
  playState,
}: {
  track: SpotifyTrackCard;
  playState?: SpotifyPlayState;
}) {
  const playTrack = useSpotifyPlayerStore((s) => s.playTrack);
  const currentTrack = useSpotifyPlayerStore((s) => s.currentTrack);
  const globalPlaying = useSpotifyPlayerStore((s) => s.playing);
  const previewUrl = track.previewUrl?.trim() || null;
  const isActive = currentTrack?.id === track.id;
  const previewPlaying = isActive && globalPlaying;

  const togglePreview = () => {
    if (!previewUrl) return;
    void playTrack(track);
  };

  return (
    <div className="spotify-track-card">
      <div className="spotify-track-card__art" aria-hidden>
        {track.imageUrl ? (
          <img src={track.imageUrl} alt="" className="spotify-track-card__img" draggable={false} />
        ) : (
          <img
            src={connectorIconPath(CONNECTOR_ICON_FILES.spotify)}
            alt=""
            className="spotify-track-card__fallback"
            draggable={false}
          />
        )}
      </div>

      <div className="spotify-track-card__body">
        <p className="spotify-track-card__label">
          <img
            src={connectorIconPath(CONNECTOR_ICON_FILES.spotify)}
            alt=""
            className="spotify-track-card__logo"
            draggable={false}
          />
          Spotify
          {playState?.requiresPremium && previewUrl ? (
            <span className="spotify-track-card__badge">Extrait 30 s</span>
          ) : null}
        </p>
        {track.url ? (
          <a
            href={track.url}
            target="_blank"
            rel="noopener noreferrer"
            className="spotify-track-card__title spotify-track-card__title--link"
          >
            {track.name}
          </a>
        ) : (
          <p className="spotify-track-card__title">{track.name}</p>
        )}
        <p className="spotify-track-card__meta">
          {track.artists}
          {track.album ? ` · ${track.album}` : ""}
        </p>
      </div>

      {previewUrl ? (
        <button
          type="button"
          className="spotify-track-card__play"
          onClick={togglePreview}
          aria-label={previewPlaying ? "Pause extrait" : "Lire l'extrait"}
          title={previewPlaying ? "Pause" : "Lire l'extrait (30 s)"}
        >
          {previewPlaying ? (
            <Pause size={16} fill="currentColor" aria-hidden />
          ) : (
            <Play size={16} fill="currentColor" aria-hidden />
          )}
        </button>
      ) : null}
    </div>
  );
}
