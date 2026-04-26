/**
 * ConnectionDoctorPanel.ts — Interactive diagnostic panel for netplay.
 */

import { createElement as make } from "../../ui/dom.js";

export function buildConnectionDoctorPanel(container: HTMLElement): void {
  container.innerHTML = "";

  const panel = make("div", { class: "doctor-panel" });
  panel.appendChild(make("h3", {}, "Connection Doctor"));
  panel.appendChild(make("p", { class: "doctor-intro" }, "Scanning your connection for issues..."));

  const resultsList = make("div", { class: "doctor-results" });
  
  // Example result items (would be dynamically generated from LanemuConnectionDoctor)
  const addItem = (label: string, status: "pass" | "warn" | "fail", message: string, fix?: string) => {
    const item = make("div", { class: `doctor-item doctor-item--${status}` });
    item.innerHTML = `
      <div class="doctor-item__header">
        <span class="doctor-item__status">${status === "pass" ? "✅" : status === "warn" ? "⚠️" : "❌"}</span>
        <span class="doctor-item__label">${label}</span>
      </div>
      <div class="doctor-item__message">${message}</div>
      ${fix ? `<div class="doctor-item__fix"><strong>Fix:</strong> ${fix}</div>` : ""}
    `;
    resultsList.appendChild(item);
  };

  addItem("LANemu Process", "pass", "LANemu is running (PID: 1234)");
  addItem("Virtual IP Address", "pass", "Your virtual IP: 10.6.10.10");
  addItem("Friend Reachability", "fail", "Could not reach friend at 10.6.10.11", "Make sure your friend has joined the same room.");

  panel.appendChild(resultsList);
  
  const btnRetry = make("button", { class: "btn btn--primary" }, "Run Checks Again");
  panel.appendChild(btnRetry);

  container.appendChild(panel);
}
