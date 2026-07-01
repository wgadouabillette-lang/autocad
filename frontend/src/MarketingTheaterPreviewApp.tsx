import CallsView from "./components/calls/CallsView";
import { useColorTheme } from "./hooks/useColorTheme";

export default function MarketingTheaterPreviewApp() {
  useColorTheme();

  return (
    <div
      className="app-shell marketing-preview-shell marketing-preview-shell--theater-feature"
      aria-hidden="true"
    >
      <CallsView />
    </div>
  );
}
