/* global Spotify, window */
(function () {
  const SDK_URL = "https://sdk.scdn.co/spotify-player.js";

  /** @type {import("./player-types").SpotifyWebPlayer | null} */
  let player = null;
  /** @type {string | null} */
  let deviceId = null;
  let cachedPlaying = false;
  let playbackStartedAt = 0;
  let cachedPositionMs = 0;
  let cachedPositionAt = 0;
  let cachedDurationMs = 0;
  let endPosted = false;
  let approachedTrackEnd = false;
  let endWatchTimer = null;
  let playedMs = 0;
  let playingSince = 0;

  const END_GRACE_MS = 8000;

  function post(msg) {
    if (window.ewvjs?.api?.postMessage) {
      void window.ewvjs.api.postMessage(msg);
      return true;
    }
    if (typeof fetch === "function") {
      void fetch("/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg),
      }).catch(() => undefined);
      return true;
    }
    return false;
  }

  function postWhenReady(msg) {
    if (post(msg)) return;
    window.setTimeout(() => postWhenReady(msg), 50);
  }

  function loadSdk() {
    if (window.Spotify?.Player) return Promise.resolve();
    return new Promise((resolve, reject) => {
      window.onSpotifyWebPlaybackSDKReady = () => resolve();
      const script = document.createElement("script");
      script.src = SDK_URL;
      script.async = true;
      script.onerror = () => reject(new Error("SDK Spotify indisponible."));
      document.body.appendChild(script);
      window.setTimeout(() => reject(new Error("SDK Spotify timeout.")), 12_000);
    });
  }

  async function fetchToken() {
    if (window.ewvjs?.api?.fetchToken) {
      const token = await window.ewvjs.api.fetchToken();
      if (!token) throw new Error("Token Spotify vide.");
      return token;
    }
    const response = await fetch("/spotify-token");
    if (!response.ok) throw new Error("Token Spotify indisponible.");
    const token = (await response.text()).trim();
    if (!token) throw new Error("Token Spotify vide.");
    return token;
  }

  function clearEndWatch() {
    if (endWatchTimer) {
      clearInterval(endWatchTimer);
      endWatchTimer = null;
    }
  }

  function wallPlayedMs() {
    let total = playedMs;
    if (cachedPlaying && playingSince > 0) total += performance.now() - playingSince;
    return total;
  }

  function markPlaying(playing) {
    const now = performance.now();
    if (playing && !cachedPlaying) playingSince = now;
    if (!playing && cachedPlaying && playingSince > 0) {
      playedMs += now - playingSince;
      playingSince = 0;
    }
    cachedPlaying = playing;
  }

  function postEnded() {
    if (endPosted) return;
    if (performance.now() - playbackStartedAt < END_GRACE_MS) return;
    endPosted = true;
    approachedTrackEnd = false;
    markPlaying(false);
    clearEndWatch();
    post({ event: "ended" });
    post({ event: "playing", playing: false });
  }

  function noteProgress(position, duration) {
    if (!(duration > 0) || !(position >= 0)) return;
    if (position >= Math.max(0, duration - 5000)) approachedTrackEnd = true;
    if (position >= Math.max(0, duration - 1200)) postEnded();
  }

  function considerNaturalEnd(state) {
    if (endPosted) return;
    if (!state) {
      if (cachedPlaying && wallPlayedMs() >= 8000 && cachedDurationMs > 0 && wallPlayedMs() >= cachedDurationMs - 800) {
        postEnded();
      }
      return;
    }
    const duration = typeof state.duration === "number" && state.duration > 0 ? state.duration : cachedDurationMs;
    const position = typeof state.position === "number" ? state.position : 0;
    if (duration > 0) cachedDurationMs = duration;
    cachedPositionMs = position;
    cachedPositionAt = performance.now();
    const playing = !state.paused;
    if (playing !== cachedPlaying) {
      markPlaying(playing);
      post({ event: "playing", playing });
    }
    noteProgress(position, duration);
    if (endPosted) return;
    if (!playing && approachedTrackEnd && position < 2000) postEnded();
    if (playing && duration > 0 && wallPlayedMs() >= duration - 600) postEnded();
  }

  function startEndWatch() {
    if (endWatchTimer) return;
    endWatchTimer = setInterval(() => {
      if (endPosted || !player) return;
      void player
        .getCurrentState()
        .then((state) => considerNaturalEnd(state))
        .catch(() => undefined);
    }, 1000);
  }

  function resetPlayClock() {
    endPosted = false;
    approachedTrackEnd = false;
    playedMs = 0;
    playingSince = performance.now();
    cachedPlaying = true;
    playbackStartedAt = playingSince;
    cachedPositionMs = 0;
    cachedPositionAt = playingSince;
    cachedDurationMs = 0;
    startEndWatch();
  }

  async function ensurePlayer() {
    if (player) return player;
    await loadSdk();
    if (!window.Spotify?.Player) throw new Error("SDK Spotify indisponible.");

    const initialVolume =
      typeof window.__hallSpotifyVolume === "number" && Number.isFinite(window.__hallSpotifyVolume)
        ? Math.min(1, Math.max(0, window.__hallSpotifyVolume))
        : 0.85;

    player = new window.Spotify.Player({
      name: "Meetra WebView2 Player",
      getOAuthToken: (callback) => {
        void fetchToken()
          .then((token) => callback(token))
          .catch(() => callback(""));
      },
      volume: initialVolume,
    });

    player.addListener("ready", ({ device_id }) => {
      deviceId = device_id;
      post({ event: "device-ready", deviceId: device_id });
    });
    player.addListener("not_ready", ({ device_id }) => {
      if (!device_id || deviceId === device_id) deviceId = null;
    });
    let lastVolumeTrackId = "";
    player.addListener("player_state_changed", (state) => {
      considerNaturalEnd(state);
      const trackId = state?.track_window?.current_track?.id || "";
      if (!trackId || trackId === lastVolumeTrackId || !player) return;
      lastVolumeTrackId = trackId;
      const saved = window.__hallSpotifyVolume;
      if (typeof saved !== "number" || !Number.isFinite(saved)) return;
      void player.setVolume(Math.min(1, Math.max(0, saved))).catch(() => undefined);
    });
    player.addListener("authentication_error", ({ message }) => {
      post({ event: "error", message: message || "auth" });
    });
    player.addListener("account_error", ({ message }) => {
      post({ event: "error", message: message || "account" });
    });
    player.addListener("initialization_error", ({ message }) => {
      post({ event: "error", message: message || "init" });
    });

    const connected = await player.connect();
    if (!connected) throw new Error("Connexion Spotify impossible.");

    await new Promise((resolve, reject) => {
      if (deviceId) {
        resolve(deviceId);
        return;
      }
      const timer = window.setTimeout(() => reject(new Error("Device Spotify timeout.")), 15_000);
      player.addListener("ready", ({ device_id }) => {
        window.clearTimeout(timer);
        resolve(device_id);
      });
    });

    try {
      await player.activateElement();
    } catch {
      // ignore
    }

    return player;
  }

  async function waitForDevice(timeoutMs = 12_000) {
    if (deviceId) return deviceId;
    const started = Date.now();
    while (!deviceId) {
      if (Date.now() - started > timeoutMs) throw new Error("Device Spotify indisponible.");
      await new Promise((r) => window.setTimeout(r, 80));
    }
    return deviceId;
  }

  window.hallSpotifyPlayer = {
    async warm() {
      await ensurePlayer();
      post({ event: "ready" });
    },

    async play(trackId) {
      const id = String(trackId || "").trim();
      if (!id) throw new Error("trackId manquant.");
      const webPlayer = await ensurePlayer();
      try {
        await webPlayer.activateElement();
      } catch {
        // ignore
      }
      const activeDeviceId = await waitForDevice();
      const token = await fetchToken();
      const response = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(activeDeviceId)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ uris: [`spotify:track:${id}`] }),
        },
      );
      if (!response.ok && response.status !== 204) {
        throw new Error(`Spotify play HTTP ${response.status}`);
      }
      resetPlayClock();
      const saved = window.__hallSpotifyVolume;
      if (typeof saved === "number" && Number.isFinite(saved)) {
        const next = Math.min(1, Math.max(0, saved));
        try {
          await webPlayer.setVolume(next);
        } catch {
          // le morceau suivant réapplique le même niveau
        }
        window.setTimeout(() => {
          void webPlayer.setVolume(next).catch(() => undefined);
        }, 700);
      }
      try {
        considerNaturalEnd(await webPlayer.getCurrentState());
      } catch {
        post({ event: "playing", playing: true });
      }
      return true;
    },

    async pause() {
      if (!player) return;
      markPlaying(false);
      await player.pause();
    },

    async resume() {
      if (!player) return;
      markPlaying(true);
      startEndWatch();
      await player.resume();
    },

    async toggle() {
      if (!player) return;
      await player.togglePlay();
    },

    async setVolume(volume) {
      const next =
        typeof volume === "number" && Number.isFinite(volume)
          ? Math.min(1, Math.max(0, volume))
          : 0.85;
      window.__hallSpotifyVolume = next;
      if (!player) return;
      await player.setVolume(next);
    },

    async getPlaybackClock() {
      if (!player) {
        return {
          sec: cachedPositionAt > 0 ? cachedPositionMs / 1000 : null,
          durationSec: cachedDurationMs > 0 ? cachedDurationMs / 1000 : null,
        };
      }
      try {
        const state = await player.getCurrentState();
        if (state && typeof state.position === "number") {
          cachedPositionMs = state.position;
          cachedPositionAt = performance.now();
          cachedPlaying = !state.paused;
          if (typeof state.duration === "number" && state.duration > 0) {
            cachedDurationMs = state.duration;
          }
        }
      } catch {
        // keep cached clock
      }
      let sec = null;
      if (cachedPositionAt > 0) {
        sec = cachedPlaying
          ? (cachedPositionMs + (performance.now() - cachedPositionAt)) / 1000
          : cachedPositionMs / 1000;
        if (cachedDurationMs > 0) {
          sec = Math.min(sec, cachedDurationMs / 1000);
        }
      }
      return {
        sec,
        durationSec: cachedDurationMs > 0 ? cachedDurationMs / 1000 : null,
      };
    },

    async getPositionSec() {
      const clock = await window.hallSpotifyPlayer.getPlaybackClock();
      return clock?.sec ?? null;
    },

    async reset() {
      if (player) {
        try {
          await player.disconnect();
        } catch {
          // ignore
        }
      }
      player = null;
      deviceId = null;
      clearEndWatch();
      endPosted = true;
      cachedPlaying = false;
      playingSince = 0;
      cachedPositionMs = 0;
      cachedPositionAt = 0;
      cachedDurationMs = 0;
    },
  };

  postWhenReady({ event: "page-ready" });
})();
