import clsx from "clsx";
import PanelToolbarButtons from "./toolbar/PanelToolbarButtons";
import WorkspaceBrandButton from "./workspace/WorkspaceBrandButton";

export default function AppChromeRow({ immersive = false }: { immersive?: boolean }) {
  return (
    <header className={clsx("app-chrome-row", immersive && "app-chrome-row--immersive")}>
      <div className="app-chrome-row__main">
        <div className="app-chrome-row__leading">
          <WorkspaceBrandButton />
        </div>
        <div className="app-chrome-row__brand" aria-label="Meetra">
          <img
            src={`${import.meta.env.BASE_URL}meetra-mark.svg`}
            alt=""
            className="app-chrome-row__brand-logo"
            draggable={false}
          />
          <span className="app-chrome-row__brand-wordmark">Meetra</span>
        </div>
        <div className="app-chrome-row__actions" aria-hidden={immersive || undefined}>
          {!immersive ? <PanelToolbarButtons /> : null}
        </div>
      </div>
    </header>
  );
}
