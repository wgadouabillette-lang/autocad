import clsx from "clsx";
import { ExternalLink, Pause, Play, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import type { SpotifyTrackCard } from "../../lib/connectorsApi";
import { connectorIconPath, CONNECTOR_ICON_FILES } from "../../lib/connectorIcons";
import { primeSpotifyPreviewAudio } from "../../lib/spotifyAudioPulse";
import { primeSpotifyWebAudioUnlock } from "../../lib/spotifyWebPlayback";
import { landingLabel } from "../../lib/marketingPreview";
import { useSpotifyPlayerStore } from "../../store/useSpotifyPlayerStore";
import { useStore } from "../../store/useStore";

const PICKER_LIMIT = 4;

export default function SpotifyTrackPicker({
  tracks,
  query,
  chatIndex,
  generation = 0,
  pageOffset = 0,
  verdict,
}: {
  tracks: SpotifyTrackCard[];
  query?: string;
  chatIndex?: number;
  generation?: number;
  pageOffset?: number;
  verdict?: "accepted" | "rejected";
}) {
  const choices = tracks.slice(pageOffset, pageOffset + PICKER_LIMIT);
  const currentTrack = useSpotifyPlayerStore((s) => s.currentTrack);
  const playing = useSpotifyPlayerStore((s) => s.playing);
  const playTrack = useSpotifyPlayerStore((s) => s.playTrack);
  const reloadSpotifyPicker = useStore((s) => s.reloadSpotifyPicker);
  const setSpotifyPickerVerdict = useStore((s) => s.setSpotifyPickerVerdict);
  const [reloading, setReloading] = useState(false);

  if (choices.length === 0) return null;

  const canAct = typeof chatIndex === "number" && !!query?.trim();

  const start = (track: SpotifyTrackCard) => {
    if (verdict === "rejected") return;
    primeSpotifyPreviewAudio();
    primeSpotifyWebAudioUnlock();
    void playTrack(track);
  };

  const reload = async () => {
    if (!canAct || reloading) return;
    setReloading(true);
    try {
      await reloadSpotifyPicker(chatIndex);
    } finally {
      setReloading(false);
    }
  };

  return (
    <div className="spotify-track-picker-block">
      <ul
        key={generation}
        className={clsx(
          "spotify-track-picker",
          verdict === "rejected" && "spotify-track-picker--rejected",
        )}
      >
        {choices.map((track, index) => {
          const isActive = currentTrack?.id === track.id;
          const isPlaying = isActive && playing;
          const canPlay = !!track.id || !!track.previewUrl?.trim();
          return (
            <li
              key={track.id ?? `${track.name}-${track.artists}`}
              className="spotify-track-picker__item"
              style={{ ["--cascade-i" as string]: index }}
            >
              <div className={clsx("spotify-track-picker__row", isActive && "spotify-track-picker__row--active")}>
                <div className="spotify-track-picker__art" aria-hidden>
                  {track.imageUrl ? (
                    <img src={track.imageUrl} alt="" className="spotify-track-picker__img" draggable={false} />
                  ) : (
                    <img
                      src={connectorIconPath(CONNECTOR_ICON_FILES.spotify)}
                      alt=""
                      className="spotify-track-picker__fallback"
                      draggable={false}
                    />
                  )}
                </div>
                <button
                  type="button"
                  className="spotify-track-picker__body"
                  onClick={() => canPlay && start(track)}
                  disabled={!canPlay || verdict === "rejected"}
                >
                  <span className="spotify-track-picker__title">{track.name}</span>
                  <span className="spotify-track-picker__meta">
                    {track.artists}
                    {track.album ? ` · ${track.album}` : ""}
                  </span>
                </button>
                {canPlay ? (
                  <button
                    type="button"
                    className="spotify-track-picker__play"
                    onClick={() => start(track)}
                    disabled={verdict === "rejected"}
                    aria-label={isPlaying ? "Pause" : landingLabel("Play", "Lire")}
                    title={isPlaying ? "Pause" : landingLabel("Play", "Lire")}
                  >
                    {isPlaying ? (
                      <Pause size={13} fill="currentColor" aria-hidden />
                    ) : (
                      <Play size={13} fill="currentColor" aria-hidden />
                    )}
                  </button>
                ) : track.url ? (
                  <a
                    href={track.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="spotify-track-picker__play"
                    aria-label={landingLabel("Open in Spotify", "Ouvrir dans Spotify")}
                  >
                    <ExternalLink size={13} aria-hidden />
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="spotify-track-picker__actions">
        <button
          type="button"
          className={clsx("spotify-track-picker__action", reloading && "spotify-track-picker__action--busy")}
          disabled={!canAct || reloading}
          onClick={() => void reload()}
          aria-label={landingLabel("Show more matches", "Montrer plus de correspondances")}
          title={landingLabel("Show more matches", "Montrer plus de correspondances")}
        >
          <RefreshCw size={14} strokeWidth={2.25} aria-hidden />
        </button>
        <button
          type="button"
          className={clsx(
            "spotify-track-picker__action",
            verdict === "accepted" && "spotify-track-picker__action--on",
          )}
          disabled={!canAct}
          onClick={() => canAct && setSpotifyPickerVerdict(chatIndex, "accepted")}
          aria-label={landingLabel("Accept this answer", "Valider la réponse")}
          aria-pressed={verdict === "accepted"}
          title={landingLabel("Accept this answer", "Valider la réponse")}
        >
          <ThumbsUp size={14} strokeWidth={2.25} aria-hidden />
        </button>
        <button
          type="button"
          className={clsx(
            "spotify-track-picker__action",
            "spotify-track-picker__action--reject",
            verdict === "rejected" && "spotify-track-picker__action--on",
          )}
          disabled={!canAct}
          onClick={() => canAct && setSpotifyPickerVerdict(chatIndex, "rejected")}
          aria-label={landingLabel("Reject this answer", "Ne pas valider la réponse")}
          aria-pressed={verdict === "rejected"}
          title={landingLabel("Reject this answer", "Ne pas valider la réponse")}
        >
          <ThumbsDown size={14} strokeWidth={2.25} aria-hidden />
        </button>
      </div>
    </div>
  );
}
