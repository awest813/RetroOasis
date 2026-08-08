## 2024-05-18 - DOM-based XSS in player.html
**Vulnerability:** DOM-based XSS via `innerHTML` injection of the `back` URL parameter in `fail()` and `showLoading()`, and `javascript:` URI XSS via direct assignment to an `href` attribute.
**Learning:** Static HTML files without a module bundler or template engine are particularly susceptible to DOM XSS when relying on `innerHTML` for dynamic content. A single unvalidated URL parameter can compromise the execution context.
**Prevention:** Use native DOM creation (`document.createElement` and `appendChild`) or safe properties (`textContent`) instead of `innerHTML`. Strip control characters and reject unsafe schemes (like `javascript:`) before assigning URL parameters to navigational attributes like `href`.
