## 2024-11-20 - [XSS via DOM innerHTML]
**Vulnerability:** XSS vulnerability in `src/ui/easyNetplayModal.ts` where unescaped user data `currentGameName` / `currentGameId` is injected into `innerHTML`.
**Learning:** Developers might use `innerHTML` out of convenience to mix HTML icons (like `<svg>`) and user data without properly isolating the data. This creates an XSS vulnerability when a maliciously crafted filename/name containing `<script>` or other event handlers is imported into the app.
**Prevention:** Always use safe DOM manipulation methods such as `.textContent`, or when using `innerHTML`, ensure the dynamic variables are escaped using helpers like `escHtml()`.

## 2024-11-20 - [XSS via DOM innerHTML in Game Card]
**Vulnerability:** XSS vulnerability in `src/ui/widgets/gameCard.ts` where unescaped variable `system?.name ?? game.systemId` is injected into `innerHTML`.
**Learning:** Even variables that seem safe, like system IDs or names, can be manipulated by malicious files or integrations if not strictly validated. It is important to escape all variable interpolations inside `innerHTML` regardless of where the data originates.
**Prevention:** Consistently use `escHtml()` on all variables dynamically injected into `innerHTML`, or prefer `.textContent` where possible.

## 2026-06-22 - [XSS via DOM innerHTML in Multiplayer Dashboard]
**Vulnerability:** XSS vulnerability in `src/multiplayer/ui/MultiplayerLaunchPanel.ts` and `src/multiplayer/ui/MultiplayerHome.ts` where unescaped user data `gameName` and `systemId` is injected into `innerHTML`.
**Learning:** When creating new components like the multiplayer UI, developers may forget to apply standard sanitization to dynamic data interpolated into HTML template strings. This allows malicious payloads inside game names or system IDs to execute.
**Prevention:** Use the project's `escHtml()` utility for all variable interpolations inside `innerHTML`, or use safe DOM methods like `.textContent`.
