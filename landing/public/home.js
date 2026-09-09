(function () {
  var MOBILE_HIGHLIGHTS_MQ = window.matchMedia("(max-width: 767px)");

  function t(key) {
    var locale = window.HallSitePrefs ? window.HallSitePrefs.getLocale() : "en";
    if (window.HallLandingI18n) return window.HallLandingI18n.t(key, locale);
    return key;
  }

  function configureDownloadLink(link, labelEl, locale, options) {
    if (!link) return;
    options = options || {};
    var preserveLabel = Boolean(options.preserveLabel);

    var lang = (function () {
      var code = String(locale || "en").toLowerCase().split("-")[0];
      return { en:1, fr:1, es:1, de:1, pt:1, it:1, ja:1, zh:1 }[code] ? code : "en";
    })();
    var icon = link.querySelector("svg");
    var desktop =
      typeof window.HallIsDesktopDownload === "function"
        ? window.HallIsDesktopDownload()
        : true;

    if (!desktop) {
      var unavailable =
        typeof window.HallUnavailableLabel === "function"
          ? window.HallUnavailableLabel()
          : "Unavailable on mobile";
      if (labelEl && !preserveLabel) {
        labelEl.textContent = unavailable;
      }
      link.classList.add("is-unavailable");
      link.removeAttribute("href");
      link.removeAttribute("download");
      link.setAttribute("role", "note");
      link.setAttribute("aria-disabled", "true");
      link.setAttribute("aria-label", unavailable);
      if (icon && !preserveLabel) {
        icon.outerHTML =
          typeof window.HallUnavailableIcon === "function"
            ? window.HallUnavailableIcon("hero__cta-icon")
            : "";
      }
      return;
    }

    var target =
      typeof window.HallDownloadTarget === "function"
        ? window.HallDownloadTarget()
        : {
            href: "/downloads/Hall-mac.dmg",
            labelKey: "try.downloadMac",
            ariaKey: "try.downloadMacAria",
            fallbackLabel: "Download for macOS",
            fallbackAria: "Download Meetra for macOS",
          };

    link.classList.remove("is-unavailable");
    link.removeAttribute("role");
    link.removeAttribute("aria-disabled");
    link.href = target.href;
    link.setAttribute("download", "");
    if (labelEl && !preserveLabel) {
      labelEl.textContent = window.HallLandingI18n
        ? window.HallLandingI18n.t(target.labelKey, lang)
        : target.fallbackLabel;
    }
    link.setAttribute(
      "aria-label",
      window.HallLandingI18n
        ? window.HallLandingI18n.t(target.ariaKey, lang)
        : target.fallbackAria,
    );
    icon = link.querySelector("svg");
    if (icon && !preserveLabel) {
      var usePlatformIcon =
        link.id === "hero-download" || link.id === "feature-try-download";
      if (
        usePlatformIcon &&
        typeof window.HallDownloadPlatformIcon === "function"
      ) {
        var platformIcon = window.HallDownloadPlatformIcon(
          target.platform || "mac",
          "hero__cta-platform-icon",
        );
        icon.outerHTML = platformIcon;
        var labelNode =
          labelEl ||
          link.querySelector("#hero-download-label") ||
          link.querySelector("#feature-try-download-label");
        var inserted = link.querySelector(".hero__cta-platform-icon");
        if (inserted && labelNode && inserted.nextSibling !== labelNode) {
          link.insertBefore(inserted, labelNode);
        }
      } else if (typeof window.HallDownloadArrowIcon === "function") {
        icon.outerHTML = window.HallDownloadArrowIcon("hero__cta-icon");
      }
    }
  }

  function featureTryLabel(featureKey, locale) {
    var key = "featureTry." + featureKey;
    if (window.HallLandingI18n) return window.HallLandingI18n.t(key, locale);
    return featureKey;
  }

  var featureTryCloseTimer = null;

  function finishCloseFeatureTryOverlay(overlay) {
    overlay.classList.remove("is-open");
    overlay.setAttribute("hidden", "");
    document.documentElement.classList.remove("feature-try-overlay-open");
    document.body.classList.remove("feature-try-overlay-open");
  }

  function closeFeatureTryOverlay() {
    var overlay = document.getElementById("feature-try-overlay");
    if (!overlay || !overlay.classList.contains("is-open")) return;
    if (featureTryCloseTimer) {
      clearTimeout(featureTryCloseTimer);
      featureTryCloseTimer = null;
    }
    overlay.classList.remove("is-open");
    featureTryCloseTimer = setTimeout(function () {
      featureTryCloseTimer = null;
      finishCloseFeatureTryOverlay(overlay);
    }, 400);
  }

  function openFeatureTryOverlay(featureKey) {
    var overlay = document.getElementById("feature-try-overlay");
    var message = document.getElementById("feature-try-message");
    if (!overlay || !message) return;

    if (featureTryCloseTimer) {
      clearTimeout(featureTryCloseTimer);
      featureTryCloseTimer = null;
    }

    var locale = window.HallSitePrefs ? window.HallSitePrefs.getLocale() : "en";
    var feature = featureTryLabel(featureKey, locale);
    message.textContent = window.HallLandingI18n
      ? window.HallLandingI18n.t("featureTry.message", locale, { feature: feature })
      : "Sure you want to download Meetra to try " + feature + "?";
    message.dataset.featureKey = featureKey;

    configureDownloadLink(
      document.getElementById("feature-try-download"),
      document.getElementById("feature-try-download-label"),
      locale,
    );

    overlay.removeAttribute("hidden");
    document.documentElement.classList.add("feature-try-overlay-open");
    document.body.classList.add("feature-try-overlay-open");
    // Next frame so the opacity/transform transition actually runs.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.classList.add("is-open");
      });
    });
  }

  function wireFeatureTryLinks() {
    var triggers = document.querySelectorAll("[data-feature-try]");
    for (var i = 0; i < triggers.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          openFeatureTryOverlay(btn.getAttribute("data-feature-try") || "spotify");
        });
      })(triggers[i]);
    }

    var overlay = document.getElementById("feature-try-overlay");
    if (!overlay) return;

    var closers = overlay.querySelectorAll("[data-feature-try-close]");
    for (var c = 0; c < closers.length; c++) {
      closers[c].addEventListener("click", closeFeatureTryOverlay);
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeFeatureTryOverlay();
    });
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
    configureDownloadLink(
      document.getElementById("feature-try-download"),
      document.getElementById("feature-try-download-label"),
      locale,
    );
    var navDownload = document.getElementById("nav-download");
    if (navDownload && navDownload.tagName === "A") {
      configureDownloadLink(
        navDownload,
        document.getElementById("nav-download-label"),
        locale,
      );
    }
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

  wireFeatureTryLinks();
  refreshDownloadLabel(window.HallSitePrefs ? window.HallSitePrefs.getLocale() : "en");
  refreshHighlightsMoreLabel();
  document.addEventListener("lyte-landing:locale", function (event) {
    refreshDownloadLabel(event.detail && event.detail.locale ? event.detail.locale : "en");
    refreshHighlightsMoreLabel();
    var overlay = document.getElementById("feature-try-overlay");
    if (overlay && overlay.classList.contains("is-open")) {
      var message = document.getElementById("feature-try-message");
      if (message && message.dataset.featureKey) {
        openFeatureTryOverlay(message.dataset.featureKey);
      }
    }
  });
  document.addEventListener("lyte-landing:viewport", function () {
    refreshDownloadLabel(window.HallSitePrefs ? window.HallSitePrefs.getLocale() : "en");
  });
})();
