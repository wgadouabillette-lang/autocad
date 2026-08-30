// Shared navbar injected into every page.
(function () {
  var DESKTOP_VIEWPORT_QUERY = "(min-width: 768px)";

  function currentPageSlug() {
    var segment = window.location.pathname.replace(/\/+$/, "").split("/").pop() || "";
    if (!segment || segment === "index.html") return "home";
    if (segment.endsWith(".html")) return segment.slice(0, -5);
    return segment;
  }

  function isHomePage() {
    return currentPageSlug() === "home";
  }

  /** Locked single-viewport home (legacy): nav drives the hero preview iframe. */
  function usesPreviewNav() {
    return document.body.classList.contains("landing-locked");
  }

  function detectActiveTab() {
    var mount = document.getElementById("site-nav");
    var fromAttr = mount ? mount.getAttribute("data-active") || "" : "";
    if (fromAttr) return fromAttr;
    var slug = currentPageSlug();
    if (slug === "tarifs" || slug === "careers" || slug === "privacy") return slug;
    return "";
  }

  function isDesktopViewport() {
    return window.matchMedia(DESKTOP_VIEWPORT_QUERY).matches;
  }

  function t(key) {
    var locale = window.HallSitePrefs ? window.HallSitePrefs.getLocale() : "en";
    if (window.HallLandingI18n) return window.HallLandingI18n.t(key, locale);
    return key;
  }

  function unavailableIcon() {
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="10" />' +
      '<path d="m15 9-6 6" />' +
      '<path d="m9 9 6 6" />' +
      "</svg>"
    );
  }

  function downloadCta() {
    if (!isDesktopViewport()) {
      var unavailableLabel =
        typeof window.HallUnavailableLabel === "function"
          ? window.HallUnavailableLabel()
          : window.HallLandingI18n
            ? t("nav.downloadUnavailable")
            : "Unavailable on mobile";
      var icon =
        typeof window.HallUnavailableIcon === "function"
          ? window.HallUnavailableIcon()
          : unavailableIcon();
      return (
        '<span class="nav__cta nav__cta--unavailable" id="nav-download" role="note" aria-label="' +
        unavailableLabel +
        '"><span id="nav-download-label">' +
        unavailableLabel +
        "</span>" +
        icon +
        "</span>"
      );
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
    var label = window.HallLandingI18n
      ? t(target.labelKey)
      : target.fallbackLabel;
    var aria = window.HallLandingI18n
      ? t(target.ariaKey)
      : target.fallbackAria;
    return (
      '<a class="nav__cta" id="nav-download" href="' +
      target.href +
      '" aria-label="' +
      aria +
      '"><span id="nav-download-label">' +
      label +
      "</span></a>"
    );
  }

  function homeSectionHref(sectionId) {
    if (isHomePage() || usesPreviewNav()) return "#" + sectionId;
    return "/#" + sectionId;
  }

  function setCompactActiveTab(sectionId) {
    var nav = document.getElementById("site-nav");
    if (!nav) return;
    nav.setAttribute("data-active", sectionId);
    var links = nav.querySelectorAll("a.nav__tab");
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var href = link.getAttribute("href") || "";
      var hashIndex = href.indexOf("#");
      var id = hashIndex === -1 ? "" : href.slice(hashIndex + 1);
      var active = id === sectionId;
      link.classList.toggle("nav__tab--active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
  }

  function handleCompactNavSection(sectionId) {
    setCompactActiveTab(sectionId);
    if (window.history && window.history.replaceState) {
      var path = window.location.pathname + window.location.search;
      window.history.replaceState(null, "", path + "#" + sectionId);
    }
    if (
      window.HallCompactPreview &&
      typeof window.HallCompactPreview.showSection === "function"
    ) {
      window.HallCompactPreview.showSection(sectionId);
    }
  }

  function navScrollOffset() {
    var root = document.documentElement;
    var navHeight = parseFloat(getComputedStyle(root).getPropertyValue("--nav-height")) || 64;
    return navHeight + 16;
  }

  function scrollToLandingSection(sectionId, behavior) {
    var el = document.getElementById(sectionId);
    if (!el) return false;
    var top =
      window.scrollY + el.getBoundingClientRect().top - navScrollOffset();
    window.scrollTo({
      top: Math.max(0, top),
      behavior: behavior || "smooth",
    });
    if (window.history && window.history.replaceState) {
      var path = window.location.pathname + window.location.search;
      window.history.replaceState(null, "", path + "#" + sectionId);
    } else {
      window.location.hash = sectionId;
    }
    return true;
  }

  function bindNavSectionLinks() {
    var nav = document.getElementById("site-nav");
    if (!nav || nav.dataset.sectionLinksBound === "1") return;
    nav.dataset.sectionLinksBound = "1";

    nav.addEventListener("click", function (event) {
      var link = event.target.closest("a.nav__tab");
      if (!link) return;
      var href = link.getAttribute("href") || "";
      var hashIndex = href.indexOf("#");
      if (hashIndex === -1) return;

      var pathPart = href.slice(0, hashIndex);
      if (pathPart && pathPart !== "/" && pathPart !== "index.html") return;

      var sectionId = href.slice(hashIndex + 1);
      if (usesPreviewNav()) {
        event.preventDefault();
        handleCompactNavSection(sectionId);
        return;
      }

      if (!isHomePage()) return;

      event.preventDefault();
      scrollToLandingSection(sectionId);
    });
  }

  function scrollToInitialHash() {
    var sectionId = (window.location.hash || "").replace(/^#/, "");
    if (!sectionId) return;
    if (usesPreviewNav()) {
      window.requestAnimationFrame(function () {
        // Wait for the dashboard iframe helper to mount.
        window.setTimeout(function () {
          handleCompactNavSection(sectionId);
        }, 300);
      });
      return;
    }
    if (!isHomePage()) return;
    window.requestAnimationFrame(function () {
      scrollToLandingSection(sectionId, "auto");
    });
  }

  function mountNav() {
    var placeholder = document.getElementById("site-nav");
    var active = detectActiveTab();
    if (!placeholder) return;

    var ctaHtml = downloadCta();

    var tabs = usesPreviewNav()
      ? [
          { id: "music", labelKey: "nav.music", href: "#music" },
          { id: "skills", labelKey: "nav.skills", href: "#skills" },
          { id: "connectors", labelKey: "nav.connectors", href: "#connectors" },
          { id: "privacy", labelKey: "nav.privacy", href: "/privacy" },
          {
            id: "affiliate",
            labelKey: "nav.affiliate",
            disabled: true,
            titleKey: "nav.affiliateSoon",
          },
        ]
      : [
          { id: "workspaces", labelKey: "nav.workspaces", href: homeSectionHref("workspaces") },
          { id: "skills", labelKey: "nav.skills", href: homeSectionHref("skills") },
          { id: "connectors", labelKey: "nav.connectors", href: homeSectionHref("connectors") },
          { id: "privacy", labelKey: "nav.privacy", href: "/privacy" },
          {
            id: "affiliate",
            labelKey: "nav.affiliate",
            disabled: true,
            titleKey: "nav.affiliateSoon",
          },
        ];

    var tabsHtml = tabs
      .map(function (tab) {
        if (tab.disabled) {
          return (
            '<li><span class="nav__tab nav__tab--disabled" aria-disabled="true" title="' +
            t(tab.titleKey || "nav.affiliateSoon") +
            '">' +
            t(tab.labelKey) +
            "</span></li>"
          );
        }
        var isActive = tab.id === active;
        return (
          '<li><a class="nav__tab' +
          (isActive ? " nav__tab--active" : "") +
          '" href="' +
          tab.href +
          '"' +
          (isActive ? ' aria-current="page"' : "") +
          ">" +
          t(tab.labelKey) +
          "</a></li>"
        );
      })
      .join("");

    placeholder.outerHTML =
      '<nav class="nav" id="site-nav" data-active="' +
      active +
      '">' +
      '<a class="nav__logo" href="/" aria-label="Meetra">' +
      '<img src="/meetra-wordmark.png" alt="Meetra" class="nav__logo-wordmark" />' +
      "</a>" +
      '<ul class="nav__tabs" role="list">' +
      tabsHtml +
      "</ul>" +
      '<div class="nav__actions">' +
      ctaHtml +
      "</div></nav>";

    bindNavSectionLinks();
  }

  mountNav();
  scrollToInitialHash();
  document.addEventListener("lyte-landing:locale", mountNav);
  if (window.matchMedia) {
    var desktopMq = window.matchMedia(DESKTOP_VIEWPORT_QUERY);
    if (desktopMq.addEventListener) {
      desktopMq.addEventListener("change", mountNav);
    } else if (desktopMq.addListener) {
      desktopMq.addListener(mountNav);
    }
  }
})();
