import clsx from "clsx";
import { ListMusic, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { ADD_QUEUE_SKILL_TEMPLATE } from "../../lib/playSkill";
import { useSpotifyPlayerStore } from "../../store/useSpotifyPlayerStore";
import { useStore } from "../../store/useStore";

export default function SpotifyComposerActions() {
  const insertAgentComposerText = useStore((s) => s.insertAgentComposerText);
  const playing = useSpotifyPlayerStore((s) => s.playing);
  const queue = useSpotifyPlayerStore((s) => s.queue);
  const history = useSpotifyPlayerStore((s) => s.history);
  const currentTrack = useSpotifyPlayerStore((s) => s.currentTrack);
  const lastPlayedTrack = useSpotifyPlayerStore((s) => s.lastPlayedTrack);
  const togglePlayback = useSpotifyPlayerStore((s) => s.togglePlayback);
  const skipNext = useSpotifyPlayerStore((s) => s.skipNext);
  const skipPrevious = useSpotifyPlayerStore((s) => s.skipPrevious);

  const canReplay = queue.length === 0 && !!(currentTrack ?? lastPlayedTrack);
  const canSkipPrevious = history.length > 0;

  return (
    <div className="chat-spotify-actions" role="toolbar" aria-label="Actions Spotify">
      <button
        type="button"
        className="chat-spotify-actions__btn"
        aria-label="Ajouter à la file — rechercher une piste"
        title="Ajouter à la file — rechercher une piste"
        onClick={() => insertAgentComposerText(ADD_QUEUE_SKILL_TEMPLATE)}
      >
        <ListMusic size={15} strokeWidth={2} aria-hidden />
      </button>

      <button
        type="button"
        className="chat-spotify-actions__btn"
        aria-label={playing ? "Pause" : "Lecture"}
        title={playing ? "Pause" : "Lecture"}
        onClick={() => togglePlayback()}
      >
        {playing ? (
          <Pause size={15} strokeWidth={2} aria-hidden />
        ) : (
          <Play size={15} strokeWidth={2} aria-hidden />
        )}
      </button>

      <button
        type="button"
        className="chat-spotify-actions__btn"
        aria-label={canReplay ? "Rejouer la piste" : "Piste suivante"}
        title={canReplay ? "Rejouer la piste" : "Piste suivante"}
        onClick={() => void skipNext()}
      >
        {canReplay ? (
          <RotateCcw size={15} strokeWidth={2} aria-hidden />
        ) : (
          <SkipForward size={15} strokeWidth={2} aria-hidden />
        )}
      </button>

      <button
        type="button"
        className={clsx("chat-spotify-actions__btn", !canSkipPrevious && "chat-spotify-actions__btn--disabled")}
        aria-label="Piste précédente"
        title="Piste précédente"
        disabled={!canSkipPrevious}
        onClick={() => void skipPrevious()}
      >
        <SkipBack size={15} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
