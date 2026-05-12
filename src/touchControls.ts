import { isPortrait } from "./touch/preferences.js";
import { TOUCH_KEY_MAP } from "./touch/input.js";
import { loadLayout, resetLayout, type TouchButtonDef } from "./touch/layouts.js";
import { buildButton, buildDpad, buildStick } from "./touch/builders.js";
import { bindButton, bindDpad, bindStick, type BinderContext } from "./touch/binders.js";
export {
  getTouchControlsDefaultForSystem,
  isPortrait,
  isTouchDevice,
  setTouchControlsPreferenceForSystem,
  type TouchControlsPreferenceSettings,
} from "./touch/preferences.js";
export { TOUCH_KEY_MAP, vibratePress, vibrateRelease, type TouchKeyBinding } from "./touch/input.js";
export {
  DEFAULT_LAYOUT,
  DEFAULT_PORTRAIT_LAYOUT,
  getDefaultTouchLayoutForSystem,
  loadLayout,
  resetLayout,
  saveLayout,
  type TouchButtonDef,
} from "./touch/layouts.js";

/**
 * touchControls.ts — Virtual gamepad overlay for touch devices
 *
 * Renders a virtual gamepad over the emulator canvas.  Button presses are
 * forwarded to the emulator via synthetic keyboard events, matching the
 * RetroArch/EmulatorJS default key bindings.
 *
 * Overhaul highlights:
 *   - D-pad is now a single cross-shaped element that supports 8-way
 *     (diagonal) directional input via angle-based detection.  The four
 *     separate circular arrow buttons have been replaced by this element.
 *   - All event handling has been migrated from the legacy split
 *     (touchstart/touchmove/touchend + mousedown/mousemove/mouseup) to the
 *     unified Pointer Events API (pointerdown/pointermove/pointerup/
 *     pointercancel).  setPointerCapture() ensures pressed inputs remain
 *     tracked even when the pointer slides outside the element boundary —
 *     no document-level listener hacks required.
 *   - Multi-touch is handled by tracking a Set<number> of active pointer IDs
 *     instead of an integer counter, making the semantics explicit.
 *
 * Layout profiles are stored per system in localStorage so the user's
 * arrangement persists across sessions.  Each button is independently
 * positioned as a percentage of the overlay dimensions, so layouts work
 * across different screen sizes and orientations.
 *
 * Default positions and labels are **console-specific** (Game Boy vs PlayStation
 * vs Genesis, etc.). Resetting controls restores that system's preset.
 *
 * Haptic feedback via navigator.vibrate() fires on button press/release
 * when enabled — only on Android Chrome (iOS silently ignores it).
 */

// ── TouchControlsOverlay ─────────────────────────────────────────────────────

/**
 * Manages the virtual gamepad overlay DOM and interaction model.
 *
 * Usage:
 *   const overlay = new TouchControlsOverlay(container, systemId);
 *   overlay.show();           // show during gameplay
 *   overlay.hide();           // hide when returning to library
 *   overlay.setEditing(true); // enter drag-to-reposition mode
 *   overlay.destroy();        // clean up on page unload
 */
export class TouchControlsOverlay {
  private _container: HTMLElement;
  private _overlay: HTMLElement | null = null;
  private _systemId: string;
  private _buttons: TouchButtonDef[] = [];
  private _buttonEls: Map<string, HTMLElement> = new Map();
  private _visible = false;
  private _editing = false;
  private _hapticEnabled: boolean;
  private _opacity: number;
  private _scale: number;
  private _pressedKeys = new Set<string>();
  private _portrait: boolean;
  private _orientationHandler: (() => void) | null = null;
  /**
   * Cleanup callback set by bindDpad to release its internal active-direction
   * Set when keys need to be force-released (e.g. entering edit mode).
   */
  private _dpadCleanup: (() => void) | null = null;

  /** Called when the layout is saved (after drag ends in edit mode). */
  onLayoutSaved?: (systemId: string, layout: TouchButtonDef[]) => void;

  constructor(container: HTMLElement, systemId: string, hapticEnabled = true, opacity = 0.85, scale = 1.0) {
    this._container = container;
    this._systemId = systemId;
    this._hapticEnabled = hapticEnabled;
    this._opacity = Math.max(0.1, Math.min(1, opacity));
    this._scale   = Math.max(0.5, Math.min(2, scale));
    this._portrait = isPortrait();
    this._buttons = loadLayout(systemId, this._portrait);

    // Listen for orientation changes and swap to the appropriate layout.
    // The `nowPortrait === this._portrait` guard at the top of the handler
    // means that even if both `orientationchange` and `resize` fire for a
    // single physical rotation, the (expensive) layout reload and DOM rebuild
    // only runs once.
    this._orientationHandler = () => {
      const nowPortrait = isPortrait();
      if (nowPortrait === this._portrait) return;
      this._portrait = nowPortrait;
      this._buttons = loadLayout(this._systemId, this._portrait);
      if (this._visible) this._rebuild();
    };
    window.addEventListener("orientationchange", this._orientationHandler);
    // `resize` catches browsers (notably some desktop Chromium builds) that
    // fire resize instead of orientationchange when the viewport rotates.
    window.addEventListener("resize", this._orientationHandler);
  }

  /** True when the overlay is currently visible. */
  get visible(): boolean { return this._visible; }

  /** True when in drag-to-edit mode. */
  get editing(): boolean { return this._editing; }

  /** Change haptic feedback on/off at runtime. */
  setHapticEnabled(enabled: boolean): void {
    this._hapticEnabled = enabled;
  }

  /** Change button opacity (0.1–1.0) at runtime. */
  setOpacity(opacity: number): void {
    const clamped = Math.max(0.1, Math.min(1, opacity));
    if (clamped === this._opacity) return;
    this._opacity = clamped;
    if (this._overlay) {
      this._overlay.style.setProperty("--tc-opacity", String(this._opacity));
    }
  }

  /** Change global button scale (0.5–2.0) at runtime — rebuilds DOM if visible. */
  setScale(scale: number): void {
    const clamped = Math.max(0.5, Math.min(2, scale));
    if (clamped === this._scale) return;
    this._scale = clamped;
    if (this._visible) this._rebuild();
  }

  /** Swap to a different system (reloads its layout). */
  setSystem(systemId: string): void {
    this._systemId = systemId;
    this._buttons = loadLayout(systemId, this._portrait);
    if (this._visible) this._rebuild();
  }

  show(): void {
    if (this._visible) return;
    this._visible = true;
    this._build();
  }

  hide(): void {
    if (!this._visible) return;
    this._visible = false;
    // Leaving gameplay always exits edit mode so the next session
    // starts in normal play mode.
    this._editing = false;
    this._releaseAllKeys();
    this._overlay?.remove();
    this._overlay = null;
    this._buttonEls.clear();
    this._dpadCleanup = null;
  }

  setEditing(editing: boolean): void {
    // Release all currently-held inputs before entering edit mode so that no
    // key gets stuck while the user is dragging buttons around.
    if (editing && !this._editing) {
      this._releaseAllKeys();
    }
    this._editing = editing;
    if (!this._overlay) return;
    this._overlay.classList.toggle("touch-controls--editing", editing);
    // Update each button's cursor and add/remove edit label
    for (const el of this._buttonEls.values()) {
      el.style.cursor = editing ? "grab" : "";
      const editHint = el.querySelector(".tc-edit-hint");
      if (editing && !editHint) {
        const hint = document.createElement("span");
        hint.className = "tc-edit-hint";
        hint.textContent = "\u2725";
        el.appendChild(hint);
      } else if (!editing && editHint) {
        editHint.remove();
      }
      // When entering edit mode, reset any displaced stick knob to centre so
      // the user doesn't see a stuck-offset knob while repositioning the stick.
      if (editing && el.classList.contains("tc-stick")) {
        el.classList.remove("tc-stick--active");
        const knob = el.querySelector<HTMLElement>(".tc-stick__knob");
        if (knob) knob.style.transform = "translate(-50%, -50%)";
      }
    }
  }

  /** Reset layout for the current system to defaults. */
  resetToDefaults(): void {
    this._buttons = resetLayout(this._systemId, this._portrait);
    if (this._visible) this._rebuild();
    this.onLayoutSaved?.(this._systemId, this._buttons);
  }

  destroy(): void {
    if (this._orientationHandler) {
      window.removeEventListener("orientationchange", this._orientationHandler);
      window.removeEventListener("resize", this._orientationHandler);
      this._orientationHandler = null;
    }
    this.hide();
  }

  // ── Private: DOM building ─────────────────────────────────────────────────

  private _rebuild(): void {
    this._releaseAllKeys();
    this._overlay?.remove();
    this._overlay = null;
    this._buttonEls.clear();
    this._dpadCleanup = null;
    this._build();
  }

  private _build(): void {
    const overlay = document.createElement("div");
    overlay.className = "touch-controls";
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.setProperty("--tc-opacity", String(this._opacity));

    const ctx = this._createBinderContext();

    for (const btn of this._buttons) {
      if (btn.type === "stick") {
        const scaled = Math.round(btn.size * this._scale);
        const { outer, knob } = buildStick(btn, this._scale);
        overlay.appendChild(outer);
        this._buttonEls.set(btn.id, outer);
        bindStick(outer, knob, btn, scaled, ctx);
      } else if (btn.type === "dpad") {
        const scaled = Math.round(btn.size * this._scale);
        const { outer, arms } = buildDpad(btn, this._scale);
        overlay.appendChild(outer);
        this._buttonEls.set(btn.id, outer);
        bindDpad(outer, arms, btn, scaled, ctx);
      } else {
        const el = buildButton(btn, this._scale);
        overlay.appendChild(el);
        this._buttonEls.set(btn.id, el);
        bindButton(el, btn, ctx);
      }
    }

    if (this._editing) {
      overlay.classList.add("touch-controls--editing");
    }

    this._container.appendChild(overlay);
    this._overlay = overlay;

    // Re-apply editing visuals when rebuilding while edit mode is active
    // (e.g. system change with overlay already visible).
    this.setEditing(this._editing);
  }

  /** Create a live-context object consumed by the binder functions in binders.ts. */
  private _createBinderContext(): BinderContext {
    const self = this;
    return {
      get editing()       { return self._editing; },
      get hapticEnabled() { return self._hapticEnabled; },
      get overlay()       { return self._overlay; },
      get systemId()      { return self._systemId; },
      get portrait()      { return self._portrait; },
      get buttons()       { return self._buttons; },
      pressedKeys: self._pressedKeys,
      setDpadCleanup(fn: (() => void) | null) { self._dpadCleanup = fn; },
      get onLayoutSaved() { return self.onLayoutSaved; },
    };
  }

  /** Release all currently-held virtual keys (on hide or entering edit mode). */
  private _releaseAllKeys(): void {
    for (const id of this._pressedKeys) {
      const keyDef = TOUCH_KEY_MAP[id];
      if (!keyDef) continue;
      document.dispatchEvent(new KeyboardEvent("keyup", {
        key: keyDef.key, code: keyDef.code, bubbles: true, cancelable: true,
      }));
    }
    this._pressedKeys.clear();
    for (const el of this._buttonEls.values()) {
      el.classList.remove("tc-btn--pressed");
    }
    // Clear the D-pad's internal active-direction Set and arm highlighting.
    this._dpadCleanup?.();
  }
}
