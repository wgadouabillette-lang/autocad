import { X } from "lucide-react";
import { CONNECTOR_ICON_FILES, connectorIconPath } from "../../lib/connectorIcons";

const faviconSrc = `${import.meta.env.BASE_URL}favicon.svg`;
const calendarSrc = connectorIconPath(CONNECTOR_ICON_FILES.calendar);

export default function CalendarConnectNotificationVisual() {
  return (
    <div className="notifications-panel__calendar-connect">
      <img
        src={faviconSrc}
        alt=""
        className="notifications-panel__calendar-connect-app-icon notifications-panel__calendar-connect-app-icon--left"
        draggable={false}
      />
      <span className="notifications-panel__calendar-connect-x" aria-hidden>
        <X size={16} strokeWidth={2.25} />
      </span>
      <img
        src={calendarSrc}
        alt=""
        className="notifications-panel__calendar-connect-app-icon notifications-panel__calendar-connect-app-icon--right"
        draggable={false}
      />
    </div>
  );
}
