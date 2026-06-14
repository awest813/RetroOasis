/**
 * desyncDetector.ts — Lightweight state-hashing desync detection.
 *
 * Periodically hashes emulator quick-states on the host and guest,
 * exchanging them via the custom metadata channel to detect gameplay desyncs.
 * Uses a rolling state history buffer to avoid false positives due to network lag.
 */

import { sendPeerMessage, onPeerMessage, isCustomChannelOpen } from "./customNetplayChannel.js";
import { getEasyNetplayManager } from "../ui/easyNetplayShared.js";

export interface DesyncStateEmulator {
  state: string;
  readStateData(slot: number): Uint8Array | null;
  writeStateData(slot: number, data: Uint8Array): boolean;
}

let checkIntervalId: ReturnType<typeof setInterval> | null = null;
let activeUnsubscribe: (() => void) | null = null;
let desyncDetected = false;
const desyncListeners = new Set<(desynced: boolean) => void>();

const stateHistory: string[] = [];
const MAX_HISTORY = 5;

let sequenceCounter = 0;

function quickSaveState(slot: number): boolean {
  return window.EJS_emulator?.gameManager?.quickSave(slot) ?? false;
}

function quickLoadState(slot: number): void {
  window.EJS_emulator?.gameManager?.quickLoad(slot);
}

export function startDesyncDetection(emulator: DesyncStateEmulator, isHost: boolean): void {
  stopDesyncDetection();
  desyncDetected = false;
  stateHistory.length = 0;
  sequenceCounter = 0;

  activeUnsubscribe = onPeerMessage((msg) => {
    if (msg.type === "state") {
      if (msg.seq === 9999) {
        handleFullStateSync(msg.payload, emulator);
      } else {
        handlePeerState(msg.payload, emulator);
      }
    } else if (msg.type === "chat" && msg.text === "/request_resync" && isHost) {
      performStateSync(emulator);
    }
  });

  // Periodically check state every 8 seconds
  checkIntervalId = setInterval(() => {
    if (!isCustomChannelOpen()) return;
    if (emulator.state !== "running") return;

    // Save to slot 0 (dedicated to desync checks)
    const success = quickSaveState(0);
    if (!success) return;

    setTimeout(() => {
      const stateBytes = emulator.readStateData(0);
      if (!stateBytes) return;

      const hash = computeHash(stateBytes);

      // Add to rolling history
      stateHistory.push(hash);
      if (stateHistory.length > MAX_HISTORY) {
        stateHistory.shift();
      }

      if (isHost) {
        sequenceCounter++;
        sendPeerMessage({
          type: "state",
          seq: sequenceCounter,
          payload: hash,
        });
      }
    }, 100); // Give filesystem a brief moment to write
  }, 8000);
}

export function requestForceResync(emulator: DesyncStateEmulator): void {
  const easyMgr = getEasyNetplayManager();
  const isHost = easyMgr.state === "hosting";
  if (isHost) {
    performStateSync(emulator);
  } else {
    sendPeerMessage({
      type: "chat",
      text: "/request_resync",
      senderName: "System",
    });
  }
}

export function performStateSync(emulator: DesyncStateEmulator): void {
  if (emulator.state !== "running") return;
  const success = quickSaveState(0);
  if (!success) return;

  setTimeout(() => {
    const bytes = emulator.readStateData(0);
    if (!bytes) return;

    // Convert Uint8Array to base64
    let binary = "";
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i] ?? 0);
    }
    const base64 = btoa(binary);

    sendPeerMessage({
      type: "state",
      seq: 9999,
      payload: base64,
    });
  }, 100);
}

function handleFullStateSync(base64: string, emulator: DesyncStateEmulator) {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const success = emulator.writeStateData(0, bytes);
    if (success) {
      quickLoadState(0);
      console.log("[desyncDetector] Full state resync applied successfully");
    } else {
      console.warn("[desyncDetector] Failed to write state data for resync");
    }
  } catch (err) {
    console.error("[desyncDetector] Failed to apply full state sync:", err);
  }
}

export function stopDesyncDetection(): void {
  if (checkIntervalId) {
    clearInterval(checkIntervalId);
    checkIntervalId = null;
  }
  activeUnsubscribe?.();
  activeUnsubscribe = null;
}

export function onDesyncChanged(callback: (desynced: boolean) => void): () => void {
  desyncListeners.add(callback);
  callback(desyncDetected);
  return () => {
    desyncListeners.delete(callback);
  };
}

export function isDesynced(): boolean {
  return desyncDetected;
}

function handlePeerState(peerHash: string, emulator: DesyncStateEmulator) {
  // If we are the host, we don't compare incoming hashes directly;
  // instead, we compare our history when the guest replies (or vice versa).
  // For simplicity: the guest performs the comparison and notifies back,
  // or both compare against their local histories.
  
  const success = quickSaveState(0);
  if (!success) return;

  setTimeout(() => {
    const stateBytes = emulator.readStateData(0);
    if (!stateBytes) return;

    const localHash = computeHash(stateBytes);

    stateHistory.push(localHash);
    if (stateHistory.length > MAX_HISTORY) {
      stateHistory.shift();
    }

    // Compare peer's hash with our local rolling history to account for latency frame-offsets
    const match = stateHistory.includes(peerHash);

    if (match) {
      if (desyncDetected) {
        desyncDetected = false;
        notifyDesync(false);
      }
    } else {
      if (!desyncDetected) {
        desyncDetected = true;
        notifyDesync(true);
      }
    }
  }, 100);
}

function notifyDesync(desynced: boolean) {
  for (const listener of desyncListeners) {
    try {
      listener(desynced);
    } catch (err) {
      console.error("[desyncDetector] Listener error:", err);
    }
  }
}

function computeHash(data: Uint8Array): string {
  let hash = 5381;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) + hash + (data[i] ?? 0)) >>> 0;
  }
  return hash.toString(36);
}
