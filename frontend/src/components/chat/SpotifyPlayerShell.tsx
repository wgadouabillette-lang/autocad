import clsx from "clsx";
import { Pause, Play, Search, X } from "lucide-react";
import { FormEvent, useEffect, useRef } from "react";
import { connectorIconPath, CONNECTOR_ICON_FILES } from "../../lib/connectorIcons";
import { useSpotifyPlayerStore } from "../../store/useSpotifyPlayerStore";
import SpotifyTrackList from "./SpotifyTrackList";

function SpotifyNowPlayingBar({ compact = false }: { compact?: boolean }) {
  const currentTrack = useSpotifyPlayerStore((s) => s.currentTrack);
  const playing = useSpotifyPlayerStore((s) => s.playing);
  const togglePlayback = useSpotifyPlayerStore((s) => s.togglePlayback);
  const openPanel = useSpotifyPlayerStore((s) => s.openPanel);

  if (!currentTrack) return null;

  return (
    <div
      className={clsx("spotify-now-playing", compact && "spotify-now-playing--compact")}
      role="region"
      aria-label="Lecture en cours"
    >
      <div className="spotify-now-playing__art" aria-hidden>
        {currentTrack.imageUrl ? (
          <img src={currentTrack.imageUrl} alt="" />
        ) : (
          <img src={connectorIconPath(CONNECTOR_ICON_FILES.spotify)} alt="" />
        )}
      </div>
      <button
        type="button"
        className="spotify-now-playing__info"
        onClick={() => openPanel()}
        title="Ouvrir le lecteur Spotify"
      >
        <span className="spotify-now-playing__title">{currentTrack.name}</span>
        <span className="spotify-now-playing__meta">{currentTrack.artists}</span>
      </button>
      <button
        type="button"
        className="spotify-now-playing__toggle"
        onClick={togglePlayback}
        disabled={!currentTrack.previewUrl?.trim()}
        aria-label={playing ? "Pause" : "Lecture"}
      >
        {playing ? (
          <Pause size={16} fill="currentColor" aria-hidden />
        ) : (
          <Play size={16} fill="currentColor" aria-hidden />
        )}
      </button>
    </div>
  );
}

export default function SpotifyPlayerShell() {
  const panelOpen = useSpotifyPlayerStore((s) => s.panelOpen);
  const searchQuery = useSpotifyPlayerStore((s) => s.searchQuery);
  const results = useSpotifyPlayerStore((s) => s.results);
  const searching = useSpotifyPlayerStore((s) => s.searching);
  const searchError = useSpotifyPlayerStore((s) => s.searchError);
  const playerNotice = useSpotifyPlayerStore((s) => s.playerNotice);
  const premiumAvailable = useSpotifyPlayerStore((s) => s.premiumAvailable);
  const playbackMode = useSpotifyPlayerStore((s) => s.playbackMode);
  const currentTrack = useSpotifyPlayerStore((s) => s.currentTrack);
  const closePanel = useSpotifyPlayerStore((s) => s.closePanel);
  const setSearchQuery = useSpotifyPlayerStore((s) => s.setSearchQuery);
  const search = useSpotifyPlayerStore((s) => s.search);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (panelOpen) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [panelOpen]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    void search();
  };

  return (
    <>
      {!panelOpen && currentTrack ? <SpotifyNowPlayingBar compact /> : null}

      {panelOpen ? (
        <div className="spotify-player-overlay" role="dialog" aria-modal="true" aria-label="Lecteur Spotify">
          <button
            type="button"
            className="spotify-player-overlay__backdrop"
            aria-label="Fermer"
            onClick={closePanel}
          />
          <div className="spotify-player-panel">
            <header className="spotify-player-panel__header">
              <div className="spotify-player-panel__brand">
                <img
                  src={connectorIconPath(CONNECTOR_ICON_FILES.spotify)}
                  alt=""
                  className="spotify-player-panel__logo"
                />
                <span>Spotify</span>
              </div>
              <button
                type="button"
                className="spotify-player-panel__close"
                onClick={closePanel}
                aria-label="Fermer"
              >
                <X size={16} aria-hidden />
              </button>
            </header>

            <form className="spotify-player-panel__search" onSubmit={submitSearch}>
              <Search size={14} className="spotify-player-panel__search-icon" aria-hidden />
              <input
                ref={inputRef}
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Titre, artiste, album…"
                className="spotify-player-panel__search-input"
              />
              <button type="submit" className="spotify-player-panel__search-btn" disabled={searching}>
                {searching ? "…" : "Chercher"}
              </button>
            </form>

            <p className="spotify-player-panel__hint">
              {premiumAvailable
                ? "Premium détecté — lecture complète dans l'app via le Web Playback SDK."
                : "Recherche une piste et écoute-la ici. Premium + reconnexion Spotify pour la piste complète, sinon extrait 30 s."}
              {playbackMode === "full" ? " · Lecture complète" : playbackMode === "preview" ? " · Extrait 30 s" : ""}
            </p>

            {playerNotice ? <p className="spotify-player-panel__notice">{playerNotice}</p> : null}

            {searchError ? <p className="spotify-player-panel__error">{searchError}</p> : null}

            <div className="spotify-player-panel__results">
              <SpotifyTrackList tracks={results} />
            </div>

            {currentTrack ? (
              <footer className="spotify-player-panel__footer">
                <SpotifyNowPlayingBar />
              </footer>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
