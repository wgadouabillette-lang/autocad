import { APP_DISPLAY_NAME } from "../lib/appBrand";
import PanelToolbarButtons from "./toolbar/PanelToolbarButtons";
import WorkspaceBrandButton from "./workspace/WorkspaceBrandButton";

export default function AppChromeRow() {
  return (
    <header className="app-chrome-row">
      <div className="app-chrome-row__main">
        <div className="app-chrome-row__leading">
          <WorkspaceBrandButton />
        </div>
        <div className="app-chrome-row__brand">
          <img
            src={`${import.meta.env.BASE_URL}favicon.svg`}
            alt=""
            className="app-chrome-row__brand-logo"
            width={16}
            height={16}
            draggable={false}
          />
          <span className="app-chrome-row__brand-mark">{APP_DISPLAY_NAME}</span>
        </div>
        <div className="app-chrome-row__actions">
          <PanelToolbarButtons />
        </div>
      </div>
    </header>
  );
}
