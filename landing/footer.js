// Shared footer injected on marketing pages via #site-footer placeholder.
(function () {
  function resolveAppHref() {
    var hostname = window.location.hostname;
    var port = window.location.port;
    var isLocal = hostname === "127.0.0.1" || hostname === "localhost";
    if (isLocal && (port === "5190" || port === "5191")) {
      return "http://localhost:5173/app/";
    }
    return "/app/";
  }

  function t(key, vars) {
    var locale = window.HallSitePrefs ? window.HallSitePrefs.getLocale() : "en";
    if (window.HallLandingI18n) return window.HallLandingI18n.t(key, locale, vars);
    return key;
  }

  function link(href, labelKey, external) {
    var label = t(labelKey);
    var ext = external
      ? '<span class="footer-link__ext" aria-hidden="true">&nbsp;↗</span>'
      : "";
    var attrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
    return (
      '<li><a class="footer-link" href="' +
      href +
      '"' +
      attrs +
      ">" +
      label +
      ext +
      "</a></li>"
    );
  }

  function socialLink(href, label) {
    return (
      '<li><a class="footer-link" href="' +
      href +
      '" target="_blank" rel="noopener noreferrer">' +
      label +
      '<span class="footer-link__ext" aria-hidden="true">&nbsp;↗</span></a></li>'
    );
  }

  function column(titleKey, itemsHtml) {
    return (
      '<div class="site-footer__col">' +
      '<h3 class="site-footer__col-title">' +
      t(titleKey) +
      "</h3>" +
      '<ul class="site-footer__col-list">' +
      itemsHtml +
      "</ul>" +
      "</div>"
    );
  }

  function languageMenuHtml() {
    var locale = window.HallSitePrefs ? window.HallSitePrefs.getLocale() : "en";
    var checkIcon = window.HallFooterIcons ? window.HallFooterIcons.icon("check") : "";
    return ["en", "fr"]
      .map(function (code) {
        var selected = code === locale;
        return (
          '<button type="button" class="site-footer__lang-option" role="option"' +
          ' data-locale="' +
          code +
          '" aria-selected="' +
          (selected ? "true" : "false") +
          '">' +
          "<span>" +
          (window.HallLandingI18n ? window.HallLandingI18n.LOCALES[code] : code) +
          "</span>" +
          (selected ? '<span class="site-footer__lang-check">' + checkIcon + "</span>" : "") +
          "</button>"
        );
      })
      .join("");
  }

  function themeBtn(mode, labelKey) {
    var iconName = mode === "light" ? "sun" : mode === "dark" ? "moon" : "monitor";
    var iconHtml = window.HallFooterIcons ? window.HallFooterIcons.icon(iconName) : "";
    return (
      '<button type="button" class="site-footer__theme-btn" data-theme-mode="' +
      mode +
      '" aria-label="' +
      t(labelKey) +
      '">' +
      iconHtml +
      "</button>"
    );
  }

  function controlsHtml() {
    var locale = window.HallSitePrefs ? window.HallSitePrefs.getLocale() : "en";
    var langTrigger = window.HallFooterIcons
      ? window.HallFooterIcons.langTriggerHtml(locale)
      : window.HallLandingI18n
        ? window.HallLandingI18n.languageLabel(locale)
        : "English";
    return (
      '<div class="site-footer__controls">' +
      '<div class="site-footer__theme-switch" role="group" aria-label="' +
      t("footer.theme.system") +
      '">' +
      themeBtn("system", "footer.theme.system") +
      themeBtn("light", "footer.theme.light") +
      themeBtn("dark", "footer.theme.dark") +
      "</div>" +
      '<div class="site-footer__lang">' +
      '<button type="button" class="site-footer__lang-trigger" id="footer-lang-trigger"' +
      ' aria-expanded="false" aria-controls="footer-lang-menu" aria-haspopup="listbox"' +
      ' aria-label="' +
      t("footer.lang.label") +
      '">' +
      langTrigger +
      "</button>" +
      '<div class="site-footer__lang-menu" id="footer-lang-menu" role="listbox" hidden>' +
      languageMenuHtml() +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function buildFooterHtml() {
    var appHref = resolveAppHref();
    var year = String(new Date().getFullYear());
    var columns = [
      column(
        "footer.product",
        link(appHref, "footer.openApp") +
          link("tarifs.html", "footer.pricing") +
          link("/downloads/Hall-mac.dmg", "footer.downloadMac") +
          link("/downloads/Hall-windows.exe", "footer.downloadWin"),
      ),
      column(
        "footer.resources",
        link("ressources.html", "footer.resources") +
          link("auth.html", "footer.signIn") +
          link("ressources.html", "footer.guides"),
      ),
      column("footer.company", link("careers.html", "nav.careers")),
      column(
        "footer.legal",
        link("privacy.html", "footer.privacy") +
          link("terms.html", "footer.terms") +
          link("subprocessors.html", "footer.subprocessors"),
      ),
      column(
        "footer.connect",
        socialLink("https://x.com/", "X") +
          socialLink("https://www.linkedin.com/", "LinkedIn"),
      ),
    ].join("");

    return (
      '<footer id="site-footer" class="site-footer">' +
      '<div class="site-footer__nav-wrap">' +
      '<nav class="site-footer__nav" aria-label="Footer">' +
      '<div class="site-footer__columns">' +
      columns +
      "</div>" +
      "</nav>" +
      "</div>" +
      '<div class="site-footer__bar">' +
      '<small class="site-footer__copy">' +
      t("footer.copyright", { year: year }) +
      "</small>" +
      controlsHtml() +
      "</div>" +
      "</footer>"
    );
  }

  function mountFooter() {
    var mount = document.getElementById("site-footer");
    if (!mount) return;
    mount.outerHTML = buildFooterHtml();
    if (window.HallSitePrefs) {
      window.HallSitePrefs.wireFooterControls();
    }
  }

  mountFooter();
  document.addEventListener("lyte-landing:locale", mountFooter);
})();
