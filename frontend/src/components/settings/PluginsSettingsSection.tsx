import ChatConnectorsList from "../chat/ChatConnectorsList";
import { useConnectors } from "../../hooks/useConnectors";

export default function PluginsSettingsSection() {
  const { connectedIds, loading, error, connectingId, connect, disconnect } = useConnectors();

  return (
    <section className="settings-section">
      {error && <p className="settings-section__error">{error}</p>}
      {loading && <p className="settings-section__meta">Chargement des connecteurs…</p>}

      <ChatConnectorsList
        variant="settings"
        connectedIds={connectedIds}
        connectingId={connectingId}
        connectError={error}
        onConnect={connect}
        onDisconnect={disconnect}
        onInsertSlash={() => {}}
      />
    </section>
  );
}
