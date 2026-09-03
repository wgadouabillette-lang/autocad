(function () {
  var PREVIEW_WIDTH = 1680;
  var PREVIEW_HEIGHT = 940;
  var LOAD_TIMEOUT_MS = 8000;
  var HOLD_MS = 1000;
  var ZOOM_MS = 720;
  var EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
  var FEATURE_MESSAGE = "lyte-marketing-handoff-feature";

  var ZOOM = {
    hold: { vw: 700, vh: 500 },
    composer: { vw: 600, vh: 430 },
    results: { vw: 640, vh: 560 },
    done: { vw: 700, vh: 500 },
  };

  var BIAS = {
    hold: { x: 0.7, y: 0.76 },
    composer: { x: 0.7, y: 0.76 },
    results: { x: 0.68, y: 0.42 },
    done: { x: 0.7, y: 0.76 },
  };

  var DEFAULT_FOCUS = { x: 1520, y: 840 };
  var mountState = null;

  function resolvePreviewHref() {
    var params = new URLSearchParams();
    var theme = document.documentElement.dataset.theme || "dark";
    params.set("theme", theme);
    params.set("scene", "handoff");
    return "/app/preview.html?" + params.toString();
  }

  function showFallback(mount) {
    mount.innerHTML =
      '<img class="hero__feature-img" src="app-preview.png" alt="Meetra AI handoff preview" loading="eager" decoding="async" />';
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function applyCamera(state) {
    var width = state.mount.clientWidth;
    var height = state.mount.clientHeight;
    if (width <= 0 || height <= 0) return;

    var vw = state.cam.vw;
    var vh = state.cam.vh;
    var scale = Math.max(width / vw, height / vh);
    var scaledW = PREVIEW_WIDTH * scale;
    var scaledH = PREVIEW_HEIGHT * scale;
    var bias = BIAS[state.cam.zoom] || BIAS.composer;
    var targetX = width * bias.x;
    var targetY = height * bias.y;
    var offsetX = targetX - state.cam.fx * scale;
    var offsetY = targetY - state.cam.fy * scale;
    offsetX = clamp(offsetX, width - scaledW, 0);
    offsetY = clamp(offsetY, height - scaledH, 0);

    state.wrapper.style.width = width + "px";
    state.wrapper.style.height = height + "px";
    state.scaleLayer.style.width = PREVIEW_WIDTH + "px";
    state.scaleLayer.style.height = PREVIEW_HEIGHT + "px";
    state.scaleLayer.style.transform =
      "translate(" + offsetX + "px, " + offsetY + "px) scale(" + scale + ")";
  }

  function setCamera(state, fx, fy, zoom, durationMs) {
    var size = ZOOM[zoom] || ZOOM.composer;
    state.cam.fx = clamp(fx, 0, PREVIEW_WIDTH);
    state.cam.fy = clamp(fy, 0, PREVIEW_HEIGHT);
    state.cam.vw = size.vw;
    state.cam.vh = size.vh;
    state.cam.zoom = zoom;
    state.scaleLayer.style.transition =
      "transform " + Math.max(0, durationMs) + "ms " + EASE;
    applyCamera(state);
  }

  function postRun(iframe) {
    try {
      iframe.contentWindow.postMessage(
        { type: FEATURE_MESSAGE, action: "run" },
        window.location.origin,
      );
    } catch {
      /* ignore */
    }
  }

  function clearTimers(state) {
    state.timers.forEach(function (id) {
      window.clearTimeout(id);
    });
    state.timers = [];
  }

  function later(state, ms, fn) {
    var id = window.setTimeout(function () {
      state.timers = state.timers.filter(function (item) {
        return item !== id;
      });
      fn();
    }, ms);
    state.timers.push(id);
  }

  function maybePostRun(state) {
    if (!state.canRun || !state.childReady || !state.inView) return;
    state.childReady = false;
    postRun(state.iframe);
  }

  function startSequence(state) {
    if (!state.loaded || !state.inView || state.running) return;
    state.running = true;
    state.canRun = false;
    clearTimers(state);
    setCamera(state, state.cam.fx, state.cam.fy, "hold", 0);
    later(state, HOLD_MS, function () {
      if (!state.inView) {
        state.running = false;
        return;
      }
      setCamera(state, state.cam.fx, state.cam.fy, "composer", ZOOM_MS);
      state.canRun = true;
      maybePostRun(state);
    });
  }

  function onFeatureMessage(state, event) {
    if (event.origin !== window.location.origin) return;
    if (event.source !== state.iframe.contentWindow) return;
    var data = event.data;
    if (!data || data.type !== FEATURE_MESSAGE) return;
    if (data.phase === "ready") {
      state.childReady = true;
      if (typeof data.x === "number" && typeof data.y === "number") {
        setCamera(state, data.x, data.y, "hold", 0);
      }
      maybePostRun(state);
      return;
    }
    if (data.phase === "focus") {
      if (typeof data.x !== "number" || typeof data.y !== "number") return;
      setCamera(
        state,
        data.x,
        data.y,
        data.zoom || state.cam.zoom || "composer",
        typeof data.durationMs === "number" ? data.durationMs : ZOOM_MS,
      );
      return;
    }
    if (data.phase === "reset") {
      setCamera(state, DEFAULT_FOCUS.x, DEFAULT_FOCUS.y, "hold", ZOOM_MS);
      state.running = false;
      state.canRun = false;
      later(state, 400, function () {
        startSequence(state);
      });
    }
  }

  function mountPreview() {
    var mount = document.getElementById("handoff-feature-preview");
    if (!mount) return;

    if (mountState) {
      clearTimers(mountState);
      window.removeEventListener("resize", mountState.onResize);
      window.removeEventListener("message", mountState.onMessage);
      if (mountState.observer) mountState.observer.disconnect();
      if (mountState.resizeObserver) mountState.resizeObserver.disconnect();
      mountState = null;
    }

    var href = resolvePreviewHref();
    mount.innerHTML = "";

    var wrapper = document.createElement("div");
    wrapper.className = "hero__theater-feature-scaler";

    var scaleLayer = document.createElement("div");
    scaleLayer.className = "hero__theater-feature-scale-layer";
    scaleLayer.style.transition = "transform " + ZOOM_MS + "ms " + EASE;

    var iframe = document.createElement("iframe");
    iframe.className = "hero__theater-feature-frame";
    iframe.title = "Meetra AI handoff preview";
    iframe.loading = "eager";
    iframe.tabIndex = -1;
    iframe.setAttribute("aria-hidden", "true");

    scaleLayer.appendChild(iframe);
    wrapper.appendChild(scaleLayer);
    mount.appendChild(wrapper);

    var state = {
      mount: mount,
      wrapper: wrapper,
      scaleLayer: scaleLayer,
      iframe: iframe,
      cam: {
        fx: DEFAULT_FOCUS.x,
        fy: DEFAULT_FOCUS.y,
        vw: ZOOM.hold.vw,
        vh: ZOOM.hold.vh,
        zoom: "hold",
      },
      loaded: false,
      inView: false,
      running: false,
      canRun: false,
      childReady: false,
      timers: [],
      observer: null,
      resizeObserver: null,
      onResize: null,
      onMessage: null,
    };
    mountState = state;

    var loaded = false;
    var fallbackTimer = window.setTimeout(function () {
      if (!loaded) showFallback(mount);
    }, LOAD_TIMEOUT_MS);

    state.onResize = function () {
      state.scaleLayer.style.transition = "transform 0ms " + EASE;
      applyCamera(state);
    };
    state.onMessage = function (event) {
      onFeatureMessage(state, event);
    };

    iframe.addEventListener("load", function () {
      loaded = true;
      state.loaded = true;
      window.clearTimeout(fallbackTimer);
      requestAnimationFrame(function () {
        applyCamera(state);
        requestAnimationFrame(function () {
          applyCamera(state);
          startSequence(state);
        });
      });
    });

    window.addEventListener("resize", state.onResize);
    window.addEventListener("message", state.onMessage);

    if ("ResizeObserver" in window) {
      state.resizeObserver = new ResizeObserver(function () {
        applyCamera(state);
      });
      state.resizeObserver.observe(mount);
    }

    if ("IntersectionObserver" in window) {
      state.observer = new IntersectionObserver(
        function (entries) {
          var entry = entries[0];
          state.inView = !!(entry && entry.isIntersecting && entry.intersectionRatio >= 0.28);
          if (state.inView) startSequence(state);
        },
        { threshold: [0, 0.28, 0.5] },
      );
      state.observer.observe(mount);
    } else {
      state.inView = true;
    }

    applyCamera(state);
    iframe.src = href;
  }

  mountPreview();
  document.addEventListener("lyte-landing:theme", mountPreview);
})();
