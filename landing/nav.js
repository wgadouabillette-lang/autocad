// Shared navbar injected into every page.
// Uses `data-active` on a placeholder element to highlight the current tab.
(function () {
  const placeholder = document.getElementById("site-nav");
  if (!placeholder) return;
  const active = placeholder.getAttribute("data-active") || "";

  const DESKTOP_VIEWPORT_QUERY = "(min-width: 768px)";

  function isDesktopViewport() {
    return window.matchMedia(DESKTOP_VIEWPORT_QUERY).matches;
  }

  function resolveAppHref() {
    const { hostname, port } = window.location;
    const isLocal = hostname === "127.0.0.1" || hostname === "localhost";
    // Landing Vite dev server — the React app runs on the frontend dev server.
    if (isLocal && (port === "5190" || port === "5191")) {
      return "http://localhost:5173/app/";
    }
    return "/app/";
  }

  const appHref = resolveAppHref();
  const desktopOnly = !isDesktopViewport();
  const ctaIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" width="11" height="11" aria-hidden="true">' +
    '<path d="M7 17 17 7M9 7h8v8" />' +
    "</svg>";

  const ctaHtml = desktopOnly
    ? `<span class="nav__cta" aria-disabled="true" title="Lyte est disponible sur ordinateur uniquement">
        <span>Ouvrir Lyte</span>
        ${ctaIcon}
      </span>`
    : `<a class="nav__cta" href="${appHref}">
        <span>Ouvrir Lyte</span>
        ${ctaIcon}
      </a>`;

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
        ${ctaHtml}
      </div>
    </nav>
  `;
})();
