/**
 * rtcInterceptor.ts — Intercepts RTCPeerConnection creations.
 *
 * Intercepts the instantiation of RTCPeerConnection to tap into
 * the WebRTC peer connection created by EmulatorJS. This allows us
 * to multiplex custom data channels for metadata exchange.
 */

let originalRTCPeerConnection: typeof RTCPeerConnection | null = null;
let activePeerConnection: RTCPeerConnection | null = null;
const listeners = new Set<(pc: RTCPeerConnection) => void>();

function replaceRtcPeerConnection(next: typeof RTCPeerConnection): void {
  Object.defineProperty(window, "RTCPeerConnection", {
    configurable: true,
    value: next,
    writable: true,
  });
}

export function initializeRTCInterceptor(): void {
  if (originalRTCPeerConnection) return;

  if (typeof window === "undefined" || !window.RTCPeerConnection) {
    return;
  }

  originalRTCPeerConnection = window.RTCPeerConnection;

  const InterceptedRTCPeerConnection = function (
    this: RTCPeerConnection,
    configuration?: RTCConfiguration
  ) {
    const pc = new originalRTCPeerConnection!(configuration);
    activePeerConnection = pc;

    // Notify listeners
    for (const listener of listeners) {
      try {
        listener(pc);
      } catch (err) {
        console.error("[rtcInterceptor] Listener error:", err);
      }
    }

    return pc;
  } as unknown as typeof RTCPeerConnection;

  InterceptedRTCPeerConnection.prototype = originalRTCPeerConnection.prototype;

  if (originalRTCPeerConnection.generateCertificate) {
    Object.defineProperty(InterceptedRTCPeerConnection, "generateCertificate", {
      value: originalRTCPeerConnection.generateCertificate,
      writable: true,
      configurable: true,
    });
  }

  replaceRtcPeerConnection(InterceptedRTCPeerConnection);
}

export function teardownRTCInterceptor(): void {
  if (originalRTCPeerConnection) {
    replaceRtcPeerConnection(originalRTCPeerConnection);
    originalRTCPeerConnection = null;
  }
  activePeerConnection = null;
  listeners.clear();
}

export function onPeerConnectionCreated(callback: (pc: RTCPeerConnection) => void): () => void {
  listeners.add(callback);
  if (activePeerConnection) {
    try {
      callback(activePeerConnection);
    } catch (err) {
      console.error("[rtcInterceptor] Immediate callback error:", err);
    }
  }
  return () => {
    listeners.delete(callback);
  };
}

export function getActivePeerConnection(): RTCPeerConnection | null {
  return activePeerConnection;
}
