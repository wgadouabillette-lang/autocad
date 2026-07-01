(function () {
  var PREVIEW_WIDTH = 1680;
  var PREVIEW_HEIGHT = 940;
  var LOAD_TIMEOUT_MS = 8000;

  function resolvePreviewHref() {
    var params = new URLSearchParams();
    var theme = document.documentElement.dataset.theme || "dark";
    params.set("theme", theme);
    return "/app/preview.html?" + params.toString();
  }

  function showFallback(mount) {
    mount.innerHTML =
      '<img class="hero__shot-img" src="app-preview.png" alt="Hall workspace preview" loading="eager" decoding="async" />';
  }

  function isMobilePreview() {
    return window.matchMedia("(max-width: 767px)").matches;
  }

  function scalePreview(mount, wrapper, scaleLayer) {
    var width = mount.clientWidth;
    var height = mount.clientHeight;
    if (width <= 0 || height <= 0) return;

    if (isMobilePreview()) {
      var scale = Math.max(width / PREVIEW_WIDTH, height / PREVIEW_HEIGHT);
      var scaledW = PREVIEW_WIDTH * scale;
      var scaledH = PREVIEW_HEIGHT * scale;
      var offsetX = 0;
      var offsetY = (height - scaledH) / 2;

      wrapper.style.width = width + "px";
      wrapper.style.height = height + "px";
      wrapper.style.left = "0";
      wrapper.style.top = "0";
      wrapper.style.transform = "none";

      scaleLayer.style.width = PREVIEW_WIDTH + "px";
      scaleLayer.style.height = PREVIEW_HEIGHT + "px";
      scaleLayer.style.transform =
        "translate(" + offsetX + "px, " + offsetY + "px) scale(" + scale + ")";
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
    }

    iframe.src = href;
  }

  mountPreview();
  document.addEventListener("lyte-landing:theme", mountPreview);
})();
