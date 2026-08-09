## 2024-05-24 - [Fix DOM-based XSS in player.html]
**Vulnerability:** DOM-based XSS via unvalidated `back` URL parameter used in `innerHTML` assignment and `javascript:` URLs.
**Learning:** URL parameters intended for navigation (like `back` buttons) must be verified to reject unsafe schemas like `javascript:` while explicitly preventing evasion using control characters (`[\x00-\x20]`).
**Prevention:** Always validate URL schemes before usage, remove control characters during checking, and prefer native DOM APIs (`document.createElement`) over `innerHTML` when building UI elements.
