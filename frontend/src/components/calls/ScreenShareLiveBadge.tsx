import { useTranslation } from "react-i18next";
import { useCallsStore } from "../../store/useCallsStore";

/** Red “En direct” capsule while this user is sharing their screen. */
export default function ScreenShareLiveBadge() {
  const { t } = useTranslation();
  const screenSharing = useCallsStore((s) => s.screenSharing);
  if (!screenSharing) return null;
  return (
    <div className="screen-share-live" role="status">
      {t("calls.live")}
    </div>
  );
}
