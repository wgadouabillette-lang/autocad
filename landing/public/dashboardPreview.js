(function () {
  var PREVIEW_WIDTH = 1680;
  var PREVIEW_HEIGHT = 940;
  var LOAD_TIMEOUT_MS = 8000;
  var NAV_MESSAGE = "lyte-marketing-preview-nav";
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
      return postPreviewNavAction("show-dashboard");
    },
  };

  function showFallback(mount) {
    mount.innerHTML =
      '<img class="hero__shot-img" src="app-preview.png" alt="Hall workspace preview" loading="eager" decoding="async" />';
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
      mount.style.marginLeft = "";
      return;
    }

    var frame = mount.closest(".hero__shots") || mount.parentElement;
    if (!frame) return;

    var availW = frame.clientWidth;
    var availH = frame.clientHeight;
    if (availW <= 0 || availH <= 0) return;

    var scale = Math.min(availW / PREVIEW_WIDTH, availH / PREVIEW_HEIGHT);
    mount.style.width = Math.floor(PREVIEW_WIDTH * scale) + "px";
    mount.style.height = Math.floor(PREVIEW_HEIGHT * scale) + "px";
    mount.style.maxWidth = "100%";
    mount.style.marginLeft = "0";
  }

  function scalePreview(mount, wrapper, scaleLayer) {
    fitLockedMount(mount);

    var width = mount.clientWidth;
    var height = mount.clientHeight;
    if (width <= 0 || height <= 0) return;

    if (isMobilePreview() && !isLockedLanding()) {
      var coverScale = Math.max(width / PREVIEW_WIDTH, height / PREVIEW_HEIGHT);
      var offsetX = 0;
      var offsetY = (height - PREVIEW_HEIGHT * coverScale) / 2;

      wrapper.style.width = width + "px";
      wrapper.style.height = height + "px";
      wrapper.style.left = "0";
      wrapper.style.top = "0";
      wrapper.style.transform = "none";

      scaleLayer.style.width = PREVIEW_WIDTH + "px";
      scaleLayer.style.height = PREVIEW_HEIGHT + "px";
      scaleLayer.style.transform =
        "translate(" + offsetX + "px, " + offsetY + "px) scale(" + coverScale + ")";
      return;
    }

    var scale = Math.min(width / PREVIEW_WIDTH, height / PREVIEW_HEIGHT);
    var scaledW = PREVIEW_WIDTH * scale;
    var scaledH = PREVIEW_HEIGHT * scale;

    wrapper.style.width = scaledW + "px";
    wrapper.style.height = scaledH + "px";
    wrapper.style.left = "50%";
    wrapper.style.top = "50%";
    wrapper.style.transform = "translate(-50%, -50%)";

    scaleLayer.style.width = PREVIEW_WIDTH + "px";
    scaleLayer.style.height = PREVIEW_HEIGHT + "px";
    scaleLayer.style.transform = "scale(" + scale + ")";
  }

  function mountPreview() {
    var mount = document.getElementById("workspaces-preview");
    if (!mount) return;

    var href = resolvePreviewHref();
    mount.innerHTML = "";
    activeIframe = null;

    var wrapper = document.createElement("div");
    wrapper.className = "hero__dashboard-preview-scaler";

    var scaleLayer = document.createElement("div");
    scaleLayer.className = "hero__dashboard-preview-scale-layer";

    var iframe = document.createElement("iframe");
    iframe.className = "hero__dashboard-preview-frame";
    iframe.title = "Hall workspace preview";
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
      scalePreview(mount, wrapper, scaleLayer);
    };

    iframe.addEventListener("load", function () {
      loaded = true;
      window.clearTimeout(fallbackTimer);
      requestAnimationFrame(function () {
        syncScale();
        requestAnimationFrame(syncScale);
      });
    });

    syncScale();
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

  mountPreview();
  document.addEventListener("lyte-landing:theme", mountPreview);
})();
