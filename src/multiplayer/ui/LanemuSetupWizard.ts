/**
 * LanemuSetupWizard.ts — Guides the user through configuring the LANemu backend.
 */

import { createElement as make } from "../../ui/dom.js";

export function buildLanemuSetupWizard(container: HTMLElement): void {
  container.innerHTML = "";

  const wizard = make("div", { class: "lanemu-wizard" });
  
  wizard.appendChild(make("h3", {}, "RetroOasis LAN Setup"));
  wizard.appendChild(make("p", {}, "We need a few tools to get your virtual network running."));

  const steps = make("div", { class: "wizard-steps" });

  // Step 1: Java Detection
  const step1 = make("div", { class: "wizard-step" });
  step1.innerHTML = `
    <div class="step-status status--pending">❓</div>
    <div class="step-info">
      <h4>Step 1: Check Java / OpenJDK</h4>
      <p>RetroOasis needs Java 17+ to run the LAN backend.</p>
    </div>
    <button class="btn btn--secondary">Detect Java</button>
  `;
  
  // Step 2: LANemu.jar
  const step2 = make("div", { class: "wizard-step" });
  step2.innerHTML = `
    <div class="step-status status--pending">❓</div>
    <div class="step-info">
      <h4>Step 2: Locate Lanemu.jar</h4>
      <p>Select your LANemu executable file.</p>
    </div>
    <button class="btn btn--secondary">Choose File</button>
  `;

  steps.append(step1, step2);
  wizard.appendChild(steps);

  const footer = make("div", { class: "wizard-footer" });
  const btnFinish = make("button", { class: "btn btn--primary", disabled: "true" }, "Finish Setup") as HTMLButtonElement;
  footer.appendChild(btnFinish);
  wizard.appendChild(footer);

  container.appendChild(wizard);
}
