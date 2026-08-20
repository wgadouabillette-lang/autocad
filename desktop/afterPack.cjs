/**
 * afterPack:
 * - macOS / Linux: VMP-sign Electron Castlabs (Widevine / Spotify)
 * - Windows: ensure Meetra icon is embedded in Meetra.exe before Authenticode
 *   (rcedit must see a BMP-format .ico — see scripts/generate-app-icon.py)
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { resolveEvsPython, signVmpPackage } = require("./evs-sign.cjs");

async function embedWindowsIcon(context) {
  const appOutDir = context.appOutDir;
  const productName = context.packager.appInfo.productFilename || "Meetra";
  const exePath = path.join(appOutDir, `${productName}.exe`);
  const iconPath = path.join(__dirname, "build", "icon.ico");

  if (!fs.existsSync(exePath)) {
    console.warn("[icon] Meetra.exe introuvable, skip rcedit:", exePath);
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

  console.log("[icon] Embedding Meetra icon into", exePath);
  await run(exePath, {
    icon: iconPath,
    "version-string": {
      ProductName: "Meetra",
      FileDescription: "Meetra",
      CompanyName: "Meetra",
      InternalName: "Meetra",
      OriginalFilename: `${productName}.exe`,
    },
  });
  console.log("[icon] Meetra.exe icon OK");
}

function stripArchSpecificVmpSignatures(appOutDir) {
  const appDir = fs.readdirSync(appOutDir).find((name) => name.endsWith(".app"));
  if (!appDir) return;
  const sigPath = path.join(
    appOutDir,
    appDir,
    "Contents",
    "Frameworks",
    "Electron Framework.framework",
    "Versions",
    "A",
    "Resources",
    "Electron Framework.sig",
  );
  if (fs.existsSync(sigPath)) {
    fs.unlinkSync(sigPath);
    console.log("[evs] removed arch-specific VMP sig for universal merge");
  }
}

function convertBinaryInfoPlistsToXml(rootDir) {
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      let st;
      try {
        st = fs.lstatSync(p);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      if (name !== "Info.plist" || !st.isFile()) continue;
      const fd = fs.openSync(p, "r");
      const magic = Buffer.alloc(8);
      fs.readSync(fd, magic, 0, 8, 0);
      fs.closeSync(fd);
      if (magic.toString("utf8") !== "bplist00") continue;
      execFileSync("plutil", ["-convert", "xml1", p], { stdio: "pipe" });
      console.log("[universal] converted binary Info.plist to XML");
    }
  };
  walk(rootDir);
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

  if (
    context.electronPlatformName !== "darwin" &&
    context.electronPlatformName !== "linux"
  ) {
    return;
  }

  const appOutDir = context.appOutDir;
  // Universal builds pack each arch into *-temp dirs first. VMP .sig files
  // differ per arch and break @electron/universal SHA checks — sign the
  // merged app only.
  if (/(?:^|[\\/])mac-universal-(?:x64|arm64)-temp(?:[\\/]|$)/.test(appOutDir)) {
    stripArchSpecificVmpSignatures(appOutDir);
    convertBinaryInfoPlistsToXml(appOutDir);
    console.log("[evs] skip VMP on universal arch temp:", appOutDir);
    return;
  }
  const evsPython = resolveEvsPython();
  console.log(
    `[evs] VMP signing ${context.electronPlatformName} (before packaging):`,
    appOutDir,
  );
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
