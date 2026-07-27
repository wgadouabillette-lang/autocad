/**
 * afterPack:
 * - macOS: VMP-sign Electron Castlabs (before code-sign)
 * - Windows: ensure Hall icon is embedded in Hall.exe before Authenticode
 *   (rcedit must see a BMP-format .ico — see scripts/generate-app-icon.py)
 */
const fs = require("fs");
const path = require("path");
const { resolveEvsPython, signVmpPackage } = require("./evs-sign.cjs");

async function embedWindowsIcon(context) {
  const appOutDir = context.appOutDir;
  const productName = context.packager.appInfo.productFilename || "Hall";
  const exePath = path.join(appOutDir, `${productName}.exe`);
  const iconPath = path.join(__dirname, "build", "icon.ico");

  if (!fs.existsSync(exePath)) {
    console.warn("[icon] Hall.exe introuvable, skip rcedit:", exePath);
    return;
  }
  if (!fs.existsSync(iconPath)) {
    console.warn("[icon] build/icon.ico introuvable, skip rcedit:", iconPath);
    return;
  }

  let run;
  try {
    run = require("rcedit");
  } catch {
    console.warn("[icon] rcedit non installé — signAndEditExecutable doit rester true.");
    return;
  }
  if (typeof run !== "function") {
    console.warn("[icon] API rcedit inattendue");
    return;
  }

  console.log("[icon] Embedding Hall icon into", exePath);
  await run(exePath, {
    icon: iconPath,
    "version-string": {
      ProductName: "Hall",
      FileDescription: "Hall",
      CompanyName: "Hall",
      InternalName: "Hall",
      OriginalFilename: `${productName}.exe`,
    },
  });
  console.log("[icon] Hall.exe icon OK");
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName === "win32") {
    try {
      await embedWindowsIcon(context);
    } catch (err) {
      console.error(
        "[icon] Impossible d'injecter l'icône Windows:",
        err instanceof Error ? err.message : err,
      );
      throw err;
    }
    return;
  }

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
