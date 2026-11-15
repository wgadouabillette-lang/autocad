import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useStore } from "../store/useStore";

/** Local fallback names stored before the interface language is known. */
const YOU_NAMES = new Set(["Vous", "You"]);
const MEMBER_NAMES = new Set(["Membre", "Member"]);

export function personLabel(
  name: string,
  isLocal: boolean | undefined,
  displayName: string,
  t: TFunction,
): string {
  if (isLocal) {
    const custom = displayName.trim();
    if (custom) return custom;
    return t("common.you");
  }
  if (YOU_NAMES.has(name)) return t("common.you");
  if (MEMBER_NAMES.has(name)) return t("calls.member");
  return name;
}

export function usePersonLabel() {
  const { t } = useTranslation();
  const displayName = useStore((s) => s.userDisplayName);
  return (name: string, isLocal?: boolean) => personLabel(name, isLocal, displayName, t);
}
