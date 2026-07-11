/**
 * VMP-sign Electron Castlabs package (macOS: afterPack, before code-sign).
 * Requires: pip install castlabs-evs + EVS account (python3 -m castlabs_evs.account signup)
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const { execSync } = require("child_process");
  const appOutDir = context.appOutDir;
  console.log("[evs] VMP signing (streaming):", appOutDir);
  try {
    execSync(`python3 -m castlabs_evs.vmp sign-pkg "${appOutDir}"`, {
      stdio: "inherit",
      env: { ...process.env, EVS_NO_ASK: process.env.CI ? "1" : process.env.EVS_NO_ASK },
    });
    console.log("[evs] VMP signature OK");
  } catch (err) {
    console.error(
      "[evs] VMP signing failed. Crée un compte gratuit : python3 -m castlabs_evs.account signup\n" +
        "Puis : python3 -m castlabs_evs.vmp sign-pkg <appOutDir>\n",
      err instanceof Error ? err.message : err,
    );
    throw err;
  }
};
