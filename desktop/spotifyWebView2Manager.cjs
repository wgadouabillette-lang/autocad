const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const PLAYER_DIR = path.join(__dirname, "spotify-webview2");
const PAGE_READY_TIMEOUT_MS = 20_000;
const COMMAND_TIMEOUT_MS = 20_000;

/** @type {import("http").Server | null} */
let server = null;
/** @type {import("child_process").ChildProcess | null} */
let edgeProc = null;
/** @type {WebSocket | null} */
let pageSocket = null;
/** @type {import("electron").BrowserWindow | null} */
let mainWindowRef = null;
/** @type {Map<string, (token: string) => void>} */
const tokenWaiters = new Map();
/** @type {Map<number, { resolve: (value: unknown) => void, reject: (err: Error) => void, timer: NodeJS.Timeout }>} */
const cdpWaiters = new Map();
/** @type {{ resolve: () => void, reject: (err: Error) => void }[]} */
let hostReadyWaiters = [];
let hostReady = false;
let startPromise = null;
let lastHostError = "Lecteur Spotify Windows indisponible.";
let cdpNextId = 0;
let playerOrigin = "";

function isSupported() {
  return process.platform === "win32";
}

function setMainWindow(win) {
  mainWindowRef = win;
}

function edgeExecutable() {
  const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
  const programFilesX86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
  const localAppData = process.env.LOCALAPPDATA || "";
  const candidates = [
    path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function contentType(filePath) {
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
  });
}

function requestSpotifyToken() {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      tokenWaiters.delete(id);
      resolve("");
    }, 12_000);
    tokenWaiters.set(id, (token) => {
      clearTimeout(timer);
      resolve(token || "");
    });
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send("forma:spotify-token-request", { id });
    } else {
      clearTimeout(timer);
      tokenWaiters.delete(id);
      resolve("");
    }
  });
}

function markHostReady() {
  if (hostReady) return;
  hostReady = true;
  for (const waiter of hostReadyWaiters.splice(0)) waiter.resolve();
}

function failHostReady(err) {
  const waiters = hostReadyWaiters.splice(0);
  for (const waiter of waiters) waiter.reject(err);
}

function handlePlayerEvent(payload) {
  if (!payload || typeof payload !== "object") return;
  if (payload.event === "page-ready") {
    markHostReady();
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
  if (payload.event === "error") {
    console.error("[spotify-edge]", payload.message || payload);
  }
}

function createPlayerServer() {
  const playerServer = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || "/", playerOrigin || "http://127.0.0.1");
    if (req.method === "GET" && requestUrl.pathname === "/spotify-token") {
      void requestSpotifyToken().then((token) => {
        res.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(token);
      });
      return;
    }
    if (req.method === "POST" && requestUrl.pathname === "/event") {
      void readRequestBody(req)
        .then((body) => {
          try {
            handlePlayerEvent(JSON.parse(body));
          } catch {
            // ignore malformed events
          }
          res.writeHead(204);
          res.end();
        })
        .catch(() => {
          res.writeHead(400);
          res.end();
        });
      return;
    }
    const relative = requestUrl.pathname === "/" ? "player.html" : requestUrl.pathname.replace(/^\/+/, "");
    const filePath = path.resolve(PLAYER_DIR, relative);
    const relativeToPlayer = path.relative(PLAYER_DIR, filePath);
    if (relativeToPlayer.startsWith("..") || path.isAbsolute(relativeToPlayer)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": contentType(filePath), "Cache-Control": "no-store" });
      res.end(data);
    });
  });
  return playerServer;
}

function listen(serverToListen) {
  return new Promise((resolve, reject) => {
    serverToListen.once("error", reject);
    serverToListen.listen(0, "127.0.0.1", () => {
      const address = serverToListen.address();
      if (!address || typeof address === "string") {
        reject(new Error("Port du lecteur Spotify indisponible."));
        return;
      }
      resolve(address.port);
    });
  });
}

function waitForHostReady(timeoutMs = PAGE_READY_TIMEOUT_MS) {
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
      reject(new Error(lastHostError || "Lecteur Spotify Windows timeout."));
    }, timeoutMs);
    hostReadyWaiters.push(waiter);
  });
}

function attachCdpSocket(socket) {
  pageSocket = socket;
  socket.addEventListener("message", (event) => {
    let message;
    try {
      const raw = typeof event.data === "string" ? event.data : String(event.data);
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!message || typeof message.id !== "number") return;
    const waiter = cdpWaiters.get(message.id);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    cdpWaiters.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message || "Commande Spotify échouée."));
    else waiter.resolve(message.result);
  });
  socket.addEventListener("close", () => {
    if (pageSocket === socket) pageSocket = null;
  });
}

function cdpCall(method, params) {
  if (!pageSocket || pageSocket.readyState !== 1) {
    return Promise.reject(new Error("Lecteur Spotify déconnecté."));
  }
  const id = ++cdpNextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cdpWaiters.delete(id);
      reject(new Error("Commande Spotify timeout."));
    }, COMMAND_TIMEOUT_MS);
    cdpWaiters.set(id, { resolve, reject, timer });
    pageSocket.send(JSON.stringify({ id, method, params }));
  });
}

async function connectToPage(debugPort) {
  const deadline = Date.now() + 15_000;
  let page = null;
  while (!page && Date.now() < deadline) {
    try {
      const targets = await httpGetJson(`http://127.0.0.1:${debugPort}/json/list`);
      page = Array.isArray(targets)
        ? targets.find((target) => target.type === "page" && String(target.url || "").includes("player.html"))
        : null;
    } catch {
      page = null;
    }
    if (!page) await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (!page?.webSocketDebuggerUrl) throw new Error("Page Spotify Edge introuvable.");
  const Socket = globalThis.WebSocket;
  if (typeof Socket !== "function") throw new Error("WebSocket indisponible dans Electron.");
  const socket = new Socket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Connexion au lecteur Spotify timeout.")), 8_000);
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("Connexion au lecteur Spotify impossible."));
    });
  });
  attachCdpSocket(socket);
}

async function callPlayer(method, args) {
  const encoded = args.map((arg) => JSON.stringify(arg ?? null)).join(", ");
  const expression = `(async () => window.hallSpotifyPlayer.${method}(${encoded}))()`;
  const result = await cdpCall("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  const details = result && result.exceptionDetails;
  if (details) {
    const description =
      details.exception?.description || details.text || "Commande Spotify échouée.";
    throw new Error(description);
  }
  return result?.result?.value;
}

function stopHost() {
  const err = new Error(lastHostError);
  if (!hostReady) failHostReady(err);
  hostReady = false;
  hostReadyWaiters = [];
  startPromise = null;
  playerOrigin = "";
  for (const waiter of cdpWaiters.values()) {
    clearTimeout(waiter.timer);
    waiter.reject(err);
  }
  cdpWaiters.clear();
  try {
    pageSocket?.close();
  } catch {
    // ignore
  }
  pageSocket = null;
  if (edgeProc?.pid) {
    spawn("taskkill", ["/PID", String(edgeProc.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  }
  edgeProc = null;
  if (server) {
    try {
      server.close();
    } catch {
      // ignore
    }
  }
  server = null;
}

function startHost() {
  if (!isSupported()) return Promise.resolve(false);
  if (hostReady && edgeProc) return Promise.resolve(true);
  if (startPromise) return startPromise;

  startPromise = new Promise((resolve) => {
    lastHostError = "Lecteur Spotify Windows indisponible.";
    void (async () => {
      const edge = edgeExecutable();
      if (!edge) {
        lastHostError = "Microsoft Edge est requis pour lire Spotify dans Meetra.";
        throw new Error(lastHostError);
      }
      if (!fs.existsSync(path.join(PLAYER_DIR, "player.html"))) {
        lastHostError = "Lecteur Spotify introuvable dans l'application.";
        throw new Error(lastHostError);
      }
      server = createPlayerServer();
      const port = await listen(server);
      playerOrigin = `http://127.0.0.1:${port}`;
      const dataDir = path.join(
        process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
        "forma-desktop",
        "spotify-edge",
      );
      fs.mkdirSync(dataDir, { recursive: true });
      let debugPort = 0;
      let stderrBuf = "";
      const debugPortReady = new Promise((ready, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error("Edge n'a pas ouvert le lecteur."));
        }, 12_000);
        const finish = (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          ready(value);
        };
        const giveUp = (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        };
        edgeProc = spawn(
          edge,
          [
            `--user-data-dir=${dataDir}`,
            "--remote-debugging-port=0",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-sync",
            "--disable-extensions",
            "--autoplay-policy=no-user-gesture-required",
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
            "--disable-features=CalculateNativeWinOcclusion",
            "--window-position=-2400,-2400",
            "--window-size=480,320",
            `--app=${playerOrigin}/player.html`,
          ],
          { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
        );
        edgeProc.stderr?.on("data", (chunk) => {
          stderrBuf += String(chunk);
          const match = stderrBuf.match(/127\.0\.0\.1:(\d+)/);
          if (match) finish(Number(match[1]));
        });
        edgeProc.once("exit", () => {
          giveUp(new Error("Edge s'est fermé avant le lecteur Spotify."));
        });
      });
      debugPort = await debugPortReady;
      await connectToPage(debugPort);
      await waitForHostReady();
      resolve(true);
    })().catch((err) => {
      lastHostError = err instanceof Error ? err.message : lastHostError;
      console.error("[spotify-edge] start failed:", lastHostError);
      stopHost();
      resolve(false);
    });
  });

  return startPromise;
}

function respondToken(id, token) {
  const waiter = tokenWaiters.get(id);
  if (!waiter) return;
  tokenWaiters.delete(id);
  waiter(typeof token === "string" ? token : "");
}

async function ensureStarted() {
  const ok = await startHost();
  if (!ok) throw new Error(lastHostError);
  await waitForHostReady();
}

async function warm() {
  await ensureStarted();
  await callPlayer("warm", []);
}

async function play(trackId) {
  await ensureStarted();
  await callPlayer("play", [trackId]);
  return true;
}

async function pause() {
  if (!hostReady) return;
  await callPlayer("pause", []);
}

async function resume() {
  if (!hostReady) return;
  await callPlayer("resume", []);
}

async function toggle() {
  if (!hostReady) return;
  await callPlayer("toggle", []);
}

async function setVolume(volume) {
  await ensureStarted();
  await callPlayer("setVolume", [volume]);
}

async function reset() {
  if (!hostReady) return;
  try {
    await callPlayer("reset", []);
  } catch {
    // ignore
  }
}

async function getPlaybackClock() {
  if (!hostReady) return { sec: null, durationSec: null };
  const clock = await callPlayer("getPlaybackClock", []);
  const sec = clock && typeof clock.sec === "number" && Number.isFinite(clock.sec) ? clock.sec : null;
  const durationSec =
    clock && typeof clock.durationSec === "number" && Number.isFinite(clock.durationSec)
      ? clock.durationSec
      : null;
  return { sec, durationSec };
}

function getAvailability() {
  return { supported: isSupported(), ready: hostReady };
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
