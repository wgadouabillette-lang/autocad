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

  /** Black platform mark for the hero download capsule (uses currentColor). */
  global.HallDownloadPlatformIcon = function HallDownloadPlatformIcon(
    platform,
    className,
  ) {
    var cls = className || "hero__cta-platform-icon";
    var path;
    if (platform === "windows") {
      path =
        '<path fill="currentColor" d="M3 5.25h8.25V12H3V5.25zm9.75 0H21V12h-8.25V5.25zM3 13.5h8.25v5.25H3V13.5zm9.75 0H21v5.25h-8.25V13.5z"/>';
    } else if (platform === "linux") {
      path =
        '<path fill="currentColor" d="M12 2.2c-1.85 0-3.2 1.55-2.95 3.35-.85.25-1.5.95-1.75 1.8C5.7 9.1 5.15 11.2 5.35 13.4c.2 2.35 1.45 3.95 3.15 4.55L8 21.2h1.9l.45-1.85h3.3l.45 1.85H16l-.5-3.25c1.7-.6 2.95-2.2 3.15-4.55.2-2.2-.35-4.3-1.95-5.55-.25-.85-.9-1.55-1.75-1.8C15.2 3.75 13.85 2.2 12 2.2zm-1.35 3.9c.4 0 .75.35.75.8s-.35.8-.75.8-.75-.35-.75-.8.35-.8.75-.8zm2.7 0c.4 0 .75.35.75.8s-.35.8-.75.8-.75-.35-.75-.8.35-.8.75-.8zM9.7 11.1c.7 1.05 1.55 1.6 2.3 1.6s1.6-.55 2.3-1.6c.15 1.35-.55 2.7-2.3 2.7s-2.45-1.35-2.3-2.7z"/>';
    } else {
      // macOS / Apple
      path =
        '<path fill="currentColor" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.27 4.7 9.15c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.01 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>';
    }
    return (
      '<svg class="' +
      cls +
      '" aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" focusable="false">' +
      path +
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
