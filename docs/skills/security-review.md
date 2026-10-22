# Security review before release

This checklist guides security reviews and regression testing. It does not
certify the editor or replace application-side sanitization.

## Goal

Review the ways untrusted content reaches the editor. Find reproducible
bugs, add browser regression tests, and make the smallest fixes. Preserve
native undo/redo and zero runtime dependencies.

Use Chromium and Firefox with the existing Playwright suite. Record
Safari as untested unless a separate review covers it. Do not add test
frameworks or sanitizer dependencies just for this review.

## Trust boundaries

| Entry point | Current boundary |
| --- | --- |
| `setHTML()` and HTML paste | Built-in DOMParser sanitizer by default. |
| Source edits and `rawMode: true` | HTML sanitization is intentionally bypassed. |
| Image URLs and upload-hook results | Image URL validation remains enabled, including in raw mode. |
| File picker, image paste/drop, and `insertImage(file)` | File type/size checks and the image upload/base64 path. |
| `unrestrictedMode: true` | HTML, URL, file-type, and file-size checks are intentionally bypassed; explicit image switches remain. |
| Custom toolbar icons and callbacks | Trusted application configuration, not user content. |
| Exported HTML | Untrusted application data; validate and sanitize before publishing. |

Native editing and Source mode do not pass through the import sanitizer.
Link prompts validate URLs except in unrestricted mode. Normal HTML drops
are rejected regardless of image switches. Raw/unrestricted HTML drops are
left to native editing, without library sanitization.

Normal imports and image insertion share the URL/data URI policy. Supported
base64 JPEG/PNG/GIF/WebP sources are allowed when base64 is enabled. Verify
these route boundaries explicitly; raw/unrestricted HTML remains unfiltered.

## Review work

### 1. HTML parsing and sanitization

Inspect `sanitizeHTML`, its tag/attribute allowlists, and both callers.
Test the serialized output and the DOM after it enters `contenteditable`.
Include a second parse to catch markup that changes meaning on reparse.

Cover:

- Scripts and styles, including their contents.
- Event handlers with mixed case, encoding, and malformed markup.
- Iframes, objects, embeds, forms, templates, SVG, and MathML.
- Namespace transitions, parser repair, comments, and broken nesting.
- Leading closing tags, full documents, and unusual table fragments.
- Unexpected URL-bearing attributes such as `srcset`, `action`, `poster`,
  `xlink:href`, and `srcdoc`.
- Styles/classes and attributes outside the documented allowlist.
- Preserved table IDs and header references: check DOM-clobbering risks and
  whether editor lookups can be redirected by imported content.

Unknown elements are currently unwrapped, not always removed with their
contents. Verify that their surviving children are also cleaned.

Use positive cases too: ordinary formatting, text, captions, sections,
column groups, spans, and header relationships must still import correctly.

### 2. URL validation and attribute construction

Inspect `allowLinkURL`, `allowImageURL`, `buildImgTag`, and the link action.
Exercise each applicable route: import, paste, prompt, image API, and
upload-hook result.

Cover:

- `javascript:`, `vbscript:`, `file:`, `blob:`, and non-image `data:` URLs.
- Case variations, control characters, whitespace, and entity decoding.
- Relative and protocol-relative URLs under HTTP(S) and `file://`.
- `mailto:` links versus image sources.
- Valid and malformed image base64 data URIs, including claimed image types
  whose bytes do not match. Assess SVG data URI behavior explicitly.
- Quotes, ampersands, and tag-like text in URLs and file names.

Verify allowed schemes and attribute escaping separately. An HTTP(S) URL
can still be remote, track the user, or point at unwanted content. The
editor does not promise to prevent network requests or enforce an origin
allowlist.

### 3. File and asynchronous insertion

Inspect picker, clipboard, drop, programmatic Blob/File, and upload paths.
Cover unsupported types, missing MIME types, misleading extensions,
zero-length files, and files just below/above `maxSize`.

Verify that failures do not corrupt content or insert executable markup.
Check rejected upload promises, invalid return values, and unsafe URLs.
Repeat with Source mode entered or the editor destroyed before an upload
resolves. Verify selection preservation and independent editor instances.

Type/extension checks are not a malware scan. Do not claim otherwise.

### 4. Bypass behavior and documentation

Verify raw mode, unrestricted mode, and Source mode using controlled test
payloads and execution sentinels. Do not assert
that these modes block executable HTML. Confirm that image API URL checks
still apply in raw/Source mode but are bypassed in unrestricted mode, and
that consuming applications receive the documented HTML.

Review README security claims against observed behavior. Clarify any
route-specific restrictions, including supported imported data URI images and the explicit unrestricted
bypass. Explain
that insertion/import may cause resource requests and that safe output is
the consuming application's responsibility.

## Test method

- Reproduce each suspected issue before changing code.
- Use isolated editor instances and controlled local resources.
- Use an execution sentinel instead of `alert()` dialogs.
- Observe execution, navigation, and network requests as well as DOM output.
- Keep dangerous-link tests in an isolated browser page with no credentials.
- Assert meaningful DOM structure, not identical browser serialization.
- Add focused regressions to the existing browser suite. Put a helper in
  `tests/` only if it keeps the smoke runner readable.
- Run `npm test` and `npm run test:package` after fixes. Commit rebuilt
  `dist/` files alongside any source changes.

## Completion criteria

- Every entry point above has been inspected and tested where applicable.
- New regression cases pass in Chromium and Firefox.
- Sanitized import/paste cases contain no executable elements, handlers, or
  prohibited URL schemes after insertion and reparse.
- Positive import cases and native editing/undo still work.
- Bypass behavior is tested and clearly documented, not presented as safe.
- Findings include a reproducer, affected route, impact, fix or deferral,
  and browser results. No confirmed high-impact default-path finding is
  left unresolved without an explicit release decision.
- Remaining risks and untested browsers are listed in the review report
  and summarized in `docs/PROJECT_NOTES.md`.

Do not describe a passing suite as proof against all XSS. Keep claims
limited to the reviewed boundaries and tested behavior.
