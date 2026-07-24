import ChatConnectorsList from "../chat/ChatConnectorsList";
import { useConnectors } from "../../hooks/useConnectors";

export default function PluginsSettingsSection() {
  const { connectedIds, statuses, statusSource, loading, error, connectingId, connect, disconnect } =
    useConnectors();

  return (
    <section className="settings-section">
      {loading && <p className="settings-section__meta">Chargement des connecteurs…</p>}

      <ChatConnectorsList
        variant="settings"
        connectedIds={connectedIds}
        statuses={statuses}
        statusSource={statusSource}
        connectingId={connectingId}
        connectError={error}
        onConnect={connect}
        onDisconnect={disconnect}
        onInsertSlash={() => {}}
      />
    </section>
  );
}
