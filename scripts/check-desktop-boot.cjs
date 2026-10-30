/**
 * Release guard: a desktop update must not be able to stick on the splash.
 * The splash window cannot install the next update, so a failed boot locks
 * every user on that build.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const preloadPath = path.join(root, "desktop", "preload.cjs");
const mainPath = path.join(root, "desktop", "main.cjs");

function fail(message) {
  console.error(`desktop boot guard: ${message}`);
  process.exit(1);
}

for (const file of [preloadPath, mainPath]) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

const preload = fs.readFileSync(preloadPath, "utf8");
const main = fs.readFileSync(mainPath, "utf8");

const bridgeCall = preload.indexOf("exposeDesktopBridge(desktopBridge)");
const documentAt = preload.search(/\bdocument\b/);
if (bridgeCall < 0) {
  fail("preload.cjs must install formaDesktop before any other work");
}
if (documentAt !== -1 && documentAt < bridgeCall) {
  fail(
    "preload.cjs touches the document before formaDesktop is installed. If that throws, the splash never closes.",
  );
}

for (const token of [
  "function forceRevealMainWindow",
  "function armLaunchWatchdog",
  "function ensureMainWindowShown",
]) {
  if (!main.includes(token)) fail(`main.cjs is missing ${token}`);
}

const handlerAt = main.indexOf('ipcMain.handle("forma:set-window-mode"');
if (handlerAt < 0) fail("forma:set-window-mode handler is missing");
const handler = main.slice(handlerAt, main.indexOf("ipcMain.handle", handlerAt + 20));
if (!handler.includes("markRendererAckedWindowMode")) {
  fail("forma:set-window-mode must cancel the launch watchdog");
}

console.log("desktop boot guard ok");
