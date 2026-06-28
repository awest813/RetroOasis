## 2026-06-27 - [Multiplayer and SVG XSS hardening]
**Vulnerability:** Multiple XSS issues were present in the multiplayer UI and SVG validation flow: unescaped session values such as `gameName` and `systemId` were interpolated into `innerHTML`, and `isSvgMarkup` used weak validation that could admit unsafe SVG markup.
**Learning:** UI templates that mix untrusted values with HTML are vulnerable when the values are not escaped. This risk is especially high when the data comes from session state, user-controlled filenames, or diagnostic output.
**Prevention:** Always escape any untrusted values before interpolating them into `innerHTML`, and keep SVG validation strict with a concrete allowlist rather than a simple prefix check.
