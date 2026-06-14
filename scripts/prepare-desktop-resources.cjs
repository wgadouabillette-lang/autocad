#!/usr/bin/env node
/**
 * Prépare frontend/dist + backend + venv portable pour electron-builder.
 * Usage: node scripts/prepare-desktop-resources.cjs
 */
const { spawnSync, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "desktop", "build-resources");
const frontendDist = path.join(root, "frontend", "dist");
const backendSrc = path.join(root, "backend");
const venvOut = path.join(out, "backend-venv");
const backendOut = path.join(out, "backend");
const frontendOut = path.join(out, "frontend-dist");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest, skip = []) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (skip.includes(name)) continue;
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d, skip);
    else fs.copyFileSync(s, d);
  }
}

console.log("→ Build frontend…");
run("npm", ["run", "build"], { cwd: path.join(root, "frontend") });

if (!fs.existsSync(frontendDist)) {
  console.error("frontend/dist introuvable");
  process.exit(1);
}

console.log("→ Préparation build-resources…");
rmrf(out);
fs.mkdirSync(out, { recursive: true });

console.log("→ Copie frontend…");
copyDir(frontendDist, frontendOut);

console.log("→ Copie backend (sans .venv)…");
copyDir(backendSrc, backendOut, [".venv", "__pycache__", ".pytest_cache"]);

const firebaseSecretSrc = path.join(root, "desktop", "secrets", "firebase-adminsdk.json");
const firebaseSecretOut = path.join(backendOut, "firebase-adminsdk.json");
if (fs.existsSync(firebaseSecretSrc)) {
  fs.copyFileSync(firebaseSecretSrc, firebaseSecretOut);
  console.log("→ Firebase Admin SDK copié dans le backend embarqué.");
} else {
  console.log(
    "→ Firebase Admin SDK absent (optionnel). Les clés LLM cloud passent par Cloud Functions ; ajoutez desktop/secrets/firebase-adminsdk.json pour le backend embarqué.",
  );
}

console.log("→ Création venv portable pour l'app…");

function resolveBasePython() {
  if (process.platform === "win32") {
    const devWin = path.join(backendSrc, ".venv", "Scripts", "python.exe");
    if (fs.existsSync(devWin)) return devWin;
    return "python";
  }
  const candidates = ["/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3", "python3"];
  for (const candidate of candidates) {
    if (candidate.includes("/") && fs.existsSync(candidate)) return candidate;
  }
  return "python3";
}

const py = resolveBasePython();

function createPortableVenv() {
  const strategies =
    process.platform === "darwin"
      ? [["-m", "venv", venvOut], ["-m", "venv", "--copies", venvOut]]
      : [
          ["-m", "venv", venvOut],
          ["-m", "venv", "--copies", venvOut],
        ];
  for (const args of strategies) {
    rmrf(venvOut);
    const result = spawnSync(py, args, { stdio: "inherit" });
    if (result.status === 0) return;
  }
  console.error("Impossible de créer le venv portable.");
  process.exit(1);
}

createPortableVenv();

const pip =
  process.platform === "win32"
    ? path.join(venvOut, "Scripts", "pip.exe")
    : path.join(venvOut, "bin", "pip");
const python =
  process.platform === "win32"
    ? path.join(venvOut, "Scripts", "python.exe")
    : path.join(venvOut, "bin", "python");

run(python, ["-m", "pip", "install", "--upgrade", "pip"]);
run(python, ["-m", "pip", "install", "-r", path.join(backendOut, "requirements.txt")]);

function materializeSymlinks(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(full);
      const resolved = path.isAbsolute(target)
        ? target
        : path.resolve(path.dirname(full), target);
      fs.rmSync(full);
      if (fs.existsSync(resolved)) {
        const resolvedStat = fs.statSync(resolved);
        if (resolvedStat.isDirectory()) copyDir(resolved, full);
        else {
          fs.copyFileSync(resolved, full);
          fs.chmodSync(full, resolvedStat.mode);
        }
      }
      continue;
    }
    if (stat.isDirectory()) materializeSymlinks(full);
  }
}

console.log("→ Résolution des liens symboliques du venv…");
materializeSymlinks(venvOut);

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

function ensureDarwinPythonRuntime(venvDir) {
  if (process.platform !== "darwin") return;

  const cfgPath = path.join(venvDir, "pyvenv.cfg");
  if (!fs.existsSync(cfgPath)) return;
  const cfg = fs.readFileSync(cfgPath, "utf8");
  const homeMatch = cfg.match(/^home\s*=\s*(.+)$/m);
  const versionMatch = cfg.match(/^version\s*=\s*([0-9]+\.[0-9]+)/m);
  const version = versionMatch ? versionMatch[1].trim() : "3.9";
  const home = homeMatch ? homeMatch[1].trim() : "";

  const frameworkRoot = path.resolve(
    home,
    "..",
    "..",
    "Library",
    "Frameworks",
    "Python3.framework",
    "Versions",
    version,
  );
  const fallbackFrameworkRoot = `/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/${version}`;
  const roots = [frameworkRoot, fallbackFrameworkRoot].filter((root) => fs.existsSync(root));

  for (const root of roots) {
    const runtimeSrc = path.join(root, "lib", `libpython${version}.dylib`);
    const resourcesSrc = path.join(root, "Resources");
    const runtimeDest = path.join(venvDir, "Python3");
    const resourcesDest = path.join(venvDir, "Resources");

    if (fs.existsSync(runtimeSrc)) {
      fs.copyFileSync(runtimeSrc, runtimeDest);
      fs.chmodSync(runtimeDest, 0o755);
    }
    if (fs.existsSync(resourcesSrc) && !fs.existsSync(resourcesDest)) {
      copyDirSync(resourcesSrc, resourcesDest);
    }

    if (fs.existsSync(runtimeDest) && fs.existsSync(resourcesDest)) {
      console.log("→ Runtime Python3 + Resources embarqués dans le venv portable.");
      return;
    }
  }

  console.warn("Warning: Python3 runtime not found — portable venv may be invalid.");
}

ensureDarwinPythonRuntime(venvOut);

console.log("→ Vérification backend…");
run(python, ["-c", "import uvicorn; from app.main import app"], {
  cwd: backendOut,
  env: { ...process.env, PYTHONPATH: backendOut },
});

console.log("Desktop resources ready in desktop/build-resources/");
