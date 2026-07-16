## 2024-11-20 - [XSS via DOM innerHTML]
**Vulnerability:** XSS vulnerability in `src/ui/easyNetplayModal.ts` where unescaped user data `currentGameName` / `currentGameId` is injected into `innerHTML`.
**Learning:** Developers might use `innerHTML` out of convenience to mix HTML icons (like `<svg>`) and user data without properly isolating the data. This creates an XSS vulnerability when a maliciously crafted filename/name containing `<script>` or other event handlers is imported into the app.
**Prevention:** Always use safe DOM manipulation methods such as `.textContent`, or when using `innerHTML`, ensure the dynamic variables are escaped using helpers like `escHtml()`.

## 2024-11-20 - [XSS via DOM innerHTML in Game Card]
**Vulnerability:** XSS vulnerability in `src/ui/widgets/gameCard.ts` where unescaped variable `system?.name ?? game.systemId` is injected into `innerHTML`.
**Learning:** Even variables that seem safe, like system IDs or names, can be manipulated by malicious files or integrations if not strictly validated. It is important to escape all variable interpolations inside `innerHTML` regardless of where the data originates.
**Prevention:** Consistently use `escHtml()` on all variables dynamically injected into `innerHTML`, or prefer `.textContent` where possible.

## 2025-02-23 - [XSS via DOM innerHTML in Multiplayer UI]
**Vulnerability:** XSS vulnerabilities in `src/multiplayer/ui/MultiplayerLaunchPanel.ts`, `src/multiplayer/ui/MultiplayerHome.ts`, and `src/multiplayer/ui/ConnectionDoctorPanel.ts` where unescaped user-controlled or external data (`gameName`, `systemId`, `res.label`, `res.message`, `res.fix`) were injected directly into `innerHTML` strings.
**Learning:** There is a recurring pattern in the codebase of using ES6 template strings with `innerHTML` to quickly render UI components involving SVGs. This leads to persistent XSS risks when user input (like game names from session state) or dynamically generated diagnostic messages bypass rendering safeguards. The `escHtml` utility exists but is often forgotten during rapid UI development.
**Prevention:** Always use `escHtml(value)` when interpolating any variable text into an `innerHTML` template string. Establish a proactive habit to audit all new `innerHTML` assignments for missing sanitization, and prefer standard DOM `textContent` or `createElement` APIs where mixing HTML markup isn't strictly necessary.

## 2026-06-27 - [Multiplayer and SVG XSS hardening]
**Vulnerability:** Multiple XSS issues were present in the multiplayer UI and SVG validation flow: unescaped session values such as `gameName` and `systemId` were interpolated into `innerHTML`, and `isSvgMarkup` used weak validation that could admit unsafe SVG markup.
**Learning:** UI templates that mix untrusted values with HTML are vulnerable when the values are not escaped. This risk is especially high when the data comes from session state, user-controlled filenames, or diagnostic output.
**Prevention:** Always escape any untrusted values before interpolating them into `innerHTML`, and keep SVG validation strict with a concrete allowlist rather than a simple prefix check.

## 2024-03-23 - [XSS via DOM innerHTML in UI components]
**Vulnerability:** XSS vulnerabilities in `src/ui/gameOfTheDay.ts` and `src/ui/librarySections.ts` where unescaped user-controlled or external data (like `iconOutput`) was injected directly into `innerHTML` strings.
**Learning:** Using `innerHTML` for convenience to render images from asset paths or external SVG strings leaves the code vulnerable when data paths might be tampered with. The `escapeHtml` utility was previously bypassed.
**Prevention:** To prevent DOM-based XSS when rendering images dynamically, UI components in this codebase should use native DOM node creation (e.g., `make("img", { src: ..., alt: "" })`) instead of `innerHTML` string interpolation, particularly for asset paths.

## 2024-07-16 - [Timing Attack in Auth Token Comparison]
**Vulnerability:** The companion server used standard string equality (`===`) to verify `AUTH_TOKEN`, making it vulnerable to a timing attack where an attacker could guess the token character by character based on response time.
**Learning:** Security-sensitive string comparisons, such as checking tokens, API keys, or passwords, should never use standard equality operators because they short-circuit and leak timing information.
**Prevention:** Always use `timingSafeEqual` (from `node:crypto`) or an equivalent constant-time comparison function when verifying secrets. Ensure both inputs are buffers of the same length before comparing.
