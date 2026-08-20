const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  shell,
  session,
  ipcMain,
  desktopCapturer,
  systemPreferences,
  components,
  screen,
} = require("electron");
const { spawn, exec } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { createUiServer } = require("./staticServer.cjs");
const {
  initUpdater,
  handleInstallNow,
  handleScheduleTonight,
  handleGetState,
  handleTriggerMockUpdate,
} = require("./updater.cjs");
const spotifyWebView2 = require("./spotifyWebView2Manager.cjs");

app.setName("Meetra");
if (process.platform === "win32") {
  // Keep taskbar / jump-list icons on Meetra's AppUserModelID (not Electron's).
  app.setAppUserModelId("com.forma.cad");
  // Chromium may stop painting when it thinks the window is occluded
  // (native chrome + File/Edit menus, gray content). Common on NVIDIA / G-SYNC.
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
  app.disableHardwareAcceleration();
}

const BACKEND_HOST = "127.0.0.1";
const BACKEND_PORT = Number(process.env.FORMA_PORT || 47831);
const UI_PORT = Number(process.env.FORMA_UI_PORT || 47832);
const DEV_URL = process.env.FORMA_DEV_URL?.trim() || "";
const BACKEND_ORIGIN = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
const UI_ORIGIN = `http://${BACKEND_HOST}:${UI_PORT}`;
const START_URL = DEV_URL || `${UI_ORIGIN}/app/`;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "forma-cad-dev";

const OAUTH_POPUP_PREFIXES = [
  "https://accounts.google.com/",
  "https://accounts.spotify.com/",
  "https://www.spotify.com/",
  "https://spotify.com/",
  "https://appleid.apple.com/",
  "https://appleid.cdn-apple.com/",
  "https://www.facebook.com/",
  "https://facebook.com/",
  "https://login.microsoftonline.com/",
  "https://login.live.com/",
  "https://forma-cad-dev.firebaseapp.com/",
  "https://checkout.stripe.com/",
  "https://billing.stripe.com/",
];

/** Shared cookie jar so Spotify can silently re-approve after the first login. */
const OAUTH_PARTITION = "persist:forma-oauth";

function isOAuthPopupUrl(url) {
  return typeof url === "string" && OAUTH_POPUP_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function oauthPopupBrowserOptions() {
  return {
    width: 520,
    height: 720,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: OAUTH_PARTITION,
    },
  };
}

function attachOAuthPopupNavigation(win) {
  if (!win || win.isDestroyed()) return;
  const contents = win.webContents;
  contents.setWindowOpenHandler(({ url }) => {
    if (isOAuthPopupUrl(url)) {
      void contents.loadURL(url);
      return { action: "deny" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });
  contents.on("did-create-window", (childWindow) => {
    attachOAuthPopupNavigation(childWindow);
  });
}

let backendProc = null;
/** @type {import("http").Server | null} */
let uiServer = null;
let mainWindow = null;
/** @type {Electron.BrowserWindow | null} */
let splashWindow = null;
/** @type {"splash" | "app"} */
let mainWindowMode = "splash";
/** @type {Electron.BrowserWindow | null} */
let recordingCameraWindow = null;
let backendLogPath = null;

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
    // Windows ships a full relocated CPython tree (python.exe at runtime root).
    const winRoot = resourcesPath("backend-venv", "python.exe");
    const winScripts = resourcesPath("backend-venv", "Scripts", "python.exe");
    const macLin = resourcesPath("backend-venv", "bin", "python");
    if (process.platform === "win32") {
      if (fs.existsSync(winRoot)) return winRoot;
      if (fs.existsSync(winScripts)) return winScripts;
    }
    if (fs.existsSync(macLin)) return macLin;
    if (fs.existsSync(winRoot)) return winRoot;
    if (fs.existsSync(winScripts)) return winScripts;
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

function backendLogFile() {
  if (backendLogPath) return backendLogPath;
  backendLogPath = path.join(dataDir(), "backend.log");
  return backendLogPath;
}

function appendBackendLog(chunk) {
  try {
    fs.appendFileSync(backendLogFile(), chunk);
  } catch {
    // ignore logging failures
  }
}

function windowsCertifiPath(pythonHome) {
  if (!pythonHome) return "";
  const candidates = [
    path.join(pythonHome, "Lib", "site-packages", "certifi", "cacert.pem"),
    path.join(pythonHome, "lib", "site-packages", "certifi", "cacert.pem"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function windowsPathKey(env) {
  if (Object.prototype.hasOwnProperty.call(env, "Path")) return "Path";
  if (Object.prototype.hasOwnProperty.call(env, "PATH")) return "PATH";
  return process.platform === "win32" ? "Path" : "PATH";
}

function freeListenPort(port) {
  if (process.platform !== "win32") return Promise.resolve();
  return new Promise((resolve) => {
    exec(`netstat -ano | findstr :${port}`, { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) {
        resolve();
        return;
      }
      const pids = new Set();
      for (const line of stdout.split(/\r?\n/)) {
        if (!/LISTENING/i.test(line)) continue;
        const pid = line.trim().split(/\s+/).pop();
        if (pid && /^\d+$/.test(pid) && pid !== "0") pids.add(pid);
      }
      if (pids.size === 0) {
        resolve();
        return;
      }
      exec(
        `taskkill /F ${[...pids].map((pid) => `/PID ${pid}`).join(" ")}`,
        { windowsHide: true },
        () => resolve(),
      );
    });
  });
}

async function startUiServer() {
  if (DEV_URL || uiServer) return;
  const distDir = frontendDist();
  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    throw new Error("Build frontend manquant. Lancez: cd frontend && npm run build");
  }
  uiServer = await createUiServer({
    distDir,
    apiHost: BACKEND_HOST,
    apiPort: BACKEND_PORT,
    listenHost: BACKEND_HOST,
    listenPort: UI_PORT,
  });
  appendBackendLog(`[hall] UI server ${UI_ORIGIN} → ${distDir}\n`);
}

function stopUiServer() {
  if (!uiServer) return;
  try {
    uiServer.close();
  } catch {
    // ignore
  }
  uiServer = null;
}

function spawnBackend() {
  const py = pythonExecutable();
  const cwd = backendCwd();
  ensureDataDir();
  if (!fs.existsSync(py)) {
    throw new Error(`Runtime Python introuvable: ${py}`);
  }
  const firebaseCreds = firebaseCredentialsPath();
  const pythonHome =
    app.isPackaged && process.platform === "win32"
      ? resourcesPath("backend-venv")
      : "";
  const env = {
    ...process.env,
    FORMA_DESKTOP: "1",
    FORMA_USE_LOCAL_ENV: "1",
    FORMA_HOST: BACKEND_HOST,
    FORMA_PORT: String(BACKEND_PORT),
    FORMA_DATA_DIR: dataDir(),
    FIREBASE_PROJECT_ID,
    // OAuth connecteurs (Spotify, etc.) : callback loopback sur le backend embarqué.
    FORMA_OAUTH_REDIRECT_BASE: BACKEND_ORIGIN,
    FORMA_FRONTEND_ORIGIN: UI_ORIGIN,
    FORMA_FRONTEND_BASE_PATH: "/",
    FORMA_CORS: [UI_ORIGIN, BACKEND_ORIGIN, "http://localhost:5173", "http://127.0.0.1:5173"].join(
      ",",
    ),
    PYTHONUTF8: "1",
    PYTHONUNBUFFERED: "1",
    PYTHONNOUSERSITE: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONPATH: cwd,
  };
  const packagedEnv = path.join(cwd, "forma-backend.env");
  const packagedDotenv = path.join(cwd, ".env");
  if (fs.existsSync(packagedEnv)) {
    env.FORMA_ENV_FILE = packagedEnv;
  } else if (fs.existsSync(packagedDotenv)) {
    env.FORMA_ENV_FILE = packagedDotenv;
  }
  if (firebaseCreds) {
    env.GOOGLE_APPLICATION_CREDENTIALS = firebaseCreds;
  } else {
    delete env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  if (pythonHome) {
    env.PYTHONHOME = pythonHome;
    const pathKey = windowsPathKey(env);
    env[pathKey] = [
      pythonHome,
      path.join(pythonHome, "Scripts"),
      path.join(pythonHome, "DLLs"),
      env[pathKey] || "",
    ].join(path.delimiter);
    const certFile = windowsCertifiPath(pythonHome);
    if (certFile) {
      env.SSL_CERT_FILE = certFile;
      env.REQUESTS_CA_BUNDLE = certFile;
      env.CURL_CA_BUNDLE = certFile;
    }
  }

  try {
    fs.writeFileSync(
      backendLogFile(),
      `[hall] starting backend\npython=${py}\ncwd=${cwd}\nport=${BACKEND_PORT}\nui=${UI_ORIGIN}\nenvFile=${env.FORMA_ENV_FILE || "(none)"}\n\n`,
    );
  } catch {
    // ignore
  }

  backendProc = spawn(
    py,
    ["-m", "uvicorn", "app.main:app", "--host", BACKEND_HOST, "--port", String(BACKEND_PORT)],
    {
      cwd,
      env,
      windowsHide: true,
      stdio: app.isPackaged ? ["ignore", "pipe", "pipe"] : "inherit",
    },
  );

  if (app.isPackaged) {
    backendProc.stdout?.on("data", (buf) => appendBackendLog(buf));
    backendProc.stderr?.on("data", (buf) => appendBackendLog(buf));
  }

  backendProc.on("error", (err) => {
    appendBackendLog(`[hall] spawn error: ${err?.message || err}\n`);
  });

  backendProc.on("exit", (code) => {
    backendProc = null;
    appendBackendLog(`[hall] backend exited code=${code}\n`);
  });
}

function backendHealthUrl() {
  if (DEV_URL) {
    const port = process.env.FORMA_BACKEND_PORT || "8000";
    return `http://${BACKEND_HOST}:${port}/api/health`;
  }
  return `${BACKEND_ORIGIN}/api/health`;
}

function applyDesktopUserAgent(contents) {
  try {
    const chromeMajor = process.versions.chrome?.split(".")[0] || "132";
    const ua =
      process.platform === "win32"
        ? `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`
        : process.platform === "linux"
          ? `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`
          : `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`;
    contents.setUserAgent(ua);
  } catch {
    // ignore
  }
}

function loadErrorHtml(title, message, hint) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(
    `<body style="font-family:system-ui;background:#121212;color:#e0e0e0;padding:2rem;line-height:1.5">
      <h1 style="margin:0 0 1rem">${title}</h1>
      <p>${message}</p>
      ${hint ? `<p>${hint}</p>` : ""}
    </body>`,
  )}`;
}

function attachRendererDiagnostics(win) {
  const contents = win.webContents;
  let rendererRestarts = 0;
  contents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    if (errorCode === -3) return; // ERR_ABORTED (in-page navigation)
    appendBackendLog(
      `[hall] did-fail-load code=${errorCode} desc=${errorDescription} url=${validatedURL}\n`,
    );
    win.loadURL(
      loadErrorHtml(
        "Meetra ne peut pas afficher l'interface",
        `${errorDescription} (${errorCode}).`,
        validatedURL ? `URL : ${validatedURL}` : "",
      ),
    );
  });
  contents.on("render-process-gone", (_event, details) => {
    appendBackendLog(`[hall] renderer gone reason=${details?.reason} exit=${details?.exitCode}\n`);
    if (details?.reason === "clean-exit") return;
    rendererRestarts += 1;
    if (rendererRestarts > 2) {
      win.loadURL(
        loadErrorHtml(
          "Meetra ne peut pas afficher l'interface",
          "Le moteur d'affichage s'est arrêté plusieurs fois.",
          "Relancez Meetra. Si le problème continue, mettez à jour le pilote graphique.",
        ),
      );
      return;
    }
    setTimeout(() => {
      if (!win.isDestroyed()) win.loadURL(START_URL);
    }, 400);
  });
  contents.on("did-finish-load", () => {
    if (process.platform !== "win32" || win.isDestroyed()) return;
    // Force a compositor pass — some NVIDIA / G-SYNC setups stay on backgroundColor
    // until the window is resized or invalidated.
    const [width, height] = win.getSize();
    win.setSize(width, height + 1);
    win.setSize(width, height);
  });
  contents.on("console-message", (_event, level, message) => {
    if (level >= 2) appendBackendLog(`[renderer] ${message}\n`);
  });
}

function waitForBackend(maxMs = 90000) {
  const started = Date.now();
  const healthUrl = backendHealthUrl();
  const expectLocalBackend = !DEV_URL;
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (expectLocalBackend && backendProc === null) {
        reject(
          new Error(
            "Le backend s'est arrêté avant d'être prêt. Consultez forma-data/backend.log.",
          ),
        );
        return;
      }
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

function resolveAppIconPath() {
  const ico = path.join(__dirname, "build", "icon.ico");
  const png = path.join(__dirname, "build", "icon.png");
  if (process.platform === "win32" && fs.existsSync(ico)) return ico;
  if (fs.existsSync(png)) return png;
  if (fs.existsSync(ico)) return ico;
  return undefined;
}

const SPLASH_WINDOW_SIZE = { width: 300, height: 425 };
const APP_WINDOW_SIZE = { width: 1440, height: 900 };
const APP_WINDOW_MIN_SIZE = { width: 1024, height: 640 };

/**
 * Geometric center of the visible desktop (work area), not Electron `center: true`.
 * `center: true` / `win.center()` use the full display bounds, including the macOS
 * menu bar, which places the splash slightly too high in the remaining screen.
 */
function getCenteredSplashBounds() {
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point) ?? screen.getPrimaryDisplay();
  const work = display.workArea;
  const { width, height } = SPLASH_WINDOW_SIZE;
  return {
    x: Math.round(work.x + (work.width - width) / 2),
    y: Math.round(work.y + (work.height - height) / 2),
    width,
    height,
  };
}

function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
}

function createSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) return;
  const bounds = getCenteredSplashBounds();
  splashWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    useContentSize: true,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    roundedCorners: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    title: "Meetra",
    icon: resolveAppIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  splashWindow.loadFile(path.join(__dirname, "splash.html"));
  splashWindow.once("ready-to-show", () => {
    if (!splashWindow || splashWindow.isDestroyed() || mainWindowMode === "app") return;
    splashWindow.setBounds(getCenteredSplashBounds());
    splashWindow.show();
  });
  splashWindow.on("closed", () => {
    splashWindow = null;
  });
}

function enterLaunchFullScreen(win) {
  if (!win || win.isDestroyed()) return;
  if (process.platform === "darwin") {
    win.setFullScreen(true);
    return;
  }
  win.maximize();
}

function showAppWindow() {
  if (mainWindowMode === "app") return;
  mainWindowMode = "app";
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    // Maximize while still hidden on Windows/Linux so the first paint is not 1440×900.
    // macOS native fullscreen is applied after show() — setFullScreen on a hidden
    // window is unreliable.
    if (process.platform !== "darwin") {
      enterLaunchFullScreen(mainWindow);
    }
    mainWindow.show();
    if (process.platform === "darwin") {
      enterLaunchFullScreen(mainWindow);
    }
    mainWindow.focus();
  }
  closeSplashWindow();
}

function setMainWindowMode(mode) {
  if (mode === "app") {
    showAppWindow();
    return;
  }
  if (mode !== "splash") return;
  if (mainWindowMode === "app") return;
  mainWindowMode = "splash";
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    mainWindow.hide();
  }
  createSplashWindow();
}

function createWindow() {
  if (process.platform === "win32") {
    Menu.setApplicationMenu(null);
  }

  mainWindowMode = "splash";
  createSplashWindow();

  mainWindow = new BrowserWindow({
    width: APP_WINDOW_SIZE.width,
    height: APP_WINDOW_SIZE.height,
    minWidth: APP_WINDOW_MIN_SIZE.width,
    minHeight: APP_WINDOW_MIN_SIZE.height,
    show: false,
    paintWhenInitiallyHidden: true,
    fullscreenable: true,
    title: "Meetra",
    icon: resolveAppIconPath(),
    backgroundColor: "#121212",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      // Castlabs Widevine is used on macOS; Windows plays Spotify via WebView2.
      plugins: process.platform === "darwin",
    },
  });

  applyDesktopUserAgent(mainWindow.webContents);
  attachRendererDiagnostics(mainWindow);

  mainWindow.loadURL(START_URL);
  spotifyWebView2.setMainWindow(mainWindow);
  mainWindow.webContents.once("did-finish-load", () => {
    if (spotifyWebView2.isSupported()) {
      void spotifyWebView2.startHost();
    }
  });
  mainWindow.on("closed", () => {
    spotifyWebView2.setMainWindow(null);
    hideRecordingCameraOverlay();
    closeSplashWindow();
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isOAuthPopupUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: oauthPopupBrowserOptions(),
      };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("did-create-window", (childWindow, details) => {
    if (isOAuthPopupUrl(details.url) || isOAuthPopupUrl(childWindow.webContents.getURL())) {
      attachOAuthPopupNavigation(childWindow);
    }
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

const RECORDING_CAMERA_SIZE = 140;
const RECORDING_CAMERA_MARGIN = 35;

function hideRecordingCameraOverlay() {
  if (recordingCameraWindow && !recordingCameraWindow.isDestroyed()) {
    recordingCameraWindow.destroy();
  }
  recordingCameraWindow = null;
}

/**
 * Floating always-on-top camera bubble so it stays visible over Chrome / other apps
 * while the full desktop is being recorded.
 * @param {{ mirror?: boolean }} [opts]
 */
function showRecordingCameraOverlay(opts = {}) {
  const mirror = opts.mirror !== false;
  const display = screen.getPrimaryDisplay();
  const work = display.workArea;
  const x = Math.round(work.x + RECORDING_CAMERA_MARGIN);
  const y = Math.round(work.y + work.height - RECORDING_CAMERA_SIZE - RECORDING_CAMERA_MARGIN);

  if (recordingCameraWindow && !recordingCameraWindow.isDestroyed()) {
    recordingCameraWindow.setBounds({
      x,
      y,
      width: RECORDING_CAMERA_SIZE,
      height: RECORDING_CAMERA_SIZE,
    });
    recordingCameraWindow.webContents.send("forma:recording-camera-mirror", { mirror });
    if (!recordingCameraWindow.isVisible()) {
      recordingCameraWindow.showInactive();
    }
    return;
  }

  recordingCameraWindow = new BrowserWindow({
    width: RECORDING_CAMERA_SIZE,
    height: RECORDING_CAMERA_SIZE,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: true,
    show: false,
    backgroundColor: "#00000000",
    // Linux: panel helps keep the bubble above other apps (X11 / some compositors).
    ...(process.platform === "linux" ? { type: "panel" } : {}),
    webPreferences: {
      preload: path.join(__dirname, "recording-camera-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    recordingCameraWindow.setAlwaysOnTop(true, "screen-saver");
  } catch {
    recordingCameraWindow.setAlwaysOnTop(true);
  }
  try {
    recordingCameraWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch {
    try {
      recordingCameraWindow.setVisibleOnAllWorkspaces(true);
    } catch {
      // Wayland may ignore this — still show the overlay on the current desktop.
    }
  }
  try {
    recordingCameraWindow.setIgnoreMouseEvents(true, { forward: true });
  } catch {
    recordingCameraWindow.setIgnoreMouseEvents(true);
  }

  recordingCameraWindow.on("closed", () => {
    recordingCameraWindow = null;
  });

  const overlayPath = path.join(__dirname, "recording-camera-overlay.html");
  void recordingCameraWindow.loadFile(overlayPath, {
    query: { mirror: mirror ? "1" : "0" },
  });
  recordingCameraWindow.once("ready-to-show", () => {
    if (!recordingCameraWindow || recordingCameraWindow.isDestroyed()) return;
    recordingCameraWindow.showInactive();
  });
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

  const title = win.getTitle() || "Meetra";
  const names = [title, "Meetra", "Electron"];
  for (const name of names) {
    const match = sources.find((source) => source.name === name);
    if (match) return match;
  }

  return (
    sources.find((source) => source.name.includes("Meetra")) ??
    sources.find((source) => source.name.includes("Electron")) ??
    null
  );
}

function getScreenCaptureAccessStatus() {
  if (typeof systemPreferences.getMediaAccessStatus !== "function") {
    return "unknown";
  }
  try {
    if (process.platform === "darwin" || process.platform === "win32") {
      return systemPreferences.getMediaAccessStatus("screen");
    }
  } catch {
    // Older Electron builds may not expose screen status on Windows.
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
    try {
      await listDisplayMediaSources();
    } catch {
      // Registers Meetra in Windows privacy lists when possible.
    }
    const urls = [
      "ms-settings:privacy-graphicscaptureprogrammatic",
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

  if (process.platform === "linux") {
    // No OS-wide gate like macOS TCC — PipeWire/XDG portal prompts per capture.
    // Open common privacy / settings surfaces when available.
    const candidates = [
      ["gnome-control-center", "privacy"],
      ["systemsettings5", "kcm_privacy"],
    ];
    for (const [bin, ...args] of candidates) {
      try {
        const child = spawn(bin, args, { detached: true, stdio: "ignore" });
        child.on("error", () => {});
        child.unref();
        return true;
      } catch {
        // essayer la suivante
      }
    }
    return false;
  }

  return false;
}

ipcMain.handle("forma:set-window-mode", (_event, mode) => {
  if (mode !== "splash" && mode !== "app") return { ok: false };
  setMainWindowMode(mode);
  return { ok: true, mode: mainWindowMode };
});

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

ipcMain.handle("forma:get-preferred-screen-source-id", async () => {
  const source = await resolvePreferredScreenSource();
  return source?.id ?? null;
});

ipcMain.handle("forma:show-recording-camera-overlay", (_event, payload) => {
  showRecordingCameraOverlay({
    mirror: payload?.mirror !== false,
  });
  return true;
});

ipcMain.handle("forma:hide-recording-camera-overlay", () => {
  hideRecordingCameraOverlay();
  return true;
});

ipcMain.handle("forma:update-recording-camera-overlay", (_event, payload) => {
  if (!recordingCameraWindow || recordingCameraWindow.isDestroyed()) return false;
  recordingCameraWindow.webContents.send("forma:recording-camera-mirror", {
    mirror: payload?.mirror !== false,
  });
  return true;
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
ipcMain.handle("forma:spotify-webview2-set-volume", (_event, volume) =>
  spotifyWebView2.setVolume(volume),
);
ipcMain.handle("forma:spotify-webview2-reset", () => spotifyWebView2.reset());
ipcMain.handle("forma:spotify-webview2-playback-clock", () => spotifyWebView2.getPlaybackClock());
ipcMain.handle("forma:spotify-token-response", (_event, payload) => {
  if (!payload || typeof payload.id !== "string") return;
  spotifyWebView2.respondToken(payload.id, typeof payload.token === "string" ? payload.token : "");
});
ipcMain.handle("forma:spotify-widevine-status", () => getWidevineStatus());

app.whenReady().then(async () => {
  // Screen share / recording: always grant the primary display (full desktop),
  // not just the Meetra window — so Chrome/Google etc. appear in the recording.
  session.defaultSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      try {
        // Probe sources so macOS registers Meetra/Electron in Screen Recording.
        const source = await resolvePreferredScreenSource();
        if (!source) {
          callback({});
          return;
        }
        /** @type {{ video: Electron.DesktopCapturerSource; audio?: string }} */
        const grant = { video: source };
        // Windows loopback often fails the whole capture; mic is mixed separately.
        if (request.audioRequested && process.platform !== "win32") {
          grant.audio = "loopback";
        }
        callback(grant);
      } catch (err) {
        console.error("forma display-media handler:", err);
        callback({});
      }
    },
    { useSystemPicker: process.platform === "win32" },
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
      await freeListenPort(UI_PORT);
      await startUiServer();
      await freeListenPort(BACKEND_PORT);
      spawnBackend();
    }
    createWindow();
    initUpdater({ getMainWindow: () => mainWindow });
    if (!DEV_URL) {
      void waitForBackend().catch((err) => {
        appendBackendLog(`[hall] backend not ready: ${err instanceof Error ? err.message : err}\n`);
      });
    }
  } catch (err) {
    console.error(err);
    const message =
      err instanceof Error ? err.message : "Le backend Meetra n'a pas répondu.";
    let hint;
    if (DEV_URL) {
      hint =
        "Vérifiez que le backend tourne sur le port 8000 (./scripts/desktop-dev.sh).";
    } else if (app.isPackaged) {
      const logHint = backendLogPath
        ? `Journal : ${backendLogPath}`
        : `Journal : ${path.join(app.getPath("userData"), "forma-data", "backend.log")}`;
      hint =
        process.platform === "win32"
          ? `Réinstallez Meetra depuis forma.app, puis relancez. ${logHint}`
          : `Réinstallez Meetra, puis relancez. ${logHint}`;
    } else if (process.platform === "win32") {
      hint =
        "Relancez depuis le projet : scripts\\desktop-dev.sh — ou reconstruisez : scripts\\build-desktop-win.bat";
    } else {
      hint =
        "Relancez depuis le dossier du projet : ./scripts/desktop-dev.sh — ou reconstruisez : ./scripts/build-desktop-mac.sh";
    }
    if (process.platform === "win32") {
      Menu.setApplicationMenu(null);
    }
    const win = new BrowserWindow({
      width: 720,
      height: 420,
      title: "Meetra",
      icon: resolveAppIconPath(),
      backgroundColor: "#121212",
      autoHideMenuBar: true,
    });
    win.loadURL(loadErrorHtml("Meetra ne peut pas démarrer", message, hint));
    if (process.platform === "win32") {
      dialog.showErrorBox("Meetra ne peut pas démarrer", `${message}\n\n${hint}`);
    }
  }
});

app.on("window-all-closed", () => {
  hideRecordingCameraOverlay();
  stopBackend();
  stopUiServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
  spotifyWebView2.stopHost();
  stopBackend();
  stopUiServer();
});
