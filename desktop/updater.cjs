const { app, dialog } = require("electron");
const path = require("path");
const { readState, writeState } = require("./updater-state.cjs");

const UPDATE_FEED_URL = "https://meetra.cc/desktop-updates";
const NIGHT_START_HOUR = 2;
const NIGHT_END_HOUR = 5;
const TONIGHT_TICK_MS = 60_000;
const UPDATE_POLL_MS = 4 * 60 * 60 * 1000;
const STARTUP_CHECK_DELAY_MS = 400;

let getMainWindow = () => null;
let getWindowMode = () => "app";
let schedulerTimer = null;
let pollTimer = null;
let pendingInfo = null;
let installing = false;
let downloaded = false;
let autoUpdaterRef = null;
let startupCheckComplete = false;
/** @type {{ percent: number, version: string } | null} */
let lastProgress = null;

function packageVersion() {
  try {
    return require(path.join(__dirname, "package.json")).version;
  } catch {
    return "0.0.0";
  }
}

function bumpPatchVersion(version) {
  const parts = version.split(".").map((n) => Number.parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return parts.join(".");
}

function isNightWindow(date = new Date()) {
  const hour = date.getHours();
  return hour >= NIGHT_START_HOUR && hour < NIGHT_END_HOUR;
}

function isDevMode() {
  return Boolean(process.env.FORMA_DEV_URL) || !app.isPackaged;
}

function sendToRenderer(channel, payload) {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

function sendProgress(payload) {
  lastProgress = {
    percent: Math.max(0, Math.min(100, Math.round(payload.percent || 0))),
    version: payload.version || "",
  };
  sendToRenderer("forma:update-progress", lastProgress);
}

function emitUpdateAvailable(info) {
  pendingInfo = info;
  sendToRenderer("forma:update-available", info);
}

function clearPending() {
  pendingInfo = null;
  writeState(null);
}

function releaseNotesFrom(info) {
  if (!info) return "";
  if (typeof info.releaseNotes === "string") return info.releaseNotes;
  if (Array.isArray(info.releaseNotes)) {
    return info.releaseNotes
      .map((note) => (typeof note === "string" ? note : note?.note || ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function loadAutoUpdater() {
  if (autoUpdaterRef) return autoUpdaterRef;
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (err) {
    console.error("[forma-updater] electron-updater introuvable:", err);
    return null;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.disableDifferentialDownload = true;
  autoUpdater.logger = console;
  if ("verifyUpdateCodeSignature" in autoUpdater) {
    autoUpdater.verifyUpdateCodeSignature = false;
  }

  try {
    autoUpdater.setFeedURL({
      provider: "generic",
      url: UPDATE_FEED_URL,
    });
  } catch (err) {
    console.warn("[forma-updater] setFeedURL:", err);
  }

  autoUpdater.on("update-available", (info) => {
    const payload = {
      version: info.version,
      releaseNotes: releaseNotesFrom(info),
      currentVersion: packageVersion(),
    };
    emitUpdateAvailable(payload);
    // Launch/splash: download+install while the loading overlay is still showing.
    if (getWindowMode() === "splash") {
      void runInstallNow(payload);
    }
  });

  autoUpdater.on("update-not-available", () => {
    console.info("[forma-updater] déjà à jour", packageVersion());
  });

  autoUpdater.on("error", (err) => {
    console.error("[forma-updater]", err);
  });

  autoUpdater.on("download-progress", (progress) => {
    sendProgress({
      percent: Math.round(progress.percent || 0),
      version: pendingInfo?.version || "",
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    downloaded = true;
    sendProgress({
      percent: 100,
      version: info.version,
    });
  });

  autoUpdaterRef = autoUpdater;
  return autoUpdaterRef;
}

async function checkForUpdates({ startup = false } = {}) {
  if (isDevMode()) {
    startupCheckComplete = true;
    return;
  }
  const updater = loadAutoUpdater();
  if (!updater) {
    startupCheckComplete = true;
    return;
  }
  try {
    await updater.checkForUpdates();
  } catch (err) {
    console.error("[forma-updater] check failed:", err);
  } finally {
    if (startup || !startupCheckComplete) {
      startupCheckComplete = true;
    }
  }
}

async function runMockInstall(info) {
  sendProgress({ percent: 0, version: info.version });
  const steps = [15, 40, 65, 85, 100];
  for (const percent of steps) {
    await new Promise((r) => setTimeout(r, 350));
    sendProgress({ percent, version: info.version });
  }
  sendToRenderer("forma:update-installed", {
    version: info.version,
    dev: true,
  });
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    await dialog.showMessageBox(win, {
      type: "info",
      title: "Meetra — test mise à jour",
      message: `Mise à jour ${info.version} simulée (mode dev).`,
      detail: "En production, l'app redémarrerait maintenant.",
      buttons: ["OK"],
    });
  }
  return { ok: true, dev: true };
}

async function runInstallNow(info) {
  if (installing) return { ok: false, reason: "busy" };
  installing = true;

  if (isDevMode()) {
    clearPending();
    const result = await runMockInstall(info);
    installing = false;
    return result;
  }

  const updater = loadAutoUpdater();
  if (!updater) {
    installing = false;
    return { ok: false, reason: "no_updater" };
  }

  try {
    sendProgress({ percent: 0, version: info.version });
    if (!downloaded) {
      await updater.downloadUpdate();
    }
    clearPending();
    sendToRenderer("forma:update-installed", { version: info.version });
    updater.quitAndInstall(false, true);
    return { ok: true };
  } catch (err) {
    installing = false;
    console.error("[forma-updater] install failed:", err);
    return { ok: false, reason: "install_failed" };
  }
}

function scheduleTonight(info) {
  writeState({
    version: info.version,
    releaseNotes: info.releaseNotes ?? "",
    schedule: "tonight",
    chosenAt: Date.now(),
  });
  sendToRenderer("forma:update-scheduled-tonight", {
    version: info.version,
    window: `${NIGHT_START_HOUR}h–${NIGHT_END_HOUR}h`,
  });

  if (!isDevMode()) {
    const updater = loadAutoUpdater();
    if (updater && !downloaded) {
      void updater.downloadUpdate().catch((err) => {
        console.error("[forma-updater] pré-téléchargement échoué:", err);
      });
    }
  }

  return { ok: true };
}

async function tryTonightInstall() {
  const pending = readState();
  if (!pending || pending.schedule !== "tonight") return;
  if (!isNightWindow()) return;
  if (installing) return;

  const info = {
    version: pending.version,
    releaseNotes: pending.releaseNotes,
  };
  await runInstallNow(info);
}

function startScheduler() {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(() => {
    void tryTonightInstall();
  }, TONIGHT_TICK_MS);
}

function scheduleDevMockUpdate(delayMs = 4000) {
  const current = packageVersion();
  const next = bumpPatchVersion(current);
  setTimeout(() => {
    emitUpdateAvailable({
      version: next,
      releaseNotes: "Test auto-update — choisissez Maintenant ou Cette nuit (2h–5h).",
      currentVersion: current,
    });
  }, delayMs);
}

function initUpdater(options) {
  getMainWindow = options.getMainWindow;
  if (typeof options.getWindowMode === "function") {
    getWindowMode = options.getWindowMode;
  }
  startScheduler();

  const devMode = isDevMode();
  const shouldMock =
    devMode &&
    (process.env.FORMA_MOCK_UPDATE !== "0" || process.env.FORMA_TRIGGER_UPDATE === "1");

  if (shouldMock) {
    scheduleDevMockUpdate(
      process.env.FORMA_TRIGGER_UPDATE === "1" ? 1500 : 5000,
    );
  }

  if (devMode) {
    startupCheckComplete = true;
    console.info(
      "[forma-updater] mode dev — notification de test dans quelques secondes.",
    );
    return;
  }

  loadAutoUpdater();
  setTimeout(() => {
    void checkForUpdates({ startup: true });
  }, STARTUP_CHECK_DELAY_MS);
  if (!pollTimer) {
    pollTimer = setInterval(() => {
      void checkForUpdates();
    }, UPDATE_POLL_MS);
  }
}

async function handleInstallNow() {
  const info =
    pendingInfo ??
    (() => {
      const pending = readState();
      if (!pending) return null;
      return {
        version: pending.version,
        releaseNotes: pending.releaseNotes,
      };
    })();

  if (!info) {
    return { ok: false, reason: "no_update" };
  }
  return runInstallNow(info);
}

function handleScheduleTonight() {
  if (!pendingInfo) {
    return { ok: false, reason: "no_update" };
  }
  return scheduleTonight(pendingInfo);
}

function handleGetState() {
  const pending = readState();
  return {
    available: pendingInfo,
    pendingTonight: pending?.schedule === "tonight" ? pending : null,
    installing,
    nightWindow: `${NIGHT_START_HOUR}:00–${NIGHT_END_HOUR}:00`,
    isNightWindow: isNightWindow(),
    startupCheckComplete,
    progress: lastProgress,
  };
}

function handleTriggerMockUpdate() {
  const current = packageVersion();
  emitUpdateAvailable({
    version: bumpPatchVersion(current),
    releaseNotes: "Mise à jour de test déclenchée manuellement.",
    currentVersion: current,
  });
  return { ok: true };
}

module.exports = {
  initUpdater,
  handleInstallNow,
  handleScheduleTonight,
  handleGetState,
  handleTriggerMockUpdate,
  isNightWindow,
};
