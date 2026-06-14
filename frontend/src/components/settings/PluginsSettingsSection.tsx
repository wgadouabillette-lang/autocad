import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import { CHAT_CONNECTORS } from "../chat/chatConnectors";
import ApiKeysSettingsSection from "./ApiKeysSettingsSection";
import { useConnectors } from "../../hooks/useConnectors";
import { useStore } from "../../store/useStore";
import { hasConnectorAccess } from "../../lib/subscriptionPlans";

export default function PluginsSettingsSection() {
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const allPluginsAvailable = hasConnectorAccess(subscriptionPlan);
  const { connectedIds, loading, error, connectingId, connect, disconnect } = useConnectors();

  return (
    <>
      <ApiKeysSettingsSection />
      <section className="settings-section">
      <h3 className="settings-section__label">API & connecteurs</h3>
      <p className="settings-section__hint">
        {allPluginsAvailable
          ? "Services utilisables dans le chat via des commandes slash."
          : "Les connecteurs nécessitent le forfait Pro."}
      </p>

      {error && <p className="settings-section__error">{error}</p>}
      {loading && (
        <p className="settings-section__meta">Chargement des connecteurs…</p>
      )}

      <ul className="settings-plugins-list">
        {CHAT_CONNECTORS.map(({ id, label, slash, Logo }) => {
          const connected = connectedIds.has(id);
          const connecting = connectingId === id;
          const connectorAvailable = hasConnectorAccess(subscriptionPlan);

          return (
            <li
              key={id}
              className={clsx(
                "settings-plugin-row",
                !connectorAvailable && "settings-plugin-row--locked",
              )}
            >
              <div className="settings-plugin-row__main">
                <span className="settings-plugin-row__icon">
                  <Logo />
                </span>
                <span className="settings-plugin-row__text">
                  <span className="settings-plugin-row__name">{label}</span>
                  <span className="settings-plugin-row__slash">{slash}</span>
                </span>
              </div>

              {connectorAvailable &&
                (connected ? (
                  <div className="settings-plugin-row__actions">
                    <span className="settings-plugin-row__status">Connecté</span>
                    <button
                      type="button"
                      className="settings-plugin-row__disconnect"
                      onClick={() => void disconnect(id)}
                    >
                      Déconnecter
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="settings-plugin-row__connect"
                    onClick={() => void connect(id)}
                    disabled={connecting}
                  >
                    {connecting ? "Connexion…" : "Connecter"}
                    {!connecting && (
                      <ArrowUpRight size={11} strokeWidth={2.25} className="shrink-0 opacity-80" aria-hidden />
                    )}
                  </button>
                ))}
            </li>
          );
        })}
      </ul>
    </section>
    </>
  );
}
