import ChatConnectorsList from "../chat/ChatConnectorsList";
import ConnectorPluginPreview from "./ConnectorPluginPreview";
import { CHAT_CONNECTORS } from "../chat/chatConnectors";
import { useConnectors } from "../../hooks/useConnectors";
import { useStore } from "../../store/useStore";

export default function PluginsSettingsSection() {
  const openSettingsTab = useStore((s) => s.openSettingsTab);
  const { connectedIds, statuses, loading, error, connectingId, connect, disconnect } =
    useConnectors();

  return (
    <section className="settings-section">
      {error && <p className="settings-section__error">{error}</p>}
      {loading && <p className="settings-section__meta">Chargement des connecteurs…</p>}

      <ChatConnectorsList
        variant="settings"
        connectedIds={connectedIds}
        statuses={statuses}
        connectingId={connectingId}
        connectError={error}
        onConnect={connect}
        onDisconnect={disconnect}
        onInsertSlash={() => {}}
        onOpenConnectorSettings={(id) => {
          if (id === "spotify") openSettingsTab("audio", "settings-hall-dj");
        }}
      />

      {CHAT_CONNECTORS.map(({ id, label }) =>
        connectedIds.has(id) ? (
          <div key={id} className="connector-plugin-preview-wrap">
            <h4 className="settings-section__label">{label}</h4>
            <ConnectorPluginPreview connectorId={id} connected />
          </div>
        ) : null,
      )}
    </section>
  );
}
