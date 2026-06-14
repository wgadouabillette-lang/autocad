import UserAvatar from "../UserAvatar";
import { planLabel } from "../../lib/subscriptionPlans";
import { useStore } from "../../store/useStore";

export default function SettingsProfileHeader() {
  const userDisplayName = useStore((s) => s.userDisplayName);
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);

  return (
    <div className="settings-view__profile">
      <UserAvatar
        userId="local"
        name={userDisplayName}
        isLocal
        className="settings-view__profile-avatar"
      />
      <div className="settings-view__profile-meta">
        <p className="settings-view__profile-name">{userDisplayName}</p>
        <p className="settings-view__profile-plan">{planLabel(subscriptionPlan)}</p>
      </div>
    </div>
  );
}
