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
    windows: storageDownloadUrl("Meetra.exe"),
    mac: storageDownloadUrl("Hall-mac.dmg"),
    linux: storageDownloadUrl("Meetra-linux.AppImage"),
  };

  global.HallDownloadUrls = urls;

  var DESKTOP_VIEWPORT_QUERY = "(min-width: 768px)";

  global.HallIsDesktopDownload = function HallIsDesktopDownload() {
    return Boolean(
      global.matchMedia && global.matchMedia(DESKTOP_VIEWPORT_QUERY).matches,
    );
  };

  global.HallUnavailableLabel = function HallUnavailableLabel() {
    if (global.HallLandingI18n) {
      var locale = global.HallSitePrefs ? global.HallSitePrefs.getLocale() : "en";
      return global.HallLandingI18n.t("nav.downloadUnavailable", locale);
    }
    return "Unavailable on mobile";
  };

  global.HallUnavailableIcon = function HallUnavailableIcon(className) {
    return (
      '<svg class="' +
      (className || "") +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="10" />' +
      '<path d="m15 9-6 6" />' +
      '<path d="m9 9 6 6" />' +
      "</svg>"
    );
  };

  global.HallDownloadArrowIcon = function HallDownloadArrowIcon(className) {
    return (
      '<svg class="' +
      (className || "hero__cta-icon") +
      '" aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="5" y1="12" x2="19" y2="12" />' +
      '<polyline points="12 5 19 12 12 19" />' +
      "</svg>"
    );
  };

  if (global.matchMedia) {
    var desktopMq = global.matchMedia(DESKTOP_VIEWPORT_QUERY);
    var notifyViewport = function () {
      global.dispatchEvent(new CustomEvent("lyte-landing:viewport"));
    };
    if (desktopMq.addEventListener) {
      desktopMq.addEventListener("change", notifyViewport);
    } else if (desktopMq.addListener) {
      desktopMq.addListener(notifyViewport);
    }
  }

  global.HallDownloadTarget = function HallDownloadTarget() {
    var platform = clientPlatform();
    if (platform === "windows") {
      return {
        href: urls.windows,
        labelKey: "try.downloadWin",
        ariaKey: "try.downloadWinAria",
        fallbackLabel: "Download for Windows",
        fallbackAria: "Download Meetra for Windows",
        platform: "windows",
      };
    }
    if (platform === "linux") {
      return {
        href: urls.linux,
        labelKey: "try.downloadLinux",
        ariaKey: "try.downloadLinuxAria",
        fallbackLabel: "Download for Linux",
        fallbackAria: "Download Meetra for Linux",
        platform: "linux",
      };
    }
    return {
      href: urls.mac,
      labelKey: "try.downloadMac",
      ariaKey: "try.downloadMacAria",
      fallbackLabel: "Download for macOS",
      fallbackAria: "Download Meetra for macOS",
      platform: "mac",
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
