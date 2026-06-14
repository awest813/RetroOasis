/**
 * chatOverlay.ts — In-game chat overlay for multiplayer sessions.
 *
 * Renders a brutalist Shibuya Punk chat log and text input inside the emulator view.
 * Blocks keyboard events from propagating to the emulator when typing, and fades
 * out automatically after inactivity.
 */

import { createElement as make } from "./dom.js";
import { onPeerMessage, sendPeerMessage } from "../netplay/customNetplayChannel.js";

let chatContainer: HTMLElement | null = null;
let chatLog: HTMLElement | null = null;
let chatInputWrap: HTMLElement | null = null;
let chatInput: HTMLInputElement | null = null;

let fadeTimeoutId: ReturnType<typeof setTimeout> | null = null;
let activeUnsubscribe: (() => void) | null = null;
let keydownListener: ((e: KeyboardEvent) => void) | null = null;

function isChatEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.matches("input, textarea, select, [contenteditable='true'], [contenteditable='']");
}

export function mountChatOverlay(container: HTMLElement, username: string): void {
  unmountChatOverlay();

  // Create Chat Container
  chatContainer = make("div", { class: "netplay-chat-overlay" });
  chatLog = make("div", { class: "netplay-chat-log", role: "log", "aria-live": "polite" });
  
  chatInputWrap = make("div", { class: "netplay-chat-input-wrap", hidden: "" });
  chatInput = make("input", {
    type: "text",
    class: "netplay-chat-input",
    placeholder: "Press ENTER to send, ESC to close...",
    maxlength: "128",
  }) as HTMLInputElement;

  chatInputWrap.appendChild(chatInput);
  chatContainer.append(chatLog, chatInputWrap);
  container.appendChild(chatContainer);

  // Stop typing events from bubbling up to EmulatorJS key handlers
  const stopProp = (e: KeyboardEvent) => {
    e.stopPropagation();
  };
  chatInput.addEventListener("keydown", stopProp);
  chatInput.addEventListener("keyup", stopProp);
  chatInput.addEventListener("keypress", stopProp);

  // Handle Input actions
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const text = chatInput!.value.trim();
      if (text.length > 0) {
        const sender = username || "Player";
        const success = sendPeerMessage({
          type: "chat",
          text,
          senderName: sender,
        });
        if (success) {
          addMessage(sender, text, true);
        } else {
          addSystemMessage("Message failed to send — peer disconnected.");
        }
        chatInput!.value = "";
      }
      hideInput();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      hideInput();
    }
  });

  // Listen to peer messages
  activeUnsubscribe = onPeerMessage((msg) => {
    if (msg.type === "chat") {
      addMessage(msg.senderName, msg.text, false);
    }
  });

  // Capture before emulator input handlers so the chat hotkey owns the keystroke.
  keydownListener = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() === "t" && !e.altKey && !e.ctrlKey && !e.metaKey && !isChatEditableTarget(e.target)) {
      e.preventDefault();
      e.stopPropagation();
      showInput();
    }
  };
  document.addEventListener("keydown", keydownListener, { capture: true });

  addSystemMessage("Chat initialized. Press 'T' to talk.");
}

export function unmountChatOverlay(): void {
  if (activeUnsubscribe) {
    activeUnsubscribe();
    activeUnsubscribe = null;
  }
  if (keydownListener) {
    document.removeEventListener("keydown", keydownListener, { capture: true });
    keydownListener = null;
  }
  if (chatContainer) {
    chatContainer.remove();
    chatContainer = null;
  }
  chatLog = null;
  chatInputWrap = null;
  chatInput = null;
  if (fadeTimeoutId) {
    clearTimeout(fadeTimeoutId);
    fadeTimeoutId = null;
  }
}

function showInput() {
  if (!chatInputWrap || !chatInput) return;
  chatInputWrap.hidden = false;
  chatInputWrap.classList.add("netplay-chat-input-wrap--active");
  chatInput.focus();
  showLogTemporarily(true); // Keep visible while typing
}

function hideInput() {
  if (!chatInputWrap || !chatInput) return;
  chatInputWrap.hidden = true;
  chatInputWrap.classList.remove("netplay-chat-input-wrap--active");
  chatInput.blur();
  showLogTemporarily(false); // Start fade timer
}

function addMessage(sender: string, text: string, isSelf = false) {
  if (!chatLog) return;
  const msgEl = make("div", { class: `chat-msg${isSelf ? " chat-msg--self" : ""}` });
  
  const senderSpan = make("span", { class: "chat-msg__sender" }, `${sender}: `);
  const textSpan = make("span", { class: "chat-msg__text" }, text);
  
  msgEl.append(senderSpan, textSpan);
  chatLog.appendChild(msgEl);
  chatLog.scrollTop = chatLog.scrollHeight;

  showLogTemporarily(false);
}

function addSystemMessage(text: string) {
  if (!chatLog) return;
  const msgEl = make("div", { class: "chat-msg chat-msg--system" }, text);
  chatLog.appendChild(msgEl);
  chatLog.scrollTop = chatLog.scrollHeight;
  showLogTemporarily(false);
}

function showLogTemporarily(persistent = false) {
  if (!chatContainer) return;
  chatContainer.classList.remove("netplay-chat-overlay--fade");
  chatContainer.classList.add("netplay-chat-overlay--visible");

  if (fadeTimeoutId) {
    clearTimeout(fadeTimeoutId);
    fadeTimeoutId = null;
  }

  if (!persistent) {
    fadeTimeoutId = setTimeout(() => {
      if (chatContainer) {
        chatContainer.classList.remove("netplay-chat-overlay--visible");
        chatContainer.classList.add("netplay-chat-overlay--fade");
      }
    }, 4000);
  }
}
