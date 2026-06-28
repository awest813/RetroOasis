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
