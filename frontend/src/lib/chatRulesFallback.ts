/** Réponses hors-ligne quand le backend ou le LLM est indisponible. */
export function localRulesReply(prompt: string): string {
  const text = prompt.trim();
  const low = text.toLowerCase();
  if (low === "hey" || low === "hi" || low === "hello" || low === "yo" || low === "salut" || low === "bonjour" || low === "coucou" || low === "hola") {
    return "Hey! How can I help you?";
  }
  if (low === "thanks" || low === "thank you" || low === "merci" || low === "thx") {
    return "You're welcome!";
  }
  if (low === "bye" || low === "goodbye" || low === "à bientôt" || low === "a bientot" || low === "au revoir") {
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
