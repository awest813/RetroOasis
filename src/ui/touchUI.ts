import { getSystemById, type SystemInfo } from "../systems.js";
import type { DeviceCapabilities } from "../performance.js";
import { getTouchControlsDefaultForSystem, isTouchDevice } from "../touch/preferences.js";
import type { TouchControlsOverlay } from "../touchControls.js";
import type { Settings } from "../main.js";
import { createElement as make } from "./dom.js";

function buildToggleRow(label: string, desc: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const row = make("label", { class: "toggle-row" });
  const left = make("span", { class: "toggle-row__text" });
  left.append(make("span", { class: "radio-row__label" }, label), make("span", { class: "radio-row__desc" }, desc));
  const toggle = make("span", { class: "toggle-switch" });
  const input  = make("input", { type: "checkbox" }) as HTMLInputElement;
  input.checked = checked;
  input.setAttribute("aria-label", label);
  const knob = make("span", { class: "toggle-switch__knob" });
  toggle.classList.toggle("is-checked", checked);
  toggle.append(input, knob);
  input.addEventListener("change", () => {
    toggle.classList.toggle("is-checked", input.checked);
    onChange(input.checked);
  });
  row.append(left, toggle);
  return row;
}

export function buildMobileSection(
  mobileSection: HTMLElement,
  settings: Settings,
  _deviceCaps: DeviceCapabilities,
  onSettingsChange: (patch: Partial<Settings>) => void,
  emulatorRef?: { currentSystem?: SystemInfo | null },
): void {
  mobileSection.appendChild(make("h4", { class: "settings-section__title" }, "Mobile & Touch"));

  const activeSystem = emulatorRef?.currentSystem ?? null;
  const activeSystemTouchControlsEnabled = getTouchControlsDefaultForSystem(activeSystem?.id ?? null, settings);
  const touchControlsHelp = activeSystem?.touchControlMode === "builtin"
    ? `This app keeps its overlay off by default for systems with built-in touch. Turn on if you want on-screen buttons too, then use Edit controls in the game toolbar to reposition them.`
    : `On-screen buttons over the game — defaults match each console. Turn off to hide them, or use Edit controls in the toolbar to reposition per console.`;

  const installRow = make("div", { class: "pwa-install-row" });
  installRow.innerHTML = `<p class="settings-help">Install as app: use your browser's install command in the address bar or menu.</p>`;
  mobileSection.appendChild(installRow);

  mobileSection.appendChild(buildToggleRow(
    "On-screen buttons",
    touchControlsHelp,
    activeSystemTouchControlsEnabled,
    (v) => {
      if (activeSystem?.id) {
        onSettingsChange({
          touchControlsBySystem: {
            ...settings.touchControlsBySystem,
            [activeSystem.id]: v,
          },
        });
      } else {
        onSettingsChange({ touchControls: v });
      }
    },
  ));

  const opacityRow = make("div", { class: "settings-control-row" });
  const opacityLabel = make("span", { class: "settings-control-label settings-control-label--wide" }, "Button opacity:");
  const opacityInp = make("input", {
    type: "range", min: "0.1", max: "1", step: "0.05",
    value: String(settings.touchOpacity ?? 0.85),
    class: "settings-control-field",
    "aria-label": "Touch button opacity",
  }) as HTMLInputElement;
  const opacityVal = make("span", { class: "settings-control-value settings-control-value--short" },
    `${Math.round((settings.touchOpacity ?? 0.85) * 100)}%`);
  opacityInp.addEventListener("input", () => {
    const v = parseFloat(opacityInp.value);
    opacityVal.textContent = `${Math.round(v * 100)}%`;
    onSettingsChange({ touchOpacity: v });
  });
  opacityRow.append(opacityLabel, opacityInp, opacityVal);
  mobileSection.appendChild(opacityRow);

  const scaleRow = make("div", { class: "settings-control-row" });
  const scaleLabel = make("span", { class: "settings-control-label settings-control-label--wide" }, "Button size:");
  const scaleInp = make("input", {
    type: "range", min: "0.5", max: "2", step: "0.1",
    value: String(settings.touchButtonScale ?? 1.0),
    class: "settings-control-field",
    "aria-label": "Touch button scale",
  }) as HTMLInputElement;
  const scaleVal = make("span", { class: "settings-control-value settings-control-value--short" },
    `${Math.round((settings.touchButtonScale ?? 1.0) * 100)}%`);
  scaleInp.addEventListener("input", () => {
    const v = parseFloat(scaleInp.value);
    scaleVal.textContent = `${Math.round(v * 100)}%`;
    onSettingsChange({ touchButtonScale: v });
  });
  scaleRow.append(scaleLabel, scaleInp, scaleVal);
  mobileSection.appendChild(scaleRow);

  mobileSection.appendChild(buildToggleRow(
    "Vibration feedback",
    "Vibrate briefly when pressing on-screen buttons (works on Android Chrome; not supported on iOS)",
    settings.hapticFeedback,
    (v) => onSettingsChange({ hapticFeedback: v })
  ));

  mobileSection.appendChild(buildToggleRow(
    "Auto-rotate to landscape",
    "Automatically switches to landscape orientation when a game starts (Android Chrome; not supported on iOS Safari)",
    settings.orientationLock,
    (v) => onSettingsChange({ orientationLock: v })
  ));
}

export function buildInGameTouchToggle(
  grid: HTMLElement,
  systemId: string,
  settings: Settings,
  onSettingsChange: (patch: Partial<Settings>) => void,
  signal?: AbortSignal,
): void {
  if (!isTouchDevice()) return;
  let touchEnabled = getTouchControlsDefaultForSystem(systemId, settings);
  const touchSys = getSystemById(systemId);
  const touchDesc =
    touchSys?.touchControlMode === "builtin"
      ? "Optional on-screen layer on top of native touch controls."
      : "Virtual buttons over the game — each console gets its own default layout (reset in Edit controls). Turn off for gamepads, keyboards, or a clear screen.";
  const touchRow = make("div", { class: "ingame-menu__setting-item" });
  touchRow.innerHTML = `
    <div class="ingame-menu__setting-info">
      <div class="ingame-menu__setting-name">On-screen controls</div>
      <div class="ingame-menu__setting-desc">${touchDesc}</div>
    </div>
    <div class="ingame-menu__setting-control">
      <button type="button" class="ingame-menu__toggle ${touchEnabled ? "on" : "off"}" aria-pressed="${touchEnabled ? "true" : "false"}">${touchEnabled ? "On" : "Off"}</button>
    </div>`;
  const tBtn = touchRow.querySelector("button")!;
  tBtn.addEventListener("click", () => {
    const next = !getTouchControlsDefaultForSystem(systemId, settings);
    onSettingsChange({
      touchControlsBySystem: {
        ...settings.touchControlsBySystem,
        [systemId.trim() || systemId]: next,
      },
    });
    touchEnabled = getTouchControlsDefaultForSystem(systemId, settings);
    tBtn.className = `ingame-menu__toggle ${touchEnabled ? "on" : "off"}`;
    tBtn.textContent = touchEnabled ? "On" : "Off";
    tBtn.setAttribute("aria-pressed", String(touchEnabled));
  }, { signal });
  grid.appendChild(touchRow);
}

export function buildInGameTouchHeaderButtons(
  container: HTMLElement,
  getTouchOverlay: (() => TouchControlsOverlay | null) | undefined,
  touchControlsEnabled: boolean,
  signal?: AbortSignal,
): void {
  if (!isTouchDevice()) return;
  const btnEditTouch = make("button", {
    class: "btn header-priority-optional",
    title: "Edit touch control layout",
    "aria-label": "Edit touch control layout",
  }) as HTMLButtonElement;
  btnEditTouch.textContent = "Edit controls";
  btnEditTouch.disabled = !touchControlsEnabled;
  btnEditTouch.addEventListener("click", () => {
    const overlay = getTouchOverlay?.();
    if (overlay) {
      overlay.setEditing(true);
      btnResetTouch.hidden = false;
    }
  }, { signal });

  const btnResetTouch = make("button", {
    class: "btn header-priority-optional",
    title: "Reset touch control layout to defaults",
    "aria-label": "Reset touch control layout",
  }) as HTMLButtonElement;
  btnResetTouch.textContent = "Reset Layout";
  btnResetTouch.hidden = true;
  btnResetTouch.addEventListener("click", () => {
    const overlay = getTouchOverlay?.();
    if (overlay) overlay.resetToDefaults();
  }, { signal });

  container.append(btnEditTouch, btnResetTouch);
}