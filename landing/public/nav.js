// Shared navbar injected into every page.
// Uses `data-active` on a placeholder element to highlight the current tab.
(function () {
  const placeholder = document.getElementById("site-nav");
  if (!placeholder) return;
  const active = placeholder.getAttribute("data-active") || "";

  const MAC_URL =
    "https://firebasestorage.googleapis.com/v0/b/forma-cad-dev.firebasestorage.app/o/downloads%2FLyte-mac.dmg?alt=media";
  const MAC_NAME = "Lyte-mac.dmg";
  const WIN_URL =
    "https://firebasestorage.googleapis.com/v0/b/forma-cad-dev.firebasestorage.app/o/downloads%2FLyte-windows.exe?alt=media";
  const WIN_NAME = "Lyte-windows.exe";
  // macOS download disabled until Apple signing/notarization is ready.
  const MAC_DOWNLOAD_ENABLED = false;

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
        <a class="nav__cta" id="nav-signin" href="/app/">
          <span>Sign in</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" width="11" height="11" aria-hidden="true">
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        </a>

        <a
          class="nav__cta"
          id="nav-download"
          href="#"
          aria-disabled="true"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" width="11" height="11" aria-hidden="true">
            <path d="M12 4v12m0 0 5-5m-5 5-5-5M5 20h14" />
          </svg>
          <span id="nav-download-label">Télécharger</span>
        </a>
      </div>
    </nav>
  `;

  const navBtn = document.getElementById("nav-download");
  const navLabel = document.getElementById("nav-download-label");
  if (!navBtn || !navLabel) return;

  function detectPlatform() {
    const ua = navigator.userAgent.toLowerCase();
    const platform = (navigator.platform || "").toLowerCase();
    if (ua.includes("mac") || platform.includes("mac")) return "mac";
    if (ua.includes("win") || platform.includes("win")) return "win";
    return "other";
  }

  function compactLabel(label) {
    if (!window.matchMedia("(max-width: 420px)").matches) return label;
    if (label.includes("macOS")) return "macOS";
    if (label.includes("Windows")) return "Windows";
    return label;
  }

  function setDownload(url, filename, label) {
    navBtn.href = url;
    navBtn.setAttribute("download", filename);
    navBtn.removeAttribute("aria-disabled");
    navLabel.textContent = compactLabel(label);
  }

  function setUnavailable(platformLabel) {
    navBtn.removeAttribute("href");
    navBtn.removeAttribute("download");
    navBtn.setAttribute("aria-disabled", "true");
    navLabel.textContent = `${platformLabel} — Bientôt disponible`;
  }

  function initDownloadButton() {
    const platform = detectPlatform();

    if (platform === "win") {
      setDownload(WIN_URL, WIN_NAME, "Télécharger pour Windows");
      return;
    }

    if (platform === "mac") {
      if (MAC_DOWNLOAD_ENABLED) {
        setDownload(MAC_URL, MAC_NAME, "Télécharger pour macOS");
      } else {
        setUnavailable("macOS");
      }
      return;
    }

    setDownload(WIN_URL, WIN_NAME, "Télécharger pour Windows");
  }

  initDownloadButton();

  navBtn.addEventListener("click", (event) => {
    if (navBtn.getAttribute("aria-disabled") === "true") event.preventDefault();
  });
})();
