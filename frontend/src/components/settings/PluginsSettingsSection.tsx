import ChatConnectorsList from "../chat/ChatConnectorsList";
import { useConnectors } from "../../hooks/useConnectors";

export default function PluginsSettingsSection() {
  const { connectedIds, statuses, loading, error, connectingId, connect, disconnect } =
    useConnectors();

  return (
    <section className="settings-section">
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
      />
    </section>
  );
}
