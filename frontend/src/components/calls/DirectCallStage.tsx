import { useTranslation } from "react-i18next";
import { avatarColor, userInitials } from "../../lib/calls";
import { useDirectCallStore } from "../../store/useDirectCallStore";
import { useStore } from "../../store/useStore";

/** Appel 1:1 en cours. L’identifiant se copie depuis la barre du haut. */
export default function DirectCallStage() {
  const { t } = useTranslation();
  const callId = useDirectCallStore((s) => s.callId);
  const name = useStore((s) => s.userDisplayName).trim() || t("common.you");

  if (!callId) return null;

  return (
    <div className="direct-call-stage">
      <div className="direct-call-stage__body">
        <article className="direct-call-stage__tile">
          <div className="direct-call-stage__avatar" style={{ backgroundColor: avatarColor("local") }}>
            {userInitials(name)}
          </div>
          <span className="direct-call-stage__name">{name}</span>
        </article>
      </div>
    </div>
  );
}
