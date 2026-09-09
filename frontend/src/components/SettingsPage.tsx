import clsx from "clsx";
import {
  Bot,
  Cpu,
  CreditCard,
  Gauge,
  LayoutGrid,
  LogOut,
  Plug,
  Settings,
  Users,
  Volume2,
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
import ModelsSettingsSection from "./settings/ModelsSettingsSection";
import PluginsSettingsSection from "./settings/PluginsSettingsSection";
import AgentsSettingsSection from "./settings/AgentsSettingsSection";
import AudioSettingsSection from "./settings/AudioSettingsSection";
import UsageSettingsSection from "./settings/UsageSettingsSection";
import BillingSettingsSection from "./settings/BillingSettingsSection";
import { useAuthStore } from "../store/useAuthStore";
import SettingsProfileHeader from "./settings/SettingsProfileHeader";
import WorkspacesSettingsSection from "./settings/WorkspacesSettingsSection";

type NavItem =
  | { kind: "tab"; id: SettingsTab; label: string }
  | { kind: "separator" };

const TAB_ICONS: Record<SettingsTab, LucideIcon> = {
  general: Settings,
  friends: Users,
  workspaces: LayoutGrid,
  usage: Gauge,
  billing: CreditCard,
  agents: Bot,
  audio: Volume2,
  models: Cpu,
  plugins: Plug,
};

const TAB_PANELS: Record<SettingsTab, () => JSX.Element> = {
  general: GeneralSettingsSection,
  friends: FriendsSettingsSection,
  workspaces: WorkspacesSettingsSection,
  usage: UsageSettingsSection,
  billing: BillingSettingsSection,
  agents: AgentsSettingsSection,
  audio: AudioSettingsSection,
  models: ModelsSettingsSection,
  plugins: PluginsSettingsSection,
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

  const navItems = useMemo((): NavItem[] => {
    const items: NavItem[] = [
      { kind: "tab", id: "general", label: tabTitle("general") },
      { kind: "tab", id: "friends", label: tabTitle("friends") },
      { kind: "tab", id: "workspaces", label: tabTitle("workspaces") },
      { kind: "separator" },
      { kind: "tab", id: "plugins", label: tabTitle("plugins") },
      { kind: "tab", id: "agents", label: tabTitle("agents") },
      { kind: "tab", id: "models", label: tabTitle("models") },
      { kind: "tab", id: "audio", label: tabTitle("audio") },
      { kind: "separator" },
      { kind: "tab", id: "usage", label: tabTitle("usage") },
      { kind: "tab", id: "billing", label: tabTitle("billing") },
    ];
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild when language changes via t
  }, [t]);

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
            <ul className="settings-view__tabs">
              {navItems.map((item, index) => {
                if (item.kind === "separator") {
                  return (
                    <li
                      key={`sep-${index}`}
                      className="settings-view__tabs-separator"
                      aria-hidden
                    />
                  );
                }

                const cascadeIndex = navItems
                  .slice(0, index)
                  .filter((entry) => entry.kind === "tab").length;
                const Icon = TAB_ICONS[item.id];
                return (
                  <li key={item.id} style={{ "--cascade-i": cascadeIndex } as CSSProperties}>
                    <button
                      type="button"
                      className={clsx(
                        "settings-view__tab",
                        resolvedTab === item.id && "settings-view__tab--active",
                      )}
                      onClick={() => setSettingsTab(item.id)}
                      aria-current={resolvedTab === item.id ? "page" : undefined}
                    >
                      <Icon size={14} strokeWidth={2} className="settings-view__tab-icon" aria-hidden />
                      {item.label}
                    </button>
                  </li>
                );
              })}
              <li
                className="settings-view__tabs-logout"
                style={
                  {
                    "--cascade-i": navItems.filter((entry) => entry.kind === "tab").length,
                  } as CSSProperties
                }
              >
                <button
                  type="button"
                  className="settings-view__logout"
                  onClick={() => void signOut()}
                >
                  <LogOut size={14} aria-hidden />
                  {t("common.signOut")}
                </button>
              </li>
            </ul>
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
