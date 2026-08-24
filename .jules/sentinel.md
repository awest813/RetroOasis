## 2024-05-18 - Prevent DOM-based XSS in player.html
**Vulnerability:** DOM-based XSS via unsafe URI schemes in the `back` parameter. The `back` URL parameter was inserted directly into an `innerHTML` assignment within the `fail` function, allowing an attacker to inject `javascript:` URIs (e.g., `?back=javascript:alert(1)`).
**Learning:** In static HTML pages (like `player.html`), passing unvalidated URL parameters into `href` attributes or interpolating them into HTML strings used for `innerHTML` assignments poses a significant XSS risk. The lack of standard templating or robust sanitization functions in these unbundled contexts makes them particularly vulnerable. Control characters and spaces must also be stripped before validating the schema, as they can bypass basic prefix checks (e.g., `java\x09script:`).
**Prevention:**
1. Always construct DOM nodes natively (`document.createElement`) and set properties directly (e.g., `element.href = url`) to avoid HTML string injection contexts.
2. Explicitly validate and reject unsafe URI schemes (like `javascript:`) for any user-controlled URL parameters used in links or navigation. Always strip control characters and spaces (e.g., `url.replace(/[\x00-\x20]/g, "")`) before performing the schema check.

## 2026-08-22 - Prevent DOM-based XSS in linked folder names
**Vulnerability:** DOM-based XSS in `retrooasis/src/views/settings.ts`. When a user linked a local folder containing ROMs, the name of the folder (`meta.name`) was interpolated directly into an `innerHTML` assignment without any escaping or sanitization. If an attacker could trick a user into linking a maliciously named folder, it would result in arbitrary JavaScript execution when the Settings page was loaded.
**Learning:** Even local or seemingly "safe" metadata sources like folder names retrieved via the File System Access API must be treated as untrusted input. In applications that rely heavily on string interpolation for rendering views, it is critical to ensure that every dynamically inserted variable is passed through an HTML escaping function unless it is explicitly known to be safe markup.
**Prevention:** Always use `escapeHtml()` (or equivalent sanitization) when interpolating any external or user-provided data into HTML template strings before assigning them to `innerHTML`.

## 2026-08-24 - Eliminate innerHTML in player.html
**Vulnerability:** Potential DOM-based XSS in `retrooasis/public/player.html`. Error messages and loading states were constructed using string concatenation and injected via `innerHTML`. While some inputs were escaped, the pattern itself is risky and prone to bypasses if an unescaped payload slips through.
**Learning:** In environments without robust templating (like static HTML files), passing complex structures (like mixed text and `<code>` elements) as HTML strings creates brittle, dangerous injection contexts. Custom `Error` objects can be enhanced to carry rich, safe DOM structures (`DocumentFragment`) instead of HTML strings, allowing error handlers to render complex markup safely without `innerHTML`.
**Prevention:**
1. Use native DOM construction (`document.createElement`, `document.createTextNode`) exclusively for dynamic content generation.
2. For propagating complex DOM structures (like styled error messages) through error boundaries, attach a natively constructed `DocumentFragment` to the custom error object (e.g., `err.domMessage`) rather than relying on HTML string serialization.
