(function () {
  var THEME_KEY = "lyte-landing-theme";
  var LANG_KEY = "lyte-landing-lang";
  var THEME_MODES = ["system", "light", "dark"];
  var DEFAULT_THEME = "system";
  var DEFAULT_LANG = "en";

  function resolveTheme(mode) {
    if (mode === "light" || mode === "dark") return mode;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(mode) {
    var root = document.documentElement;
    var resolved = resolveTheme(mode);
    root.dataset.themeMode = mode;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
  }

  function getThemeMode() {
    var stored = localStorage.getItem(THEME_KEY);
    return THEME_MODES.indexOf(stored) >= 0 ? stored : DEFAULT_THEME;
  }

  function setThemeMode(mode) {
    var next = THEME_MODES.indexOf(mode) >= 0 ? mode : DEFAULT_THEME;
    localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
  syncThemeButtons(next);
  document.dispatchEvent(
    new CustomEvent("lyte-landing:theme", { detail: { theme: resolveTheme(next), mode: next } }),
  );
}

  function getLocale() {
    var stored = localStorage.getItem(LANG_KEY);
    return stored === "fr" ? "fr" : DEFAULT_LANG;
  }

  function setLocale(locale) {
    var next = locale === "fr" ? "fr" : DEFAULT_LANG;
    localStorage.setItem(LANG_KEY, next);
    document.documentElement.lang = next;
    if (window.HallLandingI18n) {
      window.HallLandingI18n.apply(next);
    }
    syncLangTrigger(next);
    document.dispatchEvent(
      new CustomEvent("lyte-landing:locale", { detail: { locale: next } }),
    );
  }

  function syncThemeButtons(mode) {
    var root = document.getElementById("site-footer");
    if (!root) return;
    var buttons = root.querySelectorAll("[data-theme-mode]");
    buttons.forEach(function (btn) {
      var active = btn.getAttribute("data-theme-mode") === mode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function syncLangTrigger(locale) {
    var trigger = document.getElementById("footer-lang-trigger");
    if (!trigger || !window.HallLandingI18n) return;
    trigger.innerHTML = window.HallLandingI18n.languageLabel(locale);
  }

  function closeLangMenu() {
    var menu = document.getElementById("footer-lang-menu");
    var trigger = document.getElementById("footer-lang-trigger");
    if (!menu || !trigger) return;
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  function wireFooterControls() {
    var root = document.getElementById("site-footer");
    if (!root || root.dataset.prefsWired === "true") return;
    root.dataset.prefsWired = "true";

    root.querySelectorAll("[data-theme-mode]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setThemeMode(btn.getAttribute("data-theme-mode") || DEFAULT_THEME);
      });
    });

    var trigger = document.getElementById("footer-lang-trigger");
    var menu = document.getElementById("footer-lang-menu");
    if (trigger && menu) {
      trigger.addEventListener("click", function () {
        var open = menu.hidden;
        menu.hidden = !open;
        trigger.setAttribute("aria-expanded", open ? "true" : "false");
      });

      menu.querySelectorAll("[data-locale]").forEach(function (option) {
        option.addEventListener("click", function () {
          setLocale(option.getAttribute("data-locale") || DEFAULT_LANG);
          closeLangMenu();
        });
      });

      document.addEventListener("click", function (event) {
        if (!root.contains(event.target)) closeLangMenu();
      });

      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") closeLangMenu();
      });
    }

    syncThemeButtons(getThemeMode());
    syncLangTrigger(getLocale());
  }

  applyTheme(getThemeMode());
  document.documentElement.lang = getLocale();

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
    if (getThemeMode() === "system") applyTheme("system");
  });

  window.HallSitePrefs = {
    THEME_KEY: THEME_KEY,
    LANG_KEY: LANG_KEY,
    getThemeMode: getThemeMode,
    setThemeMode: setThemeMode,
    getLocale: getLocale,
    setLocale: setLocale,
    wireFooterControls: wireFooterControls,
    syncThemeButtons: syncThemeButtons,
    syncLangTrigger: syncLangTrigger,
  };
})();
