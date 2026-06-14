import { useCallback } from "react";
import ExpandableSearchDropdown from "../ExpandableSearchDropdown";
import {
  filterSettingsSuggestions,
  type SettingsSearchSuggestion,
  type SettingsTab,
} from "../../lib/settingsSearchSuggestions";
import { useStore } from "../../store/useStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";

export default function SettingsSearch({
  onSelectTab,
}: {
  onSelectTab: (tab: SettingsTab) => void;
}) {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const isWorkspaceOwner = useWorkspacesStore((s) => s.isWorkspaceOwner(activeRoomId));

  const filterSuggestions = useCallback(
    (query: string) =>
      filterSettingsSuggestions(query).filter(
        (item) => item.tab !== "workspace" || isWorkspaceOwner,
      ),
    [isWorkspaceOwner],
  );

  return (
    <ExpandableSearchDropdown
      placeholder="Rechercher dans les paramètres…"
      ariaLabel="Rechercher dans les paramètres"
      filterSuggestions={filterSuggestions}
      onSelect={(item: SettingsSearchSuggestion) => onSelectTab(item.tab)}
    />
  );
}
