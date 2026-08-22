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
  const shell =
    opts.shell ??
    (process.platform === "win32" && !/[\\/]/.test(cmd) && !cmd.toLowerCase().endsWith(".exe"));
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    shell,
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

if (process.env.FORMA_PROD_BUILD === "1") {
  process.env.VITE_FORMA_WEB_AUTH_URL =
    process.env.VITE_FORMA_WEB_AUTH_URL?.trim() || "https://meetra.cc/app/auth.html";
  process.env.VITE_FORMA_API_URL =
    process.env.VITE_FORMA_API_URL?.trim() || "https://meetra.cc";
  console.log("→ Production desktop web auth:", process.env.VITE_FORMA_WEB_AUTH_URL);
  console.log("→ Production desktop API:", process.env.VITE_FORMA_API_URL);
}

console.log("→ Build frontend…");
run("npm", ["run", "build"], {
  cwd: path.join(root, "frontend"),
  env: { ...process.env },
});

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

function writePackagedBackendEnv() {
  // Not named `.env`: electron-builder + gitignore `.env*` strip that file from extraResources.
  const dest = path.join(backendOut, "forma-backend.env");
  const fromSecret = (process.env.FORMA_BACKEND_ENV || "").replace(/\r\n/g, "\n").trim();
  if (fromSecret) {
    fs.writeFileSync(dest, fromSecret.endsWith("\n") ? fromSecret : `${fromSecret}\n`);
    console.log("→ backend/forma-backend.env embarqué (secrets de build).");
    return;
  }
  const localEnv = path.join(backendSrc, ".env");
  if (fs.existsSync(localEnv)) {
    fs.copyFileSync(localEnv, dest);
    console.log("→ backend/.env local copié vers forma-backend.env.");
  } else {
    console.warn(
      "→ forma-backend.env absent — paiements et OAuth connecteurs seront indisponibles dans ce build.",
    );
  }
}
writePackagedBackendEnv();

console.log("→ Création runtime Python portable pour l'app…");

function resolveBasePython() {
  if (process.platform === "win32") {
    const devWin = path.join(backendSrc, ".venv", "Scripts", "python.exe");
    if (fs.existsSync(devWin)) return devWin;
    return "python";
  }
  // Prefer the project venv (known-good), then versioned interpreters ≤3.13.
  // Bare `python3` on Homebrew is often 3.14+, which breaks pydantic-core / PyO3.
  const candidates = [
    "/usr/bin/python3",
    path.join(backendSrc, ".venv", "bin", "python"),
    "/opt/homebrew/bin/python3.13",
    "/opt/homebrew/bin/python3.12",
    "/opt/homebrew/bin/python3.11",
    "/opt/homebrew/bin/python3.10",
    "/opt/homebrew/bin/python3.9",
    "/usr/local/bin/python3.13",
    "/usr/local/bin/python3.12",
    "/usr/local/bin/python3.11",
    "/usr/local/bin/python3.10",
  ];
  for (const candidate of candidates) {
    if (candidate.includes("/") && fs.existsSync(candidate)) return candidate;
  }
  return "python3";
}

function resolveBasePrefix(pythonExe) {
  const result = spawnSync(
    pythonExe,
    ["-c", "import sys; print(sys.base_prefix)"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.error("Impossible de résoudre sys.base_prefix:", result.stderr || result.error);
    process.exit(1);
  }
  const prefix = (result.stdout || "").trim();
  if (!prefix || !fs.existsSync(prefix)) {
    console.error("base_prefix introuvable:", prefix);
    process.exit(1);
  }
  return prefix;
}

const py = resolveBasePython();
const pyVersion = spawnSync(py, ["-c", "import sys; print('%d.%d' % sys.version_info[:2])"], {
  encoding: "utf8",
});
const pyVer = (pyVersion.stdout || "").trim();
console.log(`→ Python de base : ${py} (${pyVer || "?"})`);
if (/^3\.(1[4-9]|[2-9]\d)$/.test(pyVer)) {
  console.error(
    `Python ${pyVer} est trop récent pour le build desktop (PyO3 / pydantic-core).\n` +
      "Utilisez le venv backend (3.9–3.13) ou installez python@3.12 via Homebrew.",
  );
  process.exit(1);
}

function copyDirSync(src, dest, skip = []) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (skip.includes(name)) continue;
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = fs.lstatSync(s);
    if (st.isSymbolicLink()) {
      const target = fs.readlinkSync(s);
      const resolved = path.isAbsolute(target) ? target : path.resolve(path.dirname(s), target);
      if (!fs.existsSync(resolved)) continue;
      const resolvedStat = fs.statSync(resolved);
      if (resolvedStat.isDirectory()) copyDirSync(resolved, d, skip);
      else {
        fs.copyFileSync(resolved, d);
        fs.chmodSync(d, resolvedStat.mode);
      }
      continue;
    }
    if (st.isDirectory()) copyDirSync(s, d, skip);
    else fs.copyFileSync(s, d);
  }
}

/** Windows venvs are not relocatable (pyvenv.cfg home → build machine). Copy the full prefix. */
function createWindowsPortablePython() {
  const basePrefix = resolveBasePrefix(py);
  console.log(`→ Copie du runtime Python Windows depuis ${basePrefix}…`);
  rmrf(venvOut);
  copyDirSync(basePrefix, venvOut, [
    "Doc",
    "docs",
    "include",
    "libs",
    "tcl",
    "Tools",
    "share",
    "__pycache__",
  ]);
  const rootPy = path.join(venvOut, "python.exe");
  if (!fs.existsSync(rootPy)) {
    console.error("python.exe manquant après copie du runtime Windows.");
    process.exit(1);
  }
  const cfgPath = path.join(venvOut, "pyvenv.cfg");
  if (fs.existsSync(cfgPath)) {
    fs.unlinkSync(cfgPath);
    console.log("→ pyvenv.cfg retiré (runtime Windows autonome).");
  }
}

function createUnixPortableVenv() {
  const strategies = [
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

if (process.platform === "win32") {
  createWindowsPortablePython();
} else {
  createUnixPortableVenv();
}

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

console.log("→ Résolution des liens symboliques du runtime…");
materializeSymlinks(venvOut);

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
    // Apple CLT python looks for @executable_path/../Python3 (framework binary).
    const runtimeCandidates = [
      path.join(root, "Python3"),
      path.join(root, "lib", `libpython${version}.dylib`),
    ];
    const resourcesSrc = path.join(root, "Resources");
    const runtimeDest = path.join(venvDir, "Python3");
    const resourcesDest = path.join(venvDir, "Resources");

    for (const runtimeSrc of runtimeCandidates) {
      if (!fs.existsSync(runtimeSrc)) continue;
      fs.copyFileSync(runtimeSrc, runtimeDest);
      fs.chmodSync(runtimeDest, 0o755);
      break;
    }
    if (fs.existsSync(resourcesSrc) && !fs.existsSync(resourcesDest)) {
      copyDirSync(resourcesSrc, resourcesDest);
    }

    if (fs.existsSync(runtimeDest)) {
      console.log("→ Runtime Python3 + Resources embarqués dans le venv portable.");
      return;
    }
  }

  console.warn("Warning: Python3 runtime not found — portable venv may be invalid.");
}

// Must run before pip: Apple CLT python looks for @executable_path/../Python3.
ensureDarwinPythonRuntime(venvOut);

const python =
  process.platform === "win32"
    ? path.join(venvOut, "python.exe")
    : path.join(venvOut, "bin", "python");

run(python, ["-m", "pip", "install", "--upgrade", "pip"]);
run(python, ["-m", "pip", "install", "-r", path.join(backendOut, "requirements.txt")]);
run(python, ["-m", "pip", "install", "-r", path.join(backendOut, "requirements-cad.txt")]);

console.log("→ Vérification backend…");
run(python, ["-c", "import uvicorn; from app.main import app"], {
  cwd: backendOut,
  env: {
    ...process.env,
    PYTHONPATH: backendOut,
    ...(process.platform === "win32" ? { PYTHONHOME: venvOut } : {}),
  },
});

console.log("Desktop resources ready in desktop/build-resources/");
