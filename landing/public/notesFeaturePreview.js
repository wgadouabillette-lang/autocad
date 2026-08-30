(function () {
  var PREVIEW_WIDTH = 1680;
  var PREVIEW_HEIGHT = 940;
  var VISIBLE_WIDTH = 980;
  var VISIBLE_HEIGHT = 680;
  var VISIBLE_LEFT = (PREVIEW_WIDTH - VISIBLE_WIDTH) / 2;
  var VISIBLE_TOP = 0;
  var TOP_PAD = 15;
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
      '<img class="hero__feature-img" src="app-preview.png" alt="Meetra Notes preview" loading="eager" decoding="async" />';
  }

  function scalePreview(mount, wrapper, scaleLayer) {
    var width = mount.clientWidth;
    var height = mount.clientHeight;
    if (width <= 0 || height <= 0) return;

    var scale = Math.max(width / VISIBLE_WIDTH, height / VISIBLE_HEIGHT);
    var offsetX = -VISIBLE_LEFT * scale + (width - VISIBLE_WIDTH * scale) / 2;
    var offsetY = -VISIBLE_TOP * scale + TOP_PAD;

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
    iframe.title = "Meetra Notes preview";
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
