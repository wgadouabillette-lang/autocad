(function () {
  var PREVIEW_WIDTH = 1680;
  var PREVIEW_HEIGHT = 940;
  var WINDOW_SCALE = 0.81;
  var WINDOW_SCALE_MOBILE = 0.91;
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

  var FEATURES = {
    polls: { label: "Polls" },
    recording: { label: "Recording" },
    "follows-up": { label: "Follows-up" },
    spotify: { label: "Spotify" },
    calendar: { label: "Calendar" },
    "ai-notes": { label: "AI Notes" },
    messages: { label: "Messages" },
  };

  function pulsePreviewWindow() {
    var mount = document.getElementById("workspaces-preview");
    if (!mount) return;
    var targets = mount.querySelectorAll(
      ".hero__dashboard-preview-scaler, .hero__shot--dashboard > .hero__shot-img",
    );
    for (var i = 0; i < targets.length; i++) {
      targets[i].classList.remove("is-showcasing");
      void targets[i].offsetWidth;
      targets[i].classList.add("is-showcasing");
    }
  }

  function featureOverlayHost(mount) {
    return (
      mount.querySelector(".hero__dashboard-preview-scaler") ||
      mount
    );
  }

  function ensureFeatureOverlay(mount) {
    var host = featureOverlayHost(mount);
    var veil = host.querySelector("[data-feature-veil]");
    var callout = host.querySelector("[data-feature-callout]");
    if (!veil) {
      veil = document.createElement("div");
      veil.className = "hero__feature-veil";
      veil.setAttribute("data-feature-veil", "");
      veil.setAttribute("aria-hidden", "true");
      host.appendChild(veil);
    }
    if (!callout) {
      callout = document.createElement("div");
      callout.className = "hero__feature-callout";
      if (!host.classList.contains("hero__dashboard-preview-scaler")) {
        callout.classList.add("hero__feature-callout--fallback");
      }
      callout.setAttribute("data-feature-callout", "");
      callout.setAttribute("aria-live", "polite");
      host.appendChild(callout);
    }
    return { veil: veil, callout: callout };
  }

  function showcaseOnWindow(feature) {
    var mount = document.getElementById("workspaces-preview");
    var meta = FEATURES[feature];
    if (!mount || !meta) return;
    var overlay = ensureFeatureOverlay(mount);
    overlay.callout.textContent = meta.label;
    overlay.veil.classList.remove("is-visible");
    overlay.callout.classList.remove("is-visible");
    void overlay.callout.offsetWidth;
    overlay.veil.classList.add("is-visible");
    overlay.callout.classList.add("is-visible");
  }

  function setActiveFeatureChip(feature) {
    var chips = document.querySelectorAll("[data-feature-chip]");
    for (var i = 0; i < chips.length; i++) {
      var on = chips[i].getAttribute("data-feature-chip") === feature;
      chips[i].classList.toggle("is-active", on);
      if (on) chips[i].setAttribute("aria-pressed", "true");
      else chips[i].setAttribute("aria-pressed", "false");
    }
  }

  function showFeature(feature) {
    if (!FEATURES[feature]) return false;
    setActiveFeatureChip(feature);
    pulsePreviewWindow();
    showcaseOnWindow(feature);
    return true;
  }

  window.HallCompactPreview = {
    showSection: function (sectionId) {
      if (sectionId === "connectors") return postPreviewNavAction("open-connectors");
      if (sectionId === "skills") return postPreviewNavAction("open-skills");
      if (sectionId === "music") return postPreviewNavAction("play-music");
      if (FEATURES[sectionId]) return showFeature(sectionId);
      return postPreviewNavAction("show-dashboard");
    },
    showFeature: showFeature,
  };

  function desktopWallpaperHtml() {
    return DESKTOP_WALLPAPER;
  }

  function showFallback(mount) {
    mount.innerHTML =
      desktopWallpaperHtml() +
      '<img class="hero__shot-img" src="app-preview.png" alt="Meetra workspace preview" loading="eager" decoding="async" />';
    ensureFeatureOverlay(mount);
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

    var inset = isMobilePreview() ? WINDOW_SCALE_MOBILE : WINDOW_SCALE;
    var scale = Math.min(width / PREVIEW_WIDTH, height / PREVIEW_HEIGHT) * inset;
    var scaledW = PREVIEW_WIDTH * scale;
    var scaledH = PREVIEW_HEIGHT * scale;

    wrapper.style.width = scaledW + "px";
    wrapper.style.height = scaledH + "px";
    wrapper.style.left = "50%";
    wrapper.style.top = "46%";
    wrapper.style.transform = "translate(-50%, -50%)";

    scaleLayer.style.width = PREVIEW_WIDTH + "px";
    scaleLayer.style.height = PREVIEW_HEIGHT + "px";
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
    wrapper.appendChild(scaleLayer);
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

    ensureFeatureOverlay(mount);
    bindFeatureChips();
  }

  function bindFeatureChips() {
    var row = document.querySelector("[data-feature-chips]");
    if (!row || row.dataset.bound === "1") return;
    row.dataset.bound = "1";
    row.addEventListener("click", function (event) {
      var button = event.target.closest("[data-feature-chip]");
      if (!button || !row.contains(button)) return;
      showFeature(button.getAttribute("data-feature-chip"));
    });
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
