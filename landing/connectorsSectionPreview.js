(function () {
  var list = document.getElementById("connectors-cascade-list");
  if (!list) return;

  var CYCLE_MS = 10000;

  function replayCascade() {
    list.classList.remove("is-animating");
    void list.offsetWidth;
    list.classList.add("is-animating");
  }

  replayCascade();
  window.setInterval(replayCascade, CYCLE_MS);
})();
