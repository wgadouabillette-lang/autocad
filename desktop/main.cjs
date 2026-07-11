const {
  app,
  BrowserWindow,
  shell,
  session,
  ipcMain,
  desktopCapturer,
  systemPreferences,
  components,
} = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");
const {
  initUpdater,
  handleInstallNow,
  handleScheduleTonight,
  handleGetState,
  handleTriggerMockUpdate,
} = require("./updater.cjs");
const spotifyWebView2 = require("./spotifyWebView2Manager.cjs");

app.setName("Hall");

const BACKEND_HOST = "127.0.0.1";
const BACKEND_PORT = Number(process.env.FORMA_PORT || 47831);
const DEV_URL = process.env.FORMA_DEV_URL?.trim() || "";
const START_URL = DEV_URL || `http://${BACKEND_HOST}:${BACKEND_PORT}/`;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "forma-cad-dev";

const OAUTH_POPUP_PREFIXES = [
  "https://accounts.google.com/",
  "https://www.facebook.com/",
  "https://facebook.com/",
  "https://login.microsoftonline.com/",
  "https://forma-cad-dev.firebaseapp.com/",
  "https://checkout.stripe.com/",
  "https://billing.stripe.com/",
];

let backendProc = null;
let mainWindow = null;

function repoRoot() {
  return path.resolve(__dirname, "..");
}

function resourcesPath(...parts) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...parts);
  }
  return path.join(repoRoot(), ...parts);
}

function pythonExecutable() {
  if (app.isPackaged) {
    const macLin = resourcesPath("backend-venv", "bin", "python");
    const win = resourcesPath("backend-venv", "Scripts", "python.exe");
    if (fs.existsSync(win)) return win;
    if (fs.existsSync(macLin)) return macLin;
  }
  const devMac = path.join(repoRoot(), "backend", ".venv", "bin", "python");
  const devWin = path.join(repoRoot(), "backend", ".venv", "Scripts", "python.exe");
  if (fs.existsSync(devWin)) return devWin;
  if (fs.existsSync(devMac)) return devMac;
  return process.platform === "win32" ? "python" : "python3";
}

function backendCwd() {
  if (app.isPackaged) {
    return resourcesPath("backend");
  }
  return path.join(repoRoot(), "backend");
}

function frontendDist() {
  if (app.isPackaged) {
    return resourcesPath("frontend-dist");
  }
  return path.join(repoRoot(), "frontend", "dist");
}

function dataDir() {
  return path.join(app.getPath("userData"), "forma-data");
}

function firebaseCredentialsPath() {
  const userFile = path.join(dataDir(), "firebase-adminsdk.json");
  if (fs.existsSync(userFile)) return userFile;
  const bundledBackend = resourcesPath("backend", "firebase-adminsdk.json");
  if (fs.existsSync(bundledBackend)) return bundledBackend;
  return "";
}

function ensureDataDir() {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function spawnBackend() {
  const py = pythonExecutable();
  const cwd = backendCwd();
  ensureDataDir();
  const firebaseCreds = firebaseCredentialsPath();
  const env = {
    ...process.env,
    FORMA_DESKTOP: "1",
    FORMA_HOST: BACKEND_HOST,
    FORMA_PORT: String(BACKEND_PORT),
    FORMA_DATA_DIR: dataDir(),
    FIREBASE_PROJECT_ID,
    ...(firebaseCreds ? { GOOGLE_APPLICATION_CREDENTIALS: firebaseCreds } : {}),
    ...(DEV_URL ? {} : { FORMA_STATIC: frontendDist() }),
    PYTHONUNBUFFERED: "1",
  };

  backendProc = spawn(
    py,
    ["-m", "uvicorn", "app.main:app", "--host", BACKEND_HOST, "--port", String(BACKEND_PORT)],
    { cwd, env, stdio: app.isPackaged ? "ignore" : "inherit" },
  );

  backendProc.on("exit", (code) => {
    backendProc = null;
    if (code && code !== 0 && mainWindow) {
      mainWindow.loadURL(
        `data:text/html,<body style="font-family:system-ui;background:#121212;color:#e0e0e0;padding:2rem"><h1>Hall</h1><p>The backend engine stopped (code ${code}).</p><p>Restart the application.</p></body>`,
      );
    }
  });
}

function backendHealthUrl() {
  if (DEV_URL) {
    const port = process.env.FORMA_BACKEND_PORT || "8000";
    return `http://${BACKEND_HOST}:${port}/api/health`;
  }
  const base = START_URL.endsWith("/") ? START_URL : `${START_URL}/`;
  return `${base}api/health`;
}

function waitForBackend(maxMs = 90000) {
  const started = Date.now();
  const healthUrl = backendHealthUrl();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(healthUrl, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else retry();
      });
      req.on("error", retry);
      function retry() {
        if (Date.now() - started > maxMs) {
          reject(new Error("Backend timeout"));
          return;
        }
        setTimeout(tick, 400);
      }
    };
    tick();
  });
}

function getWidevineStatus() {
  if (typeof components?.status !== "function") {
    return { available: false, platform: process.platform };
  }
  try {
    return { available: true, platform: process.platform, ...components.status() };
  } catch {
    return { available: false, platform: process.platform };
  }
}

async function ensureDesktopPlaybackReady() {
  if (process.platform !== "darwin") return;
  if (typeof components?.whenReady !== "function") {
    console.warn("[hall] Electron Castlabs (Widevine) attendu sur macOS — vérifiez desktop/package.json");
    return;
  }
  await components.whenReady();
  console.log("[hall] Widevine CDM prêt:", getWidevineStatus());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "Hall",
    backgroundColor: "#121212",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // Castlabs Widevine / Spotify Web Playback SDK
      plugins: true,
    },
  });

  // Spotify licence Widevine : UA proche de Chrome (évite certains rejets anti-bot).
  try {
    const chromeMajor = process.versions.chrome?.split(".")[0] || "132";
    mainWindow.webContents.setUserAgent(
      `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`,
    );
  } catch {
    // ignore
  }

  mainWindow.loadURL(START_URL);
  spotifyWebView2.setMainWindow(mainWindow);
  if (spotifyWebView2.isSupported()) {
    void spotifyWebView2.startHost();
  }
  mainWindow.on("closed", () => {
    spotifyWebView2.setMainWindow(null);
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (OAUTH_POPUP_PREFIXES.some((prefix) => url.startsWith(prefix))) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 520,
          height: 720,
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        },
      };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function stopBackend() {
  if (!backendProc) return;
  backendProc.kill("SIGTERM");
  backendProc = null;
}

function capturerThumbnailSize() {
  return process.platform === "darwin"
    ? { width: 150, height: 150 }
    : { width: 0, height: 0 };
}

async function listWindowSources() {
  return desktopCapturer.getSources({
    types: ["window"],
    thumbnailSize: capturerThumbnailSize(),
  });
}

async function listDisplayMediaSources() {
  return desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: capturerThumbnailSize(),
  });
}

async function resolvePreferredScreenSource() {
  const sources = await listDisplayMediaSources();
  return (
    sources.find((source) => source.id.startsWith("screen:0")) ??
    sources.find((source) => source.id.startsWith("screen:")) ??
    sources[0] ??
    null
  );
}

async function resolveHallWindowSource() {
  const win = mainWindow || BrowserWindow.getFocusedWindow();
  if (!win) return null;

  const sources = await listWindowSources();

  if (typeof win.getMediaSourceId === "function") {
    const sourceId = win.getMediaSourceId();
    const byId = sources.find((source) => source.id === sourceId);
    if (byId) return byId;
  }

  const title = win.getTitle() || "Hall";
  const names = [title, "Hall", "Electron"];
  for (const name of names) {
    const match = sources.find((source) => source.name === name);
    if (match) return match;
  }

  return (
    sources.find((source) => source.name.includes("Hall")) ??
    sources.find((source) => source.name.includes("Electron")) ??
    null
  );
}

function getScreenCaptureAccessStatus() {
  if (process.platform === "darwin") {
    return systemPreferences.getMediaAccessStatus("screen");
  }
  return "unknown";
}

async function openScreenCaptureSettings() {
  if (process.platform === "darwin") {
    try {
      await listWindowSources();
    } catch {
      // macOS enregistre l'app dans la liste après une première tentative.
    }

    const urls = [
      "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_ScreenCapture",
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    ];
    for (const url of urls) {
      try {
        await shell.openExternal(url);
        return true;
      } catch {
        // essayer l'URL suivante (anciennes versions de macOS)
      }
    }
    return false;
  }

  if (process.platform === "win32") {
    const urls = [
      "ms-settings:privacy-screenrecording",
      "ms-settings:privacy",
    ];
    for (const url of urls) {
      try {
        await shell.openExternal(url);
        return true;
      } catch {
        // essayer l'URL suivante
      }
    }
    return false;
  }

  return false;
}

ipcMain.handle("forma:open-external", async (_event, url) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    throw new Error("Invalid external URL.");
  }
  await shell.openExternal(url);
});

ipcMain.handle("forma:get-app-window-source-id", async () => {
  const source = await resolveHallWindowSource();
  return source?.id ?? null;
});

ipcMain.handle("forma:get-screen-capture-access-status", () => ({
  status: getScreenCaptureAccessStatus(),
  platform: process.platform,
}));

ipcMain.handle("forma:open-screen-capture-settings", () => openScreenCaptureSettings());

ipcMain.handle("forma:update-install-now", () => handleInstallNow());
ipcMain.handle("forma:update-schedule-tonight", () => handleScheduleTonight());
ipcMain.handle("forma:update-get-state", () => handleGetState());
ipcMain.handle("forma:update-trigger-mock", () => handleTriggerMockUpdate());

ipcMain.handle("forma:spotify-webview2-availability", () => spotifyWebView2.getAvailability());
ipcMain.handle("forma:spotify-webview2-warm", () => spotifyWebView2.warm());
ipcMain.handle("forma:spotify-webview2-play", (_event, trackId) => spotifyWebView2.play(trackId));
ipcMain.handle("forma:spotify-webview2-pause", () => spotifyWebView2.pause());
ipcMain.handle("forma:spotify-webview2-resume", () => spotifyWebView2.resume());
ipcMain.handle("forma:spotify-webview2-toggle", () => spotifyWebView2.toggle());
ipcMain.handle("forma:spotify-webview2-reset", () => spotifyWebView2.reset());
ipcMain.handle("forma:spotify-token-response", (_event, payload) => {
  if (!payload || typeof payload.id !== "string") return;
  spotifyWebView2.respondToken(payload.id, typeof payload.token === "string" ? payload.token : "");
});
ipcMain.handle("forma:spotify-widevine-status", () => getWidevineStatus());

app.whenReady().then(async () => {
  // Screen share / recording: prefer OS picker when available (macOS 15+).
  // Fallback grants the primary display — not only the Hall window.
  session.defaultSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      try {
        // Probe sources so macOS registers Hall/Electron in Screen Recording.
        const source = await resolvePreferredScreenSource();
        if (!source) {
          callback({});
          return;
        }
        /** @type {{ video: Electron.DesktopCapturerSource; audio?: string }} */
        const grant = { video: source };
        if (request.audioRequested) {
          grant.audio = "loopback";
        }
        callback(grant);
      } catch (err) {
        console.error("forma display-media handler:", err);
        callback({});
      }
    },
    { useSystemPicker: true },
  );

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return (
      permission === "media" ||
      permission === "display-capture" ||
      permission === "protectedMedia" ||
      permission === "mediaKeySystem"
    );
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(
      permission === "media" ||
        permission === "display-capture" ||
        permission === "protectedMedia" ||
        permission === "mediaKeySystem",
    );
  });

  try {
    if (!DEV_URL && !fs.existsSync(frontendDist())) {
      throw new Error(
        "Build frontend manquant. Lancez: cd frontend && npm run build",
      );
    }
    await ensureDesktopPlaybackReady();
    if (!DEV_URL) {
      spawnBackend();
    }
    await waitForBackend();
    createWindow();
    initUpdater({ getMainWindow: () => mainWindow });
  } catch (err) {
    console.error(err);
    const message =
      err instanceof Error ? err.message : "Le backend Hall n'a pas répondu.";
    const devHint = DEV_URL
      ? "Vérifiez que le backend tourne sur le port 8000 (./scripts/desktop-dev.sh)."
      : "Relancez depuis le dossier du projet : ./scripts/desktop-dev.sh — ou reconstruisez l'app : ./scripts/build-desktop-mac.sh";
    const win = new BrowserWindow({
      width: 720,
      height: 420,
      title: "Hall",
      backgroundColor: "#121212",
    });
    win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        `<body style="font-family:system-ui;background:#121212;color:#e0e0e0;padding:2rem;line-height:1.5"><h1 style="margin:0 0 1rem">Hall ne peut pas démarrer</h1><p>${message}</p><p>${devHint}</p></body>`,
      )}`,
    );
  }
});

app.on("window-all-closed", () => {
  stopBackend();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
  spotifyWebView2.stopHost();
  stopBackend();
});
