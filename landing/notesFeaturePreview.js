(function () {
  var PREVIEW_WIDTH = 1680;
  var PREVIEW_HEIGHT = 940;
  // Hero workspace on the left, docked Notes panel (live transcription) on the right.
  var CONTENT_WIDTH = 900;
  var CONTENT_HEIGHT = 700;
  var CONTENT_LEFT = PREVIEW_WIDTH - CONTENT_WIDTH;
  var CONTENT_TOP = 20;
  var LOAD_TIMEOUT_MS = 8000;

  function resolvePreviewHref() {
    var params = new URLSearchParams();
    var theme = document.documentElement.dataset.theme || "dark";
    params.set("theme", theme);
    params.set("scene", "notes");
    return "/app/preview.html?" + params.toString();
  }

  function showFallback(mount) {
    mount.innerHTML =
      '<img class="hero__feature-img" src="app-preview.png" alt="Meetra AI Notes preview" loading="eager" decoding="async" />';
  }

  function scalePreview(mount, wrapper, scaleLayer) {
    var width = mount.clientWidth;
    var height = mount.clientHeight;
    if (width <= 0 || height <= 0) return;

    var scale = Math.max(width / CONTENT_WIDTH, height / CONTENT_HEIGHT);
    var offsetX = width - (CONTENT_LEFT + CONTENT_WIDTH) * scale;
    var offsetY = (height - CONTENT_HEIGHT * scale) / 2 - CONTENT_TOP * scale;

    wrapper.style.width = width + "px";
    wrapper.style.height = height + "px";

    scaleLayer.style.width = PREVIEW_WIDTH + "px";
    scaleLayer.style.height = PREVIEW_HEIGHT + "px";
    scaleLayer.style.transform =
      "translate(" + offsetX + "px, " + offsetY + "px) scale(" + scale + ")";
  }

  function mountPreview() {
    var mount = document.getElementById("notes-feature-preview");
    if (!mount) return;

    var href = resolvePreviewHref();
    mount.innerHTML = "";

    var wrapper = document.createElement("div");
    wrapper.className = "hero__theater-feature-scaler";

    var scaleLayer = document.createElement("div");
    scaleLayer.className = "hero__theater-feature-scale-layer";

    var iframe = document.createElement("iframe");
    iframe.className = "hero__theater-feature-frame";
    iframe.title = "Meetra AI Notes preview";
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
