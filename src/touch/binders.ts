import { TOUCH_KEY_MAP, vibratePress, vibrateRelease } from "./input.js";
import { saveLayout, type TouchButtonDef } from "./layouts.js";

/**
 * Context provided by the overlay that the binder functions need at event
 * time.  All properties (except `pressedKeys` and callbacks) are live
 * accessors on the hosting overlay so the binder always sees the current
 * editing / haptic / visibility state.
 */
export interface BinderContext {
  editing: boolean;
  hapticEnabled: boolean;
  overlay: HTMLElement | null;
  systemId: string;
  portrait: boolean;
  buttons: TouchButtonDef[];
  pressedKeys: Set<string>;
  setDpadCleanup(fn: (() => void) | null): void;
  onLayoutSaved?(systemId: string, layout: TouchButtonDef[]): void;
}

export function bindButton(el: HTMLElement, btn: TouchButtonDef, ctx: BinderContext): void {
  const keyDef = TOUCH_KEY_MAP[btn.id];

  let dragPointerId = -1;
  let dragStartX = 0, dragStartY = 0;
  let origX = btn.x, origY = btn.y;

  const activePointers = new Set<number>();

  const pressKey = () => {
    if (ctx.editing || !keyDef) return;
    if (ctx.pressedKeys.has(btn.id)) return;
    ctx.pressedKeys.add(btn.id);
    if (ctx.hapticEnabled) vibratePress();
    el.classList.add("tc-btn--pressed");
    document.dispatchEvent(new KeyboardEvent("keydown", {
      key: keyDef.key, code: keyDef.code, bubbles: true, cancelable: true,
    }));
  };

  const releaseKey = () => {
    if (!keyDef) return;
    if (!ctx.pressedKeys.has(btn.id)) return;
    ctx.pressedKeys.delete(btn.id);
    if (ctx.hapticEnabled) vibrateRelease();
    el.classList.remove("tc-btn--pressed");
    document.dispatchEvent(new KeyboardEvent("keyup", {
      key: keyDef.key, code: keyDef.code, bubbles: true, cancelable: true,
    }));
  };

  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);

    if (ctx.editing) {
      if (dragPointerId !== -1) return;
      dragPointerId = e.pointerId;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      origX = btn.x;
      origY = btn.y;
      el.style.cursor = "grabbing";
      return;
    }

    activePointers.add(e.pointerId);
    pressKey();
  }, { passive: false });

  el.addEventListener("pointermove", (e) => {
    if (dragPointerId === e.pointerId) {
      if (!ctx.overlay) return;
      const rect = ctx.overlay.getBoundingClientRect();
      btn.x = Math.max(0, Math.min(100, origX + ((e.clientX - dragStartX) / rect.width)  * 100));
      btn.y = Math.max(0, Math.min(100, origY + ((e.clientY - dragStartY) / rect.height) * 100));
      el.style.left = `${btn.x}%`;
      el.style.top  = `${btn.y}%`;
    }
  });

  const onPointerEnd = (e: PointerEvent) => {
    if (dragPointerId === e.pointerId) {
      dragPointerId = -1;
      el.style.cursor = "grab";
      el.releasePointerCapture(e.pointerId);
      saveLayout(ctx.systemId, ctx.buttons, ctx.portrait);
      ctx.onLayoutSaved?.(ctx.systemId, ctx.buttons);
      return;
    }
    activePointers.delete(e.pointerId);
    el.releasePointerCapture(e.pointerId);
    if (activePointers.size === 0) releaseKey();
  };

  el.addEventListener("pointerup",     onPointerEnd);
  el.addEventListener("pointercancel", onPointerEnd);
}

export function bindDpad(
  outer: HTMLElement,
  arms: Map<string, HTMLElement>,
  btn: TouchButtonDef,
  scaledSize: number,
  ctx: BinderContext,
): void {
  const DEAD_ZONE  = scaledSize * 0.06;
  const DIAGONAL_THRESHOLD = 0.4;

  const active = new Set<string>();

  ctx.setDpadCleanup(() => {
    releaseAll();
    outer.classList.remove("tc-dpad--active");
  });

  const fireDir = (id: string) => {
    if (active.has(id) || ctx.editing) return;
    active.add(id);
    const kd = TOUCH_KEY_MAP[id];
    if (!kd) return;
    ctx.pressedKeys.add(id);
    if (ctx.hapticEnabled) vibratePress();
    arms.get(id)?.classList.add("tc-dpad__arm--active");
    outer.classList.add("tc-dpad--active");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: kd.key, code: kd.code, bubbles: true, cancelable: true }));
  };

  const releaseDir = (id: string) => {
    if (!active.has(id)) return;
    active.delete(id);
    const kd = TOUCH_KEY_MAP[id];
    if (!kd) return;
    ctx.pressedKeys.delete(id);
    if (ctx.hapticEnabled) vibrateRelease();
    arms.get(id)?.classList.remove("tc-dpad__arm--active");
    if (active.size === 0) outer.classList.remove("tc-dpad--active");
    document.dispatchEvent(new KeyboardEvent("keyup", { key: kd.key, code: kd.code, bubbles: true, cancelable: true }));
  };

  const releaseAll = () => {
    for (const id of [...active]) releaseDir(id);
  };

  const getDirs = (cx: number, cy: number): Set<string> => {
    const rect = outer.getBoundingClientRect();
    const dx   = cx - (rect.left + rect.width  / 2);
    const dy   = cy - (rect.top  + rect.height / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dirs = new Set<string>();
    if (dist < DEAD_ZONE) return dirs;
    if (dy < -dist * DIAGONAL_THRESHOLD) dirs.add("up");
    if (dy >  dist * DIAGONAL_THRESHOLD) dirs.add("down");
    if (dx < -dist * DIAGONAL_THRESHOLD) dirs.add("left");
    if (dx >  dist * DIAGONAL_THRESHOLD) dirs.add("right");
    return dirs;
  };

  const updateDirs = (cx: number, cy: number) => {
    const newDirs = getDirs(cx, cy);
    for (const id of [...active]) {
      if (!newDirs.has(id)) releaseDir(id);
    }
    for (const id of newDirs) fireDir(id);
  };

  let dragPointerId = -1;
  let dragStartX = 0, dragStartY = 0;
  let origX = btn.x, origY = btn.y;

  let playPointerId = -1;

  outer.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    outer.setPointerCapture(e.pointerId);

    if (ctx.editing) {
      if (dragPointerId !== -1) return;
      dragPointerId = e.pointerId;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      origX = btn.x;
      origY = btn.y;
      outer.style.cursor = "grabbing";
      return;
    }

    if (playPointerId !== -1) return;
    playPointerId = e.pointerId;
    updateDirs(e.clientX, e.clientY);
  }, { passive: false });

  outer.addEventListener("pointermove", (e) => {
    if (dragPointerId === e.pointerId) {
      if (!ctx.overlay) return;
      const rect = ctx.overlay.getBoundingClientRect();
      btn.x = Math.max(0, Math.min(100, origX + ((e.clientX - dragStartX) / rect.width)  * 100));
      btn.y = Math.max(0, Math.min(100, origY + ((e.clientY - dragStartY) / rect.height) * 100));
      outer.style.left = `${btn.x}%`;
      outer.style.top  = `${btn.y}%`;
      return;
    }
    if (e.pointerId === playPointerId) {
      updateDirs(e.clientX, e.clientY);
    }
  });

  const onPointerEnd = (e: PointerEvent) => {
    if (dragPointerId === e.pointerId) {
      dragPointerId = -1;
      outer.style.cursor = "grab";
      outer.releasePointerCapture(e.pointerId);
      saveLayout(ctx.systemId, ctx.buttons, ctx.portrait);
      ctx.onLayoutSaved?.(ctx.systemId, ctx.buttons);
      return;
    }
    if (e.pointerId === playPointerId) {
      playPointerId = -1;
      outer.releasePointerCapture(e.pointerId);
      releaseAll();
    }
  };

  outer.addEventListener("pointerup",     onPointerEnd);
  outer.addEventListener("pointercancel", onPointerEnd);
  outer.addEventListener("lostpointercapture", () => {
    if (playPointerId !== -1) {
      playPointerId = -1;
      releaseAll();
    }
    if (dragPointerId !== -1) {
      dragPointerId = -1;
      outer.style.cursor = "grab";
    }
  });
}

export function bindStick(
  outer: HTMLElement,
  knob: HTMLElement,
  btn: TouchButtonDef,
  scaledSize: number,
  ctx: BinderContext,
): void {
  const maxMove  = (scaledSize / 2) * 0.52;
  const deadZone = 0.25;

  const active = new Set<string>();

  const fireKey = (id: string) => {
    if (active.has(id) || ctx.editing) return;
    active.add(id);
    const kd = TOUCH_KEY_MAP[id];
    if (!kd) return;
    ctx.pressedKeys.add(id);
    if (ctx.hapticEnabled) vibratePress();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: kd.key, code: kd.code, bubbles: true, cancelable: true }));
  };

  const releaseKey = (id: string) => {
    if (!active.has(id)) return;
    active.delete(id);
    const kd = TOUCH_KEY_MAP[id];
    if (!kd) return;
    ctx.pressedKeys.delete(id);
    if (ctx.hapticEnabled) vibrateRelease();
    document.dispatchEvent(new KeyboardEvent("keyup", { key: kd.key, code: kd.code, bubbles: true, cancelable: true }));
  };

  const releaseAll = () => {
    for (const id of [...active]) releaseKey(id);
    knob.style.transform = "translate(-50%, -50%)";
  };

  const onPlayMove = (cx: number, cy: number) => {
    if (ctx.editing) return;
    const rect   = outer.getBoundingClientRect();
    const dx     = cx - (rect.left + rect.width  / 2);
    const dy     = cy - (rect.top  + rect.height / 2);
    const dist   = Math.sqrt(dx * dx + dy * dy);

    const clamped = Math.min(dist, maxMove);
    const angle   = Math.atan2(dy, dx);
    const kx      = clamped * Math.cos(angle);
    const ky      = clamped * Math.sin(angle);
    knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;

    const threshold = maxMove * deadZone;
    if (dx >  threshold) fireKey("stick_right"); else releaseKey("stick_right");
    if (dx < -threshold) fireKey("stick_left");  else releaseKey("stick_left");
    if (dy >  threshold) fireKey("stick_down");  else releaseKey("stick_down");
    if (dy < -threshold) fireKey("stick_up");    else releaseKey("stick_up");
  };

  const setPlayActive = (isActive: boolean) => {
    outer.classList.toggle("tc-stick--active", isActive);
  };

  let dragPointerId = -1;
  let dragStartX = 0, dragStartY = 0;
  let origX = btn.x, origY = btn.y;

  let playPointerId = -1;

  outer.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    outer.setPointerCapture(e.pointerId);

    if (ctx.editing) {
      if (dragPointerId !== -1) return;
      dragPointerId = e.pointerId;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      origX = btn.x;
      origY = btn.y;
      outer.style.cursor = "grabbing";
      return;
    }

    if (playPointerId !== -1) return;
    playPointerId = e.pointerId;
    setPlayActive(true);
    onPlayMove(e.clientX, e.clientY);
  }, { passive: false });

  outer.addEventListener("pointermove", (e) => {
    if (dragPointerId === e.pointerId) {
      if (!ctx.overlay) return;
      const rect = ctx.overlay.getBoundingClientRect();
      btn.x = Math.max(0, Math.min(100, origX + ((e.clientX - dragStartX) / rect.width)  * 100));
      btn.y = Math.max(0, Math.min(100, origY + ((e.clientY - dragStartY) / rect.height) * 100));
      outer.style.left = `${btn.x}%`;
      outer.style.top  = `${btn.y}%`;
      return;
    }
    if (e.pointerId === playPointerId) {
      onPlayMove(e.clientX, e.clientY);
    }
  });

  const onPointerEnd = (e: PointerEvent) => {
    if (dragPointerId === e.pointerId) {
      dragPointerId = -1;
      outer.style.cursor = "grab";
      outer.releasePointerCapture(e.pointerId);
      saveLayout(ctx.systemId, ctx.buttons, ctx.portrait);
      ctx.onLayoutSaved?.(ctx.systemId, ctx.buttons);
      return;
    }
    if (e.pointerId === playPointerId) {
      playPointerId = -1;
      outer.releasePointerCapture(e.pointerId);
      setPlayActive(false);
      releaseAll();
    }
  };

  outer.addEventListener("pointerup",     onPointerEnd);
  outer.addEventListener("pointercancel", onPointerEnd);
  outer.addEventListener("lostpointercapture", () => {
    if (playPointerId !== -1) {
      playPointerId = -1;
      setPlayActive(false);
      releaseAll();
    }
    if (dragPointerId !== -1) {
      dragPointerId = -1;
      knob.style.transform = "translate(-50%, -50%)";
    }
  });
}
