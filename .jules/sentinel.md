## 2024-05-18 - [XSS in `fail` function of player.html]
**Vulnerability:** The `fail` function in `retrooasis/public/player.html` constructs HTML using `innerHTML` with unsanitized variables, specifically `title`, `message`, and `back`.
**Learning:** When a variable is retrieved from URL params (e.g., `back`) and rendered in HTML without proper escaping, it can lead to Cross-Site Scripting (XSS). Even if an `escapeHtml` function exists in the file, it must be explicitly used.
**Prevention:** Use native DOM APIs (e.g., `document.createElement`, `textContent`) or ensure all untrusted variables interpolated into HTML strings are thoroughly escaped via a dedicated function (like the existing `escapeHtml`).
