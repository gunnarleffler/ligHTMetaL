# ligHTMetaL::Etch — Leave your mark.

## Suite integration status

This document preserves Etch's original feature and native-format contract.
Its original repository layout, package name, development commands, and device
acceptance targets are historical. They do not override the suite's policies.
Use [the Etch guide](../Etch.md) for current paths, builds, and test commands.
Use [the suite release policy](../releasing.md) for required validation scope.
Native Safari, real-device input, and assistive-technology checks remain unverified;
this migration makes no v1-completion or compatibility claim.

## 1. Purpose and status

Etch is a small browser-based sketch editor for attachments in the Lightmetal note
app. Do the useful things well: draw, correct, arrange, layer, and save sketches.
It is not a whiteboard platform or a general-purpose SVG editor.

**This document records the v1 implementation contract.** [The guide](../Etch.md)
describes implemented workflows/API; [verification notes](../etch-verification.md)
track remaining acceptance and current verification. Requirements are not evidence of completed acceptance.

MUST/MUST NOT describe acceptance requirements. SHOULD describes a preferred
implementation that may change if an equivalent approach is documented and tested.
Sections marked “design choice” resolve unspecified behavior for the implementer;
they are not claims about reference behavior or direct quotations of user requests.

### 1.1 Confirmed requirements

- Sketches are attachments opened in an editor, not inline note blocks.
- The editor fits a bounded card and can expand to fullscreen.
- Select, move, and resize existing marks in v1.
- Create layers; import Etch documents, SVG, and raster images as layers; move whole
  layers; restrict editing to the active layer; merge layers.
- Include a native vector path element and useful, non-exotic SVG import.
- Host-owned persistence through load/save and change events.
- Detailed implementation guidance based on independent synthesis of references.

### 1.2 Technical direction and defaults

Design choices: plain JavaScript ES modules and CSS; no framework, runtime drawing
library, mandatory build step, production backend, or remote service. Use JSDoc for
public contracts. Include a local demo HTTP server as development tooling (section
13.3); file:// is not a supported module-loading environment.

The card is a bounded **viewport**, not a fixed-size page. The document is an
unbounded plane, limited by numeric/resource safeguards. Fullscreen changes the
viewport, not the document. Fixed page boundaries are deferred.

Runtime support: current and previous stable desktop Chromium, Firefox, and Safari;
current iOS Safari and Android Chrome. Feature-detect optional APIs. Basic editing
must work without browser Fullscreen API or coalesced pointer events.

### 1.3 Included / excluded

Included: pen with optional pressure width, highlighter, line, arrow (native path), rectangle, ellipse, native paths, image elements,
object eraser, partial Pen/straight-line eraser, single/multiple selection, move/resize, pan/zoom, layer controls,
undo/redo, native JSON persistence, SVG/PNG export, native/SVG/image import.

Excluded: collaboration, CRDTs, connectors/bindings, text tool,
general vector opacity/transparency, SVG node editing, rotation handles, skew
controls, lasso, partial general-path/filled-shape/pixel erasing, shape recognition, animated content,
plugins, arbitrary CSS/SVG rendering, localStorage autosave, attachment storage UI,
and note-app implementation. Partial erasure of native straight lines and freehand
Pen strokes is in scope, including native vector ink fragments; general paths,
filled shapes and raster/pixel erasing remain excluded. Safe SVG image fallback
is deferred beyond v1 (section 6.4).

Text and general vector opacity/transparency remain future work in FUTURE_WORK.md.
Highlighter is now an explicit user-requested extension with its own native type,
not a broadening of opaque Pen/shape paints or the restricted editable SVG importer.
Do not expose nonfunctional tool buttons or configuration controls.

No runtime dependency on the research packages in package.json. Do not ship their
bundles or copy implementation code. This is an independent implementation informed
by source/API analysis, not a claim of a strict separated-team clean-room process.

## 2. Reference synthesis and evidence

Research used literallycanvas 0.5.2, js-draw 1.33.x, and Excalidraw 0.18.1.
These analysis-only packages were removed when implementation began; the current
package-lock.json records development tooling, not the former research installs.

| Reference | Adopted principle | Deliberately not adopted |
|---|---|---|
| Literally Canvas | Simple shape snapshots; action-based undo; committed/live rendering separation | CoffeeScript/legacy event plumbing; destination-out erasing; mixed UI/document snapshots |
| js-draw | Pointer Events/capture; wet/dry ink; command labels; shared vector geometry for render/export; transform-based selection | Block cache; advanced fitter/stabilizer; broad SVG editor; unstable component JSON as durable format |
| Excalidraw | Plain typed elements; versioned JSON; host callbacks; object eraser; transient interaction separate from document | React/rough.js; collaboration structures; extensive app state; bindings/frames |

Historical evidence locations under the research install's node_modules/
(not present in the implementation dependency tree):

- literallycanvas/src/core/LiterallyCanvas.coffee: getSnapshot/loadSnapshot,
  drawingChange, execute/undo/redo; src/core/shapes.coffee: per-shape serialization;
  src/core/actions.coffee: add/move/clear actions; src/core/canvasRenderer.coffee:
  committed rendering; src/tools/Pencil.coffee: incremental input/smoothing.
- js-draw/dist/mjs/Editor.mjs: toSVG/toSVGAsync/loadFrom/loadFromSVG/toDataURL;
  UndoRedoHistory.mjs; Viewport.mjs; Pointer.mjs; rendering/Display.mjs;
  components/util/StrokeSmoother.mjs; tools/SelectionTool/Selection.mjs and
  SelectionBuilders/RectSelectionBuilder.mjs; components/ImageComponent.mjs.
- js-draw/dist/mjs/components/AbstractComponent.mjs: JSON serialization exists,
  but explicitly has no stable representation guarantee across minor versions.
- @excalidraw/excalidraw/dist/types/excalidraw/: types.d.ts (embedding API),
  data/types.d.ts, data/json.d.ts, data/restore.d.ts, element/types.d.ts,
  element/resizeElements.d.ts; rendering observations also used bundle inspection.
  Type declarations establish API shape, not full internal behavior.

Important distinctions verified during research:

- Literally Canvas loads shapes through actions; do not assume its load creates
  a clean no-history baseline. Etch intentionally specifies different semantics.
- js-draw's public persistence emphasizes SVG; its loader adds components to the
  current image. Etch distinguishes replace-document load from undoable import.
- js-draw warns edits during async SVG export may yield inconsistent output.
  Etch exports an immutable snapshot instead.
- Excalidraw exports elements, filtered app state, and binary files in a versioned
  envelope; its imperative onChange subscription returns an unsubscribe function.
- Midpoint quadratic smoothing and a native layer model below are Etch design
  choices, not copied implementations or claims that a reference uses this model.

## 3. User interface and interaction contract

### 3.1 Editor shell

One root component with a compact top toolbar, drawing viewport, collapsible right
sidebar, and status area. Minimum useful card size: 320 x 240 CSS px. Maximize canvas
space with a OneNote-inspired layout. Use scoped CSS custom properties for colors,
spacing, borders and focus indicators, with light/dark defaults and host overrides.

Adopt the suite's CSS-only `data-lightmetal-theme="auto|light|dark"` contract on
an ancestor, mount container or component root. Use inherited
`--lightmetal-color-scheme`, native `color-scheme` and `light-dark()` palettes.
Nearest attribute wins; nested auto resets a pin to live system preference. Without
a setting, follow the system. Include the tiny mode declarations in etch.css so it
works without any other suite CSS/JS or theme adapter. Preserve public `--etch-*`
overrides and align base UI colors with Lightmetal; shared skin palettes are a
separate future proposal, not a dependency or automatic skin support. The common
namespaced attribute rules are intentionally shared; component selectors remain
scoped to Etch. Require modern CSS light-dark() support, matching Lightmetal.

Theme changes are presentation only: do not rewrite native mark colors/background,
history, selection or revision or emit content changes. `--etch-canvas` is the CSS
viewport backdrop, not the durable document/export background. Default paper stays
white in both modes so existing dark ink remains readable without recoloring marks;
a non-null document background paints over it. Hosts may deliberately override paper
and empty-help-text color (`--etch-paper-ink`) while preserving native colors. Frames require
their own host-provided theme setting because CSS does not inherit across documents.

Toolbar: compact icon buttons with accessible labels, tooltips, visible focus and
active-tool states. Separate History, Navigation, Drawing, Document, View and Zoom groups;
include keyboard shortcuts in tooltips. On narrow cards, scroll the toolbar rather
than shrinking targets; keep the sidebar toggle fixed at the far right.
Shapes is a split button: the main icon activates the last-used line/arrow/rectangle/ellipse,
and the chevron opens the chooser. Selecting a shape updates the icon and retains
the choice for the session. Support Arrow keys, Home/End and Enter in the chooser;
Escape closes it and returns focus without closing fullscreen/sidebar.
Only expose functional actions. Keep detailed settings in the sidebar; do not add
inert Text/general-vector-opacity controls or unrelated brush/effect panels.

Sidebar: embedded default collapsed and completely hidden, with the viewport using the
freed space. Constructor option `sidebarOpen:true` starts it expanded without autofocus;
the demo uses this option. Default width is 240 CSS px, resizable from 200–400 where
space permits, with further clamping to the mount. An inherited `--etch-sidebar-width`
can set the initial width; user resizing takes precedence. Drag the left divider or
use Left/Right (10 px; Shift: 50), Home/End for limits, and Enter/double-click to reset.
Escape, pointer cancellation/capture loss, blur or mount resize cancels an unfinished
drag. Retain the requested width across collapse/reopen and temporary narrowing.
On desktop it occupies its own column; in narrow cards/tablet/mobile it is an overlay
drawer, dismissible by the toggle, Escape or an outside scrim. The responsive threshold is 700 CSS px
of editor width (implementation default, not document geometry). Sidebar state is
per-editor session UI, not durable data/history; tool or layer changes must not
reset it. Never destroy/recreate the viewport/canvases or alter saved coordinates
when changing layout. Renderer resize handling preserves world center/zoom as in
section 9.2.

The expanded sidebar has vertically stacked sections:

- **Layers at the top**, with an independent disclosure: active indication, name,
  visible/locked toggles, New, Import image, Delete, Move Up/Down and Merge Down as implemented.
  Show topmost first although native order remains bottom-to-top. The layer list
  scrolls independently without scrolling the drawing surface or toolbar. The
  Layers header remains available when its list/actions are collapsed.
- **Contextual Tool Properties below Layers**, updated immediately for the active
  functional tool. Pen: synchronized width slider/numeric field, color and a
  constant-pressure stroke preview using shared artwork geometry; Eraser: mode/size;
  Shapes: type, stroke width, border/fill color (including no fill);
  Selection: supported selected-object
  properties only. Hand/Pan and other tools without properties may hide this section
  or show a minimal message. Move Layer shows the active target name/instructions and
  the shared finger preference (labeled Move with finger).
  Highlighter has independent color/width/opacity controls and constant stylus width.
  Pen has a Pressure width checkbox (default on) synchronized with quick controls.
  Text typography and general vector opacity controls remain deferred to FUTURE_WORK.md.

Properties have a separate disclosure and scrolling body. Collapsing either section
retains settings and does not collapse the other. Keep the properties header in place
and reachable in short cards; do not grow Layers as a side effect of collapsing
properties. Disclosure state, sidebar width/visibility and tool preferences are
per-instance session UI, never native data/history or browser storage.

A contextual toolbar directly below the primary toolbar starts collapsed. Selecting
Pen, Eraser or Shapes via its tool button opens quick controls; clicking the active
tool button toggles them without deactivating it. Tool keyboard shortcuts open the
relevant controls even for the active tool. Switching to Hand, Select or Move Layer
closes the row; no inert controls are exposed. Programmatic tool changes do not
open the row. Canvas interaction does not dismiss it. Its visibility is independent
of the sidebar and settings persist while hidden. Both surfaces use the same
per-tool session settings, with immediate synchronization. Expose color swatches
(eight plus expandable extras/custom picker), width presets and a shared-geometry
Pen preview; Shapes add type/stroke/fill controls, Eraser adds size/mode presets.
Keep precise numeric inputs in the sidebar. Use a roughly 48 px row, 40 px targets,
horizontal overflow rather than shrinking controls, theme colors and reduced-motion
support. No new drawing tools or rendering behavior are introduced by this row.

Keep active tool, active layer, sidebar visibility, per-tool settings and committed
document/history separate. Tool changes never change the active layer. Each tool
retains its own session settings when switching away/back or collapsing the sidebar;
reuse existing supported settings rather than competing copies. Tool properties
apply to that tool, not the selected layer. Existing v1 style controls affect new
marks, except explicit supported selection actions. Selection exposes Delete;
node editing is not offered.

The 26 px status bar shows active tool/layer, zoom and committed default export
surface bounds, including normal padding. Use shared export bounds, not wet previews,
view bounds or a fixed document canvas; custom export options may differ. Narrow
cards prioritize context/metrics, with errors replacing them when needed. Keep
announcements available to assistive technology. Save/dirty status remains host-owned;
the editor must not infer or claim Saved.

The empty viewport says “Start drawing” and offers Import drawing / Import image.
Native drawing import inserts a layer through confirmation, not document replacement.
Dropping one PNG/JPEG/WebP file uses the existing bounded image preview/confirmation
transaction: no insertion before confirmation, Cancel preserves content, one Undo
restores an import. SVG/native drops are unsupported; use explicit import actions.
Read-only hides editing shortcuts and rejects drops. Hidden artwork gets guidance
to show a layer rather than a misleading new-document prompt.

Content is clipped to the viewport, not a permanent page. Saved dot/grid paper is
document content included in exports (section 5.1), distinct from the CSS viewport
backdrop, which is presentation only.

### 3.2 Selection and basic editing

Selection is restricted to the active visible unlocked layer. Hidden or locked
layers cannot receive edits, including import-into-existing-layer operations.
Selecting a layer in the panel is allowed even when locked/hidden; disable content
tools and explain why. New/imported layers are visible, unlocked, and active.

- Click/tap: topmost hit element in the active layer. Empty click clears selection.
- Shift-click: toggle a hit element in the selection.
- Drag empty space with Select: rectangular marquee; select elements whose painted
  bounds are fully contained. Shift-marquee adds to selection. No direction-based
  crossing mode in v1.
- Drag a selected hit element: move the selection, preserving element order.
  Drag an unselected hit element: select it and begin moving after threshold.
- The **Rotate clockwise 90°** toolbar action rotates the selection when nonempty,
  otherwise the active layer. Its tooltip identifies the target. Disable for
  read-only/busy or hidden/locked/empty active layers. It works with sidebar closed.
- **Rotate selection clockwise 90°** in Select properties rotates selected objects
  together around their combined painted center; each click is one undoable command.
  Empty selection is a no-op. Preserve selection, painter order and image bytes.
- Eight resize handles on the axis-aligned selection box; no rotation handles.
  Handles are 8 CSS px visually, with at least 16 CSS px hit areas (24 for touch).
- Dragging inside an empty part of a selection box does not move content: begin a
  new marquee. Handles take hit priority over elements.
- Delete/Backspace removes selected elements in one command.
- Escape cancels the active gesture, otherwise clears selection.
- All edits preserve z-order; selecting or moving does not bring content to front.

Moving/resizing multiple elements is one command. Do not select across layers.
Changing active layer clears selection. Reordering, hiding, locking, deleting, or
merging layers clears selection and cancels any relevant transient gesture.

### 3.3 Touch/pen and keyboard

Pen draws with pressure by default; its session pressure toggle can disable width
variation for new stylus strokes. Highlighter always uses constant width. Mouse pressure is constant; do not use the browser's
synthetic mouse pressure as meaningful pen pressure. Single-touch tool input defaults
on. One shared finger preference covers Pen/Shapes/Select/Eraser/Move Layer; an
explicit off choice survives tool switches and sidebar collapse for the session.
With it off, one finger pans; Hand always pans. Two fingers pan/zoom.
A second touch cancels an unfinished finger-drawing gesture
and starts navigation. Pen wins over incidental touch while a pen gesture is active;
do not cancel pen strokes because a palm appears. Navigation does not change the
viewport during an active pen stroke. Pen barrel-eraser input temporarily invokes
the eraser with its captured mode/radius when reliably reported; otherwise use the selected tool.
Suppress native selection/context callouts only on the artwork surface, with Safari
user-selection/touch-callout CSS and scoped contextmenu/selectstart prevention.
Controls and host-page text must retain native interactions.

Keyboard shortcuts apply only while focus is inside this editor and not in an input,
textarea, select, or contenteditable: V select; P/B pen; E eraser; L line; R rect;
O ellipse; M move layer; H hand; Space temporary hand; Ctrl/Cmd+Z undo; Ctrl/Cmd+Shift+Z redo;
Ctrl+Y redo; Delete selection; Ctrl/Cmd+A all elements in active editable layer;
+/- zoom; 0 fit; 1 100%; Escape cancel. Do not hijack browser save or global note-app
shortcuts. Layer actions are accessible via normal buttons, not mandatory shortcuts.

Shift constrains lines/arrows to 45-degree increments and rect/ellipse to square/circle.
Suppress text selection and native dragging only in the viewport. Space/middle-drag
panning must not interfere with text controls or page scrolling outside the editor.

## 4. Native document format, version 1

### 4.1 Envelope and ordering

Canonical native attachment MIME: application/vnd.lightmetal.etch+json; suggested
extension: .etch.json. JSON contains plain data only. All coordinates are world units
unless specified; initially 1 world unit corresponds to 1 CSS px at zoom 1.

```js
{
  format: "lightmetal-etch",
  version: 1,
  background: null, // transparent, opaque #RRGGBB, or {type:'dots'|'graph'|'ruled'|'engineering',spacing:24}
  layers: [        // first = bottom, last = top; at least one layer
    {
      id: "layer-id",
      name: "Layer 1",
      visible: true,
      locked: false,
      offset: [0, 0],
      elements: [] // first = bottom, last = top within this layer
    }
  ],
  assets: []      // referenced embedded PNG assets
}
```

Paper backgrounds are fresh whitelisted `{type,spacing}` data: type is `dots`, `graph`,
`ruled` or `engineering`; spacing is an integer in [8,128] world units. Public
setBackground rejects unknown keys; native validation discards extra keys. Preserve
legacy null/hex background representation. This is a native v1 extension: older
readers reject object backgrounds rather than silently losing paper appearance.

Layer IDs, element IDs, and asset IDs MUST be globally unique within the document.
Use opaque strings generated by crypto.randomUUID(), with a collision-resistant
fallback if unavailable. No fractional indexes, tombstones, classes, or functions.
Array order is authoritative. Layer names are plain text (1–80 characters).

Durable layer visibility/lock/name/order/background changes are content changes.
Active layer, selected IDs, tool settings, pan/zoom, and fullscreen are session UI
state and are not in this document. Locked visible layers still export normally.
A newly created or reset document starts with one visible unlocked layer. Users may
subsequently create multiple empty layers or hide/lock all layers; those are valid
saved states, although drawing tools then require an editable active layer.

### 4.2 Common element fields and transforms

Every element has `{id, type, transform}`. Transform is a Canvas/SVG affine matrix
`[a,b,c,d,e,f]`: `x' = a*x + c*y + e`, `y' = b*x + d*y + f`.
It maps element geometry coordinates into layer-local coordinates. The layer offset
then maps to world coordinates. Full affine transforms preserve imported SVG
appearance. The UI offers translation, axis-aligned resizing and clockwise 90°
rotation buttons; arbitrary rotation gestures remain deferred.

Do not repeatedly rewrite points during gestures. Preview a matrix composed with
the original element matrix; commit that matrix once. Translation-only layer offsets
keep whole-layer movement and merges simple. Geometry and styles remain immutable
once committed; commands replace objects rather than mutating shared snapshots.

### 4.3 Element types

```js
// Pen: points are [x, y, normalizedPressure]. At least one point.
{ id, type: "stroke", transform, points: [[10,20,0.5], [12,22,0.7]],
  color: "#112233", width: 3, pressure: true }

// Highlighter: shared sampled outline, filled ONCE at opacity. Constant width only.
{ id, type: "highlight", transform, points: [[10,20,1], [40,20,1]],
  color: "#FDE047", width: 20, pressure: false, opacity: 0.35 }

// Partially erased Pen: opaque union of closed, convex, positive-winding subpaths.
// Pressure-shaped appearance is baked into editable geometry, not re-smoothed samples.
{ id, type: "ink", transform, color: "#112233",
  parts: [[["M",0,0], ["L",10,0], ["L",10,5], ["L",0,5], ["Z"]]] }

// Basic shapes: non-negative dimensions; non-degenerate on commit.
{ id, type: "line", transform, start: [0,0], end: [50,30],
  stroke: "#112233", strokeWidth: 2, lineCap: "round" }
{ id, type: "rect", transform, x: 0, y: 0, width: 50, height: 30,
  fill: null, stroke: "#112233", strokeWidth: 2,
  lineJoin: "round", miterLimit: 4 }
{ id, type: "ellipse", transform, cx: 25, cy: 15, rx: 25, ry: 15,
  fill: null, stroke: "#112233", strokeWidth: 2 }

// Native vector path. Coordinates are absolute. Multiple subpaths are allowed.
{ id, type: "path", transform,
  commands: [["M",0,0], ["C",10,0,20,30,30,30], ["L",0,30], ["Z"]],
  fill: "#336699", fillRule: "nonzero", stroke: "#112233", strokeWidth: 2,
  lineCap: "butt", lineJoin: "miter", miterLimit: 4 }

// Positioned raster graphic, possibly produced by SVG image fallback.
{ id, type: "image", transform, assetId: "asset-id",
  x: 0, y: 0, width: 640, height: 480, alt: "Imported diagram" }
```

Path grammar: `M(x,y)`, `L(x,y)`, `Q(cx,cy,x,y)`,
`C(c1x,c1y,c2x,c2y,x,y)`, and `Z`; begin each subpath with M. No relative,
shorthand, or arc commands in persisted JSON. SVG import normalizes them.
After Z, require another M before further native commands (the SVG normalizer inserts
one at the current point if SVG continues drawing after closure). Never infer closure for
open stroked subpaths. Filled open subpaths have the normal SVG/Canvas implicit
closing edge for fill only.

Fill/stroke colors are null or canonical opaque #RRGGBB strings; stroke width is
positive when stroke is present, otherwise canonicalize to 0. Support nonzero and
evenodd fill rules, butt/round/square caps, miter/round/bevel joins, miterLimit >= 1.
At least fill or stroke is present for a painted vector element. General opacity,
transparent colors, and blend modes are excluded in v1; raster assets may contain
alpha. No rounded-rectangle UI or dash patterns in v1.

`highlight` is an explicit development-v1 extension. It shares stroke geometry,
point/derived budgets, bounds and hit tests but requires `pressure:false`, an opaque
color, positive native width, and finite opacity in [0.05,1]. Samples are canonicalized
to pressure 1. Tool widths use [0.5,64]. Older readers reject the unknown type rather
than ignoring an opacity attribute on `stroke` and silently making highlights opaque.
Fill the complete nonzero outline once at its opacity with normal source-over, not
per sample/subpath; self-overlap remains uniform while independent strokes compound.
Reset Canvas globalAlpha between elements, including images and opaque marks. SVG
writes one filled path with opacity; PNG uses the same Canvas scene. Layer order,
Merge Down, selection transforms, Undo and native import/load preserve opacity.
Partial Eraser leaves highlights unchanged; Whole Object Eraser removes them. No
transparent ink fragments, generic opacity fields, blend modes or SVG import expansion
are implied. Native JSON is the lossless backup if exported translucent SVG is rejected.

`ink` is an explicit user-requested extension of this development v1 schema. Earlier
native types remain unchanged. Older readers reject the unknown element type rather
than silently ignoring a mask field and restoring erased ink. An ink element has at
least one part and at most 20,000 parts (a fixed format safeguard). Each part is one
closed subpath: M, one or more L/Q/C, Z, with no inner M/Z. Its control polygon must
be convex with positive local winding and one total turn; reject concave/self-crossing
or degenerate parts. Render the union with nonzero fill and opaque color, no border.
Count ALL part commands against stored points/commands and derived limits. Trace exact
cubic primitives when retained; do not regenerate a sampled Pen stroke from its outline.

### 4.4 Assets

```js
{ id: "asset-id", mime: "image/webp", width: 640, height: 480,
  data: "BASE64_ENCODED_BYTES_WITHOUT_DATA_URL_PREFIX" } // image/png also supported
```

Native assets are still PNG or WebP. JPEG is accepted as import input, not stored as
native JPEG. At the user's request, default raster import encoding is WebP quality 0.8;
PNG lossless is the alternative. Use browser codecs only, no runtime dependency or
server upload. Preserve encoded bytes on save/reopen; never re-encode on each save.
Native WebP containers and PNG chunks must be non-animated, type/dimension-consistent
and structurally bounded before decoding; browser decode must still succeed. Older
PNG-only readers reject WebP MIME rather than silently changing the asset.
Dimensions are intrinsic integer pixels after browser-decoded orientation. Geometry
size is independent of intrinsic resolution.
No URLs, file handles, blobs, HTML, SVG markup, or ImageBitmap objects in JSON.
Render/export caches keep decoded resources outside the document. Export includes
only referenced assets. Keep removed assets alive internally while undo history
can restore references; release decoded resources when no document/history reference
remains. Undo must not resurrect missing image data.

### 4.5 Validation and limits

Use an explicit parser/validator that constructs fresh whitelisted objects. Do not
Object.assign untrusted data into application instances. Reject malformed data,
unknown element types, unsupported versions, duplicate IDs, missing assets,
non-finite numbers, invalid command arity/order, and singular transforms. Unknown
extra keys may be ignored, but never retain them as executable or unvalidated data.
No silent dropping of document elements during native load/import.

Default safety limits (configurable downwards by the host): 128 layers, 20,000
elements, 100,000 points/commands per element, 1,000,000 total points/commands,
64 assets, 64 MiB encoded raster file bytes in total (after base64 decoding, not pixel-buffer
memory), and 128 MiB native JSON UTF-8 input. Raster limits: max dimension 8192 and
max 16,777,216 pixels per asset, 33,554,432 pixels across assets. Inspect supported
raster headers for dimensions before decoding, then verify actual decoded dimensions
and MIME. Pixel-buffer memory is separately bounded by the pixel limits; account
for temporary copies and history-owned assets too. Also bound SVG input/nodes below.

Derived path work also has configurable-downward limits:
`derivedSegmentsPerElement` defaults to 500,000 and `derivedSegments` to 2,000,000
across the entire destination document, including hidden layers. Count normalized
path commands (including outline M/Z) as a conservative work budget; line/rectangle/
ellipse account for 2/5/4, images use the separately bounded raster resources.
Pressure-outline validation must stop at the remaining aggregate allowance without
retaining generated command arrays. A tiny stored input must not expand into
unbounded derived work by distributing expensive strokes across many elements.

Coordinates and affine translations must remain within +/-10,000,000 world units;
positive shape dimensions and stroke widths in [0.01, 1,000,000]; pen width UI range
[0.5, 64]. Affine linear coefficients have absolute value <= 10,000; both singular
values must be in [0.0001, 10,000]. Validate transformed painted bounds against the
world range. Reject excessive derived geometry before committing or exporting.
Do not clamp a corrupt file into a different drawing. Report the relevant limit.

No historical Etch schema exists yet. v1 accepts v1 only. Future migrations must be
explicit pure functions before validation/commit; never guess at future versions.

## 5. Layers, imports, and merging

### 5.1 Layer commands

New Layer inserts above the active layer, with a unique default name. It becomes
active. Reordering only changes array position. Delete Layer removes it and selects
the nearest surviving layer; confirm deletion if it contains elements. If it is the
last layer, replace it with a new empty default layer in the same undoable command.
Do not expose a generic global clear that accidentally clears every layer.

Implemented shell: per-row visibility/lock/trash controls; **Layer options** (⋯) beside
the Layers heading opens a modal for active-layer rename, Move up/down, Rotate
clockwise 90° and Merge Down. F2 on a
focused layer-name button targets that row without changing active layer. Up means
native index +1 (visually above); Down means -1. Disable endpoints and locked/read-only/
busy actions. Preserve editable geometry, assets, view and tool; each rename/reorder is
one command. Invalid/unchanged names create no edit; Escape cancels the draft without
collapsing the sidebar. Merge Down names the target and immediate lower neighbor,
explains hidden/locked/bottom-layer guards, and closes on successful merge. F2 actions
(including merge) target that focused row rather than silently changing another layer.
Suspend drawing/navigation/document shortcuts inside open modals; text undo stays native.

The **Document background** button in the top toolbar's Document group is available
without opening the sidebar. Cancel, Escape and Apply return focus to this button.
It opens a draft modal: Transparent,
opaque Solid color (native color picker and validated #RRGGBB hex input), Off-white
(solid `#FAF8F2`), Dot grid, Graph paper, Ruled paper or Engineering paper. Paper spacing is an integer [8,128] world units,
initially 24; preview valid style/color/spacing changes behind artwork on the actual
viewport, using the shared background renderer. Keep the preview session-only on the
live canvas: saves, exports, revision/history and committed pixels remain unchanged.
Cancel/Escape/API cancel, stale baseline, load/import or teardown clears the preview;
invalid drafts show committed paper. Validate before enabling Apply.
Apply calls setBackground once; Cancel/Escape/invalid/unchanged values create no edit.
Close stale drafts on document replacement/content edits or pending load/import.
The action is document-wide, independent of active-layer visibility/locking, but
read-only/busy disabled. Preserve view/tool/selection/active layer and image bytes.
This durable background is separate from CSS paper/theme, paints behind all marks,
and is included in native/PNG/SVG output. Transparent retains export alpha; it does not
remove opaque white pixels inside images. The remembered solid swatch and last paper
spacing are session-only dialog preferences.

Paper is an infinite document background, not selectable/erasable artwork or a layer.
Anchor dots and lines to world origin, moving/scaling with pan/zoom; never rotate paper with
an individual layer/object. Use opaque preset colors and world-space widths:
Dots: white `#FFFFFF`, circular `#B8C5D6` dots of radius 1 at grid intersections;
Graph: white `#FFFFFF`, grid `#D5DFED` width 0.5; Ruled: white, horizontal lines only
`#B8CDE6` width 0.5, no margin; Engineering: pale green `#F1F7E9`, grid `#CFDEC5`
width 0.5 and major `#9EB895` lines width 1 every five squares. Share these definitions
between Canvas, dialog preview and SVG. Do not let theme changes recolor paper.
Fill export crop including padding, without expanding artwork-derived crop/Fit bounds.

**Rotate layer clockwise 90°** rotates all layer elements together around their
combined painted center, composing their affine matrices without changing layer
offset, local geometry, element order or image bytes. Disable for hidden/locked/empty
layers and read-only/busy editors. Keep the dialog open for repeated clicks. Each
click is one Undo command; no automatic Fit or zoom change. Row-specific F2 targeting
also applies to rotation. Notes on other layers are unaffected.

Locked layers cannot be rotated, moved, renamed, reordered, merged, or deleted until unlocked;
the lock toggle and visibility toggle remain available. Hidden layers can be renamed
or reordered but cannot receive geometry edits. Toggling active state alone does
not dirty the drawing. Undo/redo may restore locked/hidden content as part of an
already-recorded command; those commands are not blocked by current tool state.

Move Layer is an explicit drag tool, not the result of clicking through objects.
For the active editable layer, drag anywhere in the viewport to preview a world-space
offset. Preserve its element matrices. Commit one offset change; cancel restores the
old offset. Empty layers may move. Show the layer name in the tool status and
contextual properties; keep long names safely truncated visually with full accessible
text/tooltips. Hand/Space/middle-drag remain view navigation, never layer movement.
Selecting another layer preserves Move Layer and changes its target; selecting the
tool preserves active layer/sidebar state. Design choice: movement needs 2 CSS px
endpoint displacement; taps/sub-threshold/retracted drags preserve selection, redo,
revision and history. Snapshot zoom at gesture start; world delta is CSS displacement
/ zoom, independent of DPR/pan. Preserve selected element IDs and original element
identities, not just their appearance. Preview/commit validate the complete destination,
including painted world bounds, offsets, JSON and unchanged resources. No stored point/
element capacity is needed to move existing content. Finger movement is opt-in via
the same finger preference as drawing; second touch cancels the move into navigation.

### 5.2 Merge Down

Merge active layer into its immediately lower neighbor. Disable if there is no lower
layer or either layer is hidden or locked. Preserve lower layer ID/name/offset and
make it active. Resulting elements are lower elements followed by upper elements.
For each upper element with matrix E, use:

`E_new = Translate(upper.offset - lower.offset) * E`

No rasterization, deduplication of marks, or change in element IDs. Assets remain
referenced. Restore both complete layers/order/offsets in one undo. No arbitrary
layer opacity or blend modes means this concatenation preserves appearance.

### 5.3 Import placement and transactions

All imports create a new layer above the active layer; never silently edit an
existing layer. Decode/parse/validate into temporary state before committing.
An import is one undoable command, including added assets and the new active layer.

Default placement: center imported painted bounds at the viewport's world center;
retain native world scale and SVG CSS-pixel scale. Do not silently shrink the
geometry. Offer Fit after import. If no visible geometry exists, reject as empty
instead of creating an unexplained blank layer. Large raster input may be explicitly
resampled to safety limits only after user confirmation, not silently.

Import operations capture an editor document-generation token. If load/destroy
occurs before completion, cancel without modifying the new document. Imports are
single-flight per editor; concurrent import attempts reject BUSY (not queued). While
one is pending, disable document-mutating controls; programmatic imports permit
pan/zoom/cancel. The built-in encoding-preview dialog is modal and may temporarily
block background pointer interaction, while cancellation remains available. Capture target insertion layer ID and placement center at
invocation, so navigation during decoding does not change placement. Cancellation,
parse failure, or resource failure leaves document/history/selection unchanged.

### 5.4 Import native Etch document as one layer

Validate the source document using the same native validator. Consolidate its visible
layers, bottom-to-top, into one visible unlocked layer. Preserve editable element
types, source element order, and assets; bake each source layer offset into each
copied element matrix, then use the new layer's offset for placement. Regenerate all
imported IDs and remap asset references. Exact PNG deduplication is optional.

Exclude hidden source layers with an explicit pre-import summary; user may cancel.
Ignore source lock flags and session state. Source background is not a new opaque
rectangle and does not replace destination background: warn when a non-null source
background will be omitted. BACKGROUND_OMITTED retains `color` for solid sources;
paper sources use `background:{type,spacing}` instead. To preserve all layers/background, use load(), not this
single-layer import operation.

Implemented public API: `importDocument(documentOrJSONString)` resolves
`{layerId,revision,warnings}` without a modal. Warnings are detached objects:
`{code:'HIDDEN_LAYERS_OMITTED',layers:[{id,name},...]}` and
`{code:'BACKGROUND_OMITTED',color:'#RRGGBB'}`. Empty geometry rejects EMPTY_IMPORT.
The built-in **Import drawing** document-arrow sidebar button reads a local JSON file
and shows counts, original painted size, hidden-layer names and background omission
before **Import as one layer**. Filename (without .etch.json/.json, up to 80 chars)
is the UI layer name; API uses Imported drawing. Cancel/Escape leaves committed state
and redo unchanged. JSON file bytes are checked against jsonBytes before opening a
bounded stream; decoding is strict UTF-8. Cancel/load/destroy abort pending reads and
release the stream lock. SVG and native JSON share the bounded text reader.
Full source validation includes omitted hidden/unused data; only visible referenced
image assets are copied/decoded. Current/Undo images plus new images share retained
count/byte/pixel allowances. A temporary decoded-asset pixel lease spans preparation
and confirmation; cancellation retains it until underlying decodes settle. Ownership
transfers atomically to the editor asset pool only on successful one-command commit.
Fresh IDs avoid source, current and retained history IDs. No PNG deduplication is used.

### 5.5 Import raster image

Accept still PNG, JPEG, and WebP files/blobs; sniff actual content rather than trusting
filename or supplied MIME. Reject animated PNG/WebP before decoding: this narrows the
original first-frame idea because arbitrary animation frame allocations are not safely
bounded by canvas dimensions alone. No GIF/TIFF/SVG/remote URL/clipboard HTML input.
Normalize browser-decoded orientation (including JPEG EXIF), preserve intrinsic dimensions
without silent resizing, and store one image element in a new visible unlocked layer.

The Layers section offers Import image, opening a local file picker and a cancellable
encoding preview. Default is **WebP quality 80**; allow quality 0–100, and **PNG — lossless**.
Show encoded bytes and estimated base64 bytes before confirmation. PNG has no browser
maximum-effort setting; WebP quality 100 does not mean lossless. Detect actual encoder
output MIME; never mislabel PNG bytes as WebP. If WebP encoding is unavailable, the
dialog selects PNG automatically, disables WebP for the editor session and prepares
a PNG preview without another click. Preserve confirmation, cancellation and atomicity;
only the known unsupported-encoder error permits this retry, not decode/resource failures.
The programmatic API retains strict format semantics and reports unavailable WebP;
hosts (including demo image buttons) may explicitly retry PNG.
PNG preserves safe original PNG bytes when no animation/orientation normalization is
needed; other conversions use native Canvas encoding. Alpha remains supported in both
formats. Preview uses decoded final bytes, so saved/reopened output matches it.

Bound input to 20 MiB. Inspect PNG/JPEG/WebP dimensions/containers before browser decode;
check decoded and encoded dimensions again. Fixed parser safeguard: <=10,000 container
chunks. Reserve retained current/Undo assets plus two full-size temporary surfaces and
the UI thumbnail against totalPixels. Include retained assets in count/byte allowances.
Release every source/preview bitmap, canvas and Blob URL on replacement/cancel/failure/
load/destroy; retain committed decoded resources while Undo/redo can restore them.
Conservative temporary limits can reject a file whose final image alone would fit.

Capture insertion layer and viewport world center before asynchronous work. Import is
one change with source import and one Undo step; its active-layer transition is restored
on Undo/redo. Saves/previews remain committed-only until confirmation. Never silently
lock the imported layer or create an extra drawing layer: the UI explains Lock image →
New layer to draw above. Fit is offered in the toolbar, not automatic for the API. Demo
image buttons may explicitly Fit after importing their local fixtures.

## 6. Native SVG path import

### 6.1 Supported vector subset

SVG is imported as a new layer containing native vector elements, not stored markup.
Groups are flattened in painter order. Internal grouping is not retained.

Support:

- SVG root with width/height, viewBox, and preserveAspectRatio mapping.
- g groups and nested affine transform lists: matrix, translate, scale, rotate,
  skewX, skewY. Imported transforms are allowed even though the UI has no rotate tool.
- path, line, rect (without nonzero corner radii), circle, ellipse, polyline, polygon.
- All normal SVG path commands M/L/H/V/C/S/Q/T/A/Z, relative and absolute,
  repeated argument sets, exponent numbers, and correct implicit commands.
- Solid opaque colors, fill none, stroke none, fill-rule, stroke-width,
  stroke-linecap, stroke-linejoin, stroke-miterlimit.
- Inherited presentation properties and a restricted inline style declaration list
  of these same properties. Resolve currentColor through an explicit color property.
- display:none and visibility:hidden/visible, resolved using SVG inheritance rules;
  nonrendered nodes do not create elements.
- Restricted author stylesheets: simple tag/.class/#id selector lists and the same
  presentation declarations. Preserve source order/importance for later cascade
  resolution. No external sheets, complex selectors, at-rules or CSS escapes.
- Unitless numbers/px; absolute physical units using 96 CSS px/in. Root percentage
  width/height use viewBox size when available; otherwise reject ambiguous sizing.
  Percentage geometry/style values elsewhere are outside the vector subset.

SVG defaults differ from drawing-tool defaults: fill black, stroke none, cap butt,
join miter, miterLimit 4, fill-rule nonzero. Resolve before creating native objects.
Normalize supported CSS color syntax to #RRGGBB using a safe color parser/browser
color check; accept only fully opaque colors. Treat alpha=0 as none; intermediate
alpha requires image fallback. Reject unsupported declarations that affect appearance.

The document root's viewport clipping must be preserved: vector import is accepted
only when all painted bounds fit within the mapped root viewport. Otherwise request
image fallback. Nested svg viewports and overflow-dependent geometry are outside the
subset. This prevents viewBox conversion from silently changing clipping.

### 6.2 Explicit exclusions and fallback

Unsupported for vector import: text/fonts, gradients/pattern paints, clipPath/mask,
filters, opacity other than 0/1, group compositing, blend modes, dashed strokes,
markers, vector-effect/non-scaling-stroke, rounded rects, use/symbol, embedded images,
external stylesheets, unsupported stylesheet selectors/declarations, nested svg,
animation, CSS classes requiring unsupported rules, and foreignObject. Do not silently approximate these as ordinary paths.

Return structured unsupported-feature diagnostics. The implemented UI confirms supported
editable vectors only; unsupported files explain how to export PNG externally and use
Import image. A failed import must not partially create a layer. Content with no painted
geometry reports EMPTY_IMPORT. A separately audited **Import as Image** option is future
work under section 6.4, not an implemented control/API or an automatic fallback.
Zero-length round/square-capped path subpaths remain unsupported due to Canvas/SVG differences;
zero-length round/square lines are converted to filled native dots.

### 6.3 Parsing and normalization

1. Check input byte limit (5 MiB), prohibit DOCTYPE/entity declarations, then parse
   as image/svg+xml in a disconnected XML document; reject parser errors/wrong root.
   Never insert the supplied DOM into the editor or document.
2. Security-check the complete tree, including hidden/unused nodes. Reject scripts,
   on* attributes, foreignObject, animation, external references, processing
   instructions, and unsupported namespaces. No network requests are permitted.
3. Walk a maximum of 20,000 XML elements and depth 64; resolve inherited styles,
   group transforms, root viewBox transform, and paint order. Bound tokens/numeric
   work by the native geometry limits; never use an unbounded regex loop.
4. Tokenize path data with a dedicated SVG number/command parser. Normalize to
   absolute native M/L/Q/C/Z. Expand implicit L after M; resolve H/V to L; reflect
   control points for S/T only after compatible preceding commands. Reset reflected
   control state appropriately on other commands and subpath closure.
5. Convert elliptical arcs using the standard SVG endpoint-to-center procedure:
   normalize radii, handle radii correction, zero radii (line), coincident endpoints
   (no arc), rotation, large-arc/sweep flags, then subdivide into cubic segments.
   Subdivide further as necessary to keep transformed geometric error <= 0.1 world
   units, with a hard work/segment limit and an explicit failure if exceeded.
6. Convert primitives to native shape/path elements. Polygon closes, polyline does
   not; circle maps to ellipse. Preserve each element's accumulated affine matrix
   rather than baking nonuniform transforms into stroke widths.
7. Compute bounds; validate normalized objects and limits; generate fresh IDs;
   commit the complete import as in section 5.

Internal path foundation implemented at src/import/svg-path.js (not a public SVG
import operation). normalizeSVGPath returns absolute M/L/Q/C/Z, expands post-Z moves
required by native validation, resets smooth history correctly, and scans strict ASCII
numbers/commas/one-character arc flags without a token-array or native path parser.
Default downward limits: 5Mi path characters, 1,000,000 input tokens, 128 characters per
number and 100,000 emitted commands. Output coordinates stay within native ±10,000,000.
The caller supplies the fully accumulated native-range affine matrix, not just a local
transform, so arc approximation is bounded in world space while matrices remain native.

Arc conversion uses endpoint-to-center radii correction and cubic Hermite segments;
2*maxRadius*||A||F*h^4/384 conservatively bounds interpolation error. Segment angles are
at most pi/2 and subdivided further for tolerance<=0.1 world units. Endpoints are exact;
coincident endpoints emit nothing, zero radii emit lines, negative radii normalize.
Floating-range/ill-conditioned near-diameter cases reject LIMIT_EXCEEDED rather than
silently shifting an ellipse or emitting nonfinite coordinates. This is conservative
numerical protection, not a formal floating-point or full SVG-import acceptance claim.

Internal style foundation implemented in src/import/svg-style.js with pure sRGB
src/import/svg-colors.js. resolveSVGStyles consumes SECURITY-CHECKED XML records and
returns fresh painter-order flat records with parent indexes, computed properties and
native paint values; NOT a complete native drawing. Presentation attributes, indexed
simple tag/class/ID selectors, source order, inline styles and importance are resolved.
CSS.supports validates declarations without attaching CSS/DOM; pure tests can inject
this syntax-validity dependency, never the mandatory XML/native security policy.
XML declaration records preserve ordered duplicates so invalid later declarations
(including invalid important values) do not erase earlier valid declarations. Spaced
! important is recognized and delimiter scanning respects quotes/function nesting.

SVG defaults/inheritance/currentColor/initial/inherit/unset, non-inherited display/
opacity/effects, visibility override, physical stroke widths and alpha are explicit.
Inherited fill:currentColor remains a token until each descendant's color is known.
Display:none and opacity:0 prune only after XML security checks; hidden visibility
allows visible descendants. Group effects are checked against potentially painted
subtrees; overridden inherited hints are not incorrectly treated as group effects.
Native-compatible unpainted cap/join/miter/fill-rule hints are retained when possible.
Color parser covers148 standard named colors/aliases, transparent,hex3/4/6/8,legacy/
modern rgb(a)/hsl(a),percentages and hue angle units. Alpha remains numeric rather than
raster-quantized:zero paint becomes none,intermediate alpha rejects. System colors,
wide-gamut/relative colors,var/calc and other unresolved CSS require unsupported reports.
HSL byte rounding differs at half-steps between browsers (oracle allows1 channel byte);
no formal floating-point/colorimetric equivalence claim.

Style defaults:20k processed nodes/depth64/100k selectors/100k streamed class tokens/
1m aggregate validation/matching/property work,all downward. Rule indexing avoids an
unbounded nodes-times-rules scan. No source nodes, native path parser, DOM layout,
canvas, decoder or network used by style/color resolution. The import-specific XML entry
point defers unsupported appearance decisions until computed visibility while retaining
the unconditional security pass. The standalone strict inspector retains its structural
contract. Bounded geometry-empty proofs omit simple no-op shapes before irrelevant paint/
opacity checks; generating filters and markers still reject. Unsupported paint/effects
reject without partial output; source DOM/raw CSS never reaches canvas.

Internal coordinate foundation implemented in src/import/svg-coordinates.js (not a
whole-tree geometry converter). Bounded parseSVGTransform supports matrix/translate/
scale/rotate-with-pivot/skewX/skewY, compact numeric packs and right-to-left order,
retaining native reflection/shear/stroke behavior. Prefix products and numbers are
bounded to ±10,000,000; input64Ki characters,128 characters per numeric token,2000
transforms per call (downward). Local transforms may be singular/outside native scale;
validateSVGImportMatrix checks the COMPLETE painted-element accumulated matrix against
native .0001..10000 singular values and coordinate ranges. Do not prematurely reject
compensating nested scales, or treat a hidden singular transform as painted geometry.

parseSVGLength supports px/unitless and in/cm/mm/q/pt/pc at96CSSpx/in; percentages need
an explicit base. Font-relative/host-layout units are unsupported. resolveSVGViewport
maps viewBox minima, all9 alignments, meet/slice/none and optional root defer. Explicit
root percentages use viewBox dimensions; missing dimensions use viewBox dimensions/
intrinsic ratio, else300x150 defaults. ViewBox-only imports intentionally use viewBox
user dimensions, not a browser's replaced-element default pixel size. Zero dimensions
report EMPTY_IMPORT, negative/malformed values reject. Returns a fresh matrix and root
viewport rectangle, NOT clipping eligibility. resolveSVGRootCoordinates additionally
composes root attribute transforms about viewport center, outside viewBox mapping;
geometry checks clipping both before that transform and at the final image viewport. Browser matrix/pixel
oracles cover nonuniform strokes, reflection/shear and viewBox clipping. SVG DOM
transform lists expose float32 rounding; core math remains double precision.

Internal geometry foundation implemented in src/import/svg-geometry.js:
normalizeSVGGeometry consumes security-checked/styled records, preserves painter order,
rect/ellipse/line types (circle maps ellipse), and converts path/polyline/polygon to
absolute native paths. Points attributes are NUMBER lists, not executable path command
syntax. Primitive lengths use coordinate helpers, zero dimensions skip, negatives reject,
nonzero rect corner radii reject. Primitives outside native dimension range .01..1m
normalize to paths when representable; never clamp dimensions.
Accumulated matrices remain native, preserving local strokes; complete painted-element
matrices checked only after primitive empty checks where possible. Transform:none is
identity. Root attribute transforms are supported with pre/post-transform clipping
checks. Zero-length round/square lines become filled native dots. Zero-length round/square
path subpaths (including M/Z and omitted arcs) reject rather than using Canvas's differing
zero-length stroke behavior.

Remaining aggregate point/derived/per-element command budgets are passed into each path
normalization before collecting output; polygon close reserves a command. Geometry work
is bounded by10Mi char/record charges (downward), styled records20k, and native document
limits. Returns a fully validateDocument-checked standalone document, transparent native
background/no assets/fresh internal IDs plus root viewport/bounds/stats. This is NOT a
transaction: destination/history ID avoidance/placement/combined limits and commit still
must use native-import planning/transactions.

Viewport checks use tighter conservative primitive bounds (ellipse affine support,
rect joins and line caps), avoiding fictitious miter overflow on border shapes. General
straight-path strokes use local segment, cap and join support rather than a global
miter envelope. Curved-path stroke bounds remain conservative and may reject fitting drawings.
Arc-converted paths reserve an additional0.1 world error margin in viewport checks;
only arithmetic-noise epsilon otherwise allowed. Outside paint requires unsupported
rootViewportClipping, never dropping geometry or rasterizing automatically. Native
schema validation is a separate final backstop. Pixel oracles compare original SVG vs
normalized native-document SVG export, including arcs, reflection/shear, painter order,
styles and edge-touching primitive strokes, in Chromium and Firefox. SVG graphical
children under non-container shapes reject structurally rather than rendering
descendants that SVG would not paint.

Public importSVG(stringOrBlob) and the Import SVG confirmation UI are implemented via
src/svg-import.js and native-import planning. Bounded fatal UTF-8 Blob streaming checks
size before opening a stream, supports cancellation and enforces min(5MiB,jsonBytes).
The native session captures insertion target/view center before reading; conversion and
combined destination/history validation precede one atomic commit. Fresh IDs avoid
current/history/source collisions, original scale is retained and no automatic Fit occurs.
Pending reads/confirmation keep saves/exports committed-only; failures/cancel/load/destroy
cannot install partial/stale state. Content edits/concurrent imports reject BUSY, readonly
rejects READ_ONLY. No options or image mode; unsupported appearance recommends external
PNG. No exact painted-support, floating-point, security-proof or device-acceptance claim.

The internal XML boundary is implemented in src/import/svg-xml.js. It checks UTF-8
bytes before disconnected DOMParser, blocks DTD/entity declarations/PIs (except the
initial XML declaration), and recognizes parser errors in both Chromium/Firefox
namespaces, including errors nested under an unfinished source root. A complete
iterative tree walk rejects scripts/events/animation/active foreign namespaces/base
URLs/external or embedded references, even under hidden or unused content. CSS resource
checks are quote/comment aware; escapes/imports/executable CSS reject explicitly.
No source DOM enters the live document or escapes in the result.

Compatibility: declarations/comments/CDATA text and namespace declarations are not
resource loads. Known editor annotations and descriptive RDF metadata are omitted
only after full security checking. Non-fetching RDF descriptive URLs are permitted.
Unused defs are ignored after inspection; resource-dependent visible paint still gets
unsupported diagnostics. Namespace inference is limited to an unprefixed root missing
xmlns entirely; explicit empty/wrong namespaces are never guessed away. Restricted
stylesheet parsing preserves simple tag/class/ID rules, declarations and importance;
unknown appearance is reported, not stripped into changed artwork. Rendering hints
remain in unresolved records. Fonts irrelevant to accepted non-text vectors can be
omitted; visible text is still unsupported.

Downward XML defaults:5MiB UTF-8 input,20k elements,depth64,100k total nodes/attributes,
256attrs per element,20k CSS rules and100k combined selectors/declarations. Output is
plain detached unresolved records/styles/stats, not native geometry or sanitized SVG.
Internal inspection is not a generic sanitizer, DOMPurify compatibility API, completed
SVG security audit or host-controlled bypass. Successful inspection must still run the
style/coordinate/native-geometry stages and atomic UI/API insertion with destination/
history limits. The implemented geometry walker passes remaining aggregate budgets into
path normalization before collecting output, not just after allocation. The path/XML
helpers are not sanitizers or permission to attach supplied XML. Public import always
runs all mandatory stages; no host bypass or image fallback is exposed.

Do not depend on experimental SVG getPathData(), browser-specific path parsing
internals, or the installed reference packages. Path2D(string) is not sufficient as
the sole parser: native JSON, bounds, and diagnostics require normalized commands.

### 6.4 Safe SVG image fallback (deferred beyond v1, not implemented)

Approved scope change: this feature is not required for v1 completion. Retain the
restricted editable SVG importer and external-PNG guidance for unsupported artwork.
The following is a future design, not an active implementation requirement. See
`SVG_FALLBACK_AUDIT.md` for the design/boundary review, not security certification.

A fallback is not permission to execute arbitrary SVG. Build a separate, audited
allowlist sanitizer that reconstructs SVG in a disconnected document. Never attach
source markup to the live DOM. Permit the vector subset plus local defs, gradients,
clipPath, mask, and fractional opacity. Local fragment references may only target
allowed nodes; check duplicate IDs, reference cycles, depth, and bounded complexity.
Text may be rasterized with installed system fonts only; warn that fonts can differ.
No downloadable fonts, stylesheet elements, event attributes, script, foreignObject,
animation, external/data resource references, embedded images, use/symbol, or filters
in this fallback profile. Inline style values must be parsed/whitelisted, not copied
as arbitrary CSS. URL paint values can only be validated local #id references.

Serialize only the reconstructed allowed tree; decode it through an image-only
Blob URL, rasterize to bounded PNG, and revoke the URL. Verify canvas readback works.
The sanitizer must be tested to cause zero external requests. If safe sanitization
cannot preserve the supplied SVG, reject and ask for PNG instead. Do not silently
strip dangerous or appearance-affecting content and claim a faithful import.

Fallback resolution defaults to intrinsic SVG CSS-pixel dimensions, at least 1 pixel
per dimension, within raster limits. Show proposed raster dimensions and warn about
loss of vector scalability. Store only the resulting PNG asset, never raw SVG.

## 7. Geometry, coordinates, and hit testing

### 7.1 Coordinate spaces

Five spaces: element geometry -> layer-local -> world -> viewport CSS pixels ->
canvas backing pixels. Let E be element matrix, L layer translation, V viewport
scale/translation, D DPR scale. Rendering transform is `D * V * L * E`.
Viewport `screen = zoom * world + pan`, with pan measured in CSS px.
Pointer world = `(clientPosition - viewportRect.origin - pan) / zoom`.
Then inverse layer/element matrices provide local hit coordinates.

Keep CSS and backing pixels distinct. Canvas pixel dimensions are rounded
client dimensions times devicePixelRatio. Call setTransform explicitly; do not
accumulate scale() calls across frames. Respond to ResizeObserver and DPR changes.
Guard zero-size containers. Screen-space caches are invalid after DPR/view changes;
immutable local-space Path2D geometry can remain cached because transforms are
applied explicitly on each paint.

### 7.2 Bounds and shared path geometry

One geometry module builds normalized paths, render data, and conservative painted
bounds for every type. It MUST be used by canvas rendering, SVG export, hit testing,
fit, import placement, and selection; do not invent unrelated smoothing per output.

Compute line/Bezier extrema (derivative roots in [0,1]); include closing segments,
shape extents, cap/join expansion, and transforms. A conservative transformed local
bounding box is acceptable for selection/culling; it must never clip painted content.
For miter joins, conservatively expand by strokeWidth/2 * miterLimit before applying
the matrix; affine nonuniform scaling needs a safe operator-norm expansion. Images
use the transformed rectangle. Empty paths do not affect bounds.

Hit test active-layer elements in reverse order after a bounds rejection. Vector
fills use Path2D + isPointInPath with the correct fill rule; strokes use
isPointInStroke with explicit cap/join/miter state. Pressure strokes hit the filled
outline. Images use their whole transformed rectangle, not per-pixel alpha.

Picking tolerance: 5 CSS px mouse/pen, 10 touch, independent of zoom. A robust
implementation flattens transformed curves to screen-space error <= 0.5 CSS px and
tests distance to the painted geometry for the tolerance band, in addition to exact
fill/stroke tests. Do not naively divide tolerance by just one element scale when
there is skew or anisotropic scaling. Reuse cached flattened geometry by matrix/
zoom revision. Broad-phase AABBs avoid examining every curve on every event.

### 7.3 Selection transforms and degeneracy

Let B be the original selection's axis-aligned painted bounds in layer-local space.
Compute drag/resize from B and original matrices, never incremental previews.
For moving: `E_new = Translate(deltaLocal) * E_old`.
For resize around opposite handle anchor A:
`E_new = Translate(A) * Scale(sx,sy) * Translate(-A) * E_old`.

This resizes strokes as well as geometry; pen thickness scales with the mark.
No flips in v1: clamp positive scale factors to keep transforms valid. Corner resize
is free by default; Shift preserves aspect ratio. Single images preserve aspect by
default, Shift permits free resize. Multi-selection uses the ordinary free default.
Side handles scale only one axis. Use padded interaction bounds (minimum 8 CSS px)
for zero/very thin dimensions, without padding saved geometry. Disable an axis only
if a stable nonsingular resize cannot be formed; moving always remains available.

For a clockwise quarter-turn around combined painted center C in layer-local space:
`E_new = [0,1,-1,0,C.x+C.y,C.y-C.x] * E_old`.
Use unpadded painted bounds, not resize interaction padding. Apply this same matrix
to every target element; validate the full destination before committing atomically.
Empty targets create no history/revision change. No image re-encoding is involved.

Arrow keys nudge selection by 1 world unit, Shift by 10, one undo command per key
press (repeat events may be coalesced until keyup). Apply the same validation as drag.
No-op transforms and gestures below movement threshold create no history entry.

## 8. Pen and tool input implementation

### 8.1 Pointer lifecycle

Use Pointer Events and setPointerCapture for initiating pointers; release on finish.
Store pointer ID/device/pressure/timestamp and world coordinates in normalized input
records. Use getCoalescedEvents when present, falling back to the event itself.
Record all meaningful samples; rAF batching controls rendering, not sample capture.
Do not use a fixed 10 ms throttle or a 2 px cutoff that loses short strokes.

Deduplicate samples closer than 0.25 CSS px only if pressure is effectively unchanged
(delta < 0.01). Retain the first/last sample. Bound per-stroke samples with explicit
feedback; do not allow input to exceed native limits. Reject invalid coordinates.
Use touch-action:none only on the viewport, with explicit touch navigation handling.

Track an interaction state machine: idle, drawing, shape-preview, marquee,
move-selection, resize-selection, move-layer, erase, pan, pinch. A single owner gets
a pointer stream. pointercancel, lostpointercapture, blur, Escape, load, and destroy
cancel transient document edits, restore the original scene, and create no command.
Capture-loss after a successful pointerup must not undo the completed gesture.
Switching tools cancels pending previews before switching.

### 8.2 Smoothing and pressure

Use standard midpoint quadratic smoothing, not the reference libraries' complex
fitters. For points P0..Pn with n >= 2: move to P0; line to midpoint(P0,P1);
for i=1..n-1 emit a quadratic with control Pi and end midpoint(Pi,Pi+1);
line to Pn. Two points form a line; one point forms a round dot. Treat pressure as a
third scalar coordinate under the same line/quadratic interpolation. The latest tail
can change during input, so the live preview rebuilds it; persisted positions remain
normalized input samples. This is a smooth visual interpolation, not a promise of
exact C1 continuity for all sampling.

Design-choice starting preferences: Pen is the initial tool for editable instances,
Hand for read-only instances; pen color #24292F and width 3 world units. Tool, pen
preferences (including `pressure:true` by default) and Draw with finger are per-instance session state, independent of
active layer/sidebar and never native JSON/history. Preference changes affect
subsequent marks; snapshot them at gesture start so changing a preference cannot
restyle an already captured stroke. With `pressure:false`, stylus input bypasses
pressure filtering, stores sample pressure 1 and persists the existing native
`stroke.pressure:false` representation. This does not change old artwork or the
pressure preference of other tools. Highlighter (K) uses Pen's sample capture and
outline pipeline with its own color/width/opacity settings: default #FDE047/20/0.35,
opacity [0.05,1], independent of Pen and always pressure:false. Both settings surfaces
synchronize immediately; Highlighter width presets are 8/16/24/40 and opacity is
shown as 5–100%. Shared finger preference and gesture cancellation rules still apply.

Width is a world-space quantity, unaffected by current zoom during creation.
For pen input clamp raw pressure to [0,1]; initialize filtered pressure to the first
positive reading (or 0.5 if absent), then use `filtered = 0.35*raw + 0.65*previous`.
Persist those filtered pressures, rather than filtering again on render. Full diameter
is `width * (0.2 + 0.8*p)`; pressure:false always uses width and stores p=1.
For zero-pressure final pen-up samples, retain the last valid filtered down pressure
instead of filtering the synthetic release zero or creating a pinched endpoint. Rendering must not
depend on timestamps or input-device availability later.

Render variable width as a deterministic **filled outline**, not a series of
separately alpha-blended line strokes. Recommended simple construction: adaptively
flatten the smoothed centerline (error <= 0.2 local units), interpolate pressure,
and form consistently wound disc/capsule/trapezoid subpaths with round joins/caps.
Fill their union once using nonzero winding. Use identical generated geometry for
canvas and SVG; cache by element revision. Keep sampling distance small relative to
radius so no visible gaps occur (recommended max step: half the smaller adjacent
radius). All primitive subpaths must have the same winding; connect consecutive
cross-sections with filled quadrilaterals and cover sampled centers with discs.
A closed outline approach is also acceptable if
sharp reversals/dots are tested. Guard derived geometry count (max 500,000 segments
per element, with the aggregate budget in section 4.5); count move/close commands
conservatively too and fail cleanly rather than hang. Uniform strokes may use the
same outline builder for output consistency.

### 8.3 Other tools

Line/rect/ellipse preview on drag, commit on release as one native element and one
undoable command. Normalize negative drag width/height through geometry, not negative
native dimensions. Design choice for meaningful geometry: a line needs at least 2 CSS
px length; rectangle/ellipse need at least 2 CSS px in each extent after constraints.
Taps, flat/tiny boxes and drags returned to their origin do not commit or clear redo/
selection; a pen tap commits a dot. Shift line snapping preserves length; square/circle
uses the larger absolute drag extent and preserves start anchor/quadrant. If a raw
axis is exactly zero, its constrained direction is positive. Shift press/release
updates the preview even without pointer motion.

Shapes is one grouped toolbar action that restores the last selected shape, initially
Rectangle. The sidebar/quick type selectors and L/A/R/O shortcuts select actual tools
`line`, `arrow`, `rect`, `ellipse`. Each retains independent session paints/width, separate from Pen.
Defaults: #24292F border, width 2 world units, no fill; round line caps and rectangle
joins. Borders are uniform, not pressure-sensitive. Shape border-width preferences
use [0.5, 64], independent of zoom, and remain positive when disabled; a fill-only
native element canonicalizes strokeWidth to 0. Opaque #RRGGBB paints only; fill may be
null, rectangle/ellipse stroke may be null if fill is present. Line and Arrow always
require stroke and have no fill setting. Both paints cannot be null. Snapshot settings at
start; changes apply only to subsequent marks in v1 (not a complex style inspector).
Arrow draws a single-ended open arrowhead at the release endpoint, with the same
opaque color and width as its shaft. It uses Line's 2 CSS px minimum length and
45-degree Shift snapping. Save one ordinary native `path`: M(start), L(end),
M(head wing 1), L(end), L(head wing 2), with fill null, nonzero fill rule, round
caps/joins and miterLimit 4. In layer-local world coordinates, head length is
min(shaft length, max(12, 4 × strokeWidth)); perpendicular half-width is head length/2.
The head never extends behind the shaft start along its axis. Geometry is captured
once per proposal; transforms/bounds/hits/Canvas/PNG/SVG reuse existing path behavior.
Arrow's five commands count against aggregate/per-element stored/derived limits.
No native schema extension, SVG markers, new partial cutter or endpoint editor is
introduced. Whole-object erasing removes it; Partial leaves it intact like other
paths. Native paths are created by Arrow and SVG import, not by a node tool.

Object eraser uses a configurable CSS-pixel radius cursor (default 10 CSS px,
UI/API range [1,128], preferences `{radius,mode}` with mode `partial` by default), scaled to world for query bounds.
Its functional sidebar size control changes this session-only setting, captured
at gesture start. E selects the tool; reliable pen button 5/buttons bit 32 temporarily
invokes it without switching the selected tool. One shared finger preference permits
single-touch erasing; second touch cancels the pending erasure into pan/pinch.
Sweep consecutive samples, not just isolated endpoints; remove all intersected
active-layer elements (including paths/images) once per gesture. Preview omissions;
commit the set in one command. Preserve original insertion indexes for undo.
Do not use destination-out or change pixels without updating the document.

Current implementation supplements exact Canvas paint membership with shared,
bounded flattened fill/stroke boundaries (including affine caps/joins/miter state)
for continuous swept queries. Gesture-local geometry has fixed safety ceilings of
500,000 accounted vertices per element, 2,000,000 per gesture and 20,000,000 query/build
work units. Distinct eraser samples are bounded by pointsPerElement independently of
stored document point capacity. Exceeding any ceiling cancels the complete gesture
with LIMIT_EXCEEDED and leaves committed state/history unchanged. These interactive
work ceilings supplement native validation; they are not new native schema fields or
configurable document limit keys. Extremely complex valid native geometry may exceed
the interactive budget. Large-document input-latency acceptance is not yet claimed.

**Partial mode (user-requested scope addition):** Eraser mode `partial` cuts native
`line`, Pen `stroke`, and resulting `ink` elements. General paths, filled shapes and
images remain untouched; there is no fallback to whole-object erasing. The sidebar
labels this Partial (Pen + lines), the default, alongside Whole object. Mode and CSS radius
are captured at start, including temporary pen eraser activation.

For straight lines:

Compute baseline-relative intervals of line centers whose painted stroke footprint
intersects every swept eraser capsule in CSS space. Respect affine caps/width, not a
single inverse scale. Merge cut intervals; retain the surviving ranges as native lines
with original paints, cap and affine matrix. Round/square new ends must not grow back
into the erased gap. This is line-section splitting, not exact pixel-shaped notches.
Bounded flattened round footprints/subpixel allowance are acceptable; do not rasterize.

Pieces occupy the original painter slot. The first survivor retains the original ID
and selection; additional pieces have fresh IDs stable through preview/commit. All
pieces can be split again. Outer endpoints are unchanged unless cut. Do not emit
zero-length elements. Full removal is valid; misses/existing-gap taps preserve redo,
selection, revision and history. Save remains committed-only. Undo restores original
objects and order with one Partially erase lines command for the entire gesture.

For freehand Pen and ink:
- Reuse the persisted stroke's shared pressure outline without filtering/re-smoothing
  its samples. Subtract each swept CSS-space capsule from the convex painted primitives.
  Keep untouched cubic/quadrilateral commands verbatim. Flatten only intersected curved
  primitives at <=0.02 CSS px tolerance, and use a circumscribed capsule with <=0.02 CSS
  px excess beyond the shared 0.25 CSS px hit allowance. Carry local coordinates through
  subdivision/intersections, preserving the affine matrix rather than inverting a scale.
- Store the surviving union as native `ink` parts. Preserve curves and pressure-shaped
  thickness; do not reconnect gaps or add fresh round caps. Connected components become
  independently editable elements, at the original slot with first ID retained and fresh
  additional IDs. Use bounded connectivity/SAT work; all cutting shares one gesture budget.
- A dot may become a ring; holes remain empty and are not Whole Object hits. Ink supports
  repeat cutting and full removal. Tiny native Canvas edge-antialias differences after
  regrouping equivalent commands are acceptable; changed surviving geometry is not.
- One Partially erase ink command commits the entire gesture (including any line cuts).
  Undo restores original sampled strokes exactly; native save/reopen preserves ink parts.
  Opaque vector outlines are not bitmap erasing, clip masks or new sample strokes.

Use the unified input owner, coalesced/release queue, touch/palm/navigation ownership,
atomic cancellation and baseline guards already used by object erasure. Validate the
full combined element/JSON/derived/world/resource destination on preview and commit.
Line splitting may need additional element capacity but consumes no stored points.
Ink output additionally consumes stored command capacity, potentially more than original
Pen samples; include it when calculating subsequent drawing capacity. Limits cancel the
entire gesture, never a truncated or whole-object fallback. Use existing geometry/work
ceilings plus 20,000 affected output pieces and 20,000 additional fragment-ID allocations
per gesture, shared between line and ink cutters. Bound ink primitives at 20,000 per
source/output element; fail LIMIT_EXCEEDED if native coordinate precision/range cannot
represent the cut safely. Valid extreme artwork may exceed these interactive safeguards.

## 9. Rendering and navigation

### 9.1 Canvas strategy and correct layer compositing

Use two stacked visible canvases: committed scene and live overlay. Keep selection
handles/accessibility controls in a DOM overlay or the live overlay. One rAF queue
coalesces input, rendering, and resize invalidations. Rebuild committed scene after
content/view changes; cull using painted bounds. No tile cache in v1.

**Do not blindly draw wet ink above the entire document.** The active layer may be
below other visible layers, and selected elements may be below siblings. Correct
painter order matters more than the literal two-canvas pattern.

Baseline: during any document preview, render the complete visible scene with a
virtual replacement/omission/insertion at the affected layer/element positions.
For example, keep the committed canvas hidden while the live canvas displays that
composited preview; use a viewport-sized offscreen canvas for assembling it if
needed. On commit/cancel, restore committed rendering and clear the live canvas.
For a topmost new stroke, the ordinary committed+wet overlay fast path is safe.
Selection handles are always UI-on-top. Eraser previews must reveal lower content.

Do not allocate one full-size backing canvas per document layer. Viewport-sized
buffers are enough. Never size working canvases to the entire unbounded world.
Each viewport backing canvas is capped at 8192 per dimension and 16,777,216 pixels;
check before allocation and report LIMIT_EXCEEDED rather than silently downscaling
or cropping. Guard hidden/zero-size mounts and recover on a supported resize.
Optional under/over caches may optimize previews, but must preserve exact order.
Profile an observed responsiveness problem before adding them (section 14.4).

### 9.2 Viewport behavior

Zoom range 0.1–8, cursor/pinch-center anchored. For world anchor W and new zoom z,
set pan so its old screen position remains unchanged. Pan unconstrained.

Wheel normally pans; Ctrl/Cmd+wheel zooms. Normalize deltaMode to CSS-pixel units
(line=16, page=viewport height); use bounded exponential zoom. Consume wheel only
inside the viewport with focused/hovered editing intent, not over the toolbar.
Two-finger pinch tracks initial centroid/distance; update zoom and pan together.
Space/middle-drag temporarily pans; restore the previous tool afterwards.

Fit uses visible painted bounds plus 24 CSS px padding, clamped to zoom limits;
empty content resets zoom 1 and centers world origin. Fit does not include hidden
layers. 100% keeps the viewport world center fixed. Resizing card/fullscreen preserves
world center and zoom, not top-left pan. No automatic Fit after every edit/load.

Fullscreen: on non-touch desktops prefer an editor-root Fullscreen API request initiated
by user action; on touch-capable devices (maxTouchPoints/coarse pointer) deliberately
use in-page expansion to avoid browser-owned native-fullscreen exit gestures. Also
provide in-page expansion if native fullscreen is unavailable/denied. Do not move drawing
state into a second editor. Handle native fullscreenchange/Escape and restore prior
host-page focus, scroll, and styles. Fullscreen is a view event, not a content edit.
The toolbar toggles Fullscreen/Exit fullscreen with an accessible pressed state.
Expansion cancels unfinished gestures, preserving selection/tool/sidebar preference,
zoom and world center. Read-only editors may expand. Escape closes an open editor
modal first; otherwise it exits expansion. Keep keyboard focus within the expanded
editor and make background controls inert, restoring prior inert attributes on exit.
Only one editor per document owns expansion at a time. Concurrent setExpanded calls
settle at the latest requested state; late native entry after destroy must be exited
without changing another editor's fullscreen ownership.
For CSS fallback, use manual popover top-layer placement where available to escape
host clipping/transforms without reparenting or losing inherited theme tokens;
without that API use fixed positioning. An iframe fallback fills only its own frame.
Lock documentElement/body overflow and overscroll while expanded. On touch devices,
fix the body at the captured scroll offset; restore every touched inline property and
priority, focus and scroll on exit, denial/cancellation cleanup or destruction. Ownership
handoff must not unlock the page while another editor remains expanded.

Canvas touch and Safari gesture events must not invoke page pan/zoom. Component-local
non-passive guards reject scroll-boundary drags but allow native internal UI scrolling
and form controls; remove them on teardown. Use overscroll containment on UI scrollports,
not touch-action:none on the entire editor (that would disable the sidebar/toolbars).
Do not install global touch blockers or disable host zoom. OS/screen-edge/browser-owned
gestures may not be preventable; real-device acceptance is required.

## 10. Undo/redo and document transactions

Use a bounded command stack with labels and before/after data. Commands operate on
IDs/known insertion positions, not current selection or mutable closure state.
Interface concept: `{label, apply(state), undo(state), retainedAssets}`.

Commands: add element; remove elements; transform elements; create/delete/reorder/
rename layer; visibility/lock; move layer; merge down; import; background change.
One completed gesture or discrete layer operation = one command. Preview state
never changes the committed document. New commands clear redo. No-op commands do
not increment revision or fire content events.

Default max 200 commands and approximate 64 MiB retained history data; evict oldest
entries to meet both, with resource cleanup. A single larger permitted command may
be retained alone; report history truncation if it cannot be kept within a host
hard limit. Do not snapshot all asset bytes on every drag. Structural sharing of
immutable committed data is encouraged. Never serialize the undo stack.

Undo/redo emits content change with its label; load is not an undoable edit and
clears both stacks only after successful validation/resource decoding. Reconcile UI
after history operations: selected IDs must exist in the active editable layer;
otherwise clear. Choose a valid active layer if the previous one disappeared.

## 11. Public embedding and persistence API

Public functions return detached plain objects where applicable. All methods throw
a typed DESTROYED error after destroy, except idempotent destroy/unsubscribe.
Use an internal tiny emitter; do not require a framework or global DOM events.

```js
import { createEtch } from "./etch.js";

const editor = createEtch(container, {
  readOnly: false,
  drawWithTouch: true, // default; false makes single-touch input navigate
  sidebarOpen: false, // true in the demo; presentation only, no autofocus
  limits: { /* optional stricter safety limits */ }
});

await editor.load(documentOrJSONString); // async: validate + decode assets + replace
const snapshot = editor.save();         // detached native v1 document, synchronous
const token = editor.getRevision();     // opaque content state token
const off = editor.on("change", ({ revision, label, source }) => {
  // Host schedules its own save; no browser storage is touched by Etch.
});

editor.setTool("pen");
editor.getTool();
editor.setToolSettings("pen", { color: "#24292F", width: 3 });
editor.getToolSettings("pen");
editor.setTool("rect");
editor.setToolSettings("rect", { stroke: "#24292F", strokeWidth: 2, fill: null });
editor.setDrawWithTouch(false);
editor.getDrawWithTouch();
editor.setActiveLayer(layerId);
editor.getViewState();
editor.setViewState({ zoom: 1, pan: [0, 0] });
editor.fit();
editor.undo();
editor.redo();
editor.canUndo();
editor.canRedo();

await editor.importDocument(documentOrJSONString);
await editor.importSVG(svgTextOrBlob); // supported editable vectors; no options/image mode
const imported = await editor.importImage(blob); // WebP quality 0.8; {layerId,revision,warnings:[]}
await editor.importImage(blob, {format:"png"}); // lossless
await editor.importImage(blob, {format:"webp",quality:0.65});

const { svg, revision } = editor.exportSVG({ padding: 16 });
const { blob, revision } = await editor.exportPNG({ padding: 16, scale: 2 });
editor.destroy();
```

`createEtch` immediately creates an empty document with revision token and a focused-
only keyboard boundary, not an automatically focused element. `load` does not focus
or automatically fit; host calls fit() on first opening if desired.

Additional required facade operations (same commands as the built-in UI):

| Method | Contract |
|---|---|
| getTool() / setTool(name) | Session-only active tool; valid names listed below |
| getToolSettings(name) | Detached supported preferences; Hand and Move Layer have none (`{}`) |
| setToolSettings(name, patch) | Validated partial session preferences; Pen: opaque `color`, `width` in [0.5, 64]. Shapes: `stroke`, `strokeWidth` in [0.5, 64], rectangle/ellipse-only `fill`; paint/null rules in section 8.3 |
| getDrawWithTouch() / setDrawWithTouch(boolean) | Session-only finger drawing preference, initialized from options |
| importDocument(documentOrJSONString) | Async native import as one new layer; `{layerId,revision,warnings}` as in 5.4 |
| importSVG(svgTextOrBlob) | Async editable SVG import; bounded UTF-8 string/Blob, `{layerId,revision,warnings:[]}`; no options/image mode |
| importImage(blob, {format = 'webp', quality = 0.8} = {}) | Async local raster import; PNG/WebP output, quality in [0,1], one command, result `{layerId,revision,warnings:[]}` |
| exportSVG({padding = 16, bounds?} = {}) | Synchronous `{svg,revision}` committed vector snapshot; no raster allocation |
| exportPNG({padding = 16, bounds?, scale = 1} = {}) | Promise of `{blob,revision}` committed PNG snapshot; see section 12 |
| getActiveLayer() | Return active layer ID |
| createLayer({name} = {}) | Insert above active layer; return new ID |
| renameLayer(id, name) | Rename an unlocked layer |
| deleteLayer(id) | Delete/replace as in section 5; confirmation is a UI concern |
| reorderLayer(id, index) | Move to final bottom-to-top array index |
| setLayerVisibility(id, visible) | Set durable visibility |
| setLayerLocked(id, locked) | Set durable lock state |
| translateLayer(id, [dx,dy]) | Apply relative world translation, one command |
| rotateLayer(id = activeLayerId) | Clockwise 90° around combined painted center; one command, no-op if empty |
| rotateSelection() | Same quarter-turn for the active-layer selection; one command, no-op if empty |
| mergeDown(id = activeLayerId) | Merge as in section 5; return surviving ID |
| getSelection() / setSelection(ids) | Detached IDs / validate same active editable layer |
| deleteSelection() | One command, no-op if empty |
| setBackground(colorOrNullOrPaper) | Opaque #RRGGBB, transparent, or paper {type,spacing}, one command |
| cancel() | Cancel preview or pending load/import; keep committed drawing |
| setExpanded(boolean) | Promise for fullscreen/fallback transition; requires user gesture for native entry |

Methods are synchronous unless shown with await, declared Promise above, or import
methods. Successful load resolves undefined. Imports resolve
`{layerId, revision, warnings: []}`; SVG vector failures reject with unsupported
feature names in error.details. Public programmatic native import follows the
visible-layers/background-omission contract without a modal; warnings enumerate
omissions. The built-in UI MUST show the pre-import summary before calling it.
Import methods never automatically switch from vector to image mode.

`getViewState()` returns `{zoom, pan, expanded}`; setViewState accepts zoom/pan only,
with expansion handled separately. Valid tool names: select, pen, highlighter, eraser,
line, arrow, rect, ellipse, hand, move-layer. Set selection/tool/preferences/view does not commit
content. Unsupported tool names/settings reject INVALID_ARGUMENT; do not add inert controls.
Eraser settings are `{radius:10,mode:'partial'}` by default; validated mode values are
`object` and `partial` (Pen/ink and native straight lines), with radius [1,128] CSS px.
Durable mutation while load/import is busy rejects BUSY; another load supersedes existing
work. Synchronous methods throw typed errors; asynchronous methods reject. Invalid
IDs/arguments use INVALID_ARGUMENT; geometry edits on hidden/locked layers use
LAYER_NOT_EDITABLE. All facade commands enforce the same limits/locks as the UI.

Export options: `{padding = 16, bounds?}` with bounds `{x,y,width,height}` in world
units; explicit bounds replace automatic bounds and padding is applied afterwards.
PNG adds `{scale = 1}`. Padding must be finite and non-negative; reject unknown option
keys and invalid/non-positive dimensions or scale. Return
objects contain strings/Blobs and the revision, not DOM nodes. Imports and exports
must validate resource limits on the combined destination/output, not just source.

### 11.1 Snapshot, load, and revision semantics

`save()` captures only committed content, even during a gesture; it neither ends nor
saves the preview. Returned data shares no mutable arrays/objects with the editor.
No saving event implies success at a storage backend. `save` may be called read-only.

`load` validates/decodes into temporary state; editing is disabled while pending,
but the old committed drawing remains visible and saveable. It cancels any preview
on invocation. On success, atomically replace content, clear history/selection,
choose the topmost visible unlocked layer (otherwise topmost), preserve valid view
state, and emit load, not change. On failure, preserve old document/history/revision.
Concurrent loads use latest-invocation-wins; superseded operations reject CANCELLED.
Destroy cancels loads/imports and closes temporary resources.

Revision is an opaque token unique to this editor session and monotonically advanced
on every successful committed change, undo, redo, and load. It is not persisted.
Undo returning to identical pixels still gets a new token. Load is a host-established
baseline, not a user-dirty event; its new token invalidates pending old host saves.
View changes do not advance revision. Hosts must compare tokens, not undo depth.

Capture snapshot and token synchronously before starting an async host write:

```js
const revision = editor.getRevision();
const document = editor.save(); // same JS turn: no asynchronous gap
await hostSaveAttachment(document);
if (editor.getRevision() === revision) {
  hostMarkSaved(revision);
}
```

The host MUST also serialize storage writes or use conditional/revision-aware writes;
UI token comparison alone cannot stop an older request overwriting a newer stored
attachment. Storage failures, autosave scheduling, close confirmation, and dirty
indicators belong to the host. A demo may illustrate these without adding storage
to the component. Exports return their captured revision so thumbnail jobs can use
the same protection against stale results.

### 11.2 Events and errors

- change: `{revision, label, source: "edit"|"undo"|"redo"|"import"}`; exactly once
  after a completed committed transaction, after state is consistent.
- load: `{revision}` after a successful replacement, never an autosave-triggering
  content change.
- viewchange: `{zoom, pan, expanded}`; rAF-coalesced.
- selectionchange: `{activeLayerId, elementIds}`; detached payload.
- historychange: `{canUndo, canRedo, undoLabel, redoLabel}`.
- error: `{code, message, details}` for UI-initiated failures; promise methods also
  reject with the same typed error. No unhandled rejection from built-in UI.

on(name, callback) returns an idempotent unsubscribe. Listener exceptions must not
prevent other listeners or corrupt the editor; report asynchronously to the host's
error reporting mechanism. Events are post-transaction; reentrant mutation should
be queued until emission completes. Destruction stops remaining notifications, rejects
queued asynchronous work with CANCELLED and closes any resources owned by that queued
work; it must not leave pending promises abandoned. Calls initiated after destruction
still fail DESTROYED. Do not expose internal mutable element objects.

Error codes: INVALID_DOCUMENT, UNSUPPORTED_VERSION, LIMIT_EXCEEDED, INVALID_SVG,
UNSUPPORTED_SVG_FEATURE, UNSAFE_SVG, DECODE_FAILED, EMPTY_IMPORT, EXPORT_TOO_LARGE,
READ_ONLY, INVALID_ARGUMENT, LAYER_NOT_EDITABLE, BUSY, CANCELLED, DESTROYED.
Include actionable details and unsupported
feature names; do not expose a raw file dump or sensitive attachment data in logs.

Read-only permits view navigation, fullscreen, load/save/export, but not content
mutation/import/undo/redo. Disable corresponding UI; API mutation attempts reject
READ_ONLY. No keyboard or pointer path may bypass it.

## 12. Export

Export all visible layers, bottom-to-top, regardless of lock or active selection.
Capture an immutable committed snapshot before doing any async work. Hidden layers,
selection, handles, UI grid, and unfinished gestures are excluded. PNG/SVG export
must not change view, selection, history, or document.

Bounds default to visible painted bounds plus 16 world units padding. Optional
explicit world bounds permit host-defined thumbnails/crops. Empty export uses
256x256 world units centered on origin before applying padding (288x288 pixels at
default PNG scale/padding). Include document background when non-null;
otherwise transparent. Export world bounds are independent of pan/zoom/DPR.
Zero-area automatic bounds (e.g. a fill-only collinear path) also use the empty
fallback, including with padding zero; never emit a zero-sized SVG viewport.

SVG: create an XML SVG string with explicit viewBox and dimensions. Emit basic
shape/path/ink elements and affine transforms, PNG/WebP assets as escaped embedded data URLs with their validated MIME,
pressure strokes as their generated filled paths. Escape all text/attribute values;
never concatenate unchecked SVG from imports. Export no script, CSS, external href,
or editing metadata. Reimporting exported vector-only supported-subset documents
should preserve painted geometry when within the same import resource limits;
Raster-containing exports are valid distributable
SVG but are outside the v1 editable vector-import subset. Native JSON is the lossless
editing round trip, not arbitrary SVG export/reimport.

SVG is implemented as synchronous `exportSVG({padding?,bounds?}) → {svg,revision}`.
Shared export-bounds.js supplies the same crop/padding/fallback contract as PNG.
svg-export.js emits fixed allowlisted SVG elements/attributes, with escaped values,
shortest round-trip numbers and streamed shared pressure outlines/cut-ink commands.
Layer offsets use structural groups without IDs/names; images use native element
matrices and preserveAspectRatio=none. The root explicitly clips its viewport;
background fills the complete padded world crop. Paper uses one generated bounded
`defs/pattern` with internal `url(#etch-paper)` fill, opaque base rectangle and grid
paths or dot circles. Align the tile origin with the crop while encoding world-origin phase in
its contents, avoiding extra fractional-crop texture blur. Its fixed internal ID is
not a native/source ID. Do not broaden editable SVG import to accept patterns: paper
exports, like raster-containing exports, need native JSON for lossless editing.
No imported XML is concatenated.
No layer names, native IDs, image alt text or editing metadata are serialized. Original
embedded raster bytes, including any existing image metadata, are not rewritten.
Crops are visual viewport clips, not redaction: out-of-crop visible geometry and complete
embedded image bytes remain in the SVG. Use PNG for flattened crop output.
Read-only and BUSY content states are allowed. No canvas/decode, raster lease, pending
job or cancellation is needed: strings are independent before return. Do not cancel
live input. Calls after destroy throw DESTROYED.

A bounded chunk writer enforces 128MiB UTF-8 serialized SVG, reduced by host jsonBytes,
plus native derived-geometry ceilings. It streams image attributes and commands rather
than materializing a whole pressure command array. Text/work excess throws
EXPORT_TOO_LARGE without a partial return, content changes or a suggestedScale (changing
SVG dimensions does not reduce payload). Reused images embed per instance rather than
introducing image use/defs constructs. Generated paper patterns are the explicit defs
exception above. SVG has no PNG raster-dimension/pixel cap.
A valid native document can exceed the SVG text ceiling or later SVG-import limits;
native JSON remains the editing backup. Editable SVG import is restricted to section 6;
SVG image fallback remains unimplemented.

PNG: use a separate bounded canvas and the shared renderer; scale is pixels/world
unit, not current DPR. Enforce max dimension 8192 and 16,777,216 output pixels.
If requested bounds/scale exceed limits, reject EXPORT_TOO_LARGE with a suggested
lower scale; never allocate first and hope. Return a PNG Blob via toBlob, not a huge
base64 data URL. Surface tainted-canvas/decode/allocation failures. Dispose temporary
canvases and resources after export; do not revoke resources still in editor use.

Canvas/PNG paper renders analytic screen-space bands or circular dots, sharing
world-space preset rules with SVG and allocating no raster tiles. Bound enumeration
at 50,000 lines or dot intersections per render;
reject excess/nonfinite grid scale with LIMIT_EXCEEDED (`limit:paperLines`) without
returning a partial PNG. Extremely large world crops can exceed this work allowance
at tiny output scales: suggest reducing crop or increasing spacing, not lowering PNG
scale. Count indices rather than incrementing huge world coordinates; normalize phase
with bounded remainder arithmetic. SVG enumerates only one fixed-size tile, independent
of crop size. Paper dots/lines do not consume native element/point budgets.

PNG is implemented via `exportPNG({padding?,bounds?,scale?}) → Promise<{blob,revision}>`.
The shared renderer paints committed pixels synchronously before encoding awaits, so
no asset pin or re-decode is needed across later load/Undo. Drop snapshot document/pool
references after painting; hold only output canvas, its pixel reservation and revision.
Do not cancel a live gesture for this read operation. Load/edit does not cancel PNG;
destroy cancels pending jobs with CANCELLED and clears canvases (including late encoder
callbacks). API calls after destruction reject DESTROYED. `cancel()` still applies to
content/load/import work, not PNG snapshots.

At most four PNG encodes per editor; further attempts reject BUSY. Downward host
rasterDimension/assetPixels limits also bound output. A transient pixel ledger shares
totalPixels among retained current/Undo assets, native-load decodes, image-import
source/output/thumbnail surfaces and pending PNG canvases plus encoder bitmap snapshots
(two output-size pixel surfaces per PNG job). Reserve before allocation;
release on completion/failure/cancel. Retain a decoding/encoding lease until underlying
native async work finishes, even after cancellation, where it can still own pixel
buffers. Atomic native replacement temporarily needs old + newly decoded resources;
large valid documents can exceed this conservative peak budget when replacing another.
Suggested PNG scale must itself fit ceil-rounded dimensions/pixels; report 0 when no
pixels are currently available. No output allocation on options/size-preflight failures.

The editor's top-toolbar Export button opens PNG/SVG choices in an accessible popover,
available with the sidebar closed, in read-only embeds, and inside native/fallback
fullscreen. Arrow/Home/End keys navigate the choices; Escape closes the popover and
returns focus without collapsing the sidebar or requesting fullscreen exit. Browsers
may reserve Escape to leave native fullscreen (Firefox does); transitions also dismiss
the popover so it cannot linger after browser-owned exit. PNG downloads
`drawing.png`; SVG downloads `drawing.svg`. Transient Blob URLs are revoked after use
or on teardown. PNG encoding disables both export choices to prevent duplicate UI jobs;
errors restore them and are reported through the existing status/error channel. Destroy
suppresses pending downloads. Neither download changes content/history/selection/view
or marks the native attachment saved. An oversized default PNG offers explicit
confirmation before retrying at a suggested lower scale. Native JSON remains the
editable backup; PNG is flattened output. The demo retains host-side Download PNG/SVG
shortcuts to the same APIs.

## 13. Architecture and development

### 13.1 Source layout — match the sibling highlighter project

Follow ../highlighter/'s repository conventions: a named root ESM entry and stylesheet,
internal modules in src/, pure tests in test/ (singular), browser checks in browser/,
development utilities in scripts/, and the runnable example in demo/. The sibling
is an organizational reference, not an Etch runtime dependency. Do not import its
modules or reuse its highlighter-specific language/theme generation machinery.

Repository layout (module responsibilities are detailed in PROJECT_NOTES.md):

```text
etch/                       repository root, not a nested source directory
  etch.js                   small public ESM entry; re-exports from src/index.js
  etch.css                  ready-to-use, scoped editor styles; hand-authored
  package.json
  package-lock.json
  .gitignore
  README.md                 quickstart, imports, API summary, demo/test commands
  SPEC.md                   implementation contract and explicit limits
  PROJECT_NOTES.md           enduring architecture and maintenance constraints
  IMPLEMENTATION_PROGRESS.md remaining v1 acceptance and current verification
  FUTURE_WORK.md             deferred features and optional investigations
  src/
    index.js                public facade, composition, and editor lifecycle
    state.js                committed content, history and mutation guards
    document.js             schema, immutable operations, revision
    validation.js           limits and native parser
    history.js              commands, history retention
    events.js               small emitter
    assets.js               decoded resource ownership/lifetime and atomic pool transfer
    background.js           saved paper presets, validation and world-space grid rules
    fullscreen.js           native/fallback expansion and page restoration
    tools.js                per-tool session settings
    viewport.js             view state and world/screen mapping
    native-import.js        pure native single-layer plan/IDs/offsets/warnings
    raster.js               raster container checks, encoding options and limits
    image-import.js         raster preparation, conversion and resource ownership
    export-bounds.js        shared committed SVG/PNG world bounds/padding
    svg-export.js           bounded safe native-to-SVG serialization
    svg-import.js           bounded UTF-8 input and mandatory editable SVG pipeline
    png-export.js           bounded snapshot canvas/encoding jobs
    geometry/
      matrix.js             affine math, inverse, scale checks
      paths.js              normalized commands and painted bounds
      curves.js             shared curve geometry
      stroke.js             smoothing + pressure outline
      hit-test.js
      line-cut.js           swept partial straight-line intervals/fragments
      convex.js             bounded convex subtraction/connectivity/SAT
      ink.js                shared pressure primitives and local/screen subdivision
      ink-cut.js            partial Pen/ink cutter and shared-budget composition
      selection.js          selection geometry and transforms
    input/
      controller.js         pointer ownership/state machine
      pen.js, shapes.js, eraser.js, selection.js, layer-move.js
    rendering/
      canvas.js             painter-order scene + virtual previews
      scheduler.js          rAF invalidation
    import/
      svg-path.js           bounded SVG path/arc normalization
      svg-xml.js            disconnected XML/security + restricted CSS records
      svg-coordinates.js    bounded transforms/lengths/intrinsic viewBox mapping
      svg-colors.js         pure sRGB colors with unquantized alpha
      svg-style.js          bounded restricted cascade/inheritance/native paints
      svg-geometry.js       supported primitives/paths/native validation/root bounds
      svg-straight-bounds.js conservative straight-path stroke bounds
    ui/
      shell.js              DOM toolbar, viewport, status
      sidebar-resize.js     session width, pointer/keyboard divider and teardown
  demo/
    index.html              interactive card/fullscreen attachment showcase
    demo.js                 imports ../etch.js; host save/load example
    demo.css                showcase layout only, not editor component styles
    fixtures/               original sample native document
  test/
    *.test.js               node:test pure-unit, package, and server tests
    helpers.js              independently authored fixture builders
  browser/
    *.test.js               node:test + Playwright integration/visual smoke checks
  scripts/
    serve-demo.js           dependency-free local HTTP server and test server factory
    benchmark.js            pure validation/bounds benchmark, not preview timing
```

Root etch.js MUST remain a thin public entry, not a bundled copy of src/. Host pages
load etch.css explicitly; JavaScript must not inject CSS or import it as a module.
A browser consumer can copy etch.js, etch.css, and the entire src/ directory, or bundle
them in its host app. Document that etch.js is not a self-contained single file.
A dist/ directory and optional build output are permitted if useful; neither a
prebuilt artifact nor a browser global is required. Keep the direct root ESM/CSS
workflow working with no mandatory build. If an optional distribution build is
introduced, document its inputs, command and copy layout separately; dist/ remains
ignored generated output. The implemented optional `npm run build` uses dev-only
esbuild (`scripts/build.js`), bundling root etch.js into minified self-contained ESM
`dist/etch.js` and copying etch.css to `dist/etch.css`. These are the only generated
files; no source maps/chunks/global wrapper or injected styles. Copy the two together,
link CSS explicitly, and import createEtch/EtchError from the built JS. Retain DOM-free
Node import safety. Isolated distribution tests serve only these outputs and check
mount/drawing/native/SVG/PNG workflows without source files or external requests.
CSS selectors and custom properties must be namespaced (e.g. .etch and --etch-*),
not global element resets.

Keep geometry, validation, commands, and import normalization independent of DOM
where possible. Importing etch.js must not mount anything, access document/window at
module evaluation, or start a server; createEtch requires a browser DOM when called.
This enables a Node public-entry smoke test without implying headless Node editing.
Prefer small explicit type switches over a plugin registry. Multiple editor instances
must coexist independently; no global singleton editor/store.

### 13.2 Package and maintenance conventions

Like highlighter's private lightmetal-polish package, use **lightmetal-etch** as the
private package name, with type:module, main:./etch.js, and Node >=22 for development.
The package is private; do not infer publication authorization. Package exports:
`.` and `./etch.js` -> ./etch.js; `./etch.css` ->
./etch.css. Keep src/ implementation paths private in the package export map.
Mark only CSS as side-effectful (`sideEffects: ["**/*.css"]`).

The package has no runtime dependencies; Playwright is development-only. Research
packages must not be runtime/test dependencies or demo/source imports. Isolate any
optional research installs under an ignored references/ directory.

Required scripts:

| Command | Script / behavior |
|---|---|
| npm test | node --test test/*.test.js; includes public entry and dev-server checks |
| npm run test:browser | node --test browser/*.test.js; starts/stops its own server |
| npm run test:themes | Focused suite-mode checks; Chromium by default, ETCH_THEME_BROWSER=firefox for Firefox |
| npm run demo | node scripts/serve-demo.js; starts the interactive demo |
| npm run serve | Alias for npm run demo |
| npm run bench | node scripts/benchmark.js; reports fixture, environment, timings |

No mandatory build, CSS generation, or demo-generation step. Unlike highlighter's
generated static gallery, Etch's demo is an interactive ESM page served directly.
Document `npm install`, `npx playwright install` for browser checks, and each command
in README.md. Commit the lockfile. Ignore node_modules/, references/, dist/,
coverage/, test-results/, and playwright-report/; do not ignore original test/demo
fixtures. Do not put research bundles or generated reports in source control.

### 13.3 Local demo server — Lightmetal examples-style workflow

The workflow mirrors ../../lightmetal/examples/server.py: one local command serves
the showcase and library assets, prints a URL, and supports a configurable test port.
Etch SHOULD use Node's built-in node:http/fs/path APIs instead of adding Flask, uv,
Python setup, Express, or a bundler dev server. The HTTP server is development-only,
not an attachment API, persistence backend, or dependency of etch.js.

Invocation and defaults:

```sh
npm run demo
# Demo available at http://127.0.0.1:5050/demo/

npm run demo -- --port 5051
# Also support ETCH_PORT=5051; CLI overrides environment.
```

Default host is 127.0.0.1, default port 5050 (5000 and 5001 are already in use).
Accept --host for explicit LAN/device testing; never bind all interfaces by default.
Use --port 0 for an OS-assigned test port and print the actual address. Reject invalid
ports/arguments with an actionable message and nonzero exit. On EADDRINUSE, explain
how to choose another port; do not silently serve a different checkout on that port.
Resolve asset paths relative to this repository/server module, not process.cwd(), so
`node /absolute/path/to/etch/scripts/serve-demo.js` also works from another directory.

Routes:

- GET/HEAD / redirects to /demo/ so relative imports resolve consistently.
- /demo/ and /demo/index.html serve the interactive showcase.
- /demo/* serves its JS, CSS, and original fixtures.
- /etch.js, /etch.css, and /src/* serve the actual unbundled component.
- /README.md may serve the quickstart for a showcase link.
- Other paths return 404, with no generic SPA fallback or directory listings.

Set correct MIME types for HTML, JS modules, CSS, JSON, SVG, PNG/JPEG/WebP; use
Cache-Control:no-store for development and X-Content-Type-Options:nosniff. Handle
HEAD without a body, missing files as 404, unsupported methods as 405 with Allow,
and unexpected errors without leaking filesystem paths or leaving sockets hanging.
Do not enable permissive CORS or filesystem writes. Check URL decoding, null bytes,
traversal, and real paths/symlinks against a narrow route/file allowlist. Never expose
node_modules/, references/, .git/, scripts/, arbitrary root files, or parent folders.
Keep the HTTP policy separate from the client SVG-import sanitizer.

Export a reusable `startDemoServer({host, port})` function from serve-demo.js, returning
an async result `{origin, close}` where close() waits for cleanup. Importing this
module must not listen automatically; only CLI execution starts a listener. Browser
checks use 127.0.0.1 and port 0, await readiness, and close in teardown without fixed
sleeps or a pre-existing process. If test fixtures beyond demo/ are required, supply
them via browser-test data/in-memory routes, not unrestricted repository serving.
Handle Ctrl+C/SIGTERM cleanly in CLI mode. No auto-opening a browser or live-reload
infrastructure is required; edit source and refresh.

The demo MUST show the real public entry and stylesheet, a card editor with
fullscreen, layers, representative editable SVG/native/image imports, native JSON
save/reopen, PNG/SVG downloads, and a host-side save-status/revision example. Files
stay local: no upload endpoint, account, analytics, CDN, or external asset fetch.
A second isolated instance or read-only preview can demonstrate instance isolation.
Do not build another copy of editor logic into the showcase.

### 13.4 Delivery scope

Implemented workflows/API are documented in README; remaining v1 acceptance and
current verification are tracked in IMPLEMENTATION_PROGRESS.md. Deferred features
are in FUTURE_WORK.md. Do not broaden SVG support to make one fixture pass or
claim completed acceptance from automated tests alone. Record approved deviations
in the relevant contract section.

## 14. Test plan and acceptance criteria

No runtime build is required. Pure logic/package/server tests in test/ use node:test.
Browser checks in browser/ use node:test with dev-only Playwright and the reusable
local demo server. Include the interactive demo for real pen/touch/manual checks.
Reference packages are not test or runtime oracles; use independently authored small
fixtures and known geometry. Do not copy reference source or bundled fixture assets.

### 14.1 Pure tests

- Public/package exports resolve through root etch.js, with no browser globals needed
  merely to import it; stylesheet export and documented copy layout are correct.
- Dev server: root redirect, demo/modules/assets load with correct MIME/no-store;
  HEAD/404/405 work; cwd-independent startup, ephemeral port, shutdown, port collision,
  malformed URL/traversal/symlink rejection, and blocked private directories.
- All native types round-trip JSON without loss; malformed values, duplicate IDs,
  non-finite/singular matrices, future schemas, unsafe/missing assets, and limit
  boundaries are rejected before mutation. Returned snapshots cannot mutate state.
- Matrix composition/inversion and screen/world conversions, including negative
  coordinates, nested imported transforms, nonuniform scaling, and skew.
- Curve extrema, subpath closure, fill rules, conservative miter/cap bounds; stroke
  dots, two points, duplicate points, sharp reversals, pressure endpoints.
- Every command apply/undo/redo restores exact document state/order and assets;
  no-op suppression, redo clearing, history eviction, and retained-resource cleanup.
- Merge with different offsets preserves world transforms and painting order;
  merge undo restores both layers. Native import remaps all IDs and asset references.
- SVG tokenization: adjacent signed numbers, exponents, implicit/repeated commands,
  relative commands, S/T reflection reset, Z/current point, arc degeneracies and
  flags, transform-list order, root aspect-ratio mapping, inherited SVG defaults.
- Equivalent supported SVG fixtures normalize to equivalent native geometry; arc
  approximation remains within error bound or gives a resource-limit error.

### 14.2 Browser automation

- Start the provided server on an ephemeral port, visit the public demo, and verify
  its ESM/CSS/assets load without console/network errors or a prior build. Exercise
  real public-entry editing and save/reopen/download controls, then stop the server.
- Pointer capture keeps a stroke alive outside viewport; cancellation/capture loss
  rolls previews back without content changes; tap dot and short strokes survive.
- A long eraser sweep cannot miss marks between events; undo restores original order.
- Selection never captures non-active-layer objects; locked/hidden layers cannot be
  edited; Delete, marquee, nudges, resize, image aspect behavior and Shift work.
- Drawing/moving/erasing on a lower layer previews in correct z-order, including
  opaque upper shapes and images. Nothing pops into a new order on commit.
- Resize at DPR 1/2, card/fullscreen transitions, zero-size mount then reveal, and
  zoom anchoring preserve world content. Navigation does not dirty attachment data.
- UI session controls preserve content/history, viewport identity and tool/layer
  independence. Cover sidebar disclosures/resize/cancellation/clamping, pen-width
  synchronization, shape chooser keyboard/focus, committed status bounds, and
  empty-state import/drop confirmation with Cancel/Undo/read-only guards.
- Native load failure is atomic; successful load clears history and emits no change;
  concurrent loads/imports cannot mutate the wrong attachment. Destroy during any
  async operation leaves no DOM, listeners, rAF loops, observers, or Blob URLs.
- Exactly one change per committed gesture/import/undo/redo; no change for preview,
  cancellation, selection, pan/zoom, save, export, or active-layer selection.
- Async PNG export is an immutable snapshot even while later edits occur; revision
  lets host discard stale results. Host demo shows serialized persistence writes.
- SVG and PNG match canvas appearance using tolerant pixel comparisons; include
  evenodd holes, affine strokes, pressure dots, alpha PNG, and hidden/locked layers.
- SVG security fixtures: script, event attrs, DOCTYPE/entities, foreignObject,
  external href/url/font, CSS escape tricks, unsafe namespaces, duplicate/cyclic
  fragment refs, deep nesting, huge paths/images. Assert zero network requests.
- Unsupported SVG produces a feature report and no partial changes, with external-PNG
  guidance. Safe image fallback is deferred beyond v1 and must not activate automatically.
- Two editor instances do not share tools/history/focus or intercept each other's
  shortcuts. Read-only cannot be bypassed through keyboard, tools, or API.
- Theme CSS works standalone and alongside suite mode declarations in either load
  order: forced light/dark overrides OS preference, nested auto resets a pin, local
  --etch-* tokens win, and live system changes update auto mode. Check document,
  selection, viewport identity, sidebar state, history and revision remain unchanged
  with no content events. Exercise the demo Appearance selector and focused theme
  coverage in Chromium/Firefox.

### 14.3 Manual accessibility and device checks

All toolbar/layer/menu actions are semantic labeled controls with visible focus,
pressed/disabled state, and keyboard access. Root has an accessible editor label.
Use a polite live region for committed command labels, active layer/lock changes,
and actionable failures; do not announce every pointer sample or pan event. Include
an accessible layer/element summary (type/count, image alt) without promising full
nonvisual geometry authoring. Selection can be deleted/nudged without dragging.

Check mouse, trackpad pinch/wheel, real pressure pen, palm contact, touch navigation,
Draw with finger, fullscreen denial, Escape, browser zoom/DPR change, and mobile
orientation. Check narrow toolbar/header scrolling, disclosure reopening, divider
discoverability/keyboard use and touch targets at minimum card sizes. Drawing must
not unexpectedly scroll the page; controls outside the viewport must remain normal page UI.

### 14.4 Performance and completion

Approved scope change: formal performance baselining is deferred. The editor has
been responsive in user testing; do not build timing infrastructure or optimize
without a user-visible problem. Ancient phones/computers are not a support target.
There is no formal timing/fixture completion gate or claimed passing measurement.
If responsiveness regresses on representative modern
hardware, reproduce and profile that workload before adding caches or weakening correctness.
Retain correctness/security tests for imports/loads at configured limits: bounded
memory/work, cancellation and useful errors remain required. Safety ceilings do
not promise fluid editing of every maximum-sized document.

Complete means: requirements above implemented; native format/API documented;
a runnable no-build demo; reproducible correctness tests and documented browser verification; no
reference runtime imports; no hidden storage/network side effects; known limits
and any approved deviations clearly recorded. Do not claim production readiness
based solely on pure tests or one browser's mouse interaction.
