import { useEffect, useMemo, useState } from "react";
import { UserMinus } from "lucide-react";
import { blockHeaderTitle } from "../../lib/calls";
import { useCallsStore } from "../../store/useCallsStore";
import { useStore } from "../../store/useStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";
import SettingsComingSoon from "./SettingsComingSoon";

export default function WorkspaceSettingsSection() {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const isOwner = useWorkspacesStore((s) => s.isWorkspaceOwner(activeRoomId));
  const findWorkspace = useWorkspacesStore((s) => s.findWorkspace);
  const customServers = useWorkspacesStore((s) => s.customServers);
  const updateWorkspace = useWorkspacesStore((s) => s.updateWorkspace);
  const blocks = useCallsStore((s) => s.callsByRoom[activeRoomId]?.blocks ?? []);
  const kickMember = useCallsStore((s) => s.kickMember);

  const workspace = findWorkspace(activeRoomId);
  const isCustomWorkspace = customServers.some((server) => server.id === activeRoomId);
  const [draftName, setDraftName] = useState(workspace?.name ?? "");

  useEffect(() => {
    setDraftName(workspace?.name ?? "");
  }, [workspace?.name, activeRoomId]);

  const remoteMembers = useMemo(
    () =>
      blocks.filter(
        (block) =>
          !block.participants.some((participant) => participant.isLocal) &&
          block.participants.length === 1,
      ),
    [blocks],
  );

  if (!isOwner) {
    return (
      <SettingsComingSoon detail="Seul le propriétaire du workspace peut modifier ces paramètres." />
    );
  }

  return (
    <>
      <section className="settings-section">
        <h3 className="settings-section__label">Nom du workspace</h3>
        <p className="settings-section__hint">
          {isCustomWorkspace
            ? "Visible pour tous les membres du serveur."
            : "Les serveurs publics ne peuvent pas être renommés depuis l'app."}
        </p>
        {isCustomWorkspace ? (
          <form
            className="settings-section__inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              updateWorkspace(activeRoomId, { name: draftName });
            }}
          >
            <input
              type="text"
              className="input min-w-0 flex-1"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="Nom du workspace"
            />
            <button type="submit" className="btn shrink-0" disabled={!draftName.trim()}>
              Enregistrer
            </button>
          </form>
        ) : (
          <p className="settings-section__meta">{workspace?.name}</p>
        )}
      </section>

      <section className="settings-section">
        <h3 className="settings-section__label">Membres</h3>
        <p className="settings-section__hint">
          Expulsez un membre du workspace. Cette action le retire de la grille vocale.
        </p>
        {remoteMembers.length === 0 ? (
          <p className="settings-section__meta">Aucun autre membre pour le moment.</p>
        ) : (
          <ul className="settings-workspace-members">
            {remoteMembers.map((block) => (
              <li key={block.id} className="settings-workspace-members__row">
                <span className="settings-workspace-members__name">
                  {blockHeaderTitle(block)}
                </span>
                <button
                  type="button"
                  className="settings-workspace-members__kick"
                  onClick={() => kickMember(activeRoomId, block.id)}
                >
                  <UserMinus size={12} strokeWidth={2.25} aria-hidden />
                  Expulser
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
