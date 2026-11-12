# Etch maintenance

Etch's facade is `src/etch.js`, modules are in `src/etch/`, and styles are
`src/etch.css`. The suite tracks generated `dist/` bundles. See
[the guide](Etch.md) for build/test commands and [release policy](releasing.md)
for validation scope.

## Start here

- `Etch.md`: setup, embedding, user workflows, implemented API and test commands.
- `specs/etch-spec.md`: authoritative v1 requirements, native schema, limits and acceptance criteria.
  Requirements are not evidence that every feature is implemented.
- `etch-future-work.md`: post-v1 features and optional investigations.
- `etch-verification.md`: remaining implementation and verification work.
- `etch-security-review.md`: scoped internal import/lifecycle review, fixes, evidence and limits.

Etch has no runtime dependencies or editor-owned storage. Importing the ESM entry
in Node is safe; mounting requires a browser DOM. Preserve relative module paths
when copying source. Load CSS explicitly. Internal module APIs are private.

Implemented: Pen (pressure-width toggle), Highlighter, shapes, whole-object and partial Pen/line erasing, selection with
move/resize/nudge, layer editing/dragging/merge, document background, raster/native/
editable SVG import, native load/save, PNG/SVG export, quarter-turn rotation and
native/fallback fullscreen. Top-bar Export provides PNG/SVG downloads in embedded,
read-only and fullscreen editors; the demo retains host-side shortcuts. Export never
marks an attachment saved. Pending UI exports suppress late downloads after teardown;
transient Blob URLs are revoked. Deferred scope is in `etch-future-work.md`; do not expose
inert controls or claim completed-v1 acceptance.

## Architecture and transaction boundaries

- `src/etch/index.js` composes the public facade, input, renderer, UI and import/export
  lifecycles. `src/etch/state.js` owns committed content, revisions, history and guards.
- `src/etch/document.js` creates immutable native state and detached snapshots;
  `src/etch/validation.js` returns fresh whitelisted data and enforces aggregate limits.
- `src/etch/history.js` retains immutable before/after references with structural sharing.
  History byte accounting is approximate. Assets referenced by Undo/redo stay alive.
- `src/etch/events.js` dispatches detached post-transaction payloads. Listener failures
  do not interrupt other listeners; reentrant mutations wait for the event batch.
  Destruction stops the remaining notification batch, rejects queued async work with
  CANCELLED, and disposes queued owned resources. Never drop promise continuations.
  Async session operations use promise-aware deferral (including fullscreen).
- `src/etch/fullscreen.js` owns native/fallback expansion of the existing root, page
  isolation/focus/scroll restoration and pending transition teardown. Fullscreen is
  session view state, never a content edit; preserve zoom/world center and cancel wet
  gestures. Fallback uses fixed positioning plus manual popover top-layer placement
  when available, retaining DOM ancestry and inherited themes. Touch-capable devices
  use in-page expansion rather than native fullscreen; lock HTML/body overscroll and
  pin the touch body at its saved offset, restoring exact styles/priorities on exit.
- `src/etch/input/gesture-guard.js` owns local touch/Safari gesture containment: canvas stays
  custom, UI scrollports work internally without boundary chaining, native forms remain
  usable. No document-wide touch suppression; teardown removes every listener.
- `src/etch/input/controller.js` owns content gestures or navigation, not both. Tool
  sessions live in `src/etch/tools.js`; tool-specific input modules produce proposals.
- `src/etch/rendering/{canvas,scheduler}.js` own two retained viewport canvases and one
  coalesced frame queue. `src/etch/ui/shell.js` owns controls, dialogs and DOM overlays.
- `src/etch/native-import.js` plans single-layer insertion; `src/etch/assets.js` owns decoded
  resources. Raster input/encoding lives in `src/etch/raster.js` and `src/etch/image-import.js`.
- `src/etch/svg-import.js` runs bounded input reading and the mandatory `src/etch/import/`
  pipeline. `src/etch/export-bounds.js` shares PNG/SVG crop rules; their serializers and
  resource lifecycles remain separate in `src/etch/png-export.js` and `src/etch/svg-export.js`.
- `src/etch/background.js` shares native paper validation, presets and world-space grid
  rules. Background accepts legacy null/hex or `{type:'dots'|'graph'|'ruled'|'engineering',
  spacing:8..128}` (integer). Paper is saved content behind artwork, not a layer;
  preserve Undo, world-origin phase and theme independence. Canvas/PNG enumerates
  bounded bands/dot intersections without raster tiles; SVG writes one crop-aligned
  vector pattern.
  Off-white is the existing solid `#FAF8F2` representation, not a new native type.
  Paper SVG export does not broaden editable SVG import; native JSON is the backup.
  Older readers reject paper objects rather than silently dropping appearance.

Content, active layer, selection, tool preferences, sidebar and view are independent.
Session changes do not dirty the document or enter history. Revisions are opaque,
session-unique tokens, not persisted IDs. Host code owns persistence and must serialize
or conditionally apply writes; revision comparison alone only protects a saved indicator.

Load validates/decodes into temporary state and replaces atomically with clean history.
It emits `load`, not `change`; failure preserves committed content/history/revision.
Latest load wins. Durable edits reject `BUSY` during load/import, while committed data
remains saveable/exportable. Read-only permits load/save/export/navigation/session
selection but blocks durable edits and Undo/redo.

Gesture previews use immutable baselines and full destination validation. Save/export
never include wet content. Cancellation, stale baselines and limit failures discard the
whole proposal, not a truncated gesture. One successful gesture is one history command.
Ordinary artwork Undo must not overwrite a later active-layer session choice; record
active-layer transitions only for commands that change it.

Validation reuses raster inspection only for unchanged frozen canonical assets minted
by the validator; caller-frozen objects alone are not trusted. Recheck dimensions,
IDs and aggregate limits on every destination. Exact JSON accounting serializes the
envelope with empty asset data and adds validated ASCII base64 lengths, avoiding
large image-byte copies per preview. Do not replace this with approximate byte counts.

## Geometry and input constraints

Use shared geometry for validation, bounds, Canvas, hits and export. Do not introduce
renderer-specific smoothing. Pen pressure is filtered once on input; persisted pressure
is interpolated, never filtered again. Capture meaningful coalesced/release samples,
not one sample per animation frame. Mouse/finger pressure remains constant.

Pointer/world math uses CSS pixels and view zoom, never DPR. Layer offsets are
translation-only; elements retain full affine matrices. Move Layer changes only its
offset. Clockwise 90° layer/selection buttons compose element matrices around combined
painted bounds (not padded interaction bounds), preserving layer offsets. Each click
is one command; no image re-encoding or automatic Fit. Free-angle/two-finger artwork
transformation is deferred; two fingers remain viewport navigation.
Selection transforms preserve local geometry, painter order and exact image
bytes. Resize derives each preview from the original bounds/matrices, not accumulated
preview scales. Thin selection padding is interaction-only, not stored geometry.

Whole-object hits use painted geometry, including holes and affine strokes, supplemented
by exact Canvas membership. Images deliberately hit their entire transformed rectangle,
including transparent pixels. Sweep every consecutive sample; endpoint-only tests miss
fast movement. Explicit pointer-capture checks prevent delayed capture-loss events from
committing a cancelled gesture.

New editor sessions default to Partial erasing (`{radius:10,mode:'partial'}`). Whole
object remains an explicit session choice and persists across tool switches.

Partial mode cuts native lines, Pen strokes and resulting `ink`; it leaves general
paths, filled shapes and images untouched. Never substitute whole-object erasure or
pixel `destination-out` for unsupported cutting.

- Lines retain editable fragments; retract new round/square caps so they cannot bridge
  cut gaps. First survivor keeps the original ID; additional IDs stay stable in previews.
- Pen cutting subtracts from the shared pressure outline, never cuts samples and
  re-smooths. Untouched curves remain verbatim; intersected curves flatten at 0.02 CSS px.
- Native `ink` stores opaque convex outline parts. Pressure appearance is baked into
  geometry, not a new editable sample sequence. Unknown-type rejection in old readers
  prevents erased ink from reappearing. Undo restores the original sampled stroke.
- Both cutters share bounded geometry/work/output budgets. Splitting can increase
  stored commands and fail combined limits even when the original stroke fits.
- Regrouping unchanged commands into separate Canvas paths can slightly change edge
  antialiasing; this does not permit changing surviving geometry.

See README and SPEC for exact schema/limit values rather than duplicating them here.

## Rendering and resource ownership

Paint bottom-to-top with explicit DPR × view × layer × element transforms. Virtual
previews replace content at its original painter position, beneath upper layers/images.
Selection outlines, resize handles and eraser cursors are DOM UI, never artwork/export.

The bounded local Path2D cache uses immutable identity. View/DPR changes do not require
rebuilding local paths. Wet paths must not evict committed cache entries. Preview
failure restores committed pixels before reporting the error. Zero-size mounts retain
no backing pixels; oversized backing canvases fail before allocation and can recover.

`src/etch/geometry/paths.js` weakly memoizes local and visible/all-document bounds only
for deeply frozen plain-data trees, returning detached bounds. Mutable/shallow-frozen
or accessor inputs recalculate; layer offsets and element transforms still apply
freshly. Do not broaden eligibility to shallow identity checks.

Current/Undo/redo assets and transient native-load/import/PNG surfaces share resource
allowances. Reserve before allocation. Cancelled browser decodes/encodes may still own
pixels: keep their leases until the underlying work settles and resources close.
Atomic replacement can conservatively reject a document that fits by itself because
old and new resources coexist. Do not weaken peak budgets to bypass that rejection.
Asset transfer checks all collisions before changing ownership; late async results
must not install content or cancel a newer operation after load/cancel/destroy.

PNG captures committed pixels/revision before async encoding and owns independent jobs;
`cancel()` does not cancel PNG, but destroy does. SVG synchronously serializes committed
native data without decoder/canvas/pixel reservations. Returned SVG strings survive
later edits/load/destroy. SVG crops clip, not redact: complete embedded image bytes and
out-of-crop geometry can remain. Native JSON is the lossless editing backup.

## Import invariants

Native JSON UI and SVG file reads share `src/etch/text-input.js`: canonical Blob size/stream,
preflight plus streaming byte caps, fatal UTF-8 decoding, abort and reader-lock cleanup.
Native/image PNG preflight rejects duplicate IHDR headers before browser decoding.

Native import validates the entire source, including omitted hidden/unused content,
then copies visible layers into one editable layer. Regenerate IDs against source,
destination and retained history; preserve painter order and exact referenced raster
bytes. Source background/hidden layers are omitted with warnings. Capture insertion
target and viewport center before async work; navigation cannot change placement.
No automatic Fit, silent scaling, image recompression or raster flattening of vectors.

SVG import must run bounded UTF-8 reading → full-tree XML/security → visibility/style
→ coordinates/path/native geometry → native validation → destination/history planning
→ atomic insertion. Internal stages are not public bypasses or general sanitizers.

- Security checks precede omissions, including hidden, unused, metadata and unsupported
  content. Never attach, render, decode or persist source XML. Host sanitizers cannot
  replace Etch-owned policy, appearance checks or resource limits.
- Post-parse XML node/work caps do not bound DOMParser peak allocation; the pre-parse
  byte cap is a separate mandatory protection.
- Defer unsupported appearance decisions until computed visibility where safe.
  Hidden groups can have visible descendants; hidden `use` is not necessarily empty.
  Filters/markers may generate paint and cannot use simple empty-geometry exemptions.
- Root attribute transforms require both original root-clip and final viewport checks;
  otherwise source-clipped paint can be resurrected. Arc approximation must also bound
  error in pre-root space. Never silently crop, clamp or drop unsupported appearance.
- Pass remaining aggregate native point/derived budgets into each path conversion
  before allocating output. Per-path limits are not whole-document validation.
- Strict standalone XML inspection is narrower than the public visibility-aware
  pipeline. CSS syntax checks are not security or native-eligibility checks.
- Curved-stroke bounds and numeric guards are conservative and can reject valid-looking
  artwork. Supported features and exclusions are documented in README/SPEC.
- Safe SVG image fallback is post-v1 scope. Its design/boundary review is in
  `etch-svg-fallback-audit.md`; future implementation still needs a separate security
  review. It cannot bypass rejected security or reuse vector-only font omission
  policy. Unsupported artwork gets external-PNG guidance.

Raster imports use bounded headers/container checks before browser decoding. Safe still
PNG selected as PNG retains original bytes/metadata; conversions use browser codecs.
Successful decoding is not a strict PNG bitstream audit; browser corruption tolerance
varies. Preserve `examples/etch/coloring.webp` and `examples/etch/note.jpeg`; they are source assets.
The image dialog automatically retries PNG only on the specific unsupported-WebP
encoder error and remembers PNG for the session. The API remains strict about
requested format; do not swallow unrelated errors or retry canceled/stale sessions.

## UI and theme maintenance

The contextual quick-controls row starts collapsed and opens on Pen/Highlighter/Eraser/Shapes
button selection or tool keyboard shortcuts (even for the active tool). Clicking the
active tool button toggles only the row. Tools without quick controls and programmatic
tool changes close it; canvas interaction never dismisses it. `shell.selectTool` owns
explicit UI activation; keyboard input routes through it. Share ToolSession settings
with the sidebar, keep visibility independent, retain 40 px targets/horizontal scrolling,
and use shared Pen outline geometry for both UI-only previews. Pen's pressure-width
preference defaults true; off bypasses filtering and stores full-width samples with
the existing `stroke.pressure:false` representation. Settings snapshot per gesture.

Highlighter (K) is implemented with independent color/width/opacity (default yellow
#FDE047, 20 world units, 0.35), always constant width. Native `highlight` is a distinct
unknown-type-rejecting schema extension with sampled points, pressure:false and opacity
[0.05,1]. Use shared stroke outline/bounds/hits; fill the whole nonzero outline ONCE
at its opacity (normal source-over). Self-overlap never compounds alpha; independent
strokes do. Canvas resets alpha per element; SVG exports one path with opacity. Native
load/import/history/Merge Down/selection preserve it. Partial leaves it intact; Whole
Object erases it. Do not route it through opaque ink cutting or broaden SVG import.

At minimum height with quick controls open, Layers header/actions may scroll with
Layers so properties retain a usable scrollport. Both sections remain independently
scrollable; collapsing disclosures must keep reopen headers reachable.

Shapes → Arrow (A) uses independent stroke/width preferences and Line-style Shift
snapping/minimum length. It saves an ordinary five-command native `path` with a
single-ended open head, not a new native type or marker. Shared path geometry owns
bounds/hits/transforms/Canvas/exports; do not special-case arrowheads in renderers.
Head length is min(shaft length, max(12, 4 × width)); perpendicular half-width is half
that length. Commands consume stored/derived budgets. Partial erasing leaves Arrow
intact like other paths; Whole Object removes it. There is no endpoint editor.

Document background lives in the primary toolbar's Document group, independent of
sidebar visibility; its dialog must return focus to that button even with the sidebar
closed. Valid background drafts preview through a document-identity-gated renderer
background override on the existing live canvas; committed data/pixels, saves/exports,
revision/history remain untouched. Invalid drafts, Cancel/Escape/API cancel, stale
content/load/import and teardown clear the override. Apply is still one content edit.
SVG import remains in the Layers heading with a file/code-brackets icon.

Keep compact tool selection separate from contextual properties below Layers. Settings
persist per tool during the session and never change the active layer. Shared finger
controls use one preference, default on. An explicit off survives tool switches;
never force it back on when Pen is selected. Embedded sidebar defaults collapsed;
demo opts into open.
Layer lists and properties scroll independently, including at 320×240. Dialog shortcuts
must not edit underlying content; preserve row-specific F2 targeting and focus return.
Suppress native copy/selection callouts on the artwork surface, not text controls,
dialogs or the host page. Safari-specific CSS is intentional.

README's Compact editor UI section describes controls; SPEC §3.1 defines their
contract. Maintain independent Layers/properties disclosures, tool settings and
sidebar visibility. Pen preview must use shared artwork geometry and remain UI-only.
Narrow toolbars scroll rather than shrinking targets; keep the sidebar toggle fixed.
`src/etch/ui/sidebar-resize.js` owns the session-only divider preference,
capture/cancellation, keyboard limits/reset and
observer teardown. Default width is 240 px, normally clamped to 200–400 and further
adapted to the mount; preserve the requested width across temporary narrowing.
Status uses committed shared default export bounds (including padding), not wet content
or view bounds. Save status remains host-owned, never inferred by the shell. Empty-state
image drops reuse the bounded preview/confirmation import transaction; shortcuts must
not start artwork gestures or replace the document. Presentation state stays session-only.
Keep the properties disclosure in place when collapsing its body; do not grow Layers
to fill the sidebar as a side effect or clip the reopen header on minimum-height cards.
Document identity gates empty-state bounds, export metrics and the accessible summary.
Layer rows are retained for session-only refreshes; active indication updates in place.
Content or busy-state changes use the existing row rebuild/focus-restoration path.
Keep dynamic controls/dialog guards current even when document-derived work is skipped.

Etch independently implements `data-lightmetal-theme="auto|light|dark"` with inherited
`--lightmetal-color-scheme`, `color-scheme` and `light-dark()`. Nearest mode wins; nested
`auto` follows the system. No Lightmetal stylesheet, `.lightmetal` class or runtime
adapter is required. Frames need their own setting. Inherited `--etch-*` overrides win;
`--etch-panel` can separate chrome from surface. Theme never recolors native artwork.
White default paper in both modes keeps dark ink readable; CSS paper is not exported.

## Verification and development

Use [the guide](Etch.md#development-and-embedding) and `package.json` for
commands. Browser tests own loopback ephemeral servers and cap workers at four
for an observed Node 26 worker crash; this is a workaround, not a runtime fix.
The demo uses tracked bundles: rebuild after source changes, then refresh.
`npm run dev` binds to 0.0.0.0:5000 by default; use HOST=127.0.0.1 for local-only
access. Download native JSON before refreshing unsaved in-memory artwork.

Chromium CDP and constructed stylus/touch events are synthetic, not hardware acceptance. Firefox omits
Chromium-only CDP cases. SVG pixel oracles are browser comparisons, not formal
security, floating-point or universal compatibility proofs. The current benchmark
measures pure validation/bounds, not interactive preview latency.
Manual assistive-technology, real-device and security acceptance remain open.
Formal performance baselining is deferred by agreement (SPEC §14.4); investigate
user-visible problems on modern hardware, not ancient-device support. Keep resource
limits/cancellation tests.

Fixtures must be independently authored/generated. Reference implementations are not
runtime/test dependencies or test oracles. SPEC section 2 retains research provenance;
this is not a separated-team clean-room claim. The sibling highlighter project is only
an organizational reference, not a dependency.
