/** Spotify playback must not alter call microphone processing (AEC/NS). */
export async function setSpotifyVoiceMixActive(_active: boolean): Promise<void> {
  // Intentionally no-op: changing live mic constraints caused intermittent mute-like behavior.
}
