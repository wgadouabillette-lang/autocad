/**
 * Preview-only: show the Meetra splash and stay there until the window is closed.
 * Usage: cd desktop && env -u ELECTRON_RUN_AS_NODE npx electron preview-splash.cjs
 */
const { app, BrowserWindow, screen } = require("electron");
const path = require("path");

const SIZE = { width: 250, height: 300 };

app.whenReady().then(() => {
  const work = screen.getPrimaryDisplay().workArea;
  const win = new BrowserWindow({
    width: SIZE.width,
    height: SIZE.height,
    x: Math.round(work.x + (work.width - SIZE.width) / 2),
    y: Math.round(work.y + (work.height - SIZE.height) / 2),
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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadFile(path.join(__dirname, "splash.html"), {
    query: { v: require("./package.json").version },
  });
  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
