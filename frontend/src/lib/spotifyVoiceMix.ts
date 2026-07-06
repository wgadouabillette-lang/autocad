import { buildAudioInputConstraints } from "./audioDevices";
import { getLocalMediaStream } from "./localMedia";
import { readUserPreferences } from "./userPreferences";

let spotifyVoiceMixActive = false;

/** Spotify playback + open mic: relax AEC/NS so music does not gate the microphone. */
export async function setSpotifyVoiceMixActive(active: boolean): Promise<void> {
  if (spotifyVoiceMixActive === active) return;
  spotifyVoiceMixActive = active;

  const stream = getLocalMediaStream();
  const tracks = stream?.getAudioTracks() ?? [];
  if (tracks.length === 0) return;

  const prefs = readUserPreferences();
  const preferred = buildAudioInputConstraints(prefs);

  for (const track of tracks) {
    if (track.readyState !== "live") continue;
    try {
      if (active) {
        await track.applyConstraints({
          ...preferred,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        });
      } else {
        await track.applyConstraints(preferred);
      }
    } catch {
      // Some browsers reject live constraint changes — ignore.
    }
  }
}
