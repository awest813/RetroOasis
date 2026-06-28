## 2024-11-20 - [XSS via DOM innerHTML]
**Vulnerability:** XSS vulnerability in `src/ui/easyNetplayModal.ts` where unescaped user data `currentGameName` / `currentGameId` is injected into `innerHTML`.
**Learning:** Developers might use `innerHTML` out of convenience to mix HTML icons (like `<svg>`) and user data without properly isolating the data. This creates an XSS vulnerability when a maliciously crafted filename/name containing `<script>` or other event handlers is imported into the app.
**Prevention:** Always use safe DOM manipulation methods such as `.textContent`, or when using `innerHTML`, ensure the dynamic variables are escaped using helpers like `escHtml()`.

## 2024-11-20 - [XSS via DOM innerHTML in Game Card]
**Vulnerability:** XSS vulnerability in `src/ui/widgets/gameCard.ts` where unescaped variable `system?.name ?? game.systemId` is injected into `innerHTML`.
**Learning:** Even variables that seem safe, like system IDs or names, can be manipulated by malicious files or integrations if not strictly validated. It is important to escape all variable interpolations inside `innerHTML` regardless of where the data originates.
**Prevention:** Consistently use `escHtml()` on all variables dynamically injected into `innerHTML`, or prefer `.textContent` where possible.
## 2026-06-27 - [Strict SVG Validation to Prevent XSS]
**Vulnerability:** The codebase contained a weak validation utility `isSvgMarkup` in `src/chromeIcons.ts` that only asserted a string starts with `<svg`. Untrusted user inputs utilizing this function could bypass HTML escaping and be rendered via `innerHTML`, causing XSS.
**Learning:** `isSvgMarkup` is vulnerable to payloads starting with `<svg` (e.g., `<svg onload=alert(1)>`). When this weak validation is combined with raw DOM injection (`innerHTML`), attackers can easily achieve XSS.
**Prevention:** The `isSvgMarkup` validation utility in `src/chromeIcons.ts` must use a strict allowlist (e.g., `SAFE_SVGS` Set) to prevent XSS via `innerHTML` injection. Untrusted user inputs failing this check will then fall back to safe sanitization (e.g., `escHtml` or `textContent`).

## 2025-02-20 - [XSS via DOM innerHTML in Multiplayer Dashboard]
**Vulnerability:** XSS vulnerability in `src/multiplayer/ui/MultiplayerLaunchPanel.ts` and `src/multiplayer/ui/MultiplayerHome.ts` where unescaped variables `gameName` and `systemId` were injected directly into `innerHTML`.
**Learning:** Multiplayer user sessions expose game data and system IDs from local storage or remote synchronization. Injecting these into template literals inside `innerHTML` without sanitization creates Cross-Site Scripting (XSS) risks if malicious game metadata propagates through a session payload.
**Prevention:** Always use `escHtml()` for any user-provided string properties, or variables sourced from external sessions, prior to rendering them via `innerHTML`.

## 2026-06-22 - [XSS via DOM innerHTML in Multiplayer Dashboard]
**Vulnerability:** XSS vulnerability in `src/multiplayer/ui/MultiplayerLaunchPanel.ts` and `src/multiplayer/ui/MultiplayerHome.ts` where unescaped user data `gameName` and `systemId` is injected into `innerHTML`.
**Learning:** When creating new components like the multiplayer UI, developers may forget to apply standard sanitization to dynamic data interpolated into HTML template strings. This allows malicious payloads inside game names or system IDs to execute.
**Prevention:** Use the project's `escHtml()` utility for all variable interpolations inside `innerHTML`, or use safe DOM methods like `.textContent`.

## 2024-11-20 - [XSS via DOM innerHTML in Multiplayer UI]
**Vulnerability:** XSS vulnerability in `src/multiplayer/ui/MultiplayerLaunchPanel.ts` and `src/multiplayer/ui/MultiplayerHome.ts` where unescaped user data `session.gameName` and `session.systemId` are injected into `innerHTML`.
**Learning:** Just like with `currentGameName` in the easy netplay modal, developers might use `innerHTML` out of convenience to mix HTML icons and user data from the session store without properly isolating the data. This creates an XSS vulnerability when a maliciously crafted session configuration is loaded.
**Prevention:** Always use safe DOM manipulation methods such as `.textContent`, or when using `innerHTML`, ensure the dynamic variables are escaped using helpers like `escHtml()`. This pattern is pervasive across the UI and must be checked wherever `innerHTML` is used.

## 2024-06-25 - XSS Vulnerability in UI Component innerHTML assignments
**Vulnerability:** XSS vulnerabilities found in `src/multiplayer/ui/MultiplayerLaunchPanel.ts`, `src/multiplayer/ui/MultiplayerHome.ts`, and `src/multiplayer/ui/ConnectionDoctorPanel.ts` where unescaped state variables (`gameName`, `systemId`, `res.label`, `res.message`, `res.fix`) were directly injected into `innerHTML` strings.
**Learning:** This pattern of building DOM structures using template literals with `innerHTML` without sanitizing variables leaves the application vulnerable to XSS if the data source is untrusted or can be manipulated by users (e.g. game names from ROM metadata or custom filenames).
**Prevention:** Always use the `escHtml` utility function provided in `src/ui/viewHelpers.js` to sanitize variables before embedding them within `innerHTML` template strings.

## 2025-02-23 - [XSS via DOM innerHTML in Multiplayer UI]
**Vulnerability:** XSS vulnerabilities in `src/multiplayer/ui/MultiplayerLaunchPanel.ts`, `src/multiplayer/ui/MultiplayerHome.ts`, and `src/multiplayer/ui/ConnectionDoctorPanel.ts` where unescaped user-controlled or external data (`gameName`, `systemId`, `res.label`, `res.message`, `res.fix`) were injected directly into `innerHTML` strings.
**Learning:** There is a recurring pattern in the codebase of using ES6 template strings with `innerHTML` to quickly render UI components involving SVGs. This leads to persistent XSS risks when user input (like game names from session state) or dynamically generated diagnostic messages bypass rendering safeguards. The `escHtml` utility exists but is often forgotten during rapid UI development.
**Prevention:** Always use `escHtml(value)` when interpolating any variable text into an `innerHTML` template string. Establish a proactive habit to audit all new `innerHTML` assignments for missing sanitization, and prefer standard DOM `textContent` or `createElement` APIs where mixing HTML markup isn't strictly necessary.
