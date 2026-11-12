# Etch verification limits

[Etch.md](Etch.md) describes implemented workflows and current test commands.
[The original v1 specification](specs/etch-spec.md) defines feature/native-format
requirements; passing automation does not establish completed-v1 acceptance.
[Suite release policy](releasing.md#approved-validation-scope) controls which
manual checks are required. Native Safari/device and assistive-technology checks
below remain unverified, not additional suite release gates.

## Unverified acceptance

- Current/previous stable desktop Safari, iOS Safari and Android Chrome
  (SPEC §1.2). Automated Linux WebKit is not Safari/iPad acceptance.
- Manual accessibility/assistive-technology checks (SPEC §14.3), including
  keyboard/focus behavior, narrow toolbar/header scrolling, sidebar disclosures,
  resize-divider discoverability and touch targets.
- Real pressure pen, palm contact, touch navigation/finger drawing, trackpad,
  fullscreen denial/Escape, browser zoom/DPR changes and mobile orientation.
- Real-iPad gesture containment: canvas gestures, internal UI scrolling, boundary
  drags and page scroll restoration after in-page fullscreen. Browser/OS edge
  gestures remain outside reliable page control.
- Host-specific CSP, downloads, persistence, save/close handling and teardown.
  The host owns storage/write ordering. The [internal security review](etch-security-review.md)
  describes its scope and resource limits; it is not independent certification.

## Automated coverage

Run `npm run test:etch` and `npm run test:etch:browser` with the suite's global
Playwright setup. Browser tests cover contextual controls, backgrounds, drawing,
import/export/native round trips, Undo, resource limits, fullscreen and teardown.
Chromium-only CDP input cases are synthetic; Firefox omits them. The foundation
suite is Chromium-only for its corrupt-PNG expectation. Use `npm run test:package`
for the exact archive's standalone, minified, ESM and bundled integration checks.
See [development and embedding](Etch.md#development-and-embedding) for commands
and [maintenance notes](etch-maintenance.md) for invariants.

Synthetic input and browser pixel comparisons do not establish real-device
acceptance or formal security/appearance proofs. Download native JSON before
refreshing unsaved in-memory artwork; the demo has no durable storage.

## Deferred scope

Safe SVG image fallback, Text, general vector opacity, broader partial cutting
and optional optimizations are tracked in [future work](etch-future-work.md).
Unsupported SVG retains external-PNG guidance. The [SVG fallback audit](etch-svg-fallback-audit.md)
reviews a future design, not an implemented fallback.

Formal performance baselining is deferred (SPEC §14.4). Investigate observable
responsiveness problems on representative modern hardware; ancient-device support
is out of scope. Resource-limit correctness and cancellation remain required.
