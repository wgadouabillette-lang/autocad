import PanelToolbarButtons from "./toolbar/PanelToolbarButtons";
import WorkspaceBrandButton from "./workspace/WorkspaceBrandButton";
import WorkspaceInviteButton from "./workspace/WorkspaceInviteButton";

export default function AppChromeRow() {
  return (
    <header className="app-chrome-row">
      <div className="app-chrome-row__main">
        <div className="app-chrome-row__leading">
          <WorkspaceInviteButton />
        </div>
        <div className="app-chrome-row__brand">
          <WorkspaceBrandButton />
        </div>
        <div className="app-chrome-row__actions">
          <PanelToolbarButtons />
        </div>
      </div>
    </header>
  );
}
