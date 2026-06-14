// Shared navbar injected into every page.
// Uses `data-active` on a placeholder element to highlight the current tab.
(function () {
  const placeholder = document.getElementById("site-nav");
  if (!placeholder) return;
  const active = placeholder.getAttribute("data-active") || "";

  const MAC_URL = "downloads/Lyte-mac.dmg";
  const MAC_NAME = "Lyte-mac.dmg";
  const WIN_URL = "downloads/Lyte-windows.exe";
  const WIN_NAME = "Lyte-windows.exe";

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

  function setDownload(url, filename, label) {
    navBtn.href = url;
    navBtn.setAttribute("download", filename);
    navBtn.removeAttribute("aria-disabled");
    navLabel.textContent = label;
  }

  function setUnavailable(platformLabel) {
    navBtn.removeAttribute("href");
    navBtn.removeAttribute("download");
    navBtn.setAttribute("aria-disabled", "true");
    navLabel.textContent = `${platformLabel} — Bientôt disponible`;
  }

  async function fileExists(url) {
    try {
      const response = await fetch(url, { method: "HEAD" });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function initDownloadButton() {
    const platform = detectPlatform();
    const target =
      platform === "win"
        ? { url: WIN_URL, name: WIN_NAME, label: "Télécharger pour Windows" }
        : { url: MAC_URL, name: MAC_NAME, label: "Télécharger pour macOS" };

    const available = await fileExists(target.url);
    if (available) {
      setDownload(target.url, target.name, target.label);
      return;
    }

    if (platform === "other") {
      const fallback =
        (await fileExists(MAC_URL))
          ? { url: MAC_URL, name: MAC_NAME, label: "Télécharger pour macOS" }
          : (await fileExists(WIN_URL))
            ? { url: WIN_URL, name: WIN_NAME, label: "Télécharger pour Windows" }
            : null;
      if (fallback) {
        setDownload(fallback.url, fallback.name, fallback.label);
        return;
      }
    }

    setUnavailable(platform === "win" ? "Windows" : "macOS");
  }

  void initDownloadButton();

  navBtn.addEventListener("click", (event) => {
    if (navBtn.getAttribute("aria-disabled") === "true") event.preventDefault();
  });
})();
