/**
 * VMP-sign Electron Castlabs package on Windows (afterPack on macOS).
 * Windows: VMP must run AFTER Authenticode signing — see Castlabs EVS wiki.
 */
const { resolveEvsPython, signVmpPackage } = require("./evs-sign.cjs");

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== "win32") return;

  const appOutDir = context.appOutDir;
  const evsPython = resolveEvsPython();
  console.log("[evs] VMP signing Windows (after Authenticode):", appOutDir);
  try {
    signVmpPackage(appOutDir, evsPython);
    console.log("[evs] VMP signature OK");
  } catch (err) {
    console.error(
      "[evs] VMP signing failed. Install castlabs-evs and configure an EVS account:\n" +
        "  pip install castlabs-evs\n" +
        "  python -m castlabs_evs.account signup\n",
      err instanceof Error ? err.message : err,
    );
    throw err;
  }
};
