import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  CHAT_CONNECTORS,
  isConnectorComingSoon,
  isVisibleInChatConnectorsList,
  type ChatConnectorId,
} from "./chatConnectors";
import type { ConnectorStatus } from "../../lib/connectorsApi";

export default function ChatConnectorsList({
  statuses,
  statusSource = "none",
  connectedIds,
  connectingId = null,
  connectError = null,
  variant = "chat",
  locked = false,
  onConnect,
  onDisconnect,
  onInsertSlash,
}: {
  statuses?: ConnectorStatus[];
  statusSource?: "none" | "visual" | "api";
  connectedIds: ReadonlySet<ChatConnectorId>;
  connectingId?: ChatConnectorId | null;
  connectError?: string | null;
  variant?: "chat" | "settings";
  locked?: boolean;
  onConnect: (id: ChatConnectorId) => void;
  onDisconnect?: (id: ChatConnectorId) => void;
  onInsertSlash: (slash: string) => void;
}) {
  const { t } = useTranslation();
  const isSettings = variant === "settings";
  const items = isSettings
    ? CHAT_CONNECTORS
    : CHAT_CONNECTORS.filter(({ id }) => isVisibleInChatConnectorsList(id));
  const statusById = new Map((statuses ?? []).map((status) => [status.id, status]));
  const statusesFromApi = statusSource === "api";

  const unavailableTitle = (configured: boolean, status: ConnectorStatus | undefined) => {
    if (configured) return undefined;
    if (statusesFromApi && status && !status.configured) {
      return t("chat.connectors.oauthMissing");
    }
    if (statusSource === "visual") {
      return t("chat.connectors.signInToLink");
    }
    return undefined;
  };

  const unavailableLabel = (configured: boolean) => {
    if (configured) return t("chat.connectors.connect");
    if (statusesFromApi) return t("chat.connectors.unavailable");
    return t("common.loading");
  };

  return (
    <div
      className={
        isSettings
          ? "chat-connectors-list chat-connectors-list--settings"
          : "chat-connectors-list chat-connectors-list--from-bottom"
      }
      role="list"
      aria-label={t("chat.connectors.aria")}
    >
      {!locked && connectError && (
        <p className="chat-connectors-error px-0.5 pb-1 text-[11px] leading-snug text-red-400/90">
          {connectError}
        </p>
      )}
      {items.map(({ id, label, slash, Logo }, index) => {
        const status = statusById.get(id);
        const connected = connectedIds.has(id);
        const configured = status?.configured ?? false;
        const connecting = connectingId === id;
        const comingSoon = isConnectorComingSoon(id);
        const rowMain = (
          <div className="chat-connectors-row__main">
            <span className="chat-connectors-row__icon">
              <Logo />
            </span>
            <span className="chat-connectors-row__label-wrap">
              <span className="chat-connectors-row__label">{label}</span>
              {isSettings && (
                <span className="chat-connectors-row__desc">{t(`chat.connectors.describe.${id}`)}</span>
              )}
              {comingSoon && (
                <span className="chat-connectors-row__meta">{t("chat.connectors.comingSoon")}</span>
              )}
            </span>
          </div>
        );

        const rowActions = locked ? (
          <span className="chat-connectors-row__slash chat-connectors-row__slash--preview">
            <span className="chat-connectors-row__slash-cmd">{slash}</span>
          </span>
        ) : isSettings && connected ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[11px] text-muted-400">{t("chat.connectors.connected")}</span>
            <button
              type="button"
              className="chat-connectors-row__connect"
              onClick={() => onDisconnect?.(id)}
            >
              {t("chat.connectors.disconnect")}
            </button>
          </div>
        ) : isSettings ? (
          comingSoon ? (
            <span className="text-[11px] text-muted-500">{t("chat.connectors.notYet")}</span>
          ) : (
            <button
              type="button"
              className="chat-connectors-row__connect"
              onClick={() => onConnect(id)}
              disabled={connecting || !configured || !statusesFromApi}
              title={unavailableTitle(configured, status)}
            >
              {connecting ? t("chat.connectors.connecting") : unavailableLabel(configured)}
              {!connecting && configured && (
                <ArrowUpRight size={11} strokeWidth={2.25} className="shrink-0 opacity-80" aria-hidden />
              )}
            </button>
          )
        ) : connected ? (
          <button
            type="button"
            className="chat-connectors-row__slash"
            title={t("chat.connectors.insertSlash", { slash })}
            onClick={() => onInsertSlash(slash)}
          >
            {t("chat.connectors.use")}{" "}
            <span className="chat-connectors-row__slash-cmd">{slash}</span>
          </button>
        ) : comingSoon ? (
          <span className="text-[11px] text-muted-500">{t("chat.connectors.comingSoon")}</span>
        ) : (
          <button
            type="button"
            className="chat-connectors-row__connect"
            onClick={() => onConnect(id)}
            disabled={connecting || !configured || !statusesFromApi}
            title={unavailableTitle(configured, status)}
          >
            {connecting ? t("chat.connectors.connecting") : unavailableLabel(configured)}
            {!connecting && configured && (
              <ArrowUpRight size={11} strokeWidth={2.25} className="shrink-0 opacity-80" aria-hidden />
            )}
          </button>
        );

        return (
          <div
            key={id}
            role="listitem"
            className="chat-connectors-row"
            style={
              isSettings ? undefined : { animationDelay: `${(items.length - 1 - index) * 55}ms` }
            }
          >
            {rowMain}
            {rowActions}
          </div>
        );
      })}
    </div>
  );
}
