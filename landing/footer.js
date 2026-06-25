// Shared footer injected on marketing pages via #site-footer placeholder.
(function () {
  var mount = document.getElementById("site-footer");
  if (!mount) return;

  function resolveAppHref() {
    var hostname = window.location.hostname;
    var port = window.location.port;
    var isLocal = hostname === "127.0.0.1" || hostname === "localhost";
    if (isLocal && (port === "5190" || port === "5191")) {
      return "http://localhost:5173/app/";
    }
    return "/app/";
  }

  function link(href, label, external) {
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

  function column(title, itemsHtml) {
    return (
      '<div class="site-footer__col">' +
      '<h3 class="site-footer__col-title">' +
      title +
      "</h3>" +
      '<ul class="site-footer__col-list">' +
      itemsHtml +
      "</ul>" +
      "</div>"
    );
  }

  var appHref = resolveAppHref();
  var year = String(new Date().getFullYear());

  var columns = [
    column(
      "Produit",
      link(appHref, "Ouvrir Lyte") +
        link("tarifs.html", "Tarifs") +
        link("/downloads/Lyte-mac.dmg", "Télécharger macOS") +
        link("/downloads/Lyte-windows.exe", "Télécharger Windows"),
    ),
    column(
      "Ressources",
      link("ressources.html", "Ressources") +
        link("auth.html", "Se connecter") +
        link("ressources.html", "Guides &amp; légal"),
    ),
    column("Entreprise", link("careers.html", "Careers")),
    column(
      "Légal",
      link("privacy.html", "Confidentialité") +
        link("terms.html", "Conditions") +
        link("subprocessors.html", "Sous-traitants"),
    ),
    column(
      "Réseaux",
      link("https://x.com/", "X", true) +
        link("https://www.linkedin.com/", "LinkedIn", true),
    ),
  ].join("");

  mount.outerHTML =
    '<footer id="site-footer" class="site-footer">' +
    '<div class="site-footer__nav-wrap">' +
    '<nav class="site-footer__nav" aria-label="Pied de page">' +
    '<div class="site-footer__columns">' +
    columns +
    "</div>" +
    "</nav>" +
    "</div>" +
    '<div class="site-footer__bar">' +
    '<small class="site-footer__copy">© ' +
    year +
    " Lyte. Tous droits réservés.</small>" +
    "</div>" +
    "</footer>";
})();
