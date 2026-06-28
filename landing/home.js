(function () {
  function t(key) {
    var locale = window.HallSitePrefs ? window.HallSitePrefs.getLocale() : "en";
    if (window.HallLandingI18n) return window.HallLandingI18n.t(key, locale);
    return key;
  }

  function refreshDownloadLabel(locale) {
    var downloadLink = document.getElementById("home-download");
    var downloadLabel = document.getElementById("home-download-label");
    if (!downloadLink || !downloadLabel) return;

    var ua = navigator.userAgent.toLowerCase();
    var platform = (navigator.platform || "").toLowerCase();
    var isWindows = ua.includes("windows") || platform.includes("win");
    var lang = locale === "fr" ? "fr" : "en";

    if (isWindows) {
      downloadLink.href = "/downloads/Hall-windows.exe";
      downloadLabel.textContent = window.HallLandingI18n
        ? window.HallLandingI18n.t("try.downloadWin", lang)
        : "Download for Windows";
      downloadLink.setAttribute(
        "aria-label",
        window.HallLandingI18n
          ? window.HallLandingI18n.t("try.downloadWinAria", lang)
          : "Download Hall for Windows",
      );
    } else {
      downloadLink.href = "/downloads/Hall-mac.dmg";
      downloadLabel.textContent = window.HallLandingI18n
        ? window.HallLandingI18n.t("try.downloadMac", lang)
        : "Download for macOS";
      downloadLink.setAttribute(
        "aria-label",
        window.HallLandingI18n
          ? window.HallLandingI18n.t("try.downloadMacAria", lang)
          : "Download Hall for macOS",
      );
    }
  }

  window.HallHomePage = {
    refreshDownloadLabel: refreshDownloadLabel,
  };

  var grid = document.getElementById("highlights-grid");
  var moreBtn = document.getElementById("highlights-more");
  if (grid && moreBtn) {
    var moreLabel = moreBtn.querySelector(".home-highlights__more-label");
    moreBtn.addEventListener("click", function () {
      var expanded = grid.classList.toggle("is-expanded");
      moreBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
      if (moreLabel) {
        moreLabel.textContent = t(expanded ? "highlights.less" : "highlights.more");
      }
    });
  }

  refreshDownloadLabel(window.HallSitePrefs ? window.HallSitePrefs.getLocale() : "en");
  document.addEventListener("lyte-landing:locale", function (event) {
    refreshDownloadLabel(event.detail && event.detail.locale ? event.detail.locale : "en");
  });
})();
