import { createElement as make } from "../dom.js";
import { buildProfileSection } from "../profileSection.js";
import type { ApiKeyStore } from "../../apiKeyStore.js";
import { getProfileManager, type ProfileApplyDeps } from "../../profileManager.js";
import type { Settings } from "../../types/settings.js";

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function playTogetherStatus(settings: Settings): { label: string; tone: "ready" | "warn" | "idle" } {
  if (settings.netplayEnabled && settings.netplayServerUrl.trim()) {
    return { label: "Ready", tone: "ready" };
  }
  if (settings.netplayEnabled) {
    return { label: "Needs server", tone: "warn" };
  }
  return { label: "Off", tone: "idle" };
}

function buildAccountSummary(settings: Settings, deps: ProfileApplyDeps | null): HTMLElement {
  const pm = getProfileManager();
  if (deps) pm.ensureInitialized(deps);

  const summary = make("div", { class: "account-summary", role: "list", "aria-label": "Account status" });
  const profileCount = pm.listProfiles().length;
  const activeProfileName = pm.getActiveProfileName();
  const profileColor = pm.getActiveProfileColor();
  const playStatus = playTogetherStatus(settings);
  const enabledCloudSources = settings.cloudLibraries.filter((source) => source.enabled).length;

  const items: Array<{
    label: string;
    value: string;
    detail: string;
    tone?: "ready" | "warn" | "idle";
    color?: string;
  }> = [
    {
      label: "Active profile",
      value: activeProfileName,
      detail: formatCount(profileCount, "slot"),
      color: profileColor,
    },
    {
      label: "Library view",
      value: settings.profileLibraryFilter ? "Filtered" : "Shared",
      detail: settings.profileLibraryFilter ? "Active profile plus untagged games" : "All local games visible",
    },
    {
      label: "Play Together",
      value: playStatus.label,
      detail: settings.netplayServerUrl.trim() || "No server URL saved",
      tone: playStatus.tone,
    },
    {
      label: "Cloud library",
      value: formatCount(enabledCloudSources, "source"),
      detail: settings.cloudLibraries.length === 0
        ? "No cloud sources saved"
        : settings.cloudLibraries.length === enabledCloudSources
        ? "All saved sources enabled"
        : `${settings.cloudLibraries.length} saved total`,
    },
  ];

  for (const item of items) {
    const tile = make("div", { class: `account-summary__item${item.tone ? ` account-summary__item--${item.tone}` : ""}`, role: "listitem" });
    const label = make("span", { class: "account-summary__label" }, item.label);
    const value = make("strong", { class: "account-summary__value" });
    if (item.color) {
      const dot = make("span", {
        class: "account-summary__dot",
        style: `background-color:${item.color}`,
        "aria-hidden": "true",
      });
      value.append(dot);
    }
    value.append(document.createTextNode(item.value));
    tile.append(label, value, make("span", { class: "account-summary__detail" }, item.detail));
    summary.appendChild(tile);
  }

  return summary;
}

export function buildAccountTab(
  container: HTMLElement,
  settings: Settings,
  onSettingsChange: (patch: Partial<Settings>) => void,
  apiKeyStore: ApiKeyStore | undefined,
  appName = "RetroOasis",
): void {
  container.innerHTML = "";

  const headingId = "settings-account-heading";
  const section = make("div", {
    class: "settings-section settings-section--account",
    role: "region",
    "aria-labelledby": headingId,
  });
  section.appendChild(make("h4", { class: "settings-section__title", id: headingId }, "Account & Profiles"));
  section.appendChild(make("p", { class: "settings-section__desc" },
    `${appName} profiles are local account slots for people, devices, or setups. ` +
    "They bundle cloud sources, provider keys, Play Together setup, library filters, and display preferences."));

  const deps: ProfileApplyDeps | null = apiKeyStore
    ? { settings, apiKeyStore, onSettingsChange }
    : null;
  section.appendChild(buildAccountSummary(settings, deps));

  const rebuildTab = () => buildAccountTab(container, settings, onSettingsChange, apiKeyStore, appName);
  section.appendChild(buildProfileSection(settings, onSettingsChange, apiKeyStore, rebuildTab));
  container.appendChild(section);
}
