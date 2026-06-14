const { app, dialog } = require("electron");
const path = require("path");
const { readState, writeState } = require("./updater-state.cjs");

const NIGHT_START_HOUR = 2;
const NIGHT_END_HOUR = 5;
const CHECK_INTERVAL_MS = 60_000;

let getMainWindow = () => null;
let schedulerTimer = null;
let mockAvailable = null;
let installing = false;

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

function sendToRenderer(channel, payload) {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

function emitUpdateAvailable(info) {
  mockAvailable = info;
  sendToRenderer("forma:update-available", info);
}

function clearPending() {
  mockAvailable = null;
  writeState(null);
}

async function runInstallNow(info) {
  if (installing) return { ok: false, reason: "busy" };
  installing = true;
  clearPending();

  sendToRenderer("forma:update-progress", { percent: 0, version: info.version });

  const steps = [15, 40, 65, 85, 100];
  for (const percent of steps) {
    await new Promise((r) => setTimeout(r, 350));
    sendToRenderer("forma:update-progress", { percent, version: info.version });
  }

  installing = false;

  if (process.env.FORMA_DEV_URL) {
    sendToRenderer("forma:update-installed", {
      version: info.version,
      dev: true,
    });
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      await dialog.showMessageBox(win, {
        type: "info",
        title: "Lyte — test mise à jour",
        message: `Mise à jour ${info.version} simulée (mode dev).`,
        detail: "En production, l'app redémarrerait maintenant.",
        buttons: ["OK"],
      });
    }
    return { ok: true, dev: true };
  }

  sendToRenderer("forma:update-installed", { version: info.version });
  app.relaunch();
  app.exit(0);
  return { ok: true };
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
  }, CHECK_INTERVAL_MS);
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
  startScheduler();

  const devMode = Boolean(process.env.FORMA_DEV_URL);
  const shouldMock =
    devMode &&
    (process.env.FORMA_MOCK_UPDATE !== "0" || process.env.FORMA_TRIGGER_UPDATE === "1");

  if (shouldMock) {
    scheduleDevMockUpdate(
      process.env.FORMA_TRIGGER_UPDATE === "1" ? 1500 : 5000,
    );
  }

  if (devMode) {
    console.info(
      "[forma-updater] dev mock actif — notification de test dans quelques secondes.",
    );
  }
}

async function handleInstallNow() {
  const info =
    mockAvailable ??
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
  if (!mockAvailable) {
    return { ok: false, reason: "no_update" };
  }
  return scheduleTonight(mockAvailable);
}

function handleGetState() {
  const pending = readState();
  return {
    available: mockAvailable,
    pendingTonight: pending?.schedule === "tonight" ? pending : null,
    installing,
    nightWindow: `${NIGHT_START_HOUR}:00–${NIGHT_END_HOUR}:00`,
    isNightWindow: isNightWindow(),
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
