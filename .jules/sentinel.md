## 2024-11-20 - [XSS via DOM innerHTML]
**Vulnerability:** XSS vulnerability in `src/ui/easyNetplayModal.ts` where unescaped user data `currentGameName` / `currentGameId` is injected into `innerHTML`.
**Learning:** Developers might use `innerHTML` out of convenience to mix HTML icons (like `<svg>`) and user data without properly isolating the data. This creates an XSS vulnerability when a maliciously crafted filename/name containing `<script>` or other event handlers is imported into the app.
**Prevention:** Always use safe DOM manipulation methods such as `.textContent`, or when using `innerHTML`, ensure the dynamic variables are escaped using helpers like `escHtml()`.

## 2024-11-20 - [XSS via DOM innerHTML in Game Card]
**Vulnerability:** XSS vulnerability in `src/ui/widgets/gameCard.ts` where unescaped variable `system?.name ?? game.systemId` is injected into `innerHTML`.
**Learning:** Even variables that seem safe, like system IDs or names, can be manipulated by malicious files or integrations if not strictly validated. It is important to escape all variable interpolations inside `innerHTML` regardless of where the data originates.
**Prevention:** Consistently use `escHtml()` on all variables dynamically injected into `innerHTML`, or prefer `.textContent` where possible.

## 2024-06-25 - XSS Vulnerability in UI Component innerHTML assignments
**Vulnerability:** XSS vulnerabilities found in `src/multiplayer/ui/MultiplayerLaunchPanel.ts`, `src/multiplayer/ui/MultiplayerHome.ts`, and `src/multiplayer/ui/ConnectionDoctorPanel.ts` where unescaped state variables (`gameName`, `systemId`, `res.label`, `res.message`, `res.fix`) were directly injected into `innerHTML` strings.
**Learning:** This pattern of building DOM structures using template literals with `innerHTML` without sanitizing variables leaves the application vulnerable to XSS if the data source is untrusted or can be manipulated by users (e.g. game names from ROM metadata or custom filenames).
**Prevention:** Always use the `escHtml` utility function provided in `src/ui/viewHelpers.js` to sanitize variables before embedding them within `innerHTML` template strings.
