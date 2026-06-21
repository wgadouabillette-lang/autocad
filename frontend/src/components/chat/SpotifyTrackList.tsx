import clsx from "clsx";
import { ExternalLink, Pause, Play } from "lucide-react";
import type { SpotifyTrackCard } from "../../lib/connectorsApi";
import { connectorIconPath, CONNECTOR_ICON_FILES } from "../../lib/connectorIcons";
import { useSpotifyPlayerStore } from "../../store/useSpotifyPlayerStore";

export default function SpotifyTrackList({
  tracks,
  compact = false,
}: {
  tracks: SpotifyTrackCard[];
  compact?: boolean;
}) {
  const currentTrack = useSpotifyPlayerStore((s) => s.currentTrack);
  const playing = useSpotifyPlayerStore((s) => s.playing);
  const premiumAvailable = useSpotifyPlayerStore((s) => s.premiumAvailable);
  const playTrack = useSpotifyPlayerStore((s) => s.playTrack);

  if (tracks.length === 0) {
    return <p className="spotify-track-list__empty">Aucun résultat.</p>;
  }

  return (
    <ul className={clsx("spotify-track-list", compact && "spotify-track-list--compact")}>
      {tracks.map((track) => {
        const isActive = currentTrack?.id === track.id;
        const isPlaying = isActive && playing;
        const hasPreview = !!track.previewUrl?.trim();
        const canPlayFull = !!track.id && premiumAvailable;

        return (
          <li key={track.id ?? `${track.name}-${track.artists}`}>
            <div
              className={clsx(
                "spotify-track-list__row",
                isActive && "spotify-track-list__row--active",
              )}
            >
              <div className="spotify-track-list__art" aria-hidden>
                {track.imageUrl ? (
                  <img src={track.imageUrl} alt="" className="spotify-track-list__img" />
                ) : (
                  <img
                    src={connectorIconPath(CONNECTOR_ICON_FILES.spotify)}
                    alt=""
                    className="spotify-track-list__fallback"
                  />
                )}
              </div>

              <div className="spotify-track-list__body">
                <p className="spotify-track-list__title">{track.name}</p>
                <p className="spotify-track-list__meta">
                  {track.artists}
                  {track.album ? ` · ${track.album}` : ""}
                </p>
              </div>

              <div className="spotify-track-list__actions">
                {canPlayFull || hasPreview ? (
                  <button
                    type="button"
                    className="spotify-track-list__play"
                    onClick={() => void playTrack(track)}
                    aria-label={isPlaying ? "Pause" : "Lire dans l'app"}
                    title={
                      isPlaying
                        ? "Pause"
                        : canPlayFull
                          ? "Lire la piste complète"
                          : "Lire l'extrait (30 s)"
                    }
                  >
                    {isPlaying ? (
                      <Pause size={14} fill="currentColor" aria-hidden />
                    ) : (
                      <Play size={14} fill="currentColor" aria-hidden />
                    )}
                  </button>
                ) : track.url ? (
                  <a
                    href={track.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="spotify-track-list__play spotify-track-list__play--link"
                    aria-label="Ouvrir dans Spotify"
                    title="Pas d'extrait — ouvrir dans Spotify"
                  >
                    <ExternalLink size={14} aria-hidden />
                  </a>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
