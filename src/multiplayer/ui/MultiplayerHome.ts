/**
 * MultiplayerHome.ts — The landing dashboard for all LANemu rooms.
 */

import { createElement as make } from "../../ui/dom.js";

export function buildMultiplayerHome(container: HTMLElement): void {
  container.innerHTML = "";
  
  const header = make("div", { class: "multiplayer-dashboard-header" });
  header.appendChild(make("h2", { class: "dashboard-title" }, "RetroOasis LAN Rooms"));
  header.appendChild(make("p", { class: "dashboard-subtitle" }, "Play Ad Hoc and LAN games with friends over a virtual network."));
  
  const statusBar = make("div", { class: "multiplayer-status-bar" });
  statusBar.innerHTML = `
    <div class="status-indicator">
      <span class="status-dot status-dot--inactive" id="lanemu-dot"></span>
      <span id="lanemu-status-text">LANemu: Offline</span>
    </div>
    <div class="status-ip" id="lanemu-ip-display" style="display:none">
      IP: <strong>—</strong>
    </div>
  `;
  header.appendChild(statusBar);
  
  container.appendChild(header);

  const grid = make("div", { class: "multiplayer-grid" });

  // 1. Create Room Card
  const createCard = make("div", { class: "multiplayer-card multiplayer-card--primary" });
  createCard.innerHTML = `
    <div class="multiplayer-card__icon">🏠</div>
    <div class="multiplayer-card__content">
      <h3>Host a LAN Room</h3>
      <p>Create a virtual room and share the invite with friends.</p>
    </div>
  `;
  createCard.addEventListener("click", () => {
    // TODO: Transition to CreateRoom panel
  });

  // 2. Join Room Card
  const joinCard = make("div", { class: "multiplayer-card" });
  joinCard.innerHTML = `
    <div class="multiplayer-card__icon">🔗</div>
    <div class="multiplayer-card__content">
      <h3>Join a Room</h3>
      <p>Import an invite file from your friend to join their network.</p>
    </div>
  `;
  joinCard.addEventListener("click", () => {
    // TODO: Transition to JoinRoom panel
  });

  // 3. Settings / Wizard Card
  const setupCard = make("div", { class: "multiplayer-card multiplayer-card--outline" });
  setupCard.innerHTML = `
    <div class="multiplayer-card__icon">⚙️</div>
    <div class="multiplayer-card__content">
      <h3>Setup Wizard</h3>
      <p>Configure Java and LANemu.jar for first-time use.</p>
    </div>
  `;
  setupCard.addEventListener("click", () => {
    // TODO: Transition to SetupWizard
  });

  grid.append(createCard, joinCard, setupCard);
  container.appendChild(grid);
}
