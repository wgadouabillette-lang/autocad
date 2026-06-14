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
        <a class="nav__cta" href="/app/">
          <span>Ouvrir Lyte</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" width="11" height="11" aria-hidden="true">
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        </a>
      </div>
    </nav>
  `;
})();
