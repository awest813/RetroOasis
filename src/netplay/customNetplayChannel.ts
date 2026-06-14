/**
 * customNetplayChannel.ts — Custom metadata data channel over intercepted WebRTC.
 *
 * Multiplexes chat, ping radar, and state sync validation on top of the same
 * RTCPeerConnection created by EmulatorJS.
 */

import { onPeerConnectionCreated } from "./rtcInterceptor.js";
import type { PeerMessage } from "./peerChannel.js";
import { NetplayMetricsCollector } from "../multiplayer.js";

let customChannel: RTCDataChannel | null = null;
const messageListeners = new Set<(msg: PeerMessage) => void>();
const metricsCollector = new NetplayMetricsCollector();
const connectionListeners = new Set<(connected: boolean) => void>();

let pingIntervalId: ReturnType<typeof setInterval> | null = null;
let pingTimeoutId: ReturnType<typeof setInterval> | null = null;
let activePingTimestamp: number | null = null;

export function initializeCustomNetplayChannel(): void {
  onPeerConnectionCreated((pc) => {
    // Intercept setLocalDescription to detect if we are the offerer (host)
    const originalSetLocalDescription = pc.setLocalDescription.bind(pc) as (
      description?: RTCLocalSessionDescriptionInit,
    ) => Promise<void>;
    pc.setLocalDescription = function (
      this: RTCPeerConnection,
      description?: RTCLocalSessionDescriptionInit,
    ): Promise<void> {
      const promise = originalSetLocalDescription(description);
      if (description?.type === "offer") {
        if (!customChannel) {
          const chan = pc.createDataChannel("retro-oasis-metadata");
          setupChannel(chan);
        }
      }
      return promise;
    };

    // Listen for incoming data channels (joiner/answerer side)
    pc.addEventListener("datachannel", (ev) => {
      if (ev.channel.label === "retro-oasis-metadata") {
        setupChannel(ev.channel);
      }
    });
  });
}

function setupChannel(chan: RTCDataChannel) {
  customChannel = chan;
  metricsCollector.reset();

  chan.onopen = () => {
    console.log("[customNetplayChannel] Custom data channel opened");
    notifyConnection(true);
    startPingLoop();
  };

  chan.onclose = () => {
    console.log("[customNetplayChannel] Custom data channel closed");
    notifyConnection(false);
    stopPingLoop();
    customChannel = null;
  };

  chan.onerror = (err) => {
    console.error("[customNetplayChannel] Custom data channel error:", err);
    stopPingLoop();
  };

  chan.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data) as PeerMessage;
      handleIncomingMessage(data);
    } catch (err) {
      console.warn("[customNetplayChannel] Failed to parse custom message:", err);
    }
  };
}

function startPingLoop() {
  stopPingLoop();
  pingIntervalId = setInterval(() => {
    if (!customChannel || customChannel.readyState !== "open") return;
    const now = Date.now();
    activePingTimestamp = now;

    sendPeerMessage({ type: "ping", timestamp: now });

    // Timeout after 2 seconds to record packet loss
    pingTimeoutId = setTimeout(() => {
      if (activePingTimestamp === now) {
        metricsCollector.recordPacket(true);
      }
    }, 2000);
  }, 3000);
}

function stopPingLoop() {
  if (pingIntervalId) {
    clearInterval(pingIntervalId);
    pingIntervalId = null;
  }
  if (pingTimeoutId) {
    clearTimeout(pingTimeoutId);
    pingTimeoutId = null;
  }
}

export function sendPeerMessage(msg: PeerMessage): boolean {
  if (!customChannel || customChannel.readyState !== "open") {
    return false;
  }
  try {
    customChannel.send(JSON.stringify(msg));
    metricsCollector.recordPacket(false);
    return true;
  } catch (err) {
    console.error("[customNetplayChannel] Failed to send message:", err);
    metricsCollector.recordPacket(true);
    return false;
  }
}

export function onPeerMessage(callback: (msg: PeerMessage) => void): () => void {
  messageListeners.add(callback);
  return () => {
    messageListeners.delete(callback);
  };
}

export function onConnectionStateChange(callback: (connected: boolean) => void): () => void {
  connectionListeners.add(callback);
  callback(customChannel !== null && customChannel.readyState === "open");
  return () => {
    connectionListeners.delete(callback);
  };
}

function notifyConnection(connected: boolean) {
  for (const listener of connectionListeners) {
    try {
      listener(connected);
    } catch (err) {
      console.error("[customNetplayChannel] Connection listener error:", err);
    }
  }
}

function handleIncomingMessage(msg: PeerMessage) {
  if (msg.type === "ping") {
    sendPeerMessage({
      type: "pong",
      timestamp: Date.now(),
      echoTimestamp: msg.timestamp,
    });
  } else if (msg.type === "pong") {
    const rtt = Date.now() - msg.echoTimestamp;
    metricsCollector.recordLatency(rtt);
    metricsCollector.recordPacket(false);
    activePingTimestamp = null;
  }

  for (const listener of messageListeners) {
    try {
      listener(msg);
    } catch (err) {
      console.error("[customNetplayChannel] Message listener error:", err);
    }
  }
}

export function getMetricsCollector(): NetplayMetricsCollector {
  return metricsCollector;
}

export function isCustomChannelOpen(): boolean {
  return customChannel !== null && customChannel.readyState === "open";
}
