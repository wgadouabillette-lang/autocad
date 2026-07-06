(function () {
  var THEME_KEY = "lyte-landing-theme";
  var LANG_KEY = "lyte-landing-lang";
  var DEFAULT_LANG = "en";

  function applyTheme() {
    var root = document.documentElement;
    root.dataset.themeMode = "dark";
    root.dataset.theme = "dark";
    root.style.colorScheme = "dark";
  }

  function getThemeMode() {
    return "dark";
  }

  function setThemeMode() {
    localStorage.setItem(THEME_KEY, "dark");
    applyTheme();
    document.dispatchEvent(
      new CustomEvent("lyte-landing:theme", { detail: { theme: "dark", mode: "dark" } }),
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

    syncLangTrigger(getLocale());
  }

  localStorage.setItem(THEME_KEY, "dark");
  applyTheme();
  document.documentElement.lang = getLocale();

  window.HallSitePrefs = {
    THEME_KEY: THEME_KEY,
    LANG_KEY: LANG_KEY,
    getThemeMode: getThemeMode,
    setThemeMode: setThemeMode,
    getLocale: getLocale,
    setLocale: setLocale,
    wireFooterControls: wireFooterControls,
    syncLangTrigger: syncLangTrigger,
  };
})();
