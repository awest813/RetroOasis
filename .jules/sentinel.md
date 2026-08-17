## 2024-05-18 - Prevent DOM-based XSS in player.html
**Vulnerability:** DOM-based XSS via unsafe URI schemes in the `back` parameter. The `back` URL parameter was inserted directly into an `innerHTML` assignment within the `fail` function, allowing an attacker to inject `javascript:` URIs (e.g., `?back=javascript:alert(1)`).
**Learning:** In static HTML pages (like `player.html`), passing unvalidated URL parameters into `href` attributes or interpolating them into HTML strings used for `innerHTML` assignments poses a significant XSS risk. The lack of standard templating or robust sanitization functions in these unbundled contexts makes them particularly vulnerable. Control characters and spaces must also be stripped before validating the schema, as they can bypass basic prefix checks (e.g., `java\x09script:`).
**Prevention:**
1. Always construct DOM nodes natively (`document.createElement`) and set properties directly (e.g., `element.href = url`) to avoid HTML string injection contexts.
2. Explicitly validate and reject unsafe URI schemes (like `javascript:`) for any user-controlled URL parameters used in links or navigation. Always strip control characters and spaces (e.g., `url.replace(/[\x00-\x20]/g, "")`) before performing the schema check.
## 2026-08-17 - Prevent DOM-based XSS via unsafe URI schemes in player.html
**Vulnerability:** DOM-based XSS via unsafe URI schemes (`data:`, `vbscript:`) in the `back` parameter in `retrooasis/public/player.html`.
**Learning:** Checking only for `javascript:` is insufficient to prevent XSS. Attackers can use other unsafe URI schemes like `data:text/html,<script>alert(1)</script>` or `vbscript:` when a URL is assigned to an `href` attribute or used in navigation.
**Prevention:** Explicitly validate and block all unsafe URI schemes, or better, implement an allowlist of safe schemes (e.g., `http:`, `https:`) or ensure relative paths.
