## 2024-11-20 - [XSS via DOM innerHTML]
**Vulnerability:** XSS vulnerability in `src/ui/easyNetplayModal.ts` where unescaped user data `currentGameName` / `currentGameId` is injected into `innerHTML`.
**Learning:** Developers might use `innerHTML` out of convenience to mix HTML icons (like `<svg>`) and user data without properly isolating the data. This creates an XSS vulnerability when a maliciously crafted filename/name containing `<script>` or other event handlers is imported into the app.
**Prevention:** Always use safe DOM manipulation methods such as `.textContent`, or when using `innerHTML`, ensure the dynamic variables are escaped using helpers like `escHtml()`.

## 2025-02-24 - [XSS in Multiplayer UI via unescaped game/system info]
**Vulnerability:** XSS vulnerability in `src/multiplayer/ui/MultiplayerLaunchPanel.ts` and `src/multiplayer/ui/MultiplayerHome.ts` where unescaped user data (`gameName` and `systemId` from session state) was injected into `innerHTML`.
**Learning:** Even internal session data that might originate from user-controlled sources (like ROM filenames or metadata) can be a vector for XSS if inserted directly into the DOM via template literals in `innerHTML`.
**Prevention:** Consistently apply `escHtml()` (or equivalent sanitization functions) to all dynamic text content injected via `innerHTML`, especially for data retrieved from application state or external sources.
