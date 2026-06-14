/**
 * pingRadar.ts — Real-time latency (RTT) and connection quality HUD.
 *
 * Renders a stark, neon brutalist ping indicator in the top-right corner of the viewport.
 * Periodically polls netplay metrics to update connection categories (Excellent / Fair / Poor)
 * and warns about packet loss.
 */

import { createElement as make } from "./dom.js";
import { getMetricsCollector, isCustomChannelOpen } from "../netplay/customNetplayChannel.js";

let radarContainer: HTMLElement | null = null;
let radarIntervalId: ReturnType<typeof setInterval> | null = null;

const LATENCY_EXCELLENT = 80;
const LATENCY_FAIR = 200;

export function mountPingRadar(container: HTMLElement): void {
  unmountPingRadar();

  radarContainer = make("div", { class: "netplay-ping-radar", role: "status", "aria-live": "off" });
  radarContainer.innerHTML = `
    <span class="ping-radar__dot" aria-hidden="true"></span>
    <span class="ping-radar__val">Connecting…</span>
  `;
  container.appendChild(radarContainer);

  radarIntervalId = setInterval(() => {
    updateRadar();
  }, 2000);

  updateRadar(); // Initial update
}

export function unmountPingRadar(): void {
  if (radarIntervalId) {
    clearInterval(radarIntervalId);
    radarIntervalId = null;
  }
  if (radarContainer) {
    radarContainer.remove();
    radarContainer = null;
  }
}

function updateRadar() {
  if (!radarContainer) return;
  const dot = radarContainer.querySelector(".ping-radar__dot") as HTMLElement;
  const val = radarContainer.querySelector(".ping-radar__val") as HTMLElement;

  if (!isCustomChannelOpen()) {
    radarContainer.style.display = "none";
    return;
  }

  radarContainer.style.display = "flex";

  const metrics = getMetricsCollector().snapshot();
  const latency = Math.round(metrics.averageLatencyMs);
  const loss = metrics.packetLoss;

  let qualityClass = "ping-radar--poor";
  let dotColor = "#ff3366"; // Danger pink
  let statusText = `${latency} ms`;

  if (latency <= LATENCY_EXCELLENT && latency > 0) {
    qualityClass = "ping-radar--excellent";
    dotColor = "#00ffcc"; // Neon cyan/green
  } else if (latency <= LATENCY_FAIR && latency > 0) {
    qualityClass = "ping-radar--fair";
    dotColor = "#ffcc00"; // Neon yellow
  }

  if (loss > 0.05) {
    statusText += ` | Loss: ${Math.round(loss * 100)}%`;
  }

  radarContainer.className = `netplay-ping-radar ${qualityClass}`;
  dot.style.backgroundColor = dotColor;
  val.textContent = statusText;
  radarContainer.title = `Average Latency: ${latency}ms | Packet Loss: ${Math.round(loss * 100)}% | Worst Latency: ${Math.round(metrics.worstLatencyMs)}ms`;
}
