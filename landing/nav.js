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

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function menuButton() {
    var label = window.HallLandingI18n ? t("nav.menu") : "Menu";
    return (
      '<button type="button" class="nav__menu-btn" id="nav-menu" aria-expanded="false" aria-controls="nav-menu-panel" aria-label="' +
      escapeHtml(label) +
      '">' +
      '<svg class="nav__menu-icon nav__menu-icon--open" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
      '<path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />' +
      "</svg>" +
      '<svg class="nav__menu-icon nav__menu-icon--close" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
      '<path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />' +
      "</svg></button>"
    );
  }

  function downloadCta() {
    if (!isDesktopViewport()) return menuButton();

    var target =
      typeof window.HallDownloadTarget === "function"
        ? window.HallDownloadTarget()
        : {
            href: "/downloads/meetra.dmg",
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
    var platformIcon =
      typeof window.HallDownloadPlatformIcon === "function"
        ? window.HallDownloadPlatformIcon(target.platform || "mac", "nav__cta-platform-icon")
        : "";
    return (
      '<a class="nav__cta" id="nav-download" href="' +
      target.href +
      '" aria-label="' +
      aria +
      '">' +
      platformIcon +
      '<span id="nav-download-label">' +
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
    var header = document.querySelector(".site-header");
    if (header) return header.offsetHeight + 16;
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
          {
            id: "affiliate",
            labelKey: "nav.affiliate",
            href: "/affiliate",
            target: "_blank",
          },
        ]
      : [
          { id: "workspaces", labelKey: "nav.workspaces", href: homeSectionHref("workspaces") },
          { id: "skills", labelKey: "nav.skills", href: homeSectionHref("skills") },
          { id: "connectors", labelKey: "nav.connectors", href: homeSectionHref("connectors") },
          {
            id: "affiliate",
            labelKey: "nav.affiliate",
            href: "/affiliate",
            target: "_blank",
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
        var targetAttrs =
          tab.target === "_blank" ? ' target="_blank" rel="noopener noreferrer"' : "";
        return (
          '<li><a class="nav__tab' +
          (isActive ? " nav__tab--active" : "") +
          '" href="' +
          tab.href +
          '"' +
          targetAttrs +
          (isActive ? ' aria-current="page"' : "") +
          ">" +
          t(tab.labelKey) +
          (tab.id === "affiliate" ? '<span class="nav__new">New</span>' : "") +
          "</a></li>"
        );
      })
      .join("");

    var headerHtml =
      '<header class="site-header">' +
      '<div class="site-banner">' +
      '<span class="site-banner__new">New</span>' +
      '<span class="site-banner__text site-banner__text--full">' +
      escapeHtml(t("banner.text")) +
      "</span>" +
      '<span class="site-banner__text site-banner__text--short">' +
      escapeHtml(t("banner.textShort")) +
      "</span>" +
      '<a class="site-banner__link" href="#" data-banner-link>' +
      escapeHtml(t("banner.link")) +
      ' <span aria-hidden="true">→</span></a>' +
      "</div>" +
      '<nav class="nav" id="site-nav" data-active="' +
      active +
      '">' +
      '<a class="nav__logo" href="/" aria-label="Meetra">' +
      '<img src="/meetra-mark.svg" alt="" class="nav__logo-mark" draggable="false" />' +
      '<span class="nav__logo-wordmark">Meetra</span>' +
      "</a>" +
      '<ul class="nav__tabs" role="list">' +
      tabsHtml +
      "</ul>" +
      '<div class="nav__actions">' +
      ctaHtml +
      "</div>" +
      (isDesktopViewport()
        ? ""
        : '<div class="nav__menu" id="nav-menu-panel" hidden><ul class="nav__menu-list" role="list">' +
          tabsHtml +
          "</ul></div>") +
      "</nav></header>";

    var existingHeader = document.querySelector(".site-header");
    if (existingHeader) existingHeader.outerHTML = headerHtml;
    else placeholder.outerHTML = headerHtml;

    bindNavSectionLinks();
    bindBannerLink();
    bindMobileMenu();
    applyNavContrast();
  }

  var menuCloseTimer = 0;

  function finishMenuClose(panel) {
    if (panel.classList.contains("is-open")) return;
    panel.setAttribute("hidden", "");
  }

  function setMenuOpen(open) {
    var panel = document.getElementById("nav-menu-panel");
    var button = document.getElementById("nav-menu");
    if (!panel || !button) return;
    window.clearTimeout(menuCloseTimer);
    button.setAttribute("aria-expanded", open ? "true" : "false");
    button.classList.toggle("is-open", open);
    if (open) {
      panel.removeAttribute("hidden");
      panel.classList.remove("is-open");
      void panel.offsetHeight;
      panel.classList.add("is-open");
      return;
    }
    panel.classList.remove("is-open");
    var onEnd = function (event) {
      if (event.target !== panel || event.propertyName !== "max-height") return;
      panel.removeEventListener("transitionend", onEnd);
      finishMenuClose(panel);
    };
    panel.addEventListener("transitionend", onEnd);
    menuCloseTimer = window.setTimeout(function () {
      panel.removeEventListener("transitionend", onEnd);
      finishMenuClose(panel);
    }, 360);
  }

  function bindMobileMenu() {
    if (document.documentElement.dataset.navMenuBound === "1") return;
    document.documentElement.dataset.navMenuBound = "1";

    document.addEventListener("click", function (event) {
      var button = document.getElementById("nav-menu");
      var panel = document.getElementById("nav-menu-panel");
      if (!button || !panel) return;
      if (event.target.closest("#nav-menu")) {
        setMenuOpen(button.getAttribute("aria-expanded") !== "true");
        return;
      }
      if (event.target.closest("#nav-menu-panel a")) {
        setMenuOpen(false);
        return;
      }
      if (button.getAttribute("aria-expanded") === "true") setMenuOpen(false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setMenuOpen(false);
    });
  }

  function bindBannerLink() {
    if (document.documentElement.dataset.bannerLinkBound === "1") return;
    document.documentElement.dataset.bannerLinkBound = "1";
    document.addEventListener("click", function (event) {
      var link = event.target.closest("[data-banner-link]");
      if (!link || link.getAttribute("href") !== "#") return;
      event.preventDefault();
    });
  }

  var contrastCanvas = null;
  var contrastCtx = null;

  function parseCssColor(value) {
    if (!value || value === "transparent") return null;
    var match = value.match(
      /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/,
    );
    if (!match) return null;
    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
      a: match[4] == null ? 1 : Number(match[4]),
    };
  }

  function channelLuminance(value) {
    var channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  }

  function relativeLuminance(color) {
    return (
      0.2126 * channelLuminance(color.r) +
      0.7152 * channelLuminance(color.g) +
      0.0722 * channelLuminance(color.b)
    );
  }

  function contrastRatio(a, b) {
    var lighter = Math.max(a, b);
    var darker = Math.min(a, b);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function colorFromImage(img, x, y) {
    if (!img || !img.naturalWidth || !img.naturalHeight) return null;
    var rect = img.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    try {
      if (!contrastCanvas) {
        contrastCanvas = document.createElement("canvas");
        contrastCanvas.width = 1;
        contrastCanvas.height = 1;
        contrastCtx = contrastCanvas.getContext("2d", { willReadFrequently: true });
      }
      if (!contrastCtx) return null;
      var sx = ((x - rect.left) / rect.width) * img.naturalWidth;
      var sy = ((y - rect.top) / rect.height) * img.naturalHeight;
      contrastCtx.clearRect(0, 0, 1, 1);
      contrastCtx.drawImage(img, sx, sy, 1, 1, 0, 0, 1, 1);
      var pixel = contrastCtx.getImageData(0, 0, 1, 1).data;
      return { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] / 255 };
    } catch (error) {
      return null;
    }
  }

  function colorOf(node, x, y) {
    if (!node || node === document.documentElement) return null;
    if (node.tagName === "IMG") {
      var sampled = colorFromImage(node, x, y);
      if (sampled && sampled.a >= 0.4) return sampled;
    }
    var background = parseCssColor(window.getComputedStyle(node).backgroundColor);
    if (background && background.a >= 0.35) return background;
    return null;
  }

  function opaqueDescendant(root, x, y) {
    var found = null;
    var kids = root.children;
    for (var i = 0; i < kids.length; i++) {
      var child = kids[i];
      if (child.closest && child.closest(".site-header")) continue;
      var rect = child.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
      var style = window.getComputedStyle(child);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      var deeper = opaqueDescendant(child, x, y);
      found = deeper || colorOf(child, x, y) || found;
    }
    return found;
  }

  function surfaceBehind(x, y) {
    var stack = document.elementsFromPoint(x, y);
    var node = null;
    for (var i = 0; i < stack.length; i++) {
      if (!stack[i].closest(".site-header")) {
        node = stack[i];
        break;
      }
    }
    while (node && node !== document.documentElement) {
      var own = colorOf(node, x, y);
      if (own) return own;
      var nested = opaqueDescendant(node, x, y);
      if (nested) return nested;
      node = node.parentElement;
    }
    return { r: 247, g: 247, b: 245, a: 1 };
  }

  /** Light frost over the page. Text flips when white reads better than the gray label. */
  function labelNeedsLightText(x, y) {
    var surface = surfaceBehind(x, y);
    var overlay = 0.42;
    var mixed = {
      r: overlay * 247 + (1 - overlay) * surface.r,
      g: overlay * 247 + (1 - overlay) * surface.g,
      b: overlay * 245 + (1 - overlay) * surface.b,
    };
    var behind = relativeLuminance(mixed);
    var grayLabel = relativeLuminance({ r: 107, g: 107, b: 107 });
    var lightLabel = relativeLuminance({ r: 245, g: 245, b: 243 });
    return contrastRatio(lightLabel, behind) > contrastRatio(grayLabel, behind);
  }

  var applyingNavContrast = false;

  function applyNavContrast() {
    if (applyingNavContrast) return;
    var nav = document.getElementById("site-nav");
    if (!nav) return;
    applyingNavContrast = true;
    var items = nav.querySelectorAll(".nav__logo, .nav__tab, .nav__menu-btn");
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var rect = item.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        item.classList.remove("is-on-dark");
        continue;
      }
      var onDark = labelNeedsLightText(rect.left + rect.width / 2, rect.top + rect.height / 2);
      item.classList.toggle("is-on-dark", onDark);
    }
    applyingNavContrast = false;
  }

  function bindNavContrast() {
    if (document.documentElement.dataset.navContrastBound === "1") return;
    document.documentElement.dataset.navContrastBound = "1";
    var request = function () {
      applyNavContrast();
    };
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    window.addEventListener("load", request);
    if (document.body) {
      var observer = new MutationObserver(request);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    }
    request();
  }

  mountNav();
  bindNavContrast();
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
