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

  function post(msg) {
    if (window.ewvjs?.api?.postMessage) {
      void window.ewvjs.api.postMessage(msg);
    }
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
    if (!window.ewvjs?.api?.fetchToken) {
      throw new Error("Token bridge indisponible.");
    }
    const token = await window.ewvjs.api.fetchToken();
    if (!token) throw new Error("Token Spotify vide.");
    return token;
  }

  function isTrackFinished(state) {
    if (!state) return false;
    const duration = typeof state.duration === "number" ? state.duration : 0;
    if (duration <= 0) return false;
    return state.position >= Math.max(0, duration - 2_000);
  }

  function syncPosition(state) {
    const wasPlaying = cachedPlaying;
    if (!state) {
      if (wasPlaying && performance.now() - playbackStartedAt >= 5000) post({ event: "ended" });
      cachedPlaying = false;
      post({ event: "playing", playing: false });
      return;
    }
    const playing = !state.paused;
    cachedPositionMs = state.position;
    cachedPositionAt = performance.now();
    const finished = isTrackFinished(state);
    if (playing !== cachedPlaying) {
      cachedPlaying = playing;
      post({ event: "playing", playing });
    }
    if (!playing && wasPlaying && finished) {
      post({ event: "ended" });
    }
  }

  async function ensurePlayer() {
    if (player) return player;
    await loadSdk();
    if (!window.Spotify?.Player) throw new Error("SDK Spotify indisponible.");

    player = new window.Spotify.Player({
      name: "Hall WebView2 Player",
      getOAuthToken: (callback) => {
        void fetchToken()
          .then((token) => callback(token))
          .catch(() => callback(""));
      },
      volume: 0.85,
    });

    player.addListener("ready", ({ device_id }) => {
      deviceId = device_id;
      post({ event: "device-ready", deviceId: device_id });
    });
    player.addListener("not_ready", ({ device_id }) => {
      if (!device_id || deviceId === device_id) deviceId = null;
    });
    player.addListener("player_state_changed", (state) => syncPosition(state));
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
      playbackStartedAt = performance.now();
      try {
        syncPosition(await webPlayer.getCurrentState());
      } catch {
        post({ event: "playing", playing: true });
      }
      return true;
    },

    async pause() {
      if (!player) return;
      await player.pause();
    },

    async resume() {
      if (!player) return;
      await player.resume();
    },

    async toggle() {
      if (!player) return;
      await player.togglePlay();
    },

    async getPositionSec() {
      if (!player) return null;
      if (cachedPlaying && cachedPositionAt > 0) {
        return (cachedPositionMs + (performance.now() - cachedPositionAt)) / 1000;
      }
      try {
        const state = await player.getCurrentState();
        if (!state || typeof state.position !== "number") return null;
        cachedPositionMs = state.position;
        cachedPositionAt = performance.now();
        cachedPlaying = !state.paused;
        return state.position / 1000;
      } catch {
        return cachedPositionAt > 0 ? cachedPositionMs / 1000 : null;
      }
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
      cachedPlaying = false;
      cachedPositionMs = 0;
      cachedPositionAt = 0;
    },
  };

  post({ event: "page-ready" });
})();
