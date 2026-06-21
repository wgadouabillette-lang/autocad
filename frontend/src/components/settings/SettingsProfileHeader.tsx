import { ArrowLeft } from "lucide-react";
import UserAvatar from "../UserAvatar";
import { planLabel } from "../../lib/subscriptionPlans";
import { useStore } from "../../store/useStore";

interface SettingsProfileHeaderProps {
  onBack: () => void;
}

export default function SettingsProfileHeader({ onBack }: SettingsProfileHeaderProps) {
  const userDisplayName = useStore((s) => s.userDisplayName);
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);

  return (
    <div className="settings-view__profile-wrap">
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
      <button
        type="button"
        className="settings-view__back"
        onClick={onBack}
        aria-label="Back to app"
      >
        <ArrowLeft size={14} strokeWidth={2.25} className="settings-view__back-icon" aria-hidden />
        <span className="settings-view__back-meta">
          <span className="settings-view__back-name">{userDisplayName}</span>
          <span className="settings-view__back-hint">Back to app</span>
        </span>
      </button>
    </div>
  );
}
