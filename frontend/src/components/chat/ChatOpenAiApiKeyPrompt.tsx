import { useState } from "react";
import { fetchApiKeyStatus, saveApiKey } from "../../lib/firebase/apiKeys";

interface ChatOpenAiApiKeyPromptProps {
  onConfigured: () => void;
}

export default function ChatOpenAiApiKeyPrompt({ onConfigured }: ChatOpenAiApiKeyPromptProps) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const value = draft.trim();
    if (value.length < 8) {
      setError("La clé API est trop courte.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveApiKey("openai", value);
      setDraft("");
      const status = await fetchApiKeyStatus();
      if (status.openai.configured) {
        onConfigured();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-openai-key-prompt">
      <p className="chat-openai-key-prompt__label">
        Clé OpenAI requise pour ce modèle
      </p>
      <div className="chat-openai-key-prompt__form">
        <input
          type="password"
          className="chat-openai-key-prompt__input"
          placeholder="sk-…"
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void save();
            }
          }}
        />
        <button
          type="button"
          className="chat-openai-key-prompt__save"
          disabled={busy || draft.trim().length < 8}
          onClick={() => void save()}
        >
          {busy ? "…" : "Enregistrer"}
        </button>
      </div>
      {error && <p className="chat-openai-key-prompt__error">{error}</p>}
    </div>
  );
}
