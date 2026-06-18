import type { SpotifyTrackCard } from "../../lib/connectorsApi";
import { connectorIconPath, CONNECTOR_ICON_FILES } from "../../lib/connectorIcons";

export default function SpotifyTrackBubble({ track }: { track: SpotifyTrackCard }) {
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
        </p>
        {track.url ? (
          <a
            href={track.url}
            target="_blank"
            rel="noopener noreferrer"
            className="spotify-track-card__title"
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
    </div>
  );
}
