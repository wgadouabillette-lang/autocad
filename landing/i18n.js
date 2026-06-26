(function () {
  var LOCALES = {
    en: "English",
    fr: "Français",
  };

  var MESSAGES = {
    en: {
      "meta.title": "Lyte — Collaborative workspace",
      "meta.description":
        "Lyte — collaborative workspace with voice channels, AI chat, and screen recording.",
      "nav.pricing": "Pricing",
      "nav.careers": "Careers",
      "nav.skills": "Skills",
      "nav.connectors": "Connectors",
      "nav.workspaces": "Workspaces",
      "nav.resources": "Resources",
      "nav.openApp": "Open Lyte",
      "nav.openAppDesktopOnly": "Lyte is available on desktop only",
      "hero.title": "Your workspace,<br />in one app.",
      "hero.lead":
        "Voice channels, AI chat, calendar, screen recording, and connectors — Lyte brings everything your team needs day to day.",
      "hero.cta.start": "Get started",
      "hero.cta.pricing": "View pricing",
      "hero.shot.main.alt":
        "Lyte preview — main view with voice channels and AI chat",
      "hero.shot.voice.alt": "Lyte preview — voice channels and team calls",
      "hero.shot.voice.title": "Voice channels",
      "hero.shot.voice.desc":
        "Join teammates in one click — camera, screen share, and live presence.",
      "hero.shot.ai.alt": "Lyte preview — AI chat and agent",
      "hero.shot.ai.title": "AI assistant",
      "hero.shot.ai.desc":
        "Agent, live notes, and skills (/manage, /handoff) built into your workspace.",
      "hero.shot.calendar.alt": "Lyte preview — calendar and connectors",
      "hero.shot.calendar.title": "Calendar & connectors",
      "hero.shot.calendar.desc":
        "Schedule meetings and connect Gmail, Calendar, Spotify, and more.",
      "hero.shot.notes.alt": "Lyte preview — AI Notes and call recording",
      "hero.shot.notes.title": "AI Notes",
      "hero.shot.notes.desc":
        "Live transcription and structured notes during voice calls — without leaving Lyte.",
      "hero.shot.notes.cta": "Explore AI Notes",
      "hero.shot.workspace.alt": "Lyte preview — collaborative workspace and messaging",
      "hero.shot.workspace.title": "Team messaging",
      "hero.shot.workspace.desc":
        "Direct messages and group chats alongside voice — presence and history in one place.",
      "hero.shot.workspace.cta": "Explore messaging",
      "hero.shot.followup.alt": "Lyte preview — post-call follow-up and recap",
      "hero.shot.followup.title": "Post-call follow-up",
      "hero.shot.followup.desc":
        "Structured recap, action items, and draft emails — generated right after your meeting.",
      "hero.shot.followup.cta": "Explore follow-up",
      "highlights.heading": "Recent highlights",
      "highlights.card1.tag": "Voice",
      "highlights.card1.title": "Video spotlight",
      "highlights.card1.desc": "Expand a participant camera or screen share in one click.",
      "highlights.card2.tag": "Chat",
      "highlights.card2.title": "AI handoff",
      "highlights.card2.desc": "Share a conversation excerpt with a teammate or group.",
      "highlights.card3.tag": "Calls",
      "highlights.card3.title": "AI Notes",
      "highlights.card3.desc": "Live transcription during voice calls, right inside Lyte.",
      "highlights.card4.tag": "Connectors",
      "highlights.card4.title": "Spotify in chat",
      "highlights.card4.desc": "Play a track or queue it from the composer.",
      "highlights.card5.tag": "Presence",
      "highlights.card5.title": "Mute & hand raise",
      "highlights.card5.desc": "See who is muted or has raised a hand during a call.",
      "highlights.card6.tag": "Follow-up",
      "highlights.card6.title": "Post-call recap",
      "highlights.card6.desc": "Structured summary, calendar, and emails after your meeting.",
      "highlights.more": "View more product upgrades",
      "highlights.less": "View less product upgrades",
      "try.title": "Try Lyte Now.",
      "try.downloadMac": "Download for macOS",
      "try.downloadWin": "Download for Windows",
      "try.downloadMacAria": "Download Lyte for macOS",
      "try.downloadWinAria": "Download Lyte for Windows",
      "try.mobileStart": "Get started",
      "footer.product": "Product",
      "footer.openApp": "Open Lyte",
      "footer.pricing": "Pricing",
      "footer.downloadMac": "Download macOS",
      "footer.downloadWin": "Download Windows",
      "footer.resources": "Resources",
      "footer.signIn": "Sign in",
      "footer.guides": "Guides & legal",
      "footer.company": "Company",
      "footer.legal": "Legal",
      "footer.privacy": "Privacy",
      "footer.terms": "Terms",
      "footer.subprocessors": "Subprocessors",
      "footer.connect": "Connect",
      "footer.copyright": "© {year} Lyte. All rights reserved.",
      "footer.theme.system": "System theme",
      "footer.theme.light": "Light theme",
      "footer.theme.dark": "Dark theme",
      "footer.lang.label": "Language",
    },
    fr: {
      "meta.title": "Lyte — Espace de travail collaboratif",
      "meta.description":
        "Lyte — espace de travail collaboratif avec salons vocaux, chat IA et enregistrement d'écran.",
      "nav.pricing": "Tarifs",
      "nav.careers": "Careers",
      "nav.skills": "Skills",
      "nav.connectors": "Connecteurs",
      "nav.workspaces": "Workspaces",
      "nav.resources": "Ressources",
      "nav.openApp": "Ouvrir Lyte",
      "nav.openAppDesktopOnly": "Lyte est disponible sur ordinateur uniquement",
      "hero.title": "Votre espace de travail,<br />en une seule app.",
      "hero.lead":
        "Salons vocaux, chat IA, calendrier, enregistrement d'écran et connecteurs — Lyte regroupe tout ce dont votre équipe a besoin au quotidien.",
      "hero.cta.start": "Commencer",
      "hero.cta.pricing": "Voir les tarifs",
      "hero.shot.main.alt":
        "Aperçu de Lyte — vue principale avec salons vocaux et chat IA",
      "hero.shot.voice.alt": "Aperçu Lyte — salons vocaux et appels d'équipe",
      "hero.shot.voice.title": "Salons vocaux",
      "hero.shot.voice.desc":
        "Rejoignez vos collègues en un clic — caméra, partage d'écran et présence en direct.",
      "hero.shot.ai.alt": "Aperçu Lyte — chat IA et agent",
      "hero.shot.ai.title": "Assistant IA",
      "hero.shot.ai.desc":
        "Agent, notes live et skills (/manage, /handoff) intégrés à votre workspace.",
      "hero.shot.calendar.alt": "Aperçu Lyte — calendrier et connecteurs",
      "hero.shot.calendar.title": "Calendrier & connecteurs",
      "hero.shot.calendar.desc":
        "Planifiez vos réunions et branchez Gmail, Calendar, Spotify et plus encore.",
      "hero.shot.notes.alt": "Aperçu Lyte — AI Notes et enregistrement en appel vocal",
      "hero.shot.notes.title": "AI Notes",
      "hero.shot.notes.desc":
        "Transcription live et notes structurées pendant vos appels — sans quitter Lyte.",
      "hero.shot.notes.cta": "Découvrir AI Notes",
      "hero.shot.workspace.alt":
        "Aperçu Lyte — workspace collaboratif et messagerie d'équipe",
      "hero.shot.workspace.title": "Messagerie d'équipe",
      "hero.shot.workspace.desc":
        "Messages privés et groupes aux côtés de la voix — présence et historique au même endroit.",
      "hero.shot.workspace.cta": "Découvrir la messagerie",
      "hero.shot.followup.alt": "Aperçu Lyte — follow-up et récap post-appel",
      "hero.shot.followup.title": "Follow-up post-appel",
      "hero.shot.followup.desc":
        "Récap structuré, actions et brouillons d'emails — générés juste après votre réunion.",
      "hero.shot.followup.cta": "Découvrir le follow-up",
      "highlights.heading": "Recent highlights",
      "highlights.card1.tag": "Voice",
      "highlights.card1.title": "Spotlight vidéo",
      "highlights.card1.desc":
        "Agrandissez la caméra ou le partage d'écran d'un participant en un clic.",
      "highlights.card2.tag": "Chat",
      "highlights.card2.title": "Handoff IA",
      "highlights.card2.desc":
        "Transmettez un extrait de conversation à un collègue ou un groupe.",
      "highlights.card3.tag": "Calls",
      "highlights.card3.title": "AI Notes",
      "highlights.card3.desc":
        "Transcription live pendant vos appels vocaux, directement dans Lyte.",
      "highlights.card4.tag": "Connectors",
      "highlights.card4.title": "Spotify dans le chat",
      "highlights.card4.desc":
        "Lancez une piste ou ajoutez-la à la file depuis le composer.",
      "highlights.card5.tag": "Presence",
      "highlights.card5.title": "Mute & main levée",
      "highlights.card5.desc":
        "Voyez en direct qui est mute ou a levé la main dans l'appel.",
      "highlights.card6.tag": "Follow-up",
      "highlights.card6.title": "Récap post-appel",
      "highlights.card6.desc":
        "Synthèse structurée, calendrier et e-mails après votre réunion.",
      "highlights.more": "View more product upgrades",
      "highlights.less": "View less product upgrades",
      "try.title": "Try Lyte Now.",
      "try.downloadMac": "Download for macOS",
      "try.downloadWin": "Download for Windows",
      "try.downloadMacAria": "Télécharger Lyte pour macOS",
      "try.downloadWinAria": "Télécharger Lyte pour Windows",
      "try.mobileStart": "Commencer",
      "footer.product": "Produit",
      "footer.openApp": "Ouvrir Lyte",
      "footer.pricing": "Tarifs",
      "footer.downloadMac": "Télécharger macOS",
      "footer.downloadWin": "Télécharger Windows",
      "footer.resources": "Ressources",
      "footer.signIn": "Se connecter",
      "footer.guides": "Guides & légal",
      "footer.company": "Entreprise",
      "footer.legal": "Légal",
      "footer.privacy": "Confidentialité",
      "footer.terms": "Conditions",
      "footer.subprocessors": "Sous-traitants",
      "footer.connect": "Réseaux",
      "footer.copyright": "© {year} Lyte. Tous droits réservés.",
      "footer.theme.system": "Thème système",
      "footer.theme.light": "Thème clair",
      "footer.theme.dark": "Thème sombre",
      "footer.lang.label": "Langue",
    },
  };

  function t(key, locale, vars) {
    var lang = locale === "fr" ? "fr" : "en";
    var value = MESSAGES[lang][key] || MESSAGES.en[key] || key;
    if (vars) {
      Object.keys(vars).forEach(function (name) {
        value = value.replace("{" + name + "}", String(vars[name]));
      });
    }
    return value;
  }

  function apply(locale) {
    var lang = locale === "fr" ? "fr" : "en";
    document.querySelectorAll("[data-i18n]").forEach(function (node) {
      var key = node.getAttribute("data-i18n");
      if (!key) return;
      node.textContent = t(key, lang);
    });
    document.querySelectorAll("[data-i18n-html]").forEach(function (node) {
      var key = node.getAttribute("data-i18n-html");
      if (!key) return;
      node.innerHTML = t(key, lang);
    });
    document.querySelectorAll("[data-i18n-alt]").forEach(function (node) {
      var key = node.getAttribute("data-i18n-alt");
      if (!key) return;
      node.setAttribute("alt", t(key, lang));
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (node) {
      var key = node.getAttribute("data-i18n-aria");
      if (!key) return;
      node.setAttribute("aria-label", t(key, lang));
    });

    var titleKey = document.querySelector("title[data-i18n-title]");
    if (titleKey) {
      document.title = t(titleKey.getAttribute("data-i18n-title"), lang);
    }
    var meta = document.querySelector('meta[name="description"][data-i18n-content]');
    if (meta) {
      meta.setAttribute("content", t(meta.getAttribute("data-i18n-content"), lang));
    }

    var moreLabel = document.querySelector(".home-highlights__more-label");
    var moreBtn = document.getElementById("highlights-more");
    if (moreLabel && moreBtn) {
      var expanded = moreBtn.getAttribute("aria-expanded") === "true";
      moreLabel.textContent = t(expanded ? "highlights.less" : "highlights.more", lang);
    }

    if (window.LyteHomePage) {
      window.LyteHomePage.refreshDownloadLabel(lang);
    }
  }

  function languageLabel(locale) {
    if (window.LyteFooterIcons) {
      return window.LyteFooterIcons.langTriggerHtml(locale);
    }
    var locales = LOCALES;
    return locales[locale === "fr" ? "fr" : "en"] || locales.en;
  }

  window.LyteLandingI18n = {
    LOCALES: LOCALES,
    t: t,
    apply: apply,
    languageLabel: languageLabel,
  };

  apply(window.LyteSitePrefs ? window.LyteSitePrefs.getLocale() : "en");
})();
