import { isFormaDesktopMac, isFormaDesktopWindows } from "../../lib/formaDesktop";
import HeaderInviteButton from "./HeaderInviteButton";

/** Groupe gauche du header. Sur Mac et Windows, Invite est dans la barre d'actions. */
export default function WorkspaceBrandButton() {
  if (isFormaDesktopMac() || isFormaDesktopWindows()) return null;
  return (
    <div className="app-chrome-row__workspace-brand-group">
      <HeaderInviteButton />
    </div>
  );
}
