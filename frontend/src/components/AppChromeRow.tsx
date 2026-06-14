import { hasFormaDesktop } from "../lib/formaDesktop";
import PanelToolbarButtons from "./toolbar/PanelToolbarButtons";
import WorkspaceInviteButton from "./workspace/WorkspaceInviteButton";

function getLandingUrl(): string {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return "http://localhost:5190/";
  }
  return "/";
}

export default function AppChromeRow() {
  const isDesktop = hasFormaDesktop();

  return (
    <header className="app-chrome-row">
      <div className="app-chrome-row__main">
        <div className="app-chrome-row__leading">
          <WorkspaceInviteButton />
        </div>
        <div className="app-chrome-row__brand">
          {isDesktop ? (
            <span className="app-chrome-row__brand-mark" aria-hidden>
              Lyte
            </span>
          ) : (
            <a
              className="app-chrome-row__brand-mark app-chrome-row__brand-mark--link"
              href={getLandingUrl()}
              aria-label="Retour à la page d'accueil Lyte"
            >
              Lyte
            </a>
          )}
          <span className="sr-only">Lyte</span>
        </div>
        <div className="app-chrome-row__actions">
          <PanelToolbarButtons />
        </div>
      </div>
    </header>
  );
}
