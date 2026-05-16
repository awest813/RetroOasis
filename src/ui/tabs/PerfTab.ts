import { createElement as make, buildToggleRow } from "../dom.js";
import { formatCapabilitiesSummary, formatTierLabel, type DeviceCapabilities, type PerformanceMode } from "../../performance.js";
import type { Settings } from "../../types/settings.js";
import type { PSPEmulator } from "../../emulator.js";
import { buildSystemFeatureRow } from "../systemFeatures.js";

function formatWebGPUStatus(
  available: boolean,
  adapterInfo?: { device?: string; vendor?: string; isFallbackAdapter?: boolean } | null
): string {
  if (!available) return "Not available (browser does not expose WebGPU)";
  if (adapterInfo?.device) {
    const suffix = adapterInfo.isFallbackAdapter ? " (software fallback)" : "";
    return `${adapterInfo.device}${suffix}`;
  }
  if (adapterInfo?.vendor) return String(adapterInfo.vendor);
  return "Available";
}

export function buildPerfTab(
  container:        HTMLElement,
  settings:         Settings,
  deviceCaps:       DeviceCapabilities,
  onSettingsChange: (patch: Partial<Settings>) => void,
  emulatorRef?:     PSPEmulator,
  appName:          string = "RetroOasis"
): void {
  const activeSystem = emulatorRef?.currentSystem ?? null;
  const activeTier = emulatorRef?.activeTier ?? null;
  if (activeSystem) {
    const coreSection = make("div", { class: "settings-section" });
    coreSection.appendChild(make("h4", { class: "settings-section__title" }, "Current Core"));

    const heading = make("div", { class: "settings-core-heading" });
    if (activeSystem.iconUrl) {
      heading.appendChild(make("img", { src: activeSystem.iconUrl, class: "settings-core-heading__icon", alt: "" }));
    }
    const headerText = make("div", { class: "settings-core-heading__text" });
    headerText.appendChild(make("strong", { class: "settings-core-heading__title" }, activeSystem.name));

    const slotId = activeSystem.coreId ?? activeSystem.id;
    const wasmPkg = emulatorRef?.resolvedWasmCoreName;
    const coreLabel =
      wasmPkg && wasmPkg !== slotId
        ? `WASM core: ${wasmPkg} · System slot: ${slotId}`
        : `Core: ${wasmPkg ?? slotId}`;
    const coreMeta = make("div", { class: "settings-core-heading__meta" },
      `${coreLabel} · ` +
      (activeTier ? `Hardware: ${formatTierLabel(activeTier)}` : "Hardware: Auto")
    );
    headerText.appendChild(coreMeta);
    heading.appendChild(headerText);
    coreSection.appendChild(heading);

    const profileBits = [
      activeTier ? `${formatTierLabel(activeTier)} tier` : null,
      settings.performanceMode === "auto" ? "Auto graphics mode" : `${settings.performanceMode === "performance" ? "Performance" : "Quality"} graphics mode`,
      activeSystem.is3D ? "3D visuals tuned for heavier rendering" : "Lightweight core profile",
    ].filter((bit): bit is string => Boolean(bit));
    coreSection.appendChild(make("p", { class: "settings-help" }, profileBits.join(" • ")));

    const featureRow = buildSystemFeatureRow(activeSystem, {
      includeExperimental: true,
      includeOnline: true,
      className: "system-feature-row system-feature-row--settings",
    });
    if (featureRow) coreSection.appendChild(featureRow);
    container.appendChild(coreSection);
  }

  // Performance mode
  const perfSection = make("div", { class: "settings-section" });
  perfSection.appendChild(make("h4", { class: "settings-section__title" }, "Graphics Mode"));
  perfSection.appendChild(make("p", { class: "settings-help" },
    "Controls emulation quality versus speed for games that honour tier presets. " +
    "Try Performance mode if gameplay feels sluggish. Changes apply when you start or restart a game. " +
    "This graphics mode also steers WebGL power hints when cores create a GPU context."
  ));

  const autoModeActive = deviceCaps.isLowSpec || deviceCaps.tier === "medium" ? "Performance" : "Quality";
  const modes: Array<{ value: PerformanceMode; label: string; desc: string }> = [
    { value: "auto",        label: "Auto (Recommended)", desc: `Let ${appName} choose — right now leaning toward ${autoModeActive} for this device.` },
    { value: "performance", label: "Performance — smoother gameplay",  desc: "Lower-resolution presets but faster. Great for older devices or when games feel sluggish." },
    { value: "quality",     label: "Quality — sharper visuals",        desc: "Higher-resolution presets where available. May tax weaker hardware." },
  ];

  const perfRg = make("div", {
    role: "radiogroup",
    class: "settings-radio-group",
    "aria-label": "Graphics mode for games",
  });
  perfSection.appendChild(perfRg);
  for (const m of modes) {
    const row   = make("label", { class: "radio-row" });
    const radio = make("input", { type: "radio", name: "perf-mode", value: m.value }) as HTMLInputElement;
    if (settings.performanceMode === m.value) radio.checked = true;
    radio.addEventListener("change", () => { if (radio.checked) onSettingsChange({ performanceMode: m.value }); });
    const txt = make("span", { class: "radio-row__text" });
    txt.append(make("span", { class: "radio-row__label" }, m.label), make("span", { class: "radio-row__desc" }, m.desc));
    row.append(radio, txt);
    perfRg.appendChild(row);
  }

  perfSection.appendChild(buildToggleRow(
    "Dynamic resolution",
    "For PSP, PS1, Nintendo 64, DS, and Dreamcast, lowers internal resolution automatically when FPS stays below a steady threshold, then ramps back when performance recovers. A per-game graphics profile can turn this off for that title.",
    settings.dynamicResolutionScaling,
    (v) => onSettingsChange({ dynamicResolutionScaling: v }),
  ));

  // Device info
  const deviceSection = make("div", { class: "settings-section" });
  deviceSection.appendChild(make("h4", { class: "settings-section__title" }, "Your Device"));
  deviceSection.appendChild(make("p", { class: "settings-help" },
    `${appName} automatically picks the best settings for your device.`
  ));

  const capText = formatCapabilitiesSummary(deviceCaps);
  deviceSection.appendChild(make("p", { class: "device-info" }, capText));

  const tierClass = deviceCaps.tier === "low" ? "tier-badge tier-badge--warn" : deviceCaps.tier === "medium" ? "tier-badge tier-badge--mid" : "tier-badge tier-badge--ok";
  const tierLabel = deviceCaps.tier === "low"
    ? "Entry-level graphics"
    : deviceCaps.tier === "medium"
    ? "Mid-range graphics"
    : "High-performance graphics";
  deviceSection.appendChild(make("span", { class: tierClass }, tierLabel));

  // Technical GPU details behind a disclosure
  const gpuDisclosure = make("details", { class: "settings-details" }) as HTMLDetailsElement;
  gpuDisclosure.appendChild(make("summary", {}, "Technical details"));

  const gpuDetails = make("div", { class: "settings-details__content" });
  const adapterInfo = emulatorRef?.webgpuAdapterInfo;
  const webgpuStatusText = formatWebGPUStatus(deviceCaps.webgpuAvailable, adapterInfo);
  gpuDetails.appendChild(make("p", { class: "device-info" }, `GPU score: ${deviceCaps.gpuBenchmarkScore}/100`));
  gpuDetails.appendChild(make("p", { class: "device-info" }, `Max texture size: ${deviceCaps.gpuCaps.maxTextureSize}px · VRAM: ~${deviceCaps.estimatedVRAMMB} MB`));
  if (deviceCaps.gpuCaps.anisotropicFiltering) {
    gpuDetails.appendChild(make("p", { class: "device-info" }, `Anisotropic filtering: ${deviceCaps.gpuCaps.maxAnisotropy}×`));
  }
  gpuDetails.appendChild(make("p", { class: "device-info" }, `WebGL 2: ${deviceCaps.gpuCaps.webgl2 ? "Yes" : "No"} · WebGPU: ${webgpuStatusText}`));
  gpuDetails.appendChild(make("p", { class: "device-info" }, `SharedArrayBuffer: ${typeof SharedArrayBuffer !== "undefined" ? "Yes (PSP supported)" : "No"} · AudioWorklet: ${typeof AudioWorkletNode !== "undefined" ? "Yes" : "No"}`));
  gpuDisclosure.appendChild(gpuDetails);
  deviceSection.appendChild(gpuDisclosure);
  container.append(perfSection, deviceSection);

  // UI Mode (Lite vs Quality)
  const uiSection = make("div", { class: "settings-section" });
  uiSection.appendChild(make("h4", { class: "settings-section__title" }, "UI Visual Fidelity"));
  uiSection.appendChild(make("p", { class: "settings-help" },
    "Controls the chrome around the library and menus — not in-game emulation. Lite mode trims blurs and heavy animations " +
    "so the interface stays snappy on constrained devices."
  ));

  const uiModes: Array<{ value: Settings["uiMode"]; label: string; desc: string }> = [
    { value: "auto",    label: "Auto (Recommended)",    desc: "Uses device class, Motion preferences, and data-saver cues when deciding." },
    { value: "quality", label: "Quality — full effects", desc: "Full chrome: blurs, motion, richer gradients." },
    { value: "lite",    label: "Lite — max speed",      desc: "Minimal chrome for maximum UI responsiveness." },
  ];

  const uiRg = make("div", {
    role: "radiogroup",
    class: "settings-radio-group",
    "aria-label": "Library and shell visual style",
  });
  uiSection.appendChild(uiRg);
  for (const m of uiModes) {
    const row   = make("label", { class: "radio-row" });
    const radio = make("input", { type: "radio", name: "ui-mode", value: m.value }) as HTMLInputElement;
    if (settings.uiMode === m.value) radio.checked = true;
    radio.addEventListener("change", () => { if (radio.checked) onSettingsChange({ uiMode: m.value }); });
    const txt = make("span", { class: "radio-row__text" });
    txt.append(make("span", { class: "radio-row__label" }, m.label), make("span", { class: "radio-row__desc" }, m.desc));
    row.append(radio, txt);
    uiRg.appendChild(row);
  }
  container.appendChild(uiSection);
}
