## 2024-11-20 - [XSS via DOM innerHTML]
**Vulnerability:** XSS vulnerability in `src/ui/easyNetplayModal.ts` where unescaped user data `currentGameName` / `currentGameId` is injected into `innerHTML`.
**Learning:** Developers might use `innerHTML` out of convenience to mix HTML icons (like `<svg>`) and user data without properly isolating the data. This creates an XSS vulnerability when a maliciously crafted filename/name containing `<script>` or other event handlers is imported into the app.
**Prevention:** Always use safe DOM manipulation methods such as `.textContent`, or when using `innerHTML`, ensure the dynamic variables are escaped using helpers like `escHtml()`.

## 2024-11-20 - [XSS via DOM innerHTML in Game Card]
**Vulnerability:** XSS vulnerability in `src/ui/widgets/gameCard.ts` where unescaped variable `system?.name ?? game.systemId` is injected into `innerHTML`.
**Learning:** Even variables that seem safe, like system IDs or names, can be manipulated by malicious files or integrations if not strictly validated. It is important to escape all variable interpolations inside `innerHTML` regardless of where the data originates.
**Prevention:** Consistently use `escHtml()` on all variables dynamically injected into `innerHTML`, or prefer `.textContent` where possible.
## 2024-11-20 - [XSS via DOM innerHTML in Multiplayer UI]
**Vulnerability:** XSS vulnerability in `src/multiplayer/ui/MultiplayerLaunchPanel.ts` and `src/multiplayer/ui/MultiplayerHome.ts` where unescaped user data `session.gameName` and `session.systemId` are injected into `innerHTML`.
**Learning:** Just like with `currentGameName` in the easy netplay modal, developers might use `innerHTML` out of convenience to mix HTML icons and user data from the session store without properly isolating the data. This creates an XSS vulnerability when a maliciously crafted session configuration is loaded.
**Prevention:** Always use safe DOM manipulation methods such as `.textContent`, or when using `innerHTML`, ensure the dynamic variables are escaped using helpers like `escHtml()`. This pattern is pervasive across the UI and must be checked wherever `innerHTML` is used.
