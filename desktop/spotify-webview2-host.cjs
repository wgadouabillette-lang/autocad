/**
 * Processus enfant Windows : WebView2 (Edge) + Spotify Web Playback SDK.
 * Lancé par Electron avec ELECTRON_RUN_AS_NODE=1.
 */
const fs = require("fs");
const path = require("path");
const readline = require("readline");

function writeLine(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

let ewvjs;
try {
  ewvjs = require("ewvjs");
} catch (err) {
  writeLine({ event: "fatal", message: `ewvjs indisponible: ${err instanceof Error ? err.message : err}` });
  process.exit(1);
}

const { create_window, expose, start } = ewvjs;

const playerDir = path.join(__dirname, "spotify-webview2");
const playerHtml = path.join(playerDir, "player.html");

if (!fs.existsSync(playerHtml)) {
  writeLine({ event: "fatal", message: `player.html introuvable: ${playerHtml}` });
  process.exit(1);
}

/** @type {import("ewvjs").Window | null} */
let win = null;
/** @type {Map<string, { resolve: (v: string) => void, reject: (e: Error) => void, timer: NodeJS.Timeout }>} */
const pendingTokens = new Map();
let commandChain = Promise.resolve();

let pageReadyResolve;
const pageReadyPromise = new Promise((resolve) => {
  pageReadyResolve = resolve;
});

function handlePlayerEvent(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.event) writeLine(msg);
}

expose("fetchToken", () => {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingTokens.delete(id);
      reject(new Error("Token Spotify timeout."));
    }, 12_000);
    pendingTokens.set(id, { resolve, reject, timer });
    writeLine({ event: "token-request", id });
  });
});

expose("postMessage", (msg) => {
  handlePlayerEvent(msg);
  if (msg?.event === "page-ready") pageReadyResolve?.();
  return true;
});

function waitForPageReady() {
  return Promise.race([
    pageReadyPromise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Page Spotify timeout.")), 20_000);
    }),
  ]);
}

function enqueue(fn) {
  commandChain = commandChain.then(fn).catch((err) => {
    writeLine({ event: "error", message: err instanceof Error ? err.message : String(err) });
  });
  return commandChain;
}

async function evaluate(method, ...args) {
  if (!win) throw new Error("Fenêtre WebView2 non prête.");
  const encodedArgs = args.map((arg) => JSON.stringify(arg)).join(", ");
  return win.evaluate(`window.hallSpotifyPlayer.${method}(${encodedArgs})`);
}

function handleCommand(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  if (msg.cmd === "token" && typeof msg.id === "string") {
    const pending = pendingTokens.get(msg.id);
    if (pending) {
      clearTimeout(pending.timer);
      pendingTokens.delete(msg.id);
      pending.resolve(typeof msg.value === "string" ? msg.value : "");
    }
    return;
  }

  if (msg.cmd === "shutdown") {
    void enqueue(async () => {
      try {
        await evaluate("reset");
      } catch {
        // ignore
      }
      try {
        win?.close();
      } catch {
        // ignore
      }
      process.exit(0);
    });
    return;
  }

  void enqueue(async () => {
    const commandId = typeof msg.id === "string" ? msg.id : null;
    try {
      switch (msg.cmd) {
        case "warm":
          await evaluate("warm");
          break;
        case "play":
          await evaluate("play", msg.trackId);
          break;
        case "pause":
          await evaluate("pause");
          break;
        case "resume":
          await evaluate("resume");
          break;
        case "toggle":
          await evaluate("toggle");
          break;
        case "getPosition":
          writeLine({ event: "position", sec: await evaluate("getPositionSec") });
          break;
        case "reset":
          await evaluate("reset");
          break;
        default:
          break;
      }
      if (commandId) writeLine({ event: "cmd-result", id: commandId, ok: true });
    } catch (err) {
      if (commandId) {
        writeLine({
          event: "cmd-result",
          id: commandId,
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        });
      } else {
        throw err;
      }
    }
  });
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", handleCommand);

process.stdin.on("close", () => {
  try {
    win?.close();
  } catch {
    // ignore
  }
  process.exit(0);
});

win = create_window("Hall Spotify", playerHtml, {
  width: 480,
  height: 320,
  hidden: true,
  focus: false,
  session: {
    persist: true,
    path: path.join(
      process.env.FORMA_SPOTIFY_WEBVIEW2_DATA || path.join(__dirname, ".spotify-webview2-data"),
    ),
  },
});

win.on_close = () => {
  writeLine({ event: "closed" });
  process.exit(0);
};

win.run();

void waitForPageReady()
  .then(() => writeLine({ event: "host-ready" }))
  .catch((err) => {
    writeLine({ event: "fatal", message: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });

start();
