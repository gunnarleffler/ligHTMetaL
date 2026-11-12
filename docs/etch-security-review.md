# Etch — pre-integration security and lifecycle review

## Scope and status

Internal source review and regression testing of the current editor, not an independent
security certification or a guarantee against browser/codec vulnerabilities. Host
integration, real-device Safari/mobile and assistive-technology acceptance remain open.

Reviewed boundaries: native validation, SVG XML/style/path/geometry conversion, raster
header inspection and decoding, native/image/SVG import transactions, event deferral,
PNG/SVG export, Blob URL ownership, fullscreen and teardown. Relevant code is under
`src/validation.js`, `src/import/`, `src/{raster,assets,text-input,state,events}.js`, the
import/export modules, `src/index.js`, `src/fullscreen.js` and `src/ui/shell.js`.

Threat model: imported file contents are untrusted. The embedding application and
same-origin JavaScript are trusted; this editor is not a sandbox against hostile host
scripts or monkey-patched browser globals. No runtime packages, uploads, external image
URLs or editor-owned storage are introduced.

## Findings fixed

### 1. Deferred operations could be abandoned on teardown

A host event callback could queue load/import/fullscreen work, then destroy the editor
before the event batch drained. Clearing the queue dropped promise continuations without
rejecting them. A queued image commit could also lose its decoded-resource owner, and
listeners already copied for dispatch could run after destruction.

The event queue now has cancellation callbacks and an emission generation guard.
Destruction rejects queued async work with `CANCELLED`, closes a queued image commit's
resource, and stops the remaining notification batch. Fullscreen uses promise-aware
session deferral. New calls after destruction still fail with `DESTROYED`.

Regression coverage: `test/lifecycle-security.test.js` and
`browser/lifecycle-security.test.js`. The new unit reproductions failed before the fix;
browser coverage includes immediate host teardown and remounting a replacement editor.

### 2. Native JSON UI file reads were not abortable

The native file chooser previously used `Blob.text()`. Its file-size cap and stale-result
checks prevented oversized acceptance and stale commits, but cancel/load/destroy could
not stop an outstanding file read.

Native JSON and SVG now share a bounded stream reader. It checks canonical Blob size
before opening the stream, counts bytes while reading, rejects malformed UTF-8 rather
than silently replacing bytes, cancels outstanding reads and releases the reader lock.
Native JSON keeps its `jsonBytes` limit; SVG keeps its lower 5 MiB/input limit. The public
native API still accepts an object or JSON string, not a Blob.

Regression coverage: `test/text-input.test.js`, existing SVG input tests, native-import
preflight checks, and gated native-file browser tests for Cancel, load and destroy.

### 3. PNG preflight did not reject repeated dimension headers

Both raster sniffing and native base64 PNG validation now reject duplicate IHDR chunks
before decoding. This removes ambiguity between the dimensions used for allocation
budgets and malformed containers. No browser exploit was demonstrated; this is
fail-closed input hardening, not a claim that a decoder bypass was proven.

Coverage checks identical and conflicting duplicate headers, unchanged committed state,
and zero decoder calls on rejected inputs.

## Existing safeguards checked

- Native imports construct fresh whitelisted data, validate the entire source (including
  omitted content) and combined destination, regenerate imported IDs, and retain exact
  referenced image bytes. Failed operations do not partially commit or damage history.
- SVG source is parsed in a detached XML document and converted to new native records;
  source nodes/markup never enter the live editor or an SVG image decoder. Full-tree
  security checks precede hidden/metadata/unused-content omission. Declarations/entities,
  active elements/namespaces, event handlers and external resource references are rejected.
  CSS, path, transform, geometry and native validation have separate bounded work limits.
  Unsupported appearance fails rather than silently stripping visible features.
- Raster types/dimensions/chunk containers and animation restrictions are inspected before
  browser decoding; decoded dimensions are checked again. SVG is not accepted as a raster
  image. Browser codecs, not custom image decompressors, own decoding.
- Imports are single-flight. Cancellation/replacement prevents late results installing
  stale content or cancelling a newer job. Temporary pools/resources have explicit owners;
  resource reservations include retained history and overlapping native work.
- PNG exports capture committed content before asynchronous encoding, use separate owned
  canvases, and suppress late callbacks/downloads after destruction. SVG is generated from
  validated native data, not imported source XML. Toolbar Blob URLs are revoked.
- Native/fallback fullscreen restoration and renderer/input listeners have explicit cleanup.
  Lifecycle coverage also forces the HTMLImageElement decoder fallback and verifies URL,
  source and pixel-lease cleanup after cancellation, replacement and destruction.

## Verification

- Unit suite: **336 passed**.
- Full Chromium browser suite: **331 passed**.
- All Firefox-capable browser suites: **303 passed, 7 Chromium-only checks skipped**.
- Focused Playwright WebKit gesture/scroll-lock coverage: **6 passed, 1 Chromium-only
  check skipped**. This does not establish real-iPad acceptance.
- `npm audit --json`: **zero known advisories** in the current lockfile, including dev
  dependencies. This is an advisory database check, not a code-safety proof.
- Optional two-file distribution rebuilt; isolated bundle tests are included in the
  browser runs. Source import remains DOM-free and runtime-dependency-free.

## Remaining limits and release follow-ups

- Verify actual host CSP, Blob image/download permissions, save/close handling and teardown
  under Lightmetal/notes-app integration. The host owns persistence and write ordering.
- Real Safari/iPad/stylus and manual accessibility checks are still required. Automated
  Firefox/Chromium and synthetic input do not establish real-device acceptance.
- JSON parsing, XML parsing and geometry conversion are synchronous bounded work, not
  worker-isolated or instantly interruptible. Caps limit accepted work, not guaranteed
  responsiveness or total process memory. Hosts can lower limits for their use case.
- Native bitmap decoding/encoding may not be interruptible. Cancelled jobs retain pixel
  reservations until the underlying native work settles; rejecting concurrent allocations
  in that interval is deliberate. Browser decoder defects are outside these checks.
- Native JSON and SVG can preserve original embedded image bytes/metadata. SVG cropping
  clips rather than redacts; complete embedded images and out-of-crop geometry can remain.
  Prefer flattened PNG when a pixel-only or privacy-sensitive cropped picture is needed.
- Editable SVG remains a restricted subset; conservative curved-stroke bounds may reject
  otherwise valid files. Automatic SVG image fallback remains unimplemented and requires
  its own review; `etch-svg-fallback-audit.md` is only a future-design document.
- An independent security assessment may provide additional assurance for public release;
  this internal pass must not be represented as one.
