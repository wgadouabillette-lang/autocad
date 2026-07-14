/**
 * VMP-sign Electron Castlabs package on macOS (before code-sign).
 * Requires: pip install castlabs-evs + EVS account (python3 -m castlabs_evs.account signup)
 */
const { resolveEvsPython, signVmpPackage } = require("./evs-sign.cjs");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appOutDir = context.appOutDir;
  const evsPython = resolveEvsPython();
  console.log("[evs] VMP signing macOS (before code-sign):", appOutDir);
  try {
    signVmpPackage(appOutDir, evsPython);
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
