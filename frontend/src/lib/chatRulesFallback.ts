const GREETINGS = ["hey", "hi", "hello", "yo", "salut", "bonjour", "coucou", "hola"];
const THANKS = ["thanks", "thank you", "merci", "thx"];
const GOODBYES = ["bye", "goodbye", "à bientôt", "a bientot", "au revoir"];

const FREE_PLAN_UPGRADE = "[Passer au plan Pro](forma://upgrade-pro)";

/** Réponse affichée aux utilisateurs du plan Gratuit (sans appel réseau). */
export function freePlanAiReply(prompt: string): string {
  const low = prompt.trim().toLowerCase();
  if (GREETINGS.includes(low)) {
    return `Salut ! L'assistant IA est réservé au plan **Pro**.\n\n${FREE_PLAN_UPGRADE}`;
  }
  if (THANKS.includes(low)) {
    return "Avec plaisir !";
  }
  if (GOODBYES.includes(low)) {
    return "À bientôt !";
  }
  return (
    "L'assistant IA n'est pas inclus dans le plan **Gratuit**.\n\n" +
    "Le plan gratuit inclut le workspace, les appels et la messagerie entre amis — " +
    "sans chat IA, Agent ni Render.\n\n" +
    FREE_PLAN_UPGRADE
  );
}

/** Réponses hors-ligne quand le backend ou le LLM est indisponible. */
export function localRulesReply(prompt: string): string {
  const text = prompt.trim();
  const low = text.toLowerCase();
  if (GREETINGS.includes(low)) {
    return "Hey! How can I help you?";
  }
  if (THANKS.includes(low)) {
    return "You're welcome!";
  }
  if (GOODBYES.includes(low)) {
    return "See you later!";
  }
  return (
    "Je suis en mode hors-ligne — le backend est indisponible ou le LLM n'est pas configuré.\n\n" +
    "Vérifie que `./scripts/desktop-dev.sh` tourne et que `XAI_API_KEY` est renseigné dans `backend/.env`."
  );
}

export function isBackendUnavailableError(message: string): boolean {
  return (
    /HTTP 5\d\d/i.test(message) ||
    /failed to fetch/i.test(message) ||
    /networkerror/i.test(message) ||
    /load failed/i.test(message)
  );
}

/** Message utilisateur quand fetch() n'atteint pas l'API (backend arrêté, proxy Vite, etc.). */
export function backendUnavailableUserMessage(context: "connectors" | "default" = "default"): string {
  const cmd =
    typeof window !== "undefined" && window.location.hostname === "127.0.0.1"
      ? "./start.sh ou ./scripts/desktop-dev.sh"
      : "le déploiement backend (Vercel)";
  if (context === "connectors") {
    return `Backend inaccessible — lancez l'API (port 8000) avec ${cmd}, puis rechargez la page.`;
  }
  return `Backend inaccessible — vérifiez ${cmd}.`;
}

export function formatBackendError(message: string, context: "connectors" | "default" = "default"): string {
  return isBackendUnavailableError(message) ? backendUnavailableUserMessage(context) : message;
}
