## 2024-08-04 - DOM-based XSS via Unsafe URL Parameters
**Vulnerability:** The `back` URL parameter in `retrooasis/public/player.html` was rendered directly into the DOM via `innerHTML` without sanitizing for unsafe URL schemes (like `javascript:`). This could allow an attacker to execute arbitrary JavaScript if a user clicks a malicious "Exit" or "Back" link.
**Learning:** `innerHTML` shouldn't be used to inject user-controlled URLs because standard HTML escaping doesn't protect against malicious URL schemes.
**Prevention:** Always explicitly check URL parameters for unsafe schemas (e.g., rejecting `javascript:`) and strip control characters first to prevent evasion. When assigning URLs, prefer direct DOM properties (e.g., `element.href = url`) over `innerHTML` string interpolation.
