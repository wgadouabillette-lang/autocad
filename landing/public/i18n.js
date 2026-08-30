(function () {
  var LOCALES = {
    en: "English",
    fr: "Français",
  };

  var MESSAGES = {
    en: {
      "meta.title": "Meetra — Collaborative workspace",
      "meta.description":
        "Meetra is a desktop team workspace with voice channels, AI chat, calendar, screen recording, and Google/Spotify connectors — download the app to collaborate.",
      "nav.pricing": "Pricing",
      "nav.careers": "Careers",
      "nav.skills": "Skills",
      "nav.connectors": "Connectors",
      "nav.workspaces": "Workspaces",
      "nav.music": "Music",
      "nav.privacy": "Privacy",
      "nav.affiliate": "Affiliate",
      "nav.affiliateSoon": "Coming soon",
      "nav.resources": "Resources",
      "nav.openApp": "Open on web",
      "nav.openAppDesktopOnly": "Meetra is available on desktop only",
      "hero.title": "AI-powered collaborative<br />workspace for teams",
      "hero.lead":
        "A collaborative workspace application that helps teams communicate, organize meetings, manage tasks, and connect productivity tools.",
      "hero.cta.start": "Get started",
      "hero.cta.pricing": "View pricing",
      "hero.shots.trio.title": "From conversation to action",
      "hero.shot.main.alt":
        "Meetra preview — main view with voice channels and AI chat",
      "hero.shot.voice.alt": "Meetra preview — voice channels and team calls",
      "hero.shot.voice.title": "Voice channels",
      "hero.shot.voice.desc":
        "Join teammates in one click — camera, screen share, and live presence.",
      "hero.shot.skills.alt": "Meetra preview — AI Skills slash commands in chat",
      "hero.shot.skills.title": "AI Skills",
      "hero.shot.skills.desc":
        "Type / for in-app skills — schedule tasks with /manage or share context with /handoff.",
      "hero.shot.recording.alt": "Meetra preview — demo recording with active record button",
      "hero.shot.recording.title": "Demo Recording",
      "hero.shot.recording.desc":
        "Capture your screen and voice from the bottom bar — one click to record.",
      "hero.shot.calendar.alt": "Meetra preview — calendar and connectors",
      "hero.shot.calendar.title": "Calendar & connectors",
      "hero.shot.calendar.desc":
        "Schedule meetings and connect Gmail, Calendar, Spotify, and more.",
      "hero.shot.notes.alt": "Meetra preview — Starboy playing in the workspace",
      "hero.shot.notes.title": "Spotify integrated",
      "hero.shot.notes.desc":
        "Play Spotify inside Meetra — see what’s playing while you chat.",
      "hero.shot.notes.cta": "Explore Spotify",
      "hero.shot.workspace.alt": "Meetra preview — AI one-pager handed off to a teammate",
      "hero.shot.workspace.title": "AI handoff",
      "hero.shot.workspace.desc":
        "Select messages from any thread and send them to a teammate or group with /handoff — full context, zero copy-paste.",
      "hero.shot.workspace.cta": "Explore handoff",
      "hero.shot.followup.alt": "Meetra preview — Notes tab after a completed meeting",
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
      "highlights.card3.desc": "Live transcription during voice calls, right inside Meetra.",
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
      "try.title": "Try Meetra Now.",
      "try.downloadMac": "Download for macOS",
      "try.downloadWin": "Download for Windows",
      "try.downloadLinux": "Download for Linux",
      "try.downloadMacAria": "Download Meetra for macOS",
      "try.downloadWinAria": "Download Meetra for Windows",
      "try.downloadLinuxAria": "Download Meetra for Linux",
      "nav.downloadUnavailable": "Unavailable on mobile",
      "try.mobileStart": "Get started",
      "footer.product": "Product",
      "footer.openApp": "Open on web",
      "footer.pricing": "Pricing",
      "footer.downloadMac": "Download macOS",
      "footer.downloadWin": "Download Windows",
      "footer.downloadLinux": "Download Linux",
      "footer.resources": "Resources",
      "footer.signIn": "Sign in",
      "footer.guides": "Guides & legal",
      "footer.company": "Company",
      "footer.legal": "Legal",
      "footer.privacy": "Privacy",
      "footer.terms": "Terms",
      "footer.subprocessors": "Subprocessors",
      "footer.googleLimitedUse": "Google Limited Use",
      "footer.connect": "Connect",
      "footer.copyright": "© {year} Meetra. All rights reserved.",
      "footer.theme.system": "System theme",
      "footer.theme.light": "Light theme",
      "footer.theme.dark": "Dark theme",
      "footer.lang.label": "Language",
      "careers.meta.title": "Meetra — Careers",
      "careers.meta.description":
        "Join Meetra — help build the collaborative workspace teams actually want.",
      "careers.intro.title": "Help us build the workspace teams actually want",
      "careers.intro.p1":
        "Meetra is a collaborative workspace — voice channels, AI chat, calendar, connectors, and post-call follow-up in one desktop app. We're building the tool we wished we had when juggling calls, chat, and a dozen tabs.",
      "careers.intro.p2":
        "We're early but shipping fast: real-time voice with AI notes, an agent with skills, and integrations teams use every day. We're a small, focused team with big ambitions for how teams work together.",
      "careers.intro.p3":
        "As an early team member, you'll shape the product, stack, and culture from the ground up — from core infrastructure to pixel-perfect design.",
      "careers.intro.p4":
        "If that sounds exciting, write us at <a class=\"careers-intro__link\" href=\"mailto:careers@hall.app\">careers@hall.app</a>.",
      "careers.board.heading": "Open roles",
      "careers.board.empty": "No roles available at the moment.",
      "careers.filters.label": "Filters:",
      "careers.filters.reset": "Reset filters",
      "careers.filters.noneApplied": "No filters applied",
      "careers.filters.applied": "{count} roles match your filters",
      "careers.filters.department": "Department",
      "careers.filters.allDepartments": "All Departments",
      "careers.filters.design": "Design",
      "careers.filters.engineering": "Engineering",
      "careers.filters.product": "Product",
      "careers.filters.employment": "Employment Type",
      "careers.filters.allEmployment": "All Employment Types",
      "careers.filters.fulltime": "Full time",
      "careers.filters.location": "Location",
      "careers.filters.allLocations": "All Locations",
      "careers.filters.parisRemote": "Paris or Remote (Europe, North America)",
      "careers.filters.workplace": "Location Type",
      "careers.filters.allWorkplaces": "All Location Types",
      "careers.filters.remote": "Remote",
      "careers.dept.design": "Design",
      "careers.dept.engineering": "Engineering",
      "careers.dept.product": "Product",
      "careers.job.designer.title": "Product Designer",
      "careers.job.designer.meta":
        "Design • Paris or Remote (Europe, North America) • Full time • Remote",
      "careers.job.backend.title": "Software Engineer, Backend",
      "careers.job.backend.meta":
        "Engineering • Paris or Remote (Europe, North America) • Full time • Remote",
      "careers.job.productEng.title": "Software Engineer, Product",
      "careers.job.productEng.meta":
        "Engineering • Paris or Remote (Europe, North America) • Full time • Remote",
      "careers.job.tpm.title": "Technical Product Manager",
      "careers.job.tpm.meta":
        "Product • Paris or Remote (Europe, North America) • Full time • Remote",
    },
    fr: {
      "meta.title": "Meetra — Espace de travail collaboratif",
      "meta.description":
        "Meetra est une app desktop d'espace de travail d'équipe : canaux vocaux, chat IA, calendrier, enregistrement d'écran et connecteurs Google/Spotify — téléchargez l'app pour collaborer.",
      "nav.pricing": "Tarifs",
      "nav.careers": "Careers",
      "nav.skills": "Skills",
      "nav.connectors": "Connecteurs",
      "nav.workspaces": "Workspaces",
      "nav.music": "Musique",
      "nav.privacy": "Confidentialité",
      "nav.affiliate": "Affiliation",
      "nav.affiliateSoon": "Bientôt disponible",
      "nav.resources": "Ressources",
      "nav.openApp": "Ouvrir le web",
      "nav.openAppDesktopOnly": "Meetra est disponible sur ordinateur uniquement",
      "hero.title": "Espace de travail collaboratif<br />propulsé par l'IA",
      "hero.lead":
        "Une application d'espace de travail collaboratif qui aide les équipes à communiquer, organiser des réunions, gérer des tâches et connecter leurs outils de productivité.",
      "hero.cta.start": "Commencer",
      "hero.cta.pricing": "Voir les tarifs",
      "hero.shots.trio.title": "From conversation to action",
      "hero.shot.main.alt":
        "Aperçu de Meetra — vue principale avec salons vocaux et chat IA",
      "hero.shot.voice.alt": "Aperçu Meetra — salons vocaux et appels d'équipe",
      "hero.shot.voice.title": "Salons vocaux",
      "hero.shot.voice.desc":
        "Rejoignez vos collègues en un clic — caméra, partage d'écran et présence en direct.",
      "hero.shot.skills.alt": "Meetra preview — AI Skills slash commands in chat",
      "hero.shot.skills.title": "AI Skills",
      "hero.shot.skills.desc":
        "Type / for in-app skills — schedule tasks with /manage or share context with /handoff.",
      "hero.shot.recording.alt": "Meetra preview — demo recording with active record button",
      "hero.shot.recording.title": "Demo Recording",
      "hero.shot.recording.desc":
        "Capture your screen and voice from the bottom bar — one click to record.",
      "hero.shot.calendar.alt": "Meetra preview — calendar and connectors",
      "hero.shot.calendar.title": "Calendar & connectors",
      "hero.shot.calendar.desc":
        "Schedule meetings and connect Gmail, Calendar, Spotify, and more.",
      "hero.shot.notes.alt": "Aperçu Meetra — Starboy en lecture dans l’espace de travail",
      "hero.shot.notes.title": "Spotify intégré",
      "hero.shot.notes.desc":
        "Écoutez Spotify dans Meetra — la piste en cours s’affiche pendant que vous discutez.",
      "hero.shot.notes.cta": "Découvrir Spotify",
      "hero.shot.workspace.alt": "Aperçu Meetra — one-pager IA transmis à un collègue",
      "hero.shot.workspace.title": "Handoff IA",
      "hero.shot.workspace.desc":
        "Sélectionnez des messages dans n'importe quel fil et envoyez-les à un collègue ou un groupe avec /handoff — le contexte, sans copier-coller.",
      "hero.shot.workspace.cta": "Découvrir handoff",
      "hero.shot.followup.alt": "Aperçu Meetra — onglet Notes après une réunion terminée",
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
        "Transcription live pendant vos appels vocaux, directement dans Meetra.",
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
      "try.title": "Try Meetra Now.",
      "try.downloadMac": "Download for macOS",
      "try.downloadWin": "Download for Windows",
      "try.downloadLinux": "Télécharger pour Linux",
      "try.downloadMacAria": "Télécharger Meetra pour macOS",
      "try.downloadWinAria": "Télécharger Meetra pour Windows",
      "try.downloadLinuxAria": "Télécharger Meetra pour Linux",
      "nav.downloadUnavailable": "Indisponible sur mobile",
      "try.mobileStart": "Commencer",
      "footer.product": "Produit",
      "footer.openApp": "Ouvrir le web",
      "footer.pricing": "Tarifs",
      "footer.downloadMac": "Télécharger macOS",
      "footer.downloadWin": "Télécharger Windows",
      "footer.downloadLinux": "Télécharger Linux",
      "footer.resources": "Ressources",
      "footer.signIn": "Se connecter",
      "footer.guides": "Guides & légal",
      "footer.company": "Entreprise",
      "footer.legal": "Légal",
      "footer.privacy": "Confidentialité",
      "footer.terms": "Conditions",
      "footer.subprocessors": "Sous-traitants",
      "footer.googleLimitedUse": "Google Limited Use",
      "footer.connect": "Réseaux",
      "footer.copyright": "© {year} Meetra. Tous droits réservés.",
      "footer.theme.system": "Thème système",
      "footer.theme.light": "Thème clair",
      "footer.theme.dark": "Thème sombre",
      "footer.lang.label": "Langue",
      "careers.meta.title": "Meetra — Careers",
      "careers.meta.description":
        "Rejoignez Meetra — construisez l'espace de travail collaboratif dont les équipes ont besoin.",
      "careers.intro.title": "Construisons l'espace de travail dont les équipes ont vraiment besoin",
      "careers.intro.p1":
        "Meetra est un espace de travail collaboratif — salons vocaux, chat IA, calendrier, connecteurs et follow-up post-appel dans une seule app desktop. On construit l'outil qu'on aurait aimé avoir entre appels, chat et douzaines d'onglets.",
      "careers.intro.p2":
        "On est encore early stage mais on ship vite : voix temps réel avec AI Notes, un agent avec skills, et des intégrations utilisées au quotidien. Petite équipe, grandes ambitions sur la façon dont les équipes travaillent ensemble.",
      "careers.intro.p3":
        "En tant que membre fondateur, tu façonneras le produit, la stack et la culture — de l'infra core au design pixel-perfect.",
      "careers.intro.p4":
        "Si ça te parle, écris-nous à <a class=\"careers-intro__link\" href=\"mailto:careers@hall.app\">careers@hall.app</a>.",
      "careers.board.heading": "Nos offres",
      "careers.board.empty": "Aucune offre disponible pour le moment.",
      "careers.filters.label": "Filtres :",
      "careers.filters.reset": "Réinitialiser",
      "careers.filters.noneApplied": "Aucun filtre appliqué",
      "careers.filters.applied": "{count} postes correspondent à vos filtres",
      "careers.filters.department": "Département",
      "careers.filters.allDepartments": "Tous les départements",
      "careers.filters.design": "Design",
      "careers.filters.engineering": "Ingénierie",
      "careers.filters.product": "Produit",
      "careers.filters.employment": "Type d'emploi",
      "careers.filters.allEmployment": "Tous les types",
      "careers.filters.fulltime": "Temps plein",
      "careers.filters.location": "Lieu",
      "careers.filters.allLocations": "Tous les lieux",
      "careers.filters.parisRemote": "Paris ou remote (Europe, Amérique du Nord)",
      "careers.filters.workplace": "Mode de travail",
      "careers.filters.allWorkplaces": "Tous les modes",
      "careers.filters.remote": "Remote",
      "careers.dept.design": "Design",
      "careers.dept.engineering": "Ingénierie",
      "careers.dept.product": "Produit",
      "careers.job.designer.title": "Product Designer",
      "careers.job.designer.meta":
        "Design • Paris ou remote (Europe, Amérique du Nord) • Temps plein • Remote",
      "careers.job.backend.title": "Software Engineer, Backend",
      "careers.job.backend.meta":
        "Ingénierie • Paris ou remote (Europe, Amérique du Nord) • Temps plein • Remote",
      "careers.job.productEng.title": "Software Engineer, Product",
      "careers.job.productEng.meta":
        "Ingénierie • Paris ou remote (Europe, Amérique du Nord) • Temps plein • Remote",
      "careers.job.tpm.title": "Technical Product Manager",
      "careers.job.tpm.meta":
        "Produit • Paris ou remote (Europe, Amérique du Nord) • Temps plein • Remote",
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

    if (window.HallHomePage && window.HallHomePage.refreshHighlightsMoreLabel) {
      window.HallHomePage.refreshHighlightsMoreLabel();
    } else {
      var highlightsMoreBtn = document.getElementById("highlights-more");
      var highlightsMoreLabel = highlightsMoreBtn
        ? highlightsMoreBtn.querySelector(".home-highlights__more-label")
        : null;
      if (highlightsMoreBtn && highlightsMoreLabel) {
        var expanded = highlightsMoreBtn.getAttribute("aria-expanded") === "true";
        highlightsMoreLabel.textContent = t(
          expanded ? "highlights.less" : "highlights.more",
          lang,
        );
      }
    }

    if (window.HallHomePage) {
      window.HallHomePage.refreshDownloadLabel(lang);
    }
  }

  function languageLabel(locale) {
    if (window.HallFooterIcons) {
      return window.HallFooterIcons.langTriggerHtml(locale);
    }
    var locales = LOCALES;
    return locales[locale === "fr" ? "fr" : "en"] || locales.en;
  }

  window.HallLandingI18n = {
    LOCALES: LOCALES,
    t: t,
    apply: apply,
    languageLabel: languageLabel,
  };

  apply(window.HallSitePrefs ? window.HallSitePrefs.getLocale() : "en");
})();
