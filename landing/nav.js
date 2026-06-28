// Shared navbar injected into every page.
(function () {
  var DESKTOP_VIEWPORT_QUERY = "(min-width: 768px)";

  function detectActiveTab() {
    var mount = document.getElementById("site-nav");
    if (mount) return mount.getAttribute("data-active") || "";
    var path = window.location.pathname.split("/").pop() || "index.html";
    if (path === "tarifs.html") return "tarifs";
    if (path === "careers.html") return "careers";
    return "";
  }

  function isDesktopViewport() {
    return window.matchMedia(DESKTOP_VIEWPORT_QUERY).matches;
  }

  function resolveAppHref() {
    var hostname = window.location.hostname;
    var port = window.location.port;
    var isLocal = hostname === "127.0.0.1" || hostname === "localhost";
    if (isLocal && (port === "5190" || port === "5191")) {
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
    var path = window.location.pathname.split("/").pop() || "index.html";
    if (path === "" || path === "index.html") return "#" + sectionId;
    return "index.html#" + sectionId;
  }

  function mountNav() {
    var placeholder = document.getElementById("site-nav");
    var active = detectActiveTab();
    if (!placeholder) return;

    var appHref = resolveAppHref();
    var desktopOnly = !isDesktopViewport();
    var ctaIcon =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" width="11" height="11" aria-hidden="true">' +
      '<path d="M7 17 17 7M9 7h8v8" />' +
      "</svg>";

    var ctaHtml = desktopOnly
      ? '<span class="nav__cta" aria-disabled="true" title="' +
        t("nav.openAppDesktopOnly") +
        '"><span>' +
        t("nav.openApp") +
        "</span>" +
        ctaIcon +
        "</span>"
      : '<a class="nav__cta" href="' +
        appHref +
        '"><span>' +
        t("nav.openApp") +
        "</span>" +
        ctaIcon +
        "</a>";

    var tabs = [
      { id: "skills", labelKey: "nav.skills", href: homeSectionHref("skills") },
      { id: "connectors", labelKey: "nav.connectors", href: homeSectionHref("connectors") },
      { id: "workspaces", labelKey: "nav.workspaces", href: homeSectionHref("workspaces") },
      { id: "tarifs", labelKey: "nav.pricing", href: "tarifs.html" },
      { id: "careers", labelKey: "nav.careers", href: "careers.html" },
    ];

    var tabsHtml = tabs
      .map(function (tab) {
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
      '<a class="nav__logo" href="index.html" aria-label="Hall">' +
      '<img src="icon.png" alt="" class="nav__logo-icon" width="26" height="26" />' +
      "<span>Hall</span></a>" +
      '<ul class="nav__tabs" role="list">' +
      tabsHtml +
      "</ul>" +
      '<div class="nav__actions">' +
      ctaHtml +
      "</div></nav>";
  }

  mountNav();
  document.addEventListener("lyte-landing:locale", mountNav);
})();
