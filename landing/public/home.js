(function () {
  var MOBILE_HIGHLIGHTS_MQ = window.matchMedia("(max-width: 767px)");

  function t(key) {
    var locale = window.HallSitePrefs ? window.HallSitePrefs.getLocale() : "en";
    if (window.HallLandingI18n) return window.HallLandingI18n.t(key, locale);
    return key;
  }

  function configureDownloadLink(link, labelEl, locale) {
    if (!link || !labelEl) return;

    var ua = navigator.userAgent.toLowerCase();
    var platform = (navigator.platform || "").toLowerCase();
    var isWindows = ua.includes("windows") || platform.includes("win");
    var lang = locale === "fr" ? "fr" : "en";

    var urls = window.HallDownloadUrls || {};
    if (isWindows) {
      link.href = urls.windows || "/downloads/Hall-windows.exe";
      labelEl.textContent = window.HallLandingI18n
        ? window.HallLandingI18n.t("try.downloadWin", lang)
        : "Download for Windows";
      link.setAttribute(
        "aria-label",
        window.HallLandingI18n
          ? window.HallLandingI18n.t("try.downloadWinAria", lang)
          : "Download Hall for Windows",
      );
    } else {
      link.href = urls.mac || "/downloads/Hall-mac.dmg";
      labelEl.textContent = window.HallLandingI18n
        ? window.HallLandingI18n.t("try.downloadMac", lang)
        : "Download for macOS";
      link.setAttribute(
        "aria-label",
        window.HallLandingI18n
          ? window.HallLandingI18n.t("try.downloadMacAria", lang)
          : "Download Hall for macOS",
      );
    }
  }

  function refreshDownloadLabel(locale) {
    configureDownloadLink(
      document.getElementById("hero-download"),
      document.getElementById("hero-download-label"),
      locale,
    );
    configureDownloadLink(
      document.getElementById("home-download"),
      document.getElementById("home-download-label"),
      locale,
    );
  }

  var grid = document.getElementById("highlights-grid");
  var moreBtn = document.getElementById("highlights-more");
  var moreLabel = moreBtn ? moreBtn.querySelector(".home-highlights__more-label") : null;

  function isMobileHighlights() {
    return MOBILE_HIGHLIGHTS_MQ.matches;
  }

  function highlightScrollStep() {
    if (!grid) return 0;
    var card = grid.querySelector(".home-highlights__card");
    if (!card) return grid.clientWidth;
    var gap = parseFloat(getComputedStyle(grid).columnGap || getComputedStyle(grid).gap || "0") || 12;
    return (card.offsetWidth + gap) * 2;
  }

  function isHighlightScrolledEnd() {
    if (!grid) return false;
    return grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 4;
  }

  function refreshHighlightsMoreLabel() {
    if (!moreBtn || !moreLabel) return;
    var expanded;
    if (isMobileHighlights()) {
      expanded = isHighlightScrolledEnd();
    } else {
      expanded = grid ? grid.classList.contains("is-expanded") : false;
    }
    moreBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
    moreLabel.textContent = t(expanded ? "highlights.less" : "highlights.more");
  }

  function resetHighlightsLayout() {
    if (!grid) return;
    grid.classList.remove("is-expanded");
    grid.scrollLeft = 0;
    refreshHighlightsMoreLabel();
  }

  if (grid && moreBtn) {
    moreBtn.addEventListener("click", function () {
      if (isMobileHighlights()) {
        if (isHighlightScrolledEnd()) {
          grid.scrollTo({ left: 0, behavior: "smooth" });
        } else {
          grid.scrollBy({ left: highlightScrollStep(), behavior: "smooth" });
        }
        return;
      }

      grid.classList.toggle("is-expanded");
      refreshHighlightsMoreLabel();
    });

    grid.addEventListener(
      "scroll",
      function () {
        if (!isMobileHighlights()) return;
        refreshHighlightsMoreLabel();
      },
      { passive: true },
    );

    if (typeof MOBILE_HIGHLIGHTS_MQ.addEventListener === "function") {
      MOBILE_HIGHLIGHTS_MQ.addEventListener("change", resetHighlightsLayout);
    } else if (typeof MOBILE_HIGHLIGHTS_MQ.addListener === "function") {
      MOBILE_HIGHLIGHTS_MQ.addListener(resetHighlightsLayout);
    }
  }

  window.HallHomePage = {
    refreshDownloadLabel: refreshDownloadLabel,
    refreshHighlightsMoreLabel: refreshHighlightsMoreLabel,
  };

  refreshDownloadLabel(window.HallSitePrefs ? window.HallSitePrefs.getLocale() : "en");
  refreshHighlightsMoreLabel();
  document.addEventListener("lyte-landing:locale", function (event) {
    refreshDownloadLabel(event.detail && event.detail.locale ? event.detail.locale : "en");
    refreshHighlightsMoreLabel();
  });
})();
