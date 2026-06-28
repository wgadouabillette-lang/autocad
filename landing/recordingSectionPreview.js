(function () {
  var APP_WIDTH = 1680;
  var APP_HEIGHT = 940;
  var VISIBLE_WIDTH = 380;
  var VISIBLE_HEIGHT = 200;
  var SCALE_BOOST = 1.35;
  var AUTO_START_MS = 1500;
  var LOAD_TIMEOUT_MS = 8000;
  var RECORDING_DEMO_START = "lyte-recording-demo-start";

  var autoStartScheduled = false;
  var autoStartDone = false;
  var autoStartTimer = null;
  var activeIframe = null;

  function resolvePreviewHref() {
    var params = new URLSearchParams();
    var theme = document.documentElement.dataset.theme || "dark";
    params.set("theme", theme);
    params.set("scene", "recording");
    return "/app/preview.html?" + params.toString();
  }

  function showFallback(mount) {
    mount.innerHTML =
      '<img class="hero__shot-img" src="app-preview.png" alt="Hall demo recording preview" loading="eager" decoding="async" />';
  }

  function postRecordingDemoStart() {
    if (!activeIframe || !activeIframe.contentWindow) return;
    activeIframe.contentWindow.postMessage(
      { type: RECORDING_DEMO_START },
      window.location.origin,
    );
  }

  function scheduleAutoStart() {
    if (autoStartScheduled) return;
    autoStartScheduled = true;
    autoStartTimer = window.setTimeout(function () {
      autoStartDone = true;
      postRecordingDemoStart();
    }, AUTO_START_MS);
  }

  function observeSection() {
    var section = document.getElementById("recording");
    if (!section) return;

    if (!("IntersectionObserver" in window)) {
      scheduleAutoStart();
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            scheduleAutoStart();
            observer.disconnect();
            return;
          }
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(section);
  }

  function scalePreview(mount, wrapper, scaleLayer) {
    var width = mount.clientWidth;
    var height = mount.clientHeight;
    if (width <= 0 || height <= 0) return;

    var scale = Math.min(width / VISIBLE_WIDTH, height / VISIBLE_HEIGHT) * SCALE_BOOST;

    wrapper.style.width = width + "px";
    wrapper.style.height = height + "px";

    scaleLayer.style.width = APP_WIDTH + "px";
    scaleLayer.style.height = APP_HEIGHT + "px";
    scaleLayer.style.transform = "scale(" + scale + ")";
  }

  function mountPreview() {
    var mount = document.getElementById("demo-recording-preview");
    if (!mount) return;

    activeIframe = null;
    mount.innerHTML = "";
    mount.classList.add("hero__shot--recording");

    var wrapper = document.createElement("div");
    wrapper.className = "hero__recording-preview-scaler";

    var scaleLayer = document.createElement("div");
    scaleLayer.className = "hero__recording-preview-scale-layer";

    var iframe = document.createElement("iframe");
    iframe.className = "hero__recording-preview-frame";
    iframe.title = "Hall demo recording preview";
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
      activeIframe = iframe;
      window.clearTimeout(fallbackTimer);
      requestAnimationFrame(function () {
        syncScale();
        requestAnimationFrame(syncScale);
      });
      if (autoStartDone) {
        postRecordingDemoStart();
      }
    });

    syncScale();
    window.addEventListener("resize", syncScale);

    if ("ResizeObserver" in window) {
      var resizeObserver = new ResizeObserver(syncScale);
      resizeObserver.observe(mount);
    }

    iframe.src = resolvePreviewHref();
  }

  observeSection();
  mountPreview();
  document.addEventListener("lyte-landing:theme", mountPreview);
})();
