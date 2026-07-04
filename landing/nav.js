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

  function detectActiveTab() {
    var mount = document.getElementById("site-nav");
    if (mount) return mount.getAttribute("data-active") || "";
    var slug = currentPageSlug();
    if (slug === "tarifs" || slug === "careers" || slug === "privacy") return slug;
    return "";
  }

  function isDesktopViewport() {
    return window.matchMedia(DESKTOP_VIEWPORT_QUERY).matches;
  }

  function resolveAppHref() {
    var hostname = window.location.hostname;
    var port = window.location.port;
    var isLocal = hostname === "127.0.0.1" || hostname === "localhost";
    if (isLocal && (port === "5190" || port === "5191" || port === "5192" || port === "5193")) {
      return "http://localhost:5173/app/";
    }
    return "/app/";
  }

  function t(key) {
    var locale = window.HallSitePrefs ? window.HallSitePrefs.getLocale() : "en";
    if (window.HallLandingI18n) return window.HallLandingI18n.t(key, locale);
    return key;
  }

  function homeSectionHref(sectionId) {
    if (isHomePage()) return "#" + sectionId;
    return "/#" + sectionId;
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
      if (!isHomePage()) return;

      event.preventDefault();
      scrollToLandingSection(href.slice(hashIndex + 1));
    });
  }

  function scrollToInitialHash() {
    var sectionId = (window.location.hash || "").replace(/^#/, "");
    if (!sectionId) return;
    if (!isHomePage()) return;
    window.requestAnimationFrame(function () {
      scrollToLandingSection(sectionId, "auto");
    });
  }

  function mountNav() {
    var placeholder = document.getElementById("site-nav");
    var active = detectActiveTab();
    if (!placeholder) return;

    var appHref = resolveAppHref();
    var ctaIcon =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" width="11" height="11" aria-hidden="true">' +
      '<path d="M7 17 17 7M9 7h8v8" />' +
      "</svg>";

    var ctaHtml =
      '<a class="nav__cta" href="' +
      appHref +
      '"><span>' +
      t("nav.openApp") +
      "</span>" +
      ctaIcon +
      "</a>";

    var tabs = [
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
      '<a class="nav__logo" href="/" aria-label="Hall">' +
      '<img src="icon.png" alt="" class="nav__logo-icon" width="26" height="26" />' +
      "<span>Hall</span></a>" +
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
})();
