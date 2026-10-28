import clsx from "clsx";
import {
  CreditCard,
  Gauge,
  LayoutGrid,
  LogOut,
  Plug,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  normalizeSettingsTab,
  type SettingsTab,
} from "../lib/settingsSearchSuggestions";
import { useStore } from "../store/useStore";
import FriendsSettingsSection from "./settings/FriendsSettingsSection";
import GeneralSettingsSection from "./settings/GeneralSettingsSection";
import PluginsSettingsSection from "./settings/PluginsSettingsSection";
import SkillsSettingsSection from "./settings/SkillsSettingsSection";
import AudioSettingsSection from "./settings/AudioSettingsSection";
import UsageSettingsSection from "./settings/UsageSettingsSection";
import BillingSettingsSection from "./settings/BillingSettingsSection";
import { useAuthStore } from "../store/useAuthStore";
import SettingsProfileHeader from "./settings/SettingsProfileHeader";
import WorkspacesSettingsSection from "./settings/WorkspacesSettingsSection";

const NAV_GROUPS: { id: "personal" | "workspace"; tabs: SettingsTab[] }[] = [
  { id: "personal", tabs: ["general", "friends", "audio", "skills", "plugins"] },
  { id: "workspace", tabs: ["workspaces", "usage", "billing"] },
];

const TAB_ICONS: Record<SettingsTab, LucideIcon> = {
  general: Settings,
  friends: Users,
  workspaces: LayoutGrid,
  usage: Gauge,
  billing: CreditCard,
  audio: SlidersHorizontal,
  plugins: Plug,
  skills: Sparkles,
};

const TAB_PANELS: Record<SettingsTab, () => JSX.Element> = {
  general: GeneralSettingsSection,
  friends: FriendsSettingsSection,
  workspaces: WorkspacesSettingsSection,
  usage: UsageSettingsSection,
  billing: BillingSettingsSection,
  audio: AudioSettingsSection,
  plugins: PluginsSettingsSection,
  skills: SkillsSettingsSection,
};

export default function SettingsPage() {
  const { t } = useTranslation();
  const activeTab = useStore((s) => s.settingsTab);
  const settingsScrollTarget = useStore((s) => s.settingsScrollTarget);
  const clearSettingsScrollTarget = useStore((s) => s.clearSettingsScrollTarget);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const closePage = useStore((s) => s.closePage);
  const signOut = useAuthStore((s) => s.signOut);
  const panelBodyRef = useRef<HTMLDivElement>(null);

  const tabTitle = (id: SettingsTab) => t(`settings.tabs.${id}`);
  const tabDescription = (id: SettingsTab) => {
    const key = `settings.descriptions.${id}`;
    const value = t(key);
    return value === key ? "" : value;
  };

  const resolvedTab = useMemo(() => normalizeSettingsTab(activeTab), [activeTab]);
  const Panel = TAB_PANELS[resolvedTab] ?? GeneralSettingsSection;

  useEffect(() => {
    if (settingsScrollTarget) return;
    panelBodyRef.current?.scrollTo(0, 0);
  }, [resolvedTab, settingsScrollTarget]);

  useEffect(() => {
    if (resolvedTab !== activeTab) {
      setSettingsTab(resolvedTab);
    }
  }, [activeTab, resolvedTab, setSettingsTab]);

  useEffect(() => {
    if (!settingsScrollTarget) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(settingsScrollTarget);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      clearSettingsScrollTarget();
    });
    return () => cancelAnimationFrame(frame);
  }, [settingsScrollTarget, resolvedTab, clearSettingsScrollTarget]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePage("settings");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePage]);

  return (
    <div className="settings-view settings-view--cascade">
      <div className="settings-view__frame">
        <div className="settings-view__layout">
          <nav className="settings-view__nav" aria-label={t("nav.settingsSections")}>
            <SettingsProfileHeader onBack={() => closePage("settings")} />
            <div className="settings-view__tabs">
              {NAV_GROUPS.map((group) => (
                <div key={group.id} className="settings-view__tab-group">
                  <p className="settings-view__tab-label">{t(`settings.groups.${group.id}`)}</p>
                  <ul>
                    {group.tabs.map((id) => {
                      const Icon = TAB_ICONS[id];
                      const cascadeIndex = NAV_GROUPS.flatMap((entry) => entry.tabs).indexOf(id);
                      return (
                        <li key={id} style={{ "--cascade-i": cascadeIndex } as CSSProperties}>
                          <button
                            type="button"
                            className={clsx(
                              "settings-view__tab",
                              resolvedTab === id && "settings-view__tab--active",
                            )}
                            onClick={() => setSettingsTab(id)}
                            aria-current={resolvedTab === id ? "page" : undefined}
                          >
                            <Icon
                              size={15}
                              strokeWidth={2}
                              className="settings-view__tab-icon"
                              aria-hidden
                            />
                            <span className="settings-view__tab-label-text">{tabTitle(id)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="settings-view__logout"
              onClick={() => void signOut()}
            >
              <LogOut size={15} strokeWidth={2} aria-hidden />
              {t("common.signOut")}
            </button>
          </nav>

          <div className="settings-view__panel">
            <header className="settings-view__panel-header">
              <div className="settings-view__panel-content">
                <h2 className="settings-view__panel-title">{tabTitle(resolvedTab)}</h2>
                {tabDescription(resolvedTab) ? (
                  <p className="settings-view__panel-desc">{tabDescription(resolvedTab)}</p>
                ) : null}
              </div>
            </header>

            <div ref={panelBodyRef} className="settings-view__panel-body">
              <div className="settings-view__panel-content">
                <div key={resolvedTab} className="settings-view__panel-slot">
                  <Panel />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
