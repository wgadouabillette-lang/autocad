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

  function isWindowsClient() {
    var ua = (navigator.userAgent || "").toLowerCase();
    var platform = (navigator.platform || "").toLowerCase();
    var uaDataPlatform =
      navigator.userAgentData && navigator.userAgentData.platform
        ? String(navigator.userAgentData.platform).toLowerCase()
        : "";
    return (
      ua.includes("windows") ||
      platform.includes("win") ||
      uaDataPlatform.includes("win")
    );
  }

  var urls = {
    windows: storageDownloadUrl("Hall-windows.exe"),
    mac: storageDownloadUrl("Hall-mac.dmg"),
  };

  global.HallDownloadUrls = urls;

  global.HallDownloadTarget = function HallDownloadTarget() {
    if (isWindowsClient()) {
      return {
        href: urls.windows,
        labelKey: "try.downloadWin",
        ariaKey: "try.downloadWinAria",
        fallbackLabel: "Download for Windows",
        fallbackAria: "Download Hall for Windows",
        platform: "windows",
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
