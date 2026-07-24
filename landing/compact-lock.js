/**
 * Hard-lock scroll on the compact landing (CSS alone is not enough with iframes).
 */
(function () {
  if (!document.body.classList.contains("landing-locked")) return;

  function preventScroll(event) {
    event.preventDefault();
  }

  var opts = { passive: false };
  window.addEventListener("wheel", preventScroll, opts);
  window.addEventListener("touchmove", preventScroll, opts);
  window.addEventListener(
    "keydown",
    function (event) {
      var keys = [
        "ArrowUp",
        "ArrowDown",
        "PageUp",
        "PageDown",
        "Home",
        "End",
        " ",
        "Spacebar",
      ];
      if (keys.indexOf(event.key) !== -1) {
        event.preventDefault();
      }
    },
    opts,
  );

  // Keep document pinned at top if anything still shifts it.
  window.addEventListener(
    "scroll",
    function () {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
    },
    { passive: true },
  );
})();
