/**
 * Installers are hosted on Firebase Storage (too large for Netlify/Hosting).
 * Keep relative /downloads/* paths as fallbacks via hosting redirects.
 */
(function (global) {
  var BUCKET = "forma-cad-dev.firebasestorage.app";

  function storageDownloadUrl(fileName) {
    return (
      "https://firebasestorage.googleapis.com/v0/b/" +
      BUCKET +
      "/o/downloads%2F" +
      encodeURIComponent(fileName) +
      "?alt=media"
    );
  }

  function clientPlatform() {
    var ua = (navigator.userAgent || "").toLowerCase();
    var platform = (navigator.platform || "").toLowerCase();
    var uaDataPlatform =
      navigator.userAgentData && navigator.userAgentData.platform
        ? String(navigator.userAgentData.platform).toLowerCase()
        : "";
    if (
      ua.includes("windows") ||
      platform.includes("win") ||
      uaDataPlatform.includes("win")
    ) {
      return "windows";
    }
    if (
      ua.includes("linux") ||
      platform.includes("linux") ||
      uaDataPlatform.includes("linux") ||
      ua.includes("x11") ||
      ua.includes("cros")
    ) {
      return "linux";
    }
    return "mac";
  }

  var urls = {
    windows: storageDownloadUrl("Hall.exe"),
    mac: storageDownloadUrl("Hall-mac.dmg"),
    linux: storageDownloadUrl("Hall-linux.AppImage"),
  };

  global.HallDownloadUrls = urls;

  global.HallDownloadTarget = function HallDownloadTarget() {
    var platform = clientPlatform();
    if (platform === "windows") {
      return {
        href: urls.windows,
        labelKey: "try.downloadWin",
        ariaKey: "try.downloadWinAria",
        fallbackLabel: "Download for Windows",
        fallbackAria: "Download Hall for Windows",
        platform: "windows",
      };
    }
    if (platform === "linux") {
      return {
        href: urls.linux,
        labelKey: "try.downloadLinux",
        ariaKey: "try.downloadLinuxAria",
        fallbackLabel: "Download for Linux",
        fallbackAria: "Download Hall for Linux",
        platform: "linux",
      };
    }
    return {
      href: urls.mac,
      labelKey: "try.downloadMac",
      ariaKey: "try.downloadMacAria",
      fallbackLabel: "Download for macOS",
      fallbackAria: "Download Hall for macOS",
      platform: "mac",
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
