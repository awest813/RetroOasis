/**
 * MultiplayerLaunchPanel.ts — Final step before starting a game.
 */

import { createElement as make } from "../../ui/dom.js";

export function buildMultiplayerLaunchPanel(container: HTMLElement): void {
  container.innerHTML = "";

  const panel = make("div", { class: "launch-panel" });
  panel.appendChild(make("h3", {}, "Ready to Play?"));

  const infoGrid = make("div", { class: "launch-info-grid" });
  infoGrid.innerHTML = `
    <div class="launch-info">
      <span class="launch-info__label">Game</span>
      <span class="launch-info__value">Monster Hunter Freedom Unite</span>
    </div>
    <div class="launch-info">
      <span class="launch-info__label">Virtual IP</span>
      <span class="launch-info__value">10.6.10.10</span>
    </div>
  `;
  panel.appendChild(infoGrid);

  const instructions = make("div", { class: "launch-instructions" });
  instructions.innerHTML = `
    <h4>Host Instructions:</h4>
    <ul>
      <li>Enable WLAN/Ad Hoc in PPSSPP Settings.</li>
      <li>Start the in-game lobby.</li>
      <li>Tell your friend your IP: <strong>10.6.10.10</strong></li>
    </ul>
  `;
  panel.appendChild(instructions);

  const actions = make("div", { class: "launch-actions" });
  const btnTest = make("button", { class: "btn btn--secondary" }, "Test Connection");
  const btnLaunch = make("button", { class: "btn btn--primary" }, "Launch PPSSPP");
  actions.append(btnTest, btnLaunch);
  panel.appendChild(actions);

  container.appendChild(panel);
}
