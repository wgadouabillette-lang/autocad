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

  function isCompactPage() {
    return currentPageSlug() === "compact";
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

  function downloadCta() {
    var target =
      typeof window.HallDownloadTarget === "function"
        ? window.HallDownloadTarget()
        : {
            href: "/downloads/Hall-mac.dmg",
            labelKey: "try.downloadMac",
            ariaKey: "try.downloadMacAria",
            fallbackLabel: "Download for macOS",
            fallbackAria: "Download Hall for macOS",
          };
    var label = window.HallLandingI18n
      ? t(target.labelKey)
      : target.fallbackLabel;
    var aria = window.HallLandingI18n
      ? t(target.ariaKey)
      : target.fallbackAria;
    var icon =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" width="11" height="11" aria-hidden="true">' +
      '<path d="M12 3v12" />' +
      '<path d="m7 10 5 5 5-5" />' +
      '<path d="M5 21h14" />' +
      "</svg>";
    return (
      '<a class="nav__cta" id="nav-download" href="' +
      target.href +
      '" aria-label="' +
      aria +
      '"><span id="nav-download-label">' +
      label +
      "</span>" +
      icon +
      "</a>"
    );
  }

  function homeSectionHref(sectionId) {
    if (isHomePage() || isCompactPage()) return "#" + sectionId;
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
      if (isCompactPage()) {
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
    if (isCompactPage()) {
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

    var tabs = isCompactPage()
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
      '<a class="nav__logo" href="/" aria-label="Hall">' +
      '<img src="icon.svg" alt="" class="nav__logo-icon" width="26" height="26" />' +
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
