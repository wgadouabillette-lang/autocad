import PanelToolbarButtons from "./toolbar/PanelToolbarButtons";
import WorkspaceBrandButton from "./workspace/WorkspaceBrandButton";

export default function AppChromeRow() {
  return (
    <header className="app-chrome-row">
      <div className="app-chrome-row__main">
        <div className="app-chrome-row__leading">
          <WorkspaceBrandButton />
        </div>
        <div className="app-chrome-row__actions">
          <PanelToolbarButtons />
        </div>
      </div>
    </header>
  );
}
