import { isFormaDesktopMac } from "../../lib/formaDesktop";
import HeaderInviteButton from "./HeaderInviteButton";

/** Groupe gauche du header. Sur Mac, Invite est dans la barre d'actions. */
export default function WorkspaceBrandButton() {
  if (isFormaDesktopMac()) return null;
  return (
    <div className="app-chrome-row__workspace-brand-group">
      <HeaderInviteButton />
    </div>
  );
}
