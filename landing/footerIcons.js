// SVG icons for the shared marketing footer (theme + language controls).
(function () {
  var SVG_ATTRS =
    ' xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"' +
    ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  var ICONS = {
    monitor:
      "<svg" +
      SVG_ATTRS +
      ' class="site-footer__icon" aria-hidden="true"><rect width="20" height="14" x="2" y="3" rx="2"/>' +
      '<line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>',
    sun:
      "<svg" +
      SVG_ATTRS +
      ' class="site-footer__icon" aria-hidden="true"><circle cx="12" cy="12" r="4"/>' +
      '<path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/>' +
      '<path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/>' +
      '<path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
    moon:
      "<svg" +
      SVG_ATTRS +
      ' class="site-footer__icon" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
    globe:
      "<svg" +
      SVG_ATTRS +
      ' class="site-footer__icon site-footer__icon--globe" aria-hidden="true"><circle cx="12" cy="12" r="10"/>' +
      '<path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
    chevronDown:
      "<svg" +
      SVG_ATTRS +
      ' class="site-footer__icon site-footer__icon--chevron" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    check:
      "<svg" +
      SVG_ATTRS +
      ' class="site-footer__icon site-footer__icon--check" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  };

  function icon(name) {
    return ICONS[name] || "";
  }

  function localeName(locale) {
    if (!window.HallLandingI18n) return locale === "fr" ? "Français" : "English";
    var locales = window.HallLandingI18n.LOCALES;
    return locales[locale === "fr" ? "fr" : "en"] || locales.en;
  }

  function langTriggerHtml(locale) {
    return (
      '<span class="site-footer__lang-trigger-inner">' +
      icon("globe") +
      '<span class="site-footer__lang-name">' +
      localeName(locale) +
      "</span>" +
      icon("chevronDown") +
      "</span>"
    );
  }

  window.HallFooterIcons = {
    icon: icon,
    langTriggerHtml: langTriggerHtml,
  };
})();
