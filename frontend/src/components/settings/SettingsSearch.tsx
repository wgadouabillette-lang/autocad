import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  return (
    <ExpandableSearchDropdown
      placeholder={t("settingsUi.search")}
      ariaLabel={t("settingsUi.search")}
      filterSuggestions={filterSettingsSuggestions}
      onSelect={(item: SettingsSearchSuggestion) => onSelectTab(item.tab)}
    />
  );
}
