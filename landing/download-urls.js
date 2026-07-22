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

  global.HallDownloadUrls = {
    windows: storageDownloadUrl("Hall-windows.exe"),
    mac: storageDownloadUrl("Hall-mac.dmg"),
  };
})(typeof window !== "undefined" ? window : globalThis);
