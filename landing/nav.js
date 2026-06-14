// Shared navbar injected into every page.
// Uses `data-active` on a placeholder element to highlight the current tab.
(function () {
  const placeholder = document.getElementById("site-nav");
  if (!placeholder) return;
  const active = placeholder.getAttribute("data-active") || "";

  const tabs = [
    { id: "tarifs", label: "Tarifs", href: "tarifs.html" },
    { id: "careers", label: "Careers", href: "careers.html" },
    { id: "ressources", label: "Ressources", href: "ressources.html" },
  ];

  const tabsHtml = tabs
    .map((tab) => {
      const isActive = tab.id === active;
      return `<li><a class="nav__tab${isActive ? " nav__tab--active" : ""}" href="${tab.href}"${
        isActive ? ' aria-current="page"' : ""
      }>${tab.label}</a></li>`;
    })
    .join("");

  placeholder.outerHTML = `
    <nav class="nav">
      <a class="nav__logo" href="index.html" aria-label="Lyte">
        <img src="icon.png" alt="" class="nav__logo-icon" width="26" height="26" />
        <span>Lyte</span>
      </a>

      <ul class="nav__tabs" role="list">${tabsHtml}</ul>

      <div class="nav__actions">
        <a class="nav__cta" id="nav-signin" href="http://localhost:5173/">
          <span>Sign in</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" width="11" height="11" aria-hidden="true">
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        </a>

        <a
          class="nav__cta"
          id="nav-download"
          href="downloads/Lyte-mac.dmg"
          download="Lyte-mac.dmg"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" width="11" height="11" aria-hidden="true">
            <path d="M12 4v12m0 0 5-5m-5 5-5-5M5 20h14" />
          </svg>
          <span id="nav-download-label">Télécharger</span>
        </a>
      </div>
    </nav>
  `;

  // Platform-aware download button.
  const MAC_URL = "downloads/Lyte-mac.dmg";
  const WIN_URL = "downloads/Lyte-windows.exe";
  const navBtn = document.getElementById("nav-download");
  const navLabel = document.getElementById("nav-download-label");
  if (!navBtn || !navLabel) return;

  const platform = (() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac")) return "mac";
    if (ua.includes("win")) return "win";
    return "other";
  })();

  function applyMac() {
    navBtn.href = MAC_URL;
    navBtn.setAttribute("download", "Lyte-mac.dmg");
    navBtn.removeAttribute("aria-disabled");
    navLabel.textContent = "Télécharger pour macOS";
  }
  function applyWinReady() {
    navBtn.href = WIN_URL;
    navBtn.setAttribute("download", "Lyte-windows.exe");
    navBtn.removeAttribute("aria-disabled");
    navLabel.textContent = "Télécharger pour Windows";
  }
  function applyWinSoon() {
    navBtn.removeAttribute("href");
    navBtn.removeAttribute("download");
    navBtn.setAttribute("aria-disabled", "true");
    navLabel.textContent = "Windows — Bientôt disponible";
  }

  if (platform === "win") {
    applyWinSoon();
    fetch(WIN_URL, { method: "HEAD" })
      .then((res) => {
        if (res.ok) applyWinReady();
      })
      .catch(() => {});
  } else {
    applyMac();
  }

  navBtn.addEventListener("click", (event) => {
    if (navBtn.getAttribute("aria-disabled") === "true") event.preventDefault();
  });
})();
