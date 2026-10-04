class GamepadHandler {
    constructor() {
        this.buttonLabels = {
            0: 'BUTTON_1',
            1: 'BUTTON_2',
            2: 'BUTTON_3',
            3: 'BUTTON_4',
            4: 'LEFT_TOP_SHOULDER',
            5: 'RIGHT_TOP_SHOULDER',
            6: 'LEFT_BOTTOM_SHOULDER',
            7: 'RIGHT_BOTTOM_SHOULDER',
            8: 'SELECT',
            9: 'START',
            10: 'LEFT_STICK',
            11: 'RIGHT_STICK',
            12: 'DPAD_UP',
            13: 'DPAD_DOWN',
            14: 'DPAD_LEFT',
            15: 'DPAD_RIGHT',
        };
        this.gamepads = [];
        this.listeners = {};
        this.timeout = null;
        // Attach listeners before reporting controllers already present at startup.
        this.timeout = setTimeout(this.loop.bind(this), 0);
    }
    terminate() {
        window.clearTimeout(this.timeout);
    }
    getGamepads() {
        try {
            return (navigator.getGamepads ? navigator.getGamepads() : (navigator.webkitGetGamepads ? navigator.webkitGetGamepads() : [])) || [];
        } catch {
            // Access may be blocked by browser policy. Keep polling for recovery.
            return [];
        }
    }
    loop() {
        this.updateGamepadState();
        this.timeout = setTimeout(this.loop.bind(this), 10);
    }
    buttonPressed(button) {
        return typeof button === "number" ? button > 0.5 : !!button && (button.pressed || button.value > 0.5);
    }
    axisValue(value) {
        return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    }
    releaseGamepad(pad) {
        pad.axes.forEach((value, index) => {
            if (!value) return;
            const axis = ['LEFT_STICK_X', 'LEFT_STICK_Y', 'RIGHT_STICK_X', 'RIGHT_STICK_Y'][index] || "EXTRA_STICK_" + index;
            this.dispatchEvent('axischanged', {axis, value: 0, oldValue: value, index: pad.index, gamepadIndex: pad.index, label: null, release: true});
        });
        Array.from(pad.buttons).forEach((button, index) => {
            if (this.buttonPressed(button)) this.dispatchEvent('buttonup', {index, label: this.getButtonLabel(index), gamepadIndex: pad.index, release: true});
        });
        pad.axes = pad.axes.map(() => 0);
        pad.buttons = Array.from(pad.buttons, () => ({pressed: false}));
        pad.armed = false;
    }
    resetInput() {
        this.gamepads.forEach(pad => this.releaseGamepad(pad));
    }
    updateGamepadState() {
        const pads = Array.from(this.getGamepads()).filter(pad => pad && pad.connected);
        // Release while the old identity is still available to the player's assignment lookup.
        for (let index = this.gamepads.length - 1; index >= 0; index--) {
            const old = this.gamepads[index];
            if (pads.some(pad => pad.index === old.index && pad.id === old.id)) continue;
            this.releaseGamepad(old);
            this.dispatchEvent('disconnected', {gamepadIndex: old.index});
            this.gamepads.splice(index, 1);
        }
        const focused = typeof document === "undefined" || (!document.hidden && document.hasFocus());
        if (!focused) { this.resetInput(); return; }
        for (const pad of pads) {
            const axes = Array.from(pad.axes, value => this.axisValue(value));
            const buttons = Array.from(pad.buttons, button => ({pressed: this.buttonPressed(button)}));
            const neutral = !buttons.some(button => button.pressed) && (pad.mapping !== "standard" || axes.slice(0, 4).every(axis => Math.abs(axis) <= 0.18));
            let old = this.gamepads.find(old => old.index === pad.index && old.id === pad.id);
            if (!old) {
                old = {index: pad.index, id: pad.id, axes: axes.map(() => 0), buttons: buttons.map(() => ({pressed: false})), armed: neutral};
                this.gamepads.push(old);
                this.gamepads.sort((a, b) => a.index - b.index);
                this.dispatchEvent('connected', {gamepadIndex: pad.index});
                continue;
            }
            if (!old.armed) { if (neutral) old.armed = true; continue; }
            for (let index = 0; index < Math.max(old.axes.length, axes.length); index++) {
                const previous = old.axes[index] || 0;
                const raw = axes[index] || 0;
                const value = Math.abs(raw) < 0.01 ? 0 : raw;
                axes[index] = value;
                if (previous === value) continue;
                const axis = ['LEFT_STICK_X', 'LEFT_STICK_Y', 'RIGHT_STICK_X', 'RIGHT_STICK_Y'][index] || "EXTRA_STICK_" + index;
                this.dispatchEvent('axischanged', {axis, value, oldValue: previous, index: pad.index, gamepadIndex: pad.index, label: this.getAxisLabel(axis, value)});
            }
            for (let index = 0; index < Math.max(old.buttons.length, buttons.length); index++) {
                const pressed = buttons[index]?.pressed || false;
                if (this.buttonPressed(old.buttons[index]) !== pressed) {
                    this.dispatchEvent(pressed ? 'buttondown' : 'buttonup', {index, label: this.getButtonLabel(index), gamepadIndex: pad.index});
                }
            }
            old.axes = axes;
            old.buttons = buttons;
        }
    }
    dispatchEvent(name, arg) {
        if (typeof this.listeners[name] !== 'function') return;
        if (!arg) arg={};
        arg.type = name;
        this.listeners[name](arg);
    }
    on(name, cb) {
        this.listeners[name.toLowerCase()] = cb;
    }

    getButtonLabel(index) {
        if (index === null || index === undefined) {
            return null;
        }
        if (this.buttonLabels[index] === undefined) {
            return `GAMEPAD_${index}`;
        }
        return this.buttonLabels[index];
    }
    getAxisLabel(axis, value) {
        let valueLabel = null;
        if (value > 0.5 || value < -0.5) {
            if (value > 0) {
                valueLabel = '+1';
            } else {
                valueLabel = '-1';
            }
        }
        if (!axis || !valueLabel) {
            return null;
        }
        return `${axis}:${valueLabel}`;
    }
}

export { GamepadHandler };
