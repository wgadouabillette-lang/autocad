import ExpandableSearchDropdown from "../ExpandableSearchDropdown";
import {
  filterSettingsSuggestions,
  type SettingsSearchSuggestion,
  type SettingsTab,
} from "../../lib/settingsSearchSuggestions";

export default function SettingsSearch({
  onSelectTab,
}: {
  onSelectTab: (tab: SettingsTab) => void;
}) {
  return (
    <ExpandableSearchDropdown
      placeholder="Rechercher dans les paramètres…"
      ariaLabel="Rechercher dans les paramètres"
      filterSuggestions={filterSettingsSuggestions}
      onSelect={(item: SettingsSearchSuggestion) => onSelectTab(item.tab)}
    />
  );
}
