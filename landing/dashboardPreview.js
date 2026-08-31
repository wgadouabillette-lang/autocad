(function () {
  var PREVIEW_WIDTH = 1680;
  var PREVIEW_HEIGHT = 940;
  var WINDOW_SCALE = 0.81;
  var TITLE_BAR_PX = 23;
  var LOAD_TIMEOUT_MS = 8000;
  var NAV_MESSAGE = "lyte-marketing-preview-nav";
  var DESKTOP_WALLPAPER =
    '<img class="hero__shot-desktop" src="okokok.avif" alt="" decoding="async" />';
  var activeIframe = null;

  function resolvePreviewHref() {
    var params = new URLSearchParams();
    var theme = document.documentElement.dataset.theme || "dark";
    params.set("theme", theme);
    return "/app/preview.html?" + params.toString();
  }

  function postPreviewNavAction(action) {
    if (!activeIframe || !activeIframe.contentWindow) return false;
    activeIframe.contentWindow.postMessage(
      { type: NAV_MESSAGE, action: action },
      window.location.origin,
    );
    return true;
  }

  window.HallCompactPreview = {
    showSection: function (sectionId) {
      if (sectionId === "connectors") return postPreviewNavAction("open-connectors");
      if (sectionId === "skills") return postPreviewNavAction("open-skills");
      if (sectionId === "music") return postPreviewNavAction("play-music");
      return false;
    },
    showFeature: function () {
      return false;
    },
  };

  function desktopWallpaperHtml() {
    return DESKTOP_WALLPAPER;
  }

  function createMacTitleBar() {
    var bar = document.createElement("div");
    bar.className = "hero__preview-titlebar";
    bar.setAttribute("aria-hidden", "true");
    var kinds = ["close", "min", "max"];
    for (var i = 0; i < kinds.length; i++) {
      var dot = document.createElement("span");
      dot.className = "hero__preview-titlebar__dot hero__preview-titlebar__dot--" + kinds[i];
      bar.appendChild(dot);
    }
    return bar;
  }

  function showFallback(mount) {
    mount.innerHTML =
      desktopWallpaperHtml() +
      '<img class="hero__shot-img" src="app-preview.png" alt="Meetra workspace preview" loading="eager" decoding="async" />';
  }

  function isMobilePreview() {
    return window.matchMedia("(max-width: 767px)").matches;
  }

  function isLockedLanding() {
    return document.body.classList.contains("landing-locked");
  }

  /** Size the mount to the largest 1680×940 box that fits the visible shots frame. */
  function fitLockedMount(mount) {
    if (!isLockedLanding()) {
      mount.style.width = "";
      mount.style.height = "";
      mount.style.maxWidth = "";
      mount.style.maxHeight = "";
      mount.style.marginLeft = "";
      return true;
    }

    var frame = mount.closest(".hero__shots") || mount.parentElement;
    if (!frame) return false;

    var availW = frame.clientWidth;
    var availH = frame.clientHeight;
    if (availW <= 0 || availH <= 0) return false;

    var scale = Math.min(availW / PREVIEW_WIDTH, availH / PREVIEW_HEIGHT);
    mount.style.width = Math.floor(PREVIEW_WIDTH * scale) + "px";
    mount.style.height = Math.floor(PREVIEW_HEIGHT * scale) + "px";
    mount.style.maxWidth = "100%";
    mount.style.maxHeight = "100%";
    mount.style.marginLeft = "0";
    return true;
  }

  function scalePreview(mount, wrapper, scaleLayer) {
    fitLockedMount(mount);

    var width = mount.clientWidth;
    var height = mount.clientHeight;
    if (width <= 0 || height <= 0) return false;

    if (isMobilePreview()) {
      var bodyH = Math.max(height - TITLE_BAR_PX, 1);
      var coverScale = Math.max(width / PREVIEW_WIDTH, bodyH / PREVIEW_HEIGHT);
      var coverW = PREVIEW_WIDTH * coverScale;
      var coverH = PREVIEW_HEIGHT * coverScale;

      wrapper.style.inset = "0";
      wrapper.style.width = "100%";
      wrapper.style.height = "100%";
      wrapper.style.left = "0";
      wrapper.style.top = "0";
      wrapper.style.right = "0";
      wrapper.style.bottom = "0";
      wrapper.style.transform = "none";

      scaleLayer.style.width = PREVIEW_WIDTH + "px";
      scaleLayer.style.height = PREVIEW_HEIGHT + "px";
      scaleLayer.style.left = (width - coverW) / 2 + "px";
      scaleLayer.style.top = (bodyH - coverH) / 2 + "px";
      scaleLayer.style.transform = "scale(" + coverScale + ")";
      return true;
    }

    var scale = Math.min(width / PREVIEW_WIDTH, height / PREVIEW_HEIGHT) * WINDOW_SCALE;
    var scaledW = PREVIEW_WIDTH * scale;
    var scaledH = PREVIEW_HEIGHT * scale;

    wrapper.style.inset = "";
    wrapper.style.right = "";
    wrapper.style.bottom = "";
    wrapper.style.width = scaledW + "px";
    wrapper.style.height = scaledH + TITLE_BAR_PX + "px";
    wrapper.style.left = "50%";
    wrapper.style.top = "50%";
    wrapper.style.transform = "translate(-50%, -50%)";

    scaleLayer.style.width = PREVIEW_WIDTH + "px";
    scaleLayer.style.height = PREVIEW_HEIGHT + "px";
    scaleLayer.style.left = "0";
    scaleLayer.style.top = "0";
    scaleLayer.style.transform = "scale(" + scale + ")";
    return true;
  }

  function mountPreview() {
    var mount = document.getElementById("workspaces-preview");
    if (!mount) return;

    var href = resolvePreviewHref();
    mount.innerHTML = desktopWallpaperHtml();
    activeIframe = null;

    var wrapper = document.createElement("div");
    wrapper.className = "hero__dashboard-preview-scaler";

    var scaleLayer = document.createElement("div");
    scaleLayer.className = "hero__dashboard-preview-scale-layer";

    var iframe = document.createElement("iframe");
    iframe.className = "hero__dashboard-preview-frame";
    iframe.title = "Meetra workspace preview";
    iframe.loading = "eager";
    iframe.tabIndex = -1;
    iframe.setAttribute("aria-hidden", "true");
    activeIframe = iframe;

    scaleLayer.appendChild(iframe);
    var windowBody = document.createElement("div");
    windowBody.className = "hero__preview-window";
    windowBody.appendChild(scaleLayer);
    wrapper.appendChild(createMacTitleBar());
    wrapper.appendChild(windowBody);
    mount.appendChild(wrapper);

    var loaded = false;
    var fallbackTimer = window.setTimeout(function () {
      if (!loaded) showFallback(mount);
    }, LOAD_TIMEOUT_MS);

    var syncScale = function () {
      return scalePreview(mount, wrapper, scaleLayer);
    };

    var ensureScale = function (attempt) {
      if (syncScale()) return;
      if (attempt >= 40) return;
      window.requestAnimationFrame(function () {
        ensureScale(attempt + 1);
      });
    };

    iframe.addEventListener("load", function () {
      loaded = true;
      window.clearTimeout(fallbackTimer);
      ensureScale(0);
    });

    ensureScale(0);
    window.addEventListener("resize", syncScale);

    if ("ResizeObserver" in window) {
      var observer = new ResizeObserver(syncScale);
      observer.observe(mount);
      if (mount.parentElement) observer.observe(mount.parentElement);
      var shots = mount.closest(".hero__shots");
      if (shots) observer.observe(shots);
    }

    iframe.src = href;
  }

  function bootPreview() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mountPreview, { once: true });
      return;
    }
    mountPreview();
  }

  bootPreview();
  document.addEventListener("lyte-landing:theme", mountPreview);
})();
