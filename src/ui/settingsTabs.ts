import { BiosLibrary, BIOS_REQUIREMENTS } from "../bios.js";
import { SYSTEMS } from "../systems.js";
import { createElement as make } from "./dom.js";

export function buildBiosTab(container: HTMLElement, biosLibrary: BiosLibrary, opts: {
  appName: string;
  onError(message: string): void;
}): void {
  const { appName, onError } = opts;
  const biosSection = make("div", { class: "settings-section" });
  biosSection.appendChild(make("h4", { class: "settings-section__title" }, "System Startup Files"));
  biosSection.appendChild(make("p", { class: "settings-help" },
    "Some older consoles need a startup file to run games. " +
    "If a game won't start, you may need to add one here. " +
    `You can extract these files from a physical console you own — ${appName} cannot provide them.`
  ));

  const biosGrid = make("div", { class: "bios-grid" });
  biosSection.appendChild(biosGrid);

  for (const sysId of Object.keys(BIOS_REQUIREMENTS)) {
    const sysInfo = SYSTEMS.find((system) => system.id === sysId);
    if (!sysInfo) continue;
    const reqs = BIOS_REQUIREMENTS[sysId]!;

    const sysBlock = make("div", { class: "bios-system" });
    const sysHeader = make("div", { class: "bios-system__header" });
    const sysBadge = make("span", { class: "sys-badge" }, sysInfo.shortName);
    sysBadge.style.background = sysInfo.color;
    sysHeader.append(sysBadge, document.createTextNode(` ${sysInfo.name}`));
    sysBlock.appendChild(sysHeader);

    for (const req of reqs) {
      const row = make("div", { class: "bios-row" });
      const statusDot = make("span", { class: "bios-dot bios-dot--unknown" });
      const labelWrap = make("span", { class: "bios-label" });
      labelWrap.appendChild(document.createTextNode(req.displayName));
      labelWrap.appendChild(make("code", {
        class: "bios-filename",
        title: `Required filename: ${req.fileName}`,
        "aria-label": `Required filename: ${req.fileName}`,
      }, req.fileName));
      const desc = make("span", { class: "bios-desc" }, req.description);
      const requiredBadge = req.required
        ? make("span", { class: "bios-required" }, "Required")
        : make("span", { class: "bios-optional" }, "Optional");

      const uploadInput = make("input", {
        type: "file",
        accept: ".bin,.img,.rom",
        "aria-label": `Upload ${req.displayName}`,
        style: "display:none",
      }) as HTMLInputElement;

      const uploadBtn = make("button", { class: "btn bios-upload-btn" }, "Upload");
      uploadBtn.addEventListener("click", () => uploadInput.click());
      uploadInput.addEventListener("change", async () => {
        const file = uploadInput.files?.[0];
        if (!file) return;
        uploadInput.value = "";
        try {
          const canonical = new File([file], req.fileName, { type: file.type });
          await biosLibrary.addBios(canonical, sysId);
          statusDot.className = "bios-dot bios-dot--ok";
          uploadBtn.textContent = "Replace";
        } catch (err) {
          onError(`BIOS upload failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      });

      void biosLibrary.findBios(sysId, req.fileName).then((found) => {
        if (found) {
          statusDot.className = "bios-dot bios-dot--ok";
          uploadBtn.textContent = "Replace";
        } else if (req.required) {
          statusDot.className = "bios-dot bios-dot--missing";
        }
      }).catch(() => {});

      row.append(statusDot, uploadInput, labelWrap, requiredBadge, desc, uploadBtn);
      sysBlock.appendChild(row);
    }

    biosGrid.appendChild(sysBlock);
  }

  container.appendChild(biosSection);
}

export function buildAboutTab(container: HTMLElement, appName: string): void {
  const quickStartSection = make("div", { class: "settings-section" });
  quickStartSection.appendChild(make("h4", { class: "settings-section__title" }, "How to Get Started"));
  const steps = [
    "Drop a game file onto the page, or click the upload area to browse for one.",
    "If asked, choose which system to use — this happens with some common file formats.",
    "Your game launches automatically — enjoy!",
    "Save your progress with F5, load it back with F7, and press Esc to return to your game library. Saves stay local first, and cloud backup can mirror them if you connect it later.",
  ];
  const stepList = make("ol", { class: "help-steps" });
  for (const step of steps) stepList.appendChild(make("li", { class: "help-step" }, step));
  quickStartSection.appendChild(stepList);

  const shortcutsSection = make("div", { class: "settings-section" });
  shortcutsSection.appendChild(make("h4", { class: "settings-section__title" }, "Keyboard Shortcuts"));
  const shortcuts: Array<[string, string]> = [
    ["F5", "Save progress (quick save)"],
    ["F7", "Load saved progress (quick load)"],
    ["F1", "Reset game"],
    ["F9", "Open Settings (Advanced tab)"],
    ["Esc", "Return to game library"],
    ["F3", "Toggle on-screen debug overlay"],
  ];
  const shortcutList = make("div", { class: "device-info-details" });
  for (const [key, desc] of shortcuts) {
    const row = make("div", { class: "shortcut-row" });
    row.append(make("kbd", { class: "shortcut-key" }, key), make("span", { class: "shortcut-desc device-info" }, desc));
    shortcutList.appendChild(row);
  }
  shortcutsSection.appendChild(shortcutList);

  const mpSection = make("div", { class: "settings-section" });
  mpSection.appendChild(make("h4", { class: "settings-section__title" }, "Play with friends online"));
  const mpSteps = [
    "Open ⚙ Settings → Play Together. Turn on Online play and paste the WebSocket URL (wss://…) from whoever runs your server — everyone must use the same URL.",
    "Launch the same game as your friend (same title and system when possible).",
    "Click Play Together on the home screen, or Online in the game toolbar. Host creates a room and shares the invite code; Join pastes the code from your friend.",
    "If something fails, open Play Together and use 📋 Logs to copy connection details for troubleshooting.",
  ];
  const mpList = make("ol", { class: "help-steps" });
  for (const step of mpSteps) mpList.appendChild(make("li", { class: "help-step" }, step));
  mpSection.append(mpList, make("p", { class: "settings-help" },
    `In-game Wi-Fi or Nintendo WFC features inside a ROM are not the same as ${appName} Play Together — use Host / Join here for link-style multiplayer.`
  ));

  const troubleSection = make("div", { class: "settings-section" });
  troubleSection.appendChild(make("h4", { class: "settings-section__title" }, "Troubleshooting"));
  const troubles: Array<[string, string]> = [
    ["Game won't load", "Check that the file is a valid ROM. ZIP files are automatically extracted — if it still fails, try unzipping the file manually first."],
    ["PSP game won't start", "PSP games need a special browser feature. Try refreshing the page once — this sets things up automatically."],
    ["No sound", "Make sure the browser tab isn't muted. Some games take a few seconds to start audio."],
    ["Game is slow or choppy", "Open ⚡ Settings → Performance and switch to Performance mode. Closing other browser tabs can also help."],
    ["Saves aren't working", "Your saves live in your browser on this device. If you connect cloud backup, it mirrors those saves instead of replacing them. Clearing browser data will erase the local copy, so export saves first if you want a backup."],
    ["Controls not responding", "Click on the game screen first to make sure it has focus. Gamepads should be connected before launching a game."],
    ["Stuck on loading screen", "Try refreshing the page. If the issue persists, the game file may be corrupted or an unsupported format."],
    ["Can't connect to a friend online", "Confirm Settings → Play Together has the same server URL for both of you, Online play is on, and you are playing the same game. Try 📋 Logs in the Play Together window; strict networks may need a TURN server under Advanced."],
  ];
  for (const [problem, solution] of troubles) {
    const item = make("div", { class: "trouble-item" });
    item.append(make("p", { class: "trouble-item__q" }, `❓ ${problem}`), make("p", { class: "trouble-item__a" }, solution));
    troubleSection.appendChild(item);
  }

  const aboutSection = make("div", { class: "settings-section" });
  aboutSection.appendChild(make("h4", { class: "settings-section__title" }, `About ${appName}`));
  aboutSection.appendChild(make("p", { class: "settings-help" },
    `${appName} lets you play retro games from classic systems — PSP, N64, PS1, NDS, GBA, SNES, NES, Genesis and more — right in your browser. No installs, no account, nothing to sign up for.`
  ));
  aboutSection.appendChild(make("p", { class: "settings-help" },
    `Your local game library and saves stay on this device by default. If you connect cloud storage, cloud saves mirror progress and cloud library sources add remote games beside your local ROMs. ${appName} does not upload anything until you connect a provider.`
  ));

  const links = make("div", { class: "help-links" });
  links.appendChild(make("a", {
    href: "https://emulatorjs.org",
    target: "_blank",
    rel: "noopener",
    class: "btn help-link-btn",
  }, "Powered by EmulatorJS"));
  aboutSection.appendChild(links);

  container.append(quickStartSection, shortcutsSection, mpSection, troubleSection, aboutSection);
}
