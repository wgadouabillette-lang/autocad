import { useEffect, useState } from "react";
import {
  deleteApiKey,
  fetchApiKeyStatus,
  saveApiKey,
  type ApiKeyProvider,
  type ApiKeyProviderStatus,
} from "../../lib/firebase/apiKeys";

const PROVIDERS: { id: ApiKeyProvider; label: string; hint: string }[] = [
  { id: "xai", label: "xAI (Grok)", hint: "Clé xAI pour @Modelling et le chat." },
  { id: "openai", label: "OpenAI", hint: "Clé OpenAI pour GPT / Auto." },
  { id: "anthropic", label: "Anthropic", hint: "Clé Claude pour le chat avancé." },
];

export default function ApiKeysSettingsSection() {
  const [status, setStatus] = useState<Record<ApiKeyProvider, ApiKeyProviderStatus> | null>(null);
  const [drafts, setDrafts] = useState<Record<ApiKeyProvider, string>>({
    xai: "",
    openai: "",
    anthropic: "",
  });
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState<ApiKeyProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchApiKeyStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Impossible de charger les clés API.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (provider: ApiKeyProvider) => {
    const value = drafts[provider].trim();
    if (value.length < 8) {
      setError("La clé API est trop courte.");
      return;
    }
    setBusyProvider(provider);
    setError(null);
    try {
      await saveApiKey(provider, value);
      setDrafts((prev) => ({ ...prev, [provider]: "" }));
      setStatus(await fetchApiKeyStatus());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setBusyProvider(null);
    }
  };

  const remove = async (provider: ApiKeyProvider) => {
    setBusyProvider(provider);
    setError(null);
    try {
      await deleteApiKey(provider);
      setStatus(await fetchApiKeyStatus());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Suppression impossible.");
    } finally {
      setBusyProvider(null);
    }
  };

  return (
    <section className="settings-section">
      <h3 className="settings-section__label">Clés API LLM</h3>
      <p className="settings-section__hint">
        Vos clés sont stockées côté serveur via Firebase Cloud Functions et ne sont jamais exposées dans le
        navigateur après enregistrement.
      </p>
      {error && <p className="settings-section__error">{error}</p>}
      {loading && <p className="settings-section__meta">Chargement…</p>}
      <div className="settings-section__stack">
        {PROVIDERS.map(({ id, label, hint }) => {
          const configured = status?.[id]?.configured ?? false;
          const preview = status?.[id]?.keyPreview;
          const busy = busyProvider === id;
          return (
            <div key={id} className="settings-option">
              <span className="settings-option__title">{label}</span>
              <span className="settings-option__subtitle">{hint}</span>
              {configured && preview && (
                <p className="settings-section__meta">
                  Configurée {preview}
                </p>
              )}
              <div className="settings-section__inline-form">
                <input
                  type="password"
                  className="auth-page__email-input"
                  placeholder={configured ? "Remplacer la clé…" : "Coller la clé API"}
                  value={drafts[id]}
                  disabled={busy}
                  onChange={(event) =>
                    setDrafts((prev) => ({ ...prev, [id]: event.target.value }))
                  }
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || drafts[id].trim().length < 8}
                  onClick={() => void save(id)}
                >
                  {busy ? "…" : configured ? "Mettre à jour" : "Enregistrer"}
                </button>
                {configured && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => void remove(id)}
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
