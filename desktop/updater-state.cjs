const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const STATE_FILE = "update-pending.json";

function statePath() {
  return path.join(app.getPath("userData"), STATE_FILE);
}

function readState() {
  try {
    const raw = fs.readFileSync(statePath(), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeState(state) {
  if (!state) {
    try {
      fs.unlinkSync(statePath());
    } catch {
      // ignore
    }
    return;
  }
  fs.mkdirSync(path.dirname(statePath()), { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2), "utf8");
}

module.exports = { readState, writeState };
