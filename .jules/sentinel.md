## 2024-05-18 - [DOM-based XSS in static HTML via URL Params]
**Vulnerability:** The static HTML page (`retrooasis/public/player.html`) parsed URL search parameters (like `back`) and injected them into the DOM using string concatenation and `innerHTML` in the `fail` error handling function. This created a DOM-based XSS vulnerability where payloads such as `javascript:alert(1)` could be executed when a user clicked the resulting "Back" link.

**Learning:** Static files operating outside module bundlers and frameworks (like Vite or React) are especially prone to XSS because developers often rely on fast string concatenation (`innerHTML`) instead of safer native DOM APIs. When dealing with `href` attributes, relying solely on text escaping (`escapeHtml`) is insufficient to prevent XSS via `javascript:` schemas.

**Prevention:**
1. Always parse URL parameters used for navigation (`href`) strictly. Strip out control characters and reject any parameter beginning with a `javascript:` scheme.
2. In static HTML components, prefer native DOM creation APIs (e.g., `document.createElement`, `element.textContent`, and direct property assignment like `element.href = ...`) over string interpolation with `innerHTML`. This guarantees proper handling of attribute values and mitigates code injection.
