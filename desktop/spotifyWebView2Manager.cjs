const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

function hostScriptPath() {
  const bundled = path.join(__dirname, "spotify-webview2-host.cjs");
  // The published app keeps this script outside app.asar. Edge cannot open
  // player.html from inside the archive, so the child must run the unpacked copy.
  const unpacked = bundled.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`,
  );
  if (unpacked !== bundled && fs.existsSync(unpacked)) return unpacked;
  return bundled;
}

/** @type {import("child_process").ChildProcess | null} */
let hostProc = null;
/** @type {import("readline").Interface | null} */
let hostReader = null;
/** @type {import("electron").BrowserWindow | null} */
let mainWindowRef = null;
/** @type {Map<string, (token: string) => void>} */
const tokenWaiters = new Map();
let hostReady = false;
/** @type {{ resolve: () => void, reject: (err: Error) => void }[]} */
let hostReadyWaiters = [];
let startPromise = null;
let lastHostError = "Lecteur WebView2 Spotify indisponible.";
/** @type {Map<string, { resolve: (payload: Record<string, unknown>) => void, reject: (err: Error) => void, timer: NodeJS.Timeout }>} */
const commandWaiters = new Map();

function isSupported() {
  return process.platform === "win32";
}

function setMainWindow(win) {
  mainWindowRef = win;
}

function writeHost(payload) {
  if (!hostProc?.stdin?.writable) return false;
  hostProc.stdin.write(`${JSON.stringify(payload)}\n`);
  return true;
}

function waitForHostReady(timeoutMs = 25_000) {
  if (hostReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const waiter = {
      resolve: () => {
        clearTimeout(timer);
        resolve();
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    };
    const timer = setTimeout(() => {
      hostReadyWaiters = hostReadyWaiters.filter((item) => item !== waiter);
      reject(new Error(lastHostError || "WebView2 Spotify timeout."));
    }, timeoutMs);
    hostReadyWaiters.push(waiter);
  });
}

function handleHostEvent(payload) {
  if (!payload || typeof payload !== "object") return;

  if (payload.event === "host-ready") {
    hostReady = true;
    for (const waiter of hostReadyWaiters.splice(0)) waiter.resolve();
    return;
  }

  if (payload.event === "token-request" && typeof payload.id === "string") {
    const id = payload.id;
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send("forma:spotify-token-request", { id });
    } else {
      writeHost({ cmd: "token", id, value: "" });
    }
    return;
  }

  if (payload.event === "playing" && typeof payload.playing === "boolean") {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send("forma:spotify-playback-state", {
        playing: payload.playing,
      });
    }
    return;
  }

  if (payload.event === "ended") {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send("forma:spotify-playback-ended");
    }
    return;
  }

  if (payload.event === "cmd-result" && typeof payload.id === "string") {
    const pending = commandWaiters.get(payload.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    commandWaiters.delete(payload.id);
    if (payload.ok) pending.resolve(payload);
    else pending.reject(new Error(payload.message || "Commande Spotify échouée."));
    return;
  }

  if (payload.event === "fatal") {
    lastHostError = payload.message || lastHostError;
    console.error("[spotify-webview2]", lastHostError);
    stopHost();
  }
}

function attachHostProcess(proc) {
  hostProc = proc;
  hostReader = readline.createInterface({ input: proc.stdout });
  hostReader.on("line", (line) => {
    try {
      handleHostEvent(JSON.parse(line));
    } catch {
      // ignore malformed lines
    }
  });
  proc.stderr?.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) console.warn("[spotify-webview2-host]", text);
  });
  proc.on("exit", () => {
    const readyBeforeExit = hostReady;
    const waiters = hostReadyWaiters.splice(0);
    hostProc = null;
    hostReader = null;
    hostReady = false;
    hostReadyWaiters = [];
    startPromise = null;
    if (!readyBeforeExit) {
      const err = new Error(lastHostError);
      for (const waiter of waiters) waiter.reject(err);
    }
  });
}

function startHost() {
  if (!isSupported()) return Promise.resolve(false);
  if (hostReady && hostProc) return Promise.resolve(true);
  if (startPromise) return startPromise;

  startPromise = new Promise((resolve) => {
    lastHostError = "Lecteur WebView2 Spotify indisponible.";
    try {
      const dataDir = path.join(
        process.env.APPDATA || path.join(require("os").homedir(), "AppData", "Roaming"),
        "forma-desktop",
        "spotify-webview2",
      );
      const child = spawn(process.execPath, [hostScriptPath()], {
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          // Native WebView2 DLLs live beside the unpacked module, not inside app.asar.
          ELECTRON_NO_ASAR: "1",
          FORMA_SPOTIFY_WEBVIEW2_DATA: dataDir,
        },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      attachHostProcess(child);
      void waitForHostReady()
        .then(() => resolve(true))
        .catch((err) => {
          console.error("[spotify-webview2] start failed:", err);
          stopHost();
          resolve(false);
        });
    } catch (err) {
      console.error("[spotify-webview2] spawn failed:", err);
      resolve(false);
    }
  });

  return startPromise;
}

function stopHost() {
  const waiters = hostReadyWaiters.splice(0);
  if (!hostReady) {
    const err = new Error(lastHostError);
    for (const waiter of waiters) waiter.reject(err);
  }
  if (hostProc?.stdin?.writable) {
    writeHost({ cmd: "shutdown" });
  }
  if (hostProc && !hostProc.killed) {
    hostProc.kill();
  }
  hostProc = null;
  hostReader = null;
  hostReady = false;
  hostReadyWaiters = [];
  startPromise = null;
}

async function sendCommand(cmd, extra = {}, options = {}) {
  const ok = await startHost();
  if (!ok) throw new Error(lastHostError);
  await waitForHostReady();

  const expectResult = options.expectResult === true;
  const id = expectResult ? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : null;

  if (id) {
    const payload = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        commandWaiters.delete(id);
        reject(new Error("Commande Spotify timeout."));
      }, 20_000);
      commandWaiters.set(id, {
        resolve,
        reject,
        timer,
      });
      writeHost({ cmd, id, ...extra });
    });
    return payload;
  }

  writeHost({ cmd, ...extra });
  return true;
}

function respondToken(id, token) {
  writeHost({ cmd: "token", id, value: token || "" });
}

async function warm() {
  await sendCommand("warm");
}

async function play(trackId) {
  await sendCommand("play", { trackId }, { expectResult: true });
  return true;
}

async function pause() {
  await sendCommand("pause");
}

async function resume() {
  await sendCommand("resume");
}

async function toggle() {
  await sendCommand("toggle");
}

async function setVolume(volume) {
  await sendCommand("setVolume", { volume });
}

async function reset() {
  if (!hostProc) return;
  await sendCommand("reset");
}

async function getPlaybackClock() {
  const payload = await sendCommand("getPosition", {}, { expectResult: true });
  const sec =
    payload && typeof payload.sec === "number" && Number.isFinite(payload.sec) ? payload.sec : null;
  const durationSec =
    payload && typeof payload.durationSec === "number" && Number.isFinite(payload.durationSec)
      ? payload.durationSec
      : null;
  return { sec, durationSec };
}

function getAvailability() {
  return {
    supported: isSupported(),
    ready: hostReady,
  };
}

module.exports = {
  isSupported,
  setMainWindow,
  startHost,
  stopHost,
  warm,
  play,
  pause,
  resume,
  toggle,
  setVolume,
  reset,
  getPlaybackClock,
  respondToken,
  getAvailability,
};
