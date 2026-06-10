import { createElement as make, buildToggleRow } from "../dom.js";
import type { Settings } from "../../types/settings.js";
import type { DeviceCapabilities } from "../../performance.js";
import type { PSPEmulator } from "../../emulator.js";
import { resolveTier } from "../../performance.js";
import { POST_PROCESS_EFFECT_UI_ORDER, shouldDeferWebGpuPostFor3DSession } from "../../webgpuPostProcess.js";
import type { PostProcessEffect } from "../../webgpuPostProcess.js";
import { showFPSOverlay } from "../../modules/DevOverlay.js";
import { shouldApplyTouchUi } from "../mobile.js";

export function buildDisplayTab(
  container:        HTMLElement,
  settings:         Settings,
  deviceCaps:       DeviceCapabilities,
  onSettingsChange: (patch: Partial<Settings>) => void,
  emulatorRef?:     PSPEmulator,
  appName = "RetroOasis"
): void {
  // FPS & Audio section
  const overlaySection = make("div", { class: "settings-section" });
  overlaySection.appendChild(make("h4", { class: "settings-section__title" }, "In-Game Overlays"));

  overlaySection.appendChild(buildToggleRow(
    "Show FPS counter",
    "Shows frame rate while a game is running.",
    settings.showFPS,
    (v) => {
      onSettingsChange({ showFPS: v });
      showFPSOverlay(v, emulatorRef, settings.showAudioVis);
      emulatorRef?.setFPSMonitorEnabled(v);
    }
  ));

  overlaySection.appendChild(buildToggleRow(
    "Audio waveform",
    "Adds a waveform next to the FPS readout (FPS counter must be on).",
    settings.showAudioVis,
    (v) => {
      onSettingsChange({ showAudioVis: v });
      if (settings.showFPS) showFPSOverlay(true, emulatorRef, v);
    }
  ));

  // Audio Enhancement section
  const audioSection = make("div", { class: "settings-section" });
  audioSection.appendChild(make("h4", { class: "settings-section__title" }, "Audio Enhancement"));
  audioSection.appendChild(make("p", { class: "settings-help" },
    "Apply an audio filter to reduce harshness or rumble in emulated audio output."
  ));

  const filterTypeRow = make("div", { class: "settings-control-row" });
  const filterTypeLabel = make("span", { class: "settings-control-label" }, "Filter type:");
  const filterTypeSel = make("select", {
    class: "settings-select settings-control-field settings-control-field--compact",
    "aria-label": "Audio filter type",
  }) as HTMLSelectElement;
  const filterTypeOptions: Array<[string, string]> = [
    ["none",     "None (off)"],
    ["lowpass",  "Low-pass (reduce crunch)"],
    ["highpass", "High-pass (reduce rumble)"],
  ];
  for (const [val, lbl] of filterTypeOptions) {
    const o = make("option", { value: val }, lbl) as HTMLOptionElement;
    if (settings.audioFilterType === val) o.selected = true;
    filterTypeSel.appendChild(o);
  }
  filterTypeSel.addEventListener("change", () => {
    onSettingsChange({ audioFilterType: filterTypeSel.value as Settings["audioFilterType"] });
    cutoffRow.hidden = filterTypeSel.value === "none";
  });
  filterTypeRow.append(filterTypeLabel, filterTypeSel);
  audioSection.appendChild(filterTypeRow);

  const cutoffRow = make("div", { class: "settings-control-row" });
  cutoffRow.hidden = settings.audioFilterType === "none";
  const cutoffLabel = make("span", { class: "settings-control-label" }, "Cutoff frequency:");
  const cutoffInp = make("input", {
    type: "range", min: "1000", max: "18000", step: "500",
    value: String(settings.audioFilterCutoff),
    class: "settings-control-field",
    "aria-label": "Audio filter cutoff frequency",
  }) as HTMLInputElement;
  const cutoffVal = make("span", { class: "settings-control-value" }, `${settings.audioFilterCutoff} Hz`);
  cutoffInp.addEventListener("input", () => {
    const hz = parseInt(cutoffInp.value, 10);
    cutoffVal.textContent = `${hz} Hz`;
  });
  cutoffInp.addEventListener("change", () => {
    const hz = parseInt(cutoffInp.value, 10);
    onSettingsChange({ audioFilterCutoff: hz });
  });
  cutoffRow.append(cutoffLabel, cutoffInp, cutoffVal);
  audioSection.appendChild(cutoffRow);

  container.append(overlaySection, audioSection);

  const mobileSection = make("div", { class: "settings-section" });
  mobileSection.appendChild(make("h4", { class: "settings-section__title" }, "Mobile"));
  const touchFirst = shouldApplyTouchUi();
  mobileSection.appendChild(make("p", { class: "settings-help" },
    touchFirst
      ? "Touch-friendly layout with an on-screen gamepad from the emulator while you play."
      : "For phones, tablets, and touch laptops. The on-screen gamepad appears automatically on touch-first devices.",
  ));

  mobileSection.appendChild(buildToggleRow(
    "Lock to landscape while playing",
    "Keeps the screen horizontal during gameplay. Some browsers block orientation lock — turn this off if games stay stuck sideways.",
    settings.orientationLock,
    (v) => onSettingsChange({ orientationLock: v }),
  ));

  container.appendChild(mobileSection);

  // UI Scale section
  const uiScaleSection = make("div", { class: "settings-section" });
  uiScaleSection.appendChild(make("h4", { class: "settings-section__title" }, "UI Scale"));
  uiScaleSection.appendChild(make("p", { class: "settings-help" },
    "Adjust the size of all UI elements. Useful for tablets, Chromebooks, or if text feels too small."
  ));

  const uiScaleRow = make("div", { class: "settings-control-row" });
  const uiScaleLabel = make("span", { class: "settings-control-label" }, "Scale:");
  const uiScaleInp = make("input", {
    type: "range", min: "80", max: "150", step: "5",
    value: String(Math.round(settings.uiScale * 100)),
    class: "settings-control-field",
    "aria-label": "UI scale",
  }) as HTMLInputElement;
  const uiScaleVal = make("span", { class: "settings-control-value" }, `${Math.round(settings.uiScale * 100)}%`);
  uiScaleInp.addEventListener("input", () => {
    const pct = parseInt(uiScaleInp.value, 10);
    uiScaleVal.textContent = `${pct}%`;
  });
  uiScaleInp.addEventListener("change", () => {
    const scale = parseInt(uiScaleInp.value, 10) / 100;
    onSettingsChange({ uiScale: scale });
  });
  uiScaleRow.append(uiScaleLabel, uiScaleInp, uiScaleVal);
  uiScaleSection.appendChild(uiScaleRow);

  container.appendChild(uiScaleSection);

  // WebGPU section last when available — overlay and mobile settings stay near the top.
  if (deviceCaps.webgpuAvailable) {
    const gpuSection = make("div", { class: "settings-section" });
    gpuSection.appendChild(make("h4", {
      class: "settings-section__title",
      id: "visual-effects-heading",
    }, "Visual Effects"));
    gpuSection.appendChild(make("p", { class: "settings-help" },
      `Optional fullscreen filters layered over the emulator via WebGPU. When an effect runs, ${appName} may keep each WebGL frame in memory between presents ` +
      "so the overlay can sample it — a slight increase in VRAM or bandwidth on some GPUs.",
    ));

    {
      const tierForHint = resolveTier(settings.performanceMode, deviceCaps);
      if (shouldDeferWebGpuPostFor3DSession(true, tierForHint, deviceCaps)) {
        gpuSection.appendChild(make("p", { class: "settings-help" },
          "On this tier, WebGPU overlays stay off for heavier 3D systems (PSP, PS1, N64, DS) so more GPU time stays on the emulator. " +
          `Set a per-game effect in ${appName}'s graphics profile when you explicitly want filters on those cores.`
        ));
      }
    }

    gpuSection.appendChild(buildToggleRow(
      "Enable GPU effects",
      "Turns on the selectable filters below. Experimental; skipped effects are remembered but not drawn until they're allowed.",
      settings.useWebGPU,
      (v) => onSettingsChange({ useWebGPU: v }),
    ));

    type FxOption = { value: PostProcessEffect; label: string; desc: string };
    const fxOptions: FxOption[] = [
      { value: "none",       label: "No effect",        desc: "Clean output — exactly as the game renders it" },
      { value: "fsr",        label: "FSR 1.0",          desc: "Edge-adaptive upsampling + sharpening — AMD FidelityFX inspired" },
      { value: "taa",        label: "TAA",              desc: "Temporal anti-aliasing — blends frames to reduce shimmer on 3D geometry" },
      { value: "crt",        label: "CRT screen",       desc: "Scanlines and glow — like playing on a real CRT TV" },
      { value: "sharpen",    label: "Sharper image",    desc: "Crisper pixels — great for upscaled handheld games" },
      { value: "lcd",        label: "LCD handheld",     desc: "Sub-pixel grid — simulates a handheld LCD screen" },
      { value: "bloom",      label: "Soft glow",        desc: "Gentle glow on bright areas — warm, cinematic feel" },
      { value: "fxaa",       label: "Smooth edges",     desc: "Reduces jagged edges on 3D game geometry" },
      { value: "grain",      label: "Film grain",       desc: "Cinematic noise overlay — adds texture to flat backgrounds" },
      { value: "retro",      label: "Retro pixel art",  desc: "Limited palette with ordered dithering — classic console look" },
      { value: "colorgrade", label: "Color grading",    desc: "Adjust contrast, saturation, and brightness for a custom look" },
      { value: "pixelate",   label: "Pixelate",         desc: "Blocky upscale — emphasises hard pixel edges (mostly 2D-friendly)" },
      { value: "ntsc",       label: "NTSC composite",   desc: "Colour bleed and composite artifacts — CRT broadcast look" },
      { value: "hdr",        label: "HDR tone map",     desc: "Brighter highlights — intended for 3D; often disabled on 2D cores automatically" },
    ];
    if (import.meta.env.DEV) {
      fxOptions.forEach((o, i) => {
        if (POST_PROCESS_EFFECT_UI_ORDER[i] !== o.value) {
          throw new Error(
            `[${appName}] Visual Effects UI list diverged from POST_PROCESS_EFFECT_UI_ORDER at index ${i}`,
          );
        }
      });
    }

    const fxRg = make("div", {
      role: "radiogroup",
      class: "settings-radio-group",
      "aria-labelledby": "visual-effects-heading",
    });
    gpuSection.appendChild(fxRg);

    for (const opt of fxOptions) {
      const row   = make("label", { class: "radio-row" });
      const radio = make("input", { type: "radio", name: "postfx-mode", value: opt.value }) as HTMLInputElement;
      if (settings.postProcessEffect === opt.value) radio.checked = true;
      radio.disabled = !settings.useWebGPU;
      radio.addEventListener("change", () => {
        if (radio.checked) onSettingsChange({ postProcessEffect: opt.value as PostProcessEffect });
      });
      const txt = make("span", { class: "radio-row__text" });
      txt.append(make("span", { class: "radio-row__label" }, opt.label), make("span", { class: "radio-row__desc" }, opt.desc));
      row.append(radio, txt);
      fxRg.appendChild(row);
    }

    container.appendChild(gpuSection);
  }
}
