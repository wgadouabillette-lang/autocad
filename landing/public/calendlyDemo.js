(function () {
  var DEMO_URL = "https://calendly.com/wgadouabillette/30min";

  function openDemo(event) {
    if (!window.Calendly || typeof window.Calendly.initPopupWidget !== "function") return;
    event.preventDefault();
    window.Calendly.initPopupWidget({ url: DEMO_URL });
  }

  var link = document.getElementById("hero-book-demo");
  if (!link) return;
  link.href = DEMO_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.addEventListener("click", openDemo);
})();
