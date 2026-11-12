# Etch — future work beyond v1

Text and general vector opacity are **not v1 requirements** and must not appear
as inert buttons or controls. Highlighter has been implemented as an explicit
user-requested extension (see README/SPEC), not a generic vector-opacity feature. Broader partial cutting and formal performance
baselining are also deferred; resource-limit correctness remains required (SPEC §14.4).
See specs/etch-spec.md for the native schema/rendering contract.

## Safe SVG image fallback

Explicitly deferred beyond v1 by agreement. Keep the current restricted editable
SVG importer and external-PNG guidance for unsupported artwork; no automatic
rasterization or inert image-mode controls. The planned profile is retained in
SPEC §6.4 and the design/boundary audit in `etch-svg-fallback-audit.md`. Any future
implementation requires a separate reconstructing allowlist and security review;
the audit is not certification and vector-only omission policies cannot be reused.

## Text tool

- Text placement/editing, with contextual font family, font size, color, bold and
  italic controls in the sidebar.
- Define a native text representation, font availability/fallback behavior, bounds,
  selection/resize, undo/redo, persistence and PNG/SVG export before enabling it.
- Keep this separate from SVG text rasterization in the existing safe-image fallback
  plan; that fallback does not imply editable native text support.

## Highlighter follow-ups

The implemented Highlighter has independent color/width/opacity, constant width,
per-stroke source-over compositing, native `highlight` persistence and Canvas/PNG/SVG
parity. Pen also has a pressure-width toggle. Neither changes existing opaque paints.
Future partial cutting of translucent highlights needs a separate native/geometry/
compositing design; do not reuse opaque ink fragments and lose opacity. Real-device
and assistive-technology acceptance remains open.

## Vector opacity/transparency

- General Pen/shape opacity and any future object properties remain deferred.
  Highlighter's dedicated opacity is implemented; layer opacity is not implied.
- Specify per-element versus per-stroke/group compositing semantics, overlap
  behavior, validation limits, native schema compatibility/migration, SVG import,
  export and Merge Down behavior before changing the opaque vector model.
- Preserve alpha in raster PNG assets today; it is already supported and does not
  require general vector opacity.

## Free-angle and two-finger artwork transformation

Clockwise 90° buttons for layers and selected objects are implemented. Arbitrary
rotation and two-finger artwork translation/rotation are deferred nice-to-haves.

- Existing element affine matrices can represent arbitrary rotation without image
  recompression or a new layer-transform field.
- Design an explicit transform mode for an unlocked, visible layer or selection;
  merely unlocking a layer must not repurpose two-finger viewport navigation.
- Define gesture ownership, pivot, translation/rotation composition, finger changes,
  cancellation and a single Undo command per completed gesture. Derive previews from
  captured original matrices, not accumulated intermediate transforms.
- Preserve full destination validation, exact asset bytes, painted bounds/hit testing,
  native round trips and PNG/SVG output. Verify on real touch devices as well as
  automated tests before treating the gesture as supported.

## Partial erasing beyond Pen and straight lines

Partial mode supports native straight `line`, freehand Pen `stroke`, and resulting
vector `ink` objects, alongside Whole Object mode.
It preserves surviving pressure-shaped outlines without re-smoothing. General paths,
filled shapes and images remain deliberately untouched in Partial mode.

- Define filled-shape/general-path cutting with concavity, winding/holes, strokes,
  native representation, bounds/hit testing, identities, repeated cuts and budgets.
- Transparent images need explicit clipping/pixel rules and asset/history ownership.
- PNG and SVG export support native ink, including cut gaps. Future cutting additions
  must update every implemented output. Do not fake unsupported cuts with whole-object fallback
  or destination-out.

## Shared UI expectations when these tools become functional

- Tool selection belongs in the compact icon toolbar; granular settings belong
  below the Layers section of the expanded sidebar. Respect both disclosures and
  independently scrolling section bodies.
- Contextual controls must do real work and update immediately with the active tool.
- Keep active tool, active layer, sidebar visibility, per-tool session settings and
  document/history independent. Switching tools must not select a different layer.
- Retain each tool's settings during the editing session, including while the
  sidebar is collapsed. Reuse existing supported settings; do not create competing
  copies of durable object properties.
- Test settings retention, correct layer targeting, undo/redo, native round trips,
  rendering/export consistency and accessibility before exposing the tools.

## Shared semantic theme tokens

Optional suite-level follow-up: publish inherited palette tokens on a common
wrapper so sister utilities can share a skin without shared stylesheets or JavaScript.
Candidate roles: surface, panel, primary/muted text, border, accent/focus, hover and
selected background. Proposed `--lightmetal-ui-*` names are not an existing API.

Component overrides should win, then suite tokens, then standalone defaults; avoid
component-local defaults shadowing inherited tokens. Keep skin orthogonal to the
existing light/dark contract. Share visual roles, not layout rules, with no mandatory
theme framework or shared dependency.

## Performance investigations

These broader optimizations are **tabled as future nice-to-haves**. Raster inspection
reuse and exact JSON counting without copying asset data are implemented in
`src/etch/validation.js`; do not confuse them with incremental geometry/UI validation.
Revisit broader caching only if a user-visible problem on representative modern hardware
warrants it. Formal timing infrastructure and ancient-device support are out of scope
for current work; SPEC §14.4 records this approved deviation.

### Full-document preview validation

- **Location/evidence:** `src/etch/state.js` gesture destination methods validate the full
  destination during previews; `#commit()` validates again before committing.
- **Possible improvement:** reuse expensive computations for editor-owned immutable
  geometry before considering incremental aggregate accounting. Bounds reuse is
  implemented; derived-geometry validation still revisits existing elements.
- **Risk:** stale accounting could weaken combined resource limits, baseline checks
  or atomicity. Repeated validation is not established cruft: preserve input
  canonicalization and full destination checks unless an equivalent is proven.
- **Verification:** measure preview latency and derived work; retain limit-boundary,
  cancellation, stale-baseline, committed-only snapshot and Undo/redo coverage.

### Keyed layer rows across content changes

- **Location:** `src/etch/ui/shell.js`, `refresh()`, reuses document-derived text and rows
  on session-only changes. Content changes rebuild rows and restore focused controls;
  busy transitions rebuild disabled controls without recalculating document summaries.
- **Possible improvement:** consider keyed rows across content changes only if measured
  row/layout costs justify additional lifecycle complexity.
- **Risk:** keyed/incremental updates complicate listener ownership, focus restoration,
  modal targeting and teardown; a broader UI rewrite is not justified by file size.
- **Verification:** measure refresh cost with large layer lists; preserve keyboard/F2
  behavior, active-row focus, dialogs, accessibility text, responsive layout and destroy
  cleanup in Chromium/Firefox, with manual accessibility checks where applicable.

## Optional cleanup investigations

These are **nice-to-haves, not established cruft or required refactors**. Leave
existing behavior intact unless a scoped investigation demonstrates a simpler
replacement. Full-document validation is covered above.

### Import-session lifecycle duplication

- **Location:** image/native/SVG session coordination in `src/etch/index.js`,
  `src/etch/state.js` and `src/etch/ui/shell.js`.
- **Possible improvement:** consolidate genuinely identical lifecycle steps, without
  forcing the distinct preparation, preview and confirmation flows into one abstraction.
- **Risk:** cancellation, late async results, atomic insertion and decoded-resource/
  pixel-reservation ownership differ between flows. Preserve their timing and cleanup
  contracts; do not merely relocate complexity.
- **Verification:** retain failure, cancellation, supersession, destroy, resource-budget
  and committed-only snapshot coverage for each import type.

### Further test-suite consolidation

- **Possible improvement:** map overlapping assertions and consolidate tests only where
  the replacement demonstrably preserves their distinct scenarios and contracts.
- **Risk:** similarly named Node/browser suites often protect different boundaries:
  pure geometry/state versus browser pixels, pointer input and resource lifetimes.
  Test count or file count alone is not evidence of redundancy.
- **Verification:** preserve meaningful assertions, security/limit cases and browser
  coverage; run affected suites and the full Node/Chromium suites after consolidation,
  plus Firefox for changed cross-browser test infrastructure.

No delivery order or schedule is implied. See etch-verification.md for
remaining v1 work and Etch.md for implemented workflows.
