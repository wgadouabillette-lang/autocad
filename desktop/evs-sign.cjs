const path = require("path");
const { execSync } = require("child_process");

function resolveEvsPython() {
  const root = path.join(__dirname, "..");
  const candidates =
    process.platform === "win32"
      ? [
          path.join(root, "backend", ".venv", "Scripts", "python.exe"),
          path.join(__dirname, "build-resources", "backend-venv", "Scripts", "python.exe"),
          "python",
        ]
      : [
          path.join(root, "backend", ".venv", "bin", "python"),
          path.join(__dirname, "build-resources", "backend-venv", "bin", "python"),
          "python3",
        ];

  for (const candidate of candidates) {
    try {
      execSync(`"${candidate}" -c "import castlabs_evs"`, { stdio: "ignore" });
      return candidate;
    } catch {
      // try next candidate
    }
  }

  return process.platform === "win32" ? "python" : "python3";
}

function evsEnv() {
  return {
    ...process.env,
    EVS_NO_ASK: process.env.CI ? "1" : process.env.EVS_NO_ASK,
  };
}

function signVmpPackage(appOutDir, evsPython = resolveEvsPython()) {
  execSync(`"${evsPython}" -m castlabs_evs.vmp sign-pkg "${appOutDir}"`, {
    stdio: "inherit",
    env: evsEnv(),
  });
}

module.exports = { resolveEvsPython, signVmpPackage, evsEnv };
