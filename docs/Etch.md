# ligHTMetaL::Etch — Leave your mark.

No-build browser sketch editor for Lightmetal attachments. Plain JavaScript ES modules
and scoped CSS; no runtime dependencies, storage backend, or remote services.

**Work in progress — drawing, selection, layers, image/native/SVG import and PNG/SVG download.** Draw freehand, lines,
arrows, rectangles and ellipses, add translucent highlights, erase whole marks or cut gaps in freehand strokes/straight lines, or drag an
entire chosen layer independently. Import a picture as its own layer and draw above it.
Mouse, pen and optional finger input are supported. Native persistence, layers,
history, revisions, rendering for every native type, DPR/resize and pan/zoom are
implemented, including selection picking, marquee, movement and resizing.
**Fullscreen includes native browser mode and an expanded-page fallback. SVG image
fallback is deferred beyond v1 and is not implemented.** Editable SVG import
supports a restricted vector subset with mandatory full-tree security checks and a
confirmation dialog. Unsupported artwork is rejected clearly, never silently stripped
or automatically rasterized.
V1 acceptance is not complete. `specs/etch-spec.md` defines the contract;
`etch-verification.md` tracks remaining checks and current verification.

## Compact editor UI

### Toolbar

The top toolbar uses labeled SVG icon buttons for implemented quick actions
(Undo/Redo, Hand/Pan, Select, Pen, Highlighter, Eraser, grouped Shapes, Move Layer, Rotate, Fit,
100%, Fullscreen, Document background, and the far-right sidebar toggle).
History, Navigation, Drawing, Document, View and Zoom have distinct groups with shortcut
tooltips. On narrow cards the toolbar scrolls horizontally instead of shrinking
touch targets; the sidebar toggle remains fixed at the right. Shapes is a split
button: the main icon activates the last-used shape, and the chevron opens a
Line/Arrow/Rectangle/Ellipse chooser. Its icon follows the chosen shape. Arrow keys,
Home/End and Enter navigate the chooser; Escape closes it and returns focus.

A contextual quick-controls row below the toolbar starts **collapsed**. Click Pen,
Highlighter, Eraser or Shapes to open it; click the active tool again to hide it without changing
tools. Tool keyboard shortcuts also open the relevant controls (including when that
tool is already active). Hand, Select and Move Layer have no quick-controls row.
Canvas interactions do not dismiss it. Sidebar visibility is independent.
Pen offers eight color swatches, expandable additional colors, a custom picker,
width presets (1/3/6/12 world units) and a shared-geometry stroke preview. Shapes
reuse stroke colors/widths and add type, border/fill toggles and fill color. Eraser
has radius presets (5/10/20/40 CSS pixels) and its existing mode selector. Controls
scroll horizontally on narrow cards and synchronize immediately with sidebar
properties; precise numeric inputs remain in the sidebar. Hiding controls or
switching tools preserves each tool's settings. This row is session UI, never
saved content or history. Programmatic tool changes do not open the row.

### Layers and sidebar

The right sidebar starts **collapsed** in embedded editors unless `createEtch(container, {sidebarOpen:true})`
is used. The **demo starts with it open** so Layers and tool settings are visible.
Collapse it with the far-right toggle, especially before drawing on phones. It contains
New Layer, Import image, active-layer selection, visibility, locking and a **trash-can
button on every layer row**. Deleting a layer with artwork asks for confirmation;
empty layers delete immediately. Unlock a locked layer first. **Undo** restores the
layer and its image data; deleting the final layer replaces it with an empty one.
Use the **⋯ Layer options** button beside the Layers heading to rename the active layer
or **Move layer up/down** in the stack. Higher layers draw above lower ones. Each action
is undoable; locked layers must be unlocked. **F2** on a focused layer-name button edits
that specific row without changing the active layer. Escape cancels the modal draft,
not the sidebar. **Merge Down** in that same dialog combines the target layer with its
immediately lower neighbor. Both must be visible and unlocked; the dialog explains
why merging is disabled. The lower layer keeps its ID/name/offset and becomes active.
Artwork stays editable, painter order and exact image bytes are preserved, selection
clears, and one Undo restores both layers. F2 operations target that row, including merge.
The sidebar defaults to a **240 px** desktop column, or an overlay drawer when the
editor card is **700 px wide or narrower**—even in a large desktop window. Drag its
left divider to resize between **200–400 px**, reduced as needed to leave room on
small mounts. Double-click the divider or press Enter on it to reset to 240 px.
Left/Right adjusts by 10 px (Shift: 50); Home/End selects the available limits.
Escape, pointer cancellation/capture loss or blur rolls back an unfinished drag.
The requested width persists for this editor session, including collapse/reopen and
temporary narrowing, but is never saved to native JSON or browser storage. An inherited
`--etch-sidebar-width` can set the initial width; user resizing takes precedence.
The layer list and properties body scroll independently. Toggle, Escape outside the
resizer, or the mobile outside scrim closes the sidebar. Layout changes preserve the
viewport/canvases, world center and zoom, content, active layer and history.

### Tool properties

**Tool Properties appear below Layers**:
Pen color, synchronized width slider/numeric input, Pressure width checkbox and a
constant-pressure stroke preview, Highlighter color/width/opacity, or Shapes type/border width/border and fill colors, including no fill and
fill-only. Eraser offers **Whole object / Partial (Pen + lines)** modes,
a screen-pixel radius and **Erase with finger**. Move
Layer shows its target, instructions and **Move with finger**; all finger controls
share the same preference as Draw with finger. This section hides for Hand and retains
per-tool preferences across tool switches and sidebar collapse. Tool selection/settings
are independent of active layer and document history. Settings sit directly beneath
Layers. Long layer lists scroll independently, using at most half the sidebar while
settings are visible; when settings are hidden, layers can use the full available
height. No inert tool buttons or settings are shown.
Layers and contextual properties have independent disclosure buttons. Collapsing
either retains its controls and settings; disclosure state is session-only.
The property header stays visible while its content scrolls. The pen preview uses
the shared artwork outline geometry and never becomes document/export content.

### Status and empty state

The **26 px status bar** shows the current tool/active layer, zoom and default
export surface bounds in world units, including the normal 16-unit export padding.
Empty artwork uses the same 288×288 surface as exports. This is not a fixed document
size or a guarantee that a large drawing fits PNG budgets; custom crop/padding/scale
options may differ. Wet previews and view navigation do not change these dimensions.
Announcements remain live for assistive technology; narrow cards prioritize context
and metrics, with error messages replacing them when needed. Etch does not infer a
saved state: persistence/save-status tracking remains host-owned (as in the demo).

The empty canvas offers **Import drawing** and **Import image** shortcuts. Drawing
import inserts a layer through the existing confirmation flow; it does not replace
or reopen the document. Drop **one PNG/JPEG/WebP file** onto the viewport to use the
same image preview/confirmation dialog as the chooser. Nothing is inserted before
confirmation; Cancel preserves the document and Undo restores a confirmed import.
SVG/native drops are not supported—use their explicit sidebar import actions instead.
Read-only editors hide empty-state editing actions and reject file drops. When all
artwork is hidden, the empty state suggests showing a layer instead of implying loss.

**Text and general vector opacity/transparency remain future work.** Highlighter is
an explicit supported extension, not an opacity setting on Pen or arbitrary shapes.
Its native `highlight` type preserves translucency; older readers reject that unknown
type rather than opening it as opaque ink. PNG and WebP image alpha remain supported.

## Document background

The **Document background** button in the top toolbar's Document group opens
a draft dialog, even with the sidebar closed. Cancel, Escape and Apply return focus
to this button. Choose **Transparent** (the default), **Solid color**, **Off-white**,
**Dot grid**, **Graph paper**, **Ruled paper**, or **Engineering paper**.
Off-white is the ordinary solid color `#FAF8F2`; Dot grid uses subtle circular dots
anchored to world origin. Solid color uses a color picker or opaque
`#RRGGBB` hex input. Paper offers integer spacing from **8–128 world units** (default
24); one world unit is one CSS pixel at 100% zoom. Engineering paper is pale green
with heavier grid lines every five squares. **Apply background** makes one undoable
document edit. Changes to style, color and spacing preview immediately behind the
artwork on the document. Cancel or Escape restores the original background without
changing history or redo. Invalid drafts show the committed background until fixed.
Native saves and PNG/SVG exports always use the committed background, not the draft.
The dialog closes if a host edit/load replaces its baseline, so stale drafts cannot
overwrite newer content. Read-only/busy editors disable the action; a hidden or locked
active layer does not block this document-wide setting.

This is the **saved document background**, included in native JSON and PNG/SVG export—not
the CSS paper color or the Lightmetal theme. Transparent drawings may still look white
in the editor, but export with alpha. Opaque images cover the background; changing it
does not replace white pixels inside a photo, recolor artwork, or create a new layer.
Navigation, selection, active layer and tool stay unchanged. The last solid color is
a per-instance dialog preference, not an extra native field; the dialog also remembers
its last paper spacing for the session.

Paper is not an artwork layer: it cannot be selected or erased. Dots and lines are
anchored to world origin and pan/zoom with the drawing, not the screen. They fill
the entire export crop, including padding, but do not enlarge automatic artwork bounds. Empty drawings
retain the standard 288×288 default export. Ruled paper uses horizontal lines without
a margin. Dot/graph/ruled paper is white; paper colors are independent of the theme.

```js
editor.setBackground({type:'engineering', spacing:24}); // also 'dots', 'graph' or 'ruled'
editor.setBackground(null); // transparent; solid '#RRGGBB' remains supported
```

Native v1 accepts `{type,spacing}` backgrounds alongside null/hex
forms. Older Etch readers reject paper backgrounds rather than silently dropping them;
use an updated editor to reopen these files. Native JSON remains the lossless backup.
SVG uses a small generated repeating vector pattern, not embedded raster paper or
thousands of line objects. Paper-containing SVG exports are outside editable SVG
import's supported subset; reopening native JSON preserves paper and artwork.

Canvas/PNG paper work is capped at 50,000 grid lines or dot intersections per render.
Extremely large world crops can hit `LIMIT_EXCEEDED` (`details.limit === 'paperLines'`) even at a small PNG
scale; reduce the crop or increase spacing. SVG export stays bounded independently
of crop size and uses no editor-owned raster tiles.

## Importing an Etch drawing as a new layer

Open the sidebar → **Import drawing** (document-arrow icon in the Layers heading).
Choose a local `.etch.json` / `.json` file, review the summary, then **Import as one layer**.
This **adds to your drawing**; it is not load/reopen, which replaces the whole document.
The file name becomes the new layer name (up to 80 characters).

- Visible source layers are combined bottom-to-top, retaining editable native types,
  pressure samples, cut ink, paths, images and element order. Source layer offsets are
  baked into element matrices; source locks are ignored. The new layer is visible/unlocked.
- **Hidden source layers and source background are omitted**, with explicit warnings
  in the pre-import summary. Your existing background and artwork are unchanged.
  Use `load()` to preserve a source drawing's complete layers and background instead.
- All imported IDs are fresh; image references are remapped. Referenced PNG/static WebP
  bytes are retained exactly, without progressive recompression or rasterizing vectors.
- One import is **one Undo step**, including the new active layer/assets. Insertion is
  above the captured active layer, even if that target is hidden/locked. Imported painted
  bounds are centered on the captured viewport world center at original scale. No automatic
  Fit or silent shrinking; choose Fit afterwards if needed.
- Cancel/Escape, parse/decode/limit failure, load and destroy cannot commit partial imports.
  Saves/PNG stay committed-only while the summary is open. Navigation during API imports
  does not change captured placement/target. Concurrent imports/content edits reject BUSY.

```js
const {layerId, revision, warnings} = await editor.importDocument(nativeObjectOrJSONString);
// API imports do not open a modal; warnings enumerate omissions:
// {code:'HIDDEN_LAYERS_OMITTED', layers:[{id, name}, ...]}
// {code:'BACKGROUND_OMITTED', color:'#RRGGBB'}
// Paper source: {code:'BACKGROUND_OMITTED', background:{type:'graph',spacing:24}}
editor.fit(); // optional host-chosen framing
```

The full source (including hidden content) and combined destination use the same native
validator/host limits. UI file bytes are bounded before reading by `jsonBytes` (default
128 MiB). Files are strict UTF-8 and read through a bounded stream; Cancel/load/destroy
abort outstanding reads rather than just ignoring their results. Empty visible geometry rejects `EMPTY_IMPORT`. Only image assets referenced by
visible imported marks are decoded/retained; omitted/unused assets are not copied. Imported
assets plus current/Undo/redo images share count/byte/pixel limits, and temporary decoded
assets reserve the shared raster budget through confirmation or cancellation cleanup.
A cancelled underlying decode can hold its reservation until its bitmap settles, preventing
concurrent PNG/import jobs from overallocating. A valid source may therefore be rejected
when the combined drawing or retained history exceeds a limit. Nothing is uploaded.

## Importing an SVG as editable vectors

Open the sidebar → **Import SVG** (file-with-code-brackets icon), choose a local `.svg`, review
the summary, then **Import as one layer**. The new visible/unlocked layer is inserted
above the captured layer, centered in the captured view **at original scale**, with
one Undo step. Existing artwork/background stay unchanged; there is no automatic Fit.
The summary shows the source viewport and painted size. Nothing is uploaded.

```js
const {layerId, revision, warnings} = await editor.importSVG(svgTextOrBlob);
// API imports have no modal; warnings is currently [].
editor.fit(); // optional host-chosen framing
```

Files must be UTF-8; input is capped at **5 MiB** or the lower host `jsonBytes` limit,
checked before opening the Blob stream. Strings are bounded by UTF-8 byte length.
The complete XML tree is security-checked before hidden/unused content is omitted;
source markup is never attached, rendered, stored or sent to a decoder. Fresh native
geometry then uses the same destination/history-safe IDs, combined limits, captured
placement, single-flight cancellation and atomic transaction as native drawing import.
Cancel/Escape, failures, load and destroy cannot install partial or stale content.
Saves and exports remain committed-only while the confirmation is open.

Supported: paths (including arcs), square-corner rectangles, circles/ellipses, lines,
polylines/polygons, groups, affine transforms, root/viewBox mapping, opaque solid
colors, physical units, simple tag/class/ID stylesheet rules and inherited/currentColor
paints. Nonrendered unsupported content is ignored only after security inspection;
`visibility:hidden` alone cannot make referenced `<use>` content safe to omit.
Text, images, gradients, clipping/masks, filters, dashes, partial alpha and other
unsupported effects reject with actionable diagnostics. Some conservative curve-stroke
bounds/native coordinate limits can also reject otherwise fitting artwork. Export a
PNG in your drawing app and use **Import image** for those files. **No Import as Image
mode or automatic fallback is implemented**; passing an options argument rejects.
Native JSON remains the full-fidelity editable backup, especially for image layers.

## Importing a picture

Open the sidebar → **Import image** in Layers. Choose a local **still PNG, JPEG or
WebP** (no upload), inspect the preview/encoded size, then **Import as layer**.
Default: **WebP quality 80**. Adjust quality or select **PNG — lossless**. Browser-native
codecs only: no runtime dependency, no maximum-effort PNG knob or guaranteed lossless
WebP mode. If WebP encoding is unavailable, the dialog automatically selects PNG,
prepares its preview and remembers that choice for this editor session. No extra
format-selection click is needed; confirmation is still required.

Import creates one visible unlocked layer above the captured active layer, at natural
pixel size centered on the captured viewport world center. **Fit** if needed, **Lock**
the image, then **New layer** to draw above it. Move Layer repositions it without
rasterizing the vector artwork. One import = one Undo step (including active layer).

Image bytes are finalized during import and retained exactly by native JSON save/reopen
and history; drawing above never progressively recompresses the image. Safe, still PNG
input chosen as PNG keeps its original bytes/metadata; other conversions normalize
browser-decoded orientation and use Canvas encoding. Preview shows final encoded pixels.
PNG uses lossless compression; browser decoding/color management governs conversion
from other input formats. Dimensions/transparency are preserved, never silently resized.

Files are limited to 20 MiB. Actual headers, dimensions and containers are checked before
decode; animations/SVG/GIF/TIFF/remote URLs are not accepted. Resource limits include
retained Undo/redo images plus temporary source/output/thumbnail pixels, so conservative
preflight may reject an image that would fit by itself. Cancel/failure/load/destroy leave
committed content intact and dispose transient resources. Content edits reject BUSY
while an import is pending; navigation/cancel remain independent (the UI preview is modal).

```js
const {layerId, revision, warnings} = await editor.importImage(file); // WebP, quality 0.8
await editor.importImage(file, {format:'png'});                        // lossless
await editor.importImage(file, {format:'webp', quality:0.65});
```

The API keeps explicit output-format semantics: unavailable WebP encoding rejects
with `details: {encoder:'webp', supported:false}`. Hosts can catch that failure and
retry with `{format:'png'}`; the demo's image buttons do this.

The demo's **Load coloring image** and **Load note image** buttons sit outside the pad.
They import the supplied local files using WebP 80, then explicitly Fit; existing art
is not replaced. Source files `examples/etch/coloring.webp` and `examples/etch/note.jpeg` remain unchanged.

## Downloading PNG

Choose **Export → Export PNG** in the editor's top toolbar to download `drawing.png`.
It works with the sidebar closed, in fullscreen, and in read-only embeds. The demo's
**Download PNG** button above the pad remains a host-side shortcut. PNG flattens
all **visible layers**, including locked layers, photos, pressure strokes and partially
erased ink. Hidden layers and unfinished gestures are excluded. The editable drawing,
view, selection, history and saved-status indicator are unchanged.

PNG is a finished picture, **not an editable backup**: also download native JSON to
resume editing later. Native transparent background stays transparent (the white CSS
paper is not exported); a non-null native background is included. Default bounds are
visible painted bounds plus **16 world units padding**, independent of view/zoom/DPR.
Empty drawings use a centered 256×256 world area before padding (288×288 at scale 1).

```js
const {blob, revision} = await editor.exportPNG();
const thumbnail = await editor.exportPNG({scale:0.5, padding:8});
const crop = await editor.exportPNG({
  bounds:{x:0, y:0, width:800, height:600}, padding:0, scale:2
});
```

Snapshot pixels/revision are captured before asynchronous encoding: later edits, Undo
or load cannot change the result. Export is allowed read-only and during pending loads/
imports when the shared raster budget permits it; it does not cancel a live gesture.
Destroy rejects pending exports with `CANCELLED`. `cancel()` cancels content/load/import
work, not independent PNG snapshots.

Output is bounded **before allocation** to 8192 per dimension and 16,777,216 pixels,
further reduced by host raster limits and available combined pixel budget. At most four
PNG encodes run per editor (`BUSY` thereafter). Current/Undo images, native-load decodes,
image-import surfaces and pending PNG canvases/encoder snapshots (two output-size
surfaces per PNG job) share transient pixel reservations;
large concurrent operations may reject safely rather than overallocate. `EXPORT_TOO_LARGE`
provides `details.suggestedScale` (0 if no pixels are currently available). The demo asks
before using a suggested lower scale—never silently shrinks the editable picture.
Browser-native PNG encoding is lossless compression with browser color management;
there is no maximum-effort setting. Temporary canvases are disposed, not editor assets.

## Downloading SVG

Choose **Export → Export SVG** in the editor's top toolbar (or the demo's
**Download SVG** shortcut) to download `drawing.svg`, a scalable picture of all
visible committed artwork (including locked layers). It leaves the editable drawing,
selection, view, history and saved-status indicator unchanged.

```js
const {svg, revision} = editor.exportSVG(); // synchronous, not a Promise
const cropped = editor.exportSVG({bounds:{x:-20,y:10,width:800,height:600},padding:0});
const file = new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
```

Bounds/background/empty behavior matches PNG: visible painted bounds plus 16 world
units padding, optional explicit world crop, transparent unless the document has a
solid background, and a centered 256×256 empty fallback before padding. Neither theme
paper nor selection/live previews appear. Fractional dimensions and full numeric
precision are retained; root viewport clipping preserves explicit crops.
**SVG cropping is not redaction:** out-of-crop geometry and complete embedded image
bytes remain in the file. Use PNG for a flattened crop. Existing metadata within image
bytes is not stripped.

Shapes and normalized paths retain affine transforms, fills, holes, caps/joins and
painter order. Pen pressure and cut ink use the shared generated **filled paths**.
PNG/static-WebP images embed their exact original MIME/base64 bytes with native image
stretching, without re-decoding, recompression or rasterizing the vectors. No scripts,
CSS, external references, layer names, IDs, image alt text or editing metadata are emitted.

SVG captures its committed document/revision synchronously, so later edits/load/destroy
cannot alter the returned string. Read-only and pending-import/load states are allowed;
it needs no canvas, decoder or raster-pixel reservation and does not cancel a gesture.
Calls after destruction throw `DESTROYED`. SVG options accept only `padding` and `bounds`,
not PNG's `scale`.

A bounded writer enforces **128 MiB UTF-8 output**, further reduced by host `jsonBytes`,
and native derived-geometry limits. Oversized output throws `EXPORT_TOO_LARGE` without
returning a truncated document or mutating state. Reused images embed per instance, so
a valid native document can exceed the SVG output limit. Shrinking dimensions cannot
reduce vector/image payload bytes; there is no suggested PNG-style scale retry.

**Native JSON remains the lossless editing backup.** SVG does not retain native layer/
pressure-sample semantics. Embedded images exported to SVG are outside editable SVG
import's vector subset; SVG image fallback remains unimplemented.

### SVG import security and compatibility

SVG import is **not a general-purpose sanitizer** and returns no DOM or sanitized
markup. Its mandatory pipeline checks bounded XML, resolves styles/coordinates,
converts supported geometry and validates native data before atomic insertion.
See `etch-maintenance.md` for module boundaries and maintenance invariants.

Compatibility fixtures cover declarations/comments, namespace-prefixed SVG, pasted
snippets missing `xmlns` (not explicit wrong namespaces), Inkscape/RDF metadata, unused
definitions, and Illustrator-style tag/class/ID palette rules. Simple stylesheet rules
and inline declarations preserve priority/order—including spaced `! important`.
Invalid later CSS declarations do not erase earlier valid colors. Supported SVG paint
defaults, currentColor, CSS-wide inheritance, physical strokes and transparent paint
are resolved; intermediate alpha, dashed strokes and unsupported effects are rejected
when relevant to painted content. `display:none`/zero-opacity subtrees are pruned only
after XML security checking; visibility-hidden groups may have visible descendants.
The importer defers unsupported appearance decisions until visibility is known; the
standalone strict XML inspector retains its narrower structural contract. Root attribute
transforms use viewport-centered SVG semantics, with both pre-transform root clipping
and the final image viewport checked. Zero-length round/square lines become native dots;
small/large primitives use paths when representable, without clamping. Local painted
stroke widths still obey the native .01–1000000 range. Rounded rectangles
and zero-length round/square-capped path subpaths remain unsupported. Straight-path clipping
uses local joins/caps rather than global miter padding; curved-stroke bounds remain
conservative. Bounded geometry-empty proofs avoid rejecting irrelevant opacity/paint on
simple no-op shapes; generating filters and markers cannot bypass checks that way.
Rendering hints are retained and explicitly checked, not silently discarded.

DTD/entities/PIs, scripts/events/animation, active foreign markup, base URLs, external/
embedded references and disguised CSS resources are rejected, including in hidden or
unused content. Metadata URLs describing an artwork are not treated as resource loads.
Unknown appearance gets bounded unsupported-feature diagnostics. Complex CSS selectors,
CSS escapes, legacy DTD headers, embedded images and image fallback are not supported.
No third-party sanitizer is required for normal supported imports. Etch's narrow owned
policy is mandatory; a host sanitizer cannot replace the full-tree security, fidelity,
resource and native-model checks. This is a tested restricted importer, **not a general
SVG sanitizer, completed v1, formal security proof or real-device acceptance claim**.

## Drawing with Pen

Pen is selected initially in editable instances; read-only instances start with Hand.
Drag to draw, or tap for a round dot. Open the sidebar for opaque pen color and width
(0.5–64 **world units**, default 3), plus **Draw with finger**. Settings affect subsequent
marks only; they do not recolor/resize existing marks or change an in-progress stroke.

Mouse and finger strokes use constant width. **Pressure width** (on by default) in
Pen's quick controls/sidebar makes stylus width respond to pressure. Turn it off for
constant-width stylus strokes at the selected width; stored samples then use pressure 1
and `pressure:false`. The toggle persists for the session and affects new strokes
only, not existing artwork or the gesture already in progress. With it on, Pen input clamps/filters pressure once,
stores the normalized samples, and renders through the shared midpoint-smoothed
outline builder. Optional coalesced events are captured in order without frame-based
sample dropping. First/last endpoints and very short strokes are retained.

A completed stroke appends to the active visible unlocked layer as **one undoable
command and one change event**. Wet previews respect upper layers and images.
`save()` during drawing returns only committed content. Escape, capture loss,
pointer cancellation, blur/focus loss, resize, tool/layer changes, load and `cancel()`
discard the preview without committing it. Sample/geometry limits cancel the whole
stroke with feedback; they never silently save a truncated mark.

Finger input defaults **on** for Pen, Highlighter, Shapes, Select, Eraser and Move Layer. Turn off
the shared finger checkbox to use one finger for navigation instead; an explicit
off choice survives tool switches and sidebar collapse for the session. Hand always
pans, and a second touch cancels the unfinished finger gesture and begins pan/pinch. Stylus input
owns its stream over incidental palm contact; wheel/touch cannot move the view during drawing.
Reliable pen eraser-end/barrel reports (`button:5` or `buttons & 32`) temporarily
invoke object erasing, without changing the selected tool or its preferences. Switching
from unfinished ink cancels that ink first; ordinary right-click never draws or erases.
Native selection/copy callouts are suppressed on the artwork viewport, including
Safari-specific CSS; text fields and host-page controls retain native behavior.
Real hardware/device acceptance is still open.

## Drawing with Highlighter

Choose **Highlighter** or press **K**. Drag or tap for a smooth, round-ended translucent
mark. Default: yellow `#FDE047`, width **20 world units**, **35% opacity**. Quick controls
offer colors, width presets **8/16/24/40** and an opacity slider; the sidebar keeps
precise width and opacity inputs. Width is 0.5–64 world units, opacity 5–100%. Settings
are separate from Pen and persist while switching tools or hiding either surface.

Highlighter is always constant-width for stylus, mouse and finger. It uses normal
source-over compositing: a complete stroke outline is filled once at its opacity,
so self-overlap within one stroke does not darken; separate strokes build up color.
It respects layer/painter order rather than floating above other artwork. One gesture
is one undoable native `highlight` element with sampled points and opacity. Selection
move/resize/rotation, native import/load/save and PNG/SVG export preserve appearance.
Whole Object Eraser removes highlights; Partial Eraser deliberately leaves them intact.

SVG export includes highlight opacity, but editable SVG import remains its restricted
opaque-vector subset and may reject that SVG. Native JSON remains the lossless backup.
Older Etch readers reject documents containing `highlight`, never silently lose alpha.

## Drawing with Shapes

Click **Shapes** to select the last-used shape (initially Rectangle). Expand the sidebar
and choose Line, Arrow, Rectangle or Ellipse, or use focused-editor shortcuts **L / A / R / O**.
The shape chooser and quick-controls row also offer these types without the sidebar.
Drag in any direction; release commits one native element, one undoable command and
one change event. Live shapes keep their active layer's painter order beneath upper
marks/images. Save/history/revision contain only committed content.

Each shape tool retains its own opaque border color and width (0.5–64 world units,
default #24292F / 2), plus rectangle/ellipse fill (default **no fill**). Enable Fill to
choose a color; disable Border for fill-only shapes. At least one paint is required;
lines and arrows always have a border. Shapes use uniform width even with a pressure stylus.
Preferences are captured at gesture start and never restyle existing artwork.

Hold **Shift** for 45-degree line/arrow snapping or a square/circle; pressing/releasing it
updates the preview without pointer motion. Lines preserve their length when snapped;
square/circle constraints use the larger drag extent and preserve the start anchor.
Line/arrow caps and rectangle joins are round. A line or arrow needs at least 2 CSS px length;
rectangle/ellipse need at least 2 CSS px in each constrained extent. Taps, flat/tiny
boxes and drags returned to their origin create no mark or history. Pen taps still
draw dots. Cancellation and destination-limit failures follow the same atomic rules
as Pen.

**Arrow (A)** draws one shaft with an open arrowhead at the release endpoint.
The head uses the stroke color/width; its length is `min(shaft length, max(12, 4 × width))`
world units, with a half-width of half that length. Shift snaps the shaft and head
together. Each arrow is saved as a single ordinary native `path` (five commands), so
older readers, PNG/SVG export, selection move/resize/rotation and Undo work without
a new native type or SVG markers. Width/color affect new arrows only; the head is
baked into path geometry, not a separately editable endpoint. Whole Object Eraser
removes an arrow; Partial Eraser leaves it intact like other general paths.

## Erasing

Select **Eraser**, or press **E** with editor focus. Open the sidebar to choose
**Partial (Pen + lines)** (the default) or **Whole object**. Both work only on the
**active visible, unlocked layer**; mode/radius are captured at gesture start.

### Whole object

Tap or drag across marks. Every touched object is removed in full, including
pressure strokes, shapes, native paths and images—not individual pixels or stroke
fragments. Other layers and the native background are never erased.

Open the sidebar to set **Radius (screen px)**: default 10, range 1–128 CSS pixels.
The circular cursor stays the same size at every zoom/DPR. Radius is captured at
start; settings changes affect the next gesture. Enable **Erase with finger** for
touch erasing; otherwise one finger pans. Second-finger and stylus/palm ownership
follow the same rules as Pen.

The eraser sweeps between **every consecutive sample**, including coalesced and
release samples, so fast drags cannot jump over marks. It tests painted geometry,
not just bounding boxes: unfilled interiors, fill-rule holes and curve hulls do not
count as paint. Images deliberately use their entire transformed rectangle, even
transparent pixels. Affine skew/nonuniform scaling and moved layer offsets are honored.
Exact Canvas fill/stroke membership supplements a bounded, subpixel-flattened swept
boundary test; shared pressure outlines are never smoothed or filtered differently.

Live omissions reveal underlying layers in their original painter order. Release
commits **one “Erase objects” edit**, and Undo restores original insertion order and
image resources. Save/revision/history stay committed-only during the gesture;
surviving selection IDs are retained. Misses preserve selection, revision and redo.
Cancellation or a sample/geometry/work-limit failure restores **all** omitted marks,
never a partially erased document. Erasing remains available with stored document
point/element capacity full.

### Partial — freehand Pen and straight lines

1. Draw with **Pen (P/B)**, or use **Shapes → Line (L)** for a straight line.
2. Choose **Eraser (E)**, open the sidebar, and set **Mode → Partial (Pen + lines)**.
3. Close the sidebar on a phone, then tap or drag across the ink to cut gaps.

**Freehand:** cuts the actual painted outline, retaining the surviving curve and
pressure-shaped thickness rather than deleting/re-smoothing samples. Surviving pieces
are editable **native vector ink**, not a bitmap or a clip mask, and can be erased again.
A thick dot can become a ring. Connected pieces retain their original painter slot;
the first keeps the original ID/selection and additional pieces receive stable fresh IDs.
One **“Partially erase ink” Undo step** restores the entire drag, including any line cuts;
Undo restores the original sampled Pen strokes exactly. Save/reopen retains the cut ink.
Untouched cubic primitives stay verbatim; only intersected curves are flattened within
0.02 screen px. Native Canvas antialiasing may differ slightly after regrouping paths.

**Straight lines:**

This cuts full-width line sections rather than shaving individual pixels. Round/square
ends retract enough to keep new caps from filling the gap back in. The remaining pieces
are ordinary editable **native lines**, with original color, width, cap and affine
matrix—not a bitmap or a mask. They can be cut again. Several gaps in one drag still
make **one “Partially erase lines” Undo step**; Undo restores the exact original line.
Outer endpoints are retained unless erased, and pieces occupy the original painter slot.
The first surviving piece keeps the original ID/selection; additional pieces get fresh IDs.

**Partial mode leaves rectangles, ellipses, general paths and images untouched.**
Use Whole object to remove those. Resulting `ink` is a development-v1 native type; old readers reject it rather than
resurrect erased ink.

Sweeps include all coalesced/release samples and support moved layers, skew/reflection,
nonuniform scale, zoom and DPR without changing cursor size. Preview/save/cancellation,
finger/palm ownership and no-op/redo rules are the same as Whole object. Splitting may
increase element/JSON/derived-work usage; vector ink also consumes stored command
capacity, potentially more than the original Pen samples. If the combined destination
exceeds a limit, **the whole gesture is cancelled**, never silently replaced by whole-object
erasure. Stored point capacity is not required for straight-line fragments.

## Selecting, moving and resizing objects

Choose **Select (V)** to edit objects on the active visible, unlocked layer.
Click/tap picks the topmost painted object; Shift-click toggles it. Images use their
entire transformed rectangle, including transparent pixels. Empty click clears selection.
Drag empty space to select marks whose painted bounds are fully enclosed; Shift-marquee
adds. Drag a selected mark to move the selection, or drag an unselected mark to pick
and move it. Empty areas inside the selection outline still start a marquee.

Moves preserve object order, original geometry, affine transforms and exact image bytes;
only the selected elements' translation changes. One completed drag is one Undo step.
Previews are not saved/exported. Taps, sub-2-CSS-pixel drags and returning to the origin
create no edit and preserve redo. Escape cancels a live gesture; otherwise it clears
selection (when the viewport has Select focus). Delete/Backspace removes the selection;
Ctrl/Cmd+A with Select selects all active-layer objects. Host text inputs retain normal shortcuts.

**Select with finger** uses the shared finger preference. With it off, touch navigates;
a second finger cancels an unfinished selection move/resize/marquee before pan/pinch.
Selection outlines and handles are UI overlays, not drawing pixels or PNG content.

### Resizing (including imported images)

Select a mark, then drag one of the **eight resize handles**. Handles take priority
over object picking. Corner handles resize both axes; side handles resize one axis.
A **single image keeps its aspect ratio by default**; hold Shift to resize freely.
Other objects and multi-selections resize freely by default; hold Shift at a corner
to preserve aspect. Pressing/releasing Shift updates the preview immediately.

The opposite handle stays anchored. Each preview uses the original selection bounds
and matrices, not accumulated intermediate scales. Resize scales stroke thickness along
with geometry, preserves painter order, layer offsets and original image bytes, and
commits as **one Undo step**. Images are not progressively resampled or recompressed.
Save/reopen and PNG export honor the new transforms. Escape cancels the entire resize;
failed validation/resource limits also discard the whole preview.

No flipping or rotation handles. Shrinking clamps to positive nonsingular scales;
very thin selections use an 8-CSS-pixel minimum interaction box without padding stored
geometry. Handles are 8 CSS pixels visually with 16-pixel hit areas (24 for touch).
Taps, jitter below 2 CSS pixels and drags returned to their origin preserve revision/redo.

With Select and editor focus, **arrow keys nudge by 1 world unit**, or **Shift+arrow
by 10**, independent of zoom/DPR. Each key press is one undoable move.

## Rotating a photo, object or layer

For a sideways school photo, click the **Rotate clockwise 90°** toolbar button.
It rotates selected objects if there is a selection; otherwise it rotates the whole
active layer. Its tooltip identifies the target. The sidebar can stay closed.
Click twice for 180°, or four times for a full turn.

You can also open **⋯ Layer options** and click **Rotate layer clockwise 90°** to
rotate that layer regardless of selection. The dialog
stays open for repeated clicks. Unlock/show the layer first; empty layers cannot rotate.
All artwork on that layer—including notes—rotates together around its combined
painted center. Notes on other layers stay untouched.

To rotate only the photo or particular objects, choose **Select (V)**, select them,
then use **Rotate selection clockwise 90°** in the sidebar properties below Layers.
Multiple selected objects rotate together, not around separate centers.

Each click is one Undo step. Rotation keeps IDs, painter order, selection, layer
offsets and original image bytes; it does not recompress images, change zoom or
implicitly Fit. Native save/reopen and PNG/SVG export retain the rotation. Use Fit
afterwards if needed. Free-angle/two-finger rotation is deferred; two fingers still
navigate the view.

## Moving just one layer

1. Open the sidebar and select the layer you want to move.
2. Click the **four-arrow Move Layer** toolbar button, or press **M** with editor focus.
3. On narrow screens, close the sidebar to reach the canvas. Drag **anywhere on the
   canvas**. Only that layer's artwork moves; the other layers and the view stay put.
   Release to finish; Undo restores the previous position.

The active layer's name appears in the status bar and Move Layer properties. Selecting
another layer keeps the tool active and changes its target; choosing the tool never
changes layers or opens/closes the sidebar. Hand, Space-drag and middle-drag still
pan the **whole view**, not a layer.

Each completed move changes only the native layer offset, preserving element order,
coordinates, transforms, colors and image resources. It is one undoable edit and one
change event. Previews preserve painter order, and `save()` returns committed content
only. Taps, drags under 2 CSS px and drags returned to their origin are no-ops, retaining
selection and redo. Empty layers can move; hidden/locked/read-only layers cannot.
Cancellation or invalid world/resource placement discards the whole preview.

For touch, enable **Move with finger** in the sidebar; it shares the existing finger
preference with Pen/Shapes/Eraser. Otherwise one finger pans the view. A second finger cancels
the pending layer move and begins pan/pinch. Stylus movement ignores pressure.

The demo offers a taller workspace: up to 1440 px content width and roughly 85%
of viewport height (560–1000 px on desktop; 80% / 480–760 px on narrow phones). Embedded
editors still use the host's dimensions; only demo sizing changed.

## Rendering and navigation

Use **Load sample drawing** in the demo to see original multi-layer native shapes,
curves, pressure ink and an alpha PNG. Native JSON load remains a clean baseline;
the demo explicitly calls Fit for its sample, not after every load or edit.

- Drag with Hand/Pan (mouse, pen, or one finger). Two fingers pan/zoom together.
- Wheel pans; Ctrl/Cmd + wheel zooms around the pointer. Space/middle-drag temporarily pan.
- With editor focus, `P`/`B` selects Pen, `K` Highlighter, `L` Line, `A` Arrow, `R` Rectangle, `O` Ellipse,
  `E` Eraser, `M` Move Layer, `H` Hand, `+`/`-` zoom, `0` fits and `1` restores 100%. Text inputs keep their normal shortcuts.
- Fit uses visible painted bounds with 24 CSS px padding; 100% keeps world center.
- Zoom is limited to 0.1–8. Pan is in CSS pixels; DPR never enters pointer/world math.
- Navigation works read-only and never changes native data, revision or history.

The renderer uses two retained viewport-sized canvases, conservative painted-bound
culling and a bounded identity-based local Path2D cache. Every visible layer paints
bottom-to-top, including locked layers and private virtual preview replacements.
Pressure strokes use deterministic midpoint-smoothed filled outlines; native samples
are not pressure-filtered a second time. Select provides active-layer picking, marquee, movement and eight-handle resizing.

## Fullscreen

Click **Fullscreen** in the toolbar for more drawing room. Click **Exit fullscreen**
or press **Escape** to return to the card. A dialog opened inside the editor handles
Escape first, without leaving the expanded view.

On desktop, Etch requests native fullscreen for the existing editor root. On touch-capable
devices (including iPad and touch/pen hybrids), it deliberately uses **in-page expansion**
to avoid browser-reserved gestures that can exit native fullscreen. Desktop also uses
in-page expansion if native fullscreen is unavailable or denied by the host.
Where supported, top-layer placement keeps this fallback clear of transformed/clipped
ancestors while retaining inherited themes; otherwise it uses CSS fixed positioning.
Expansion inside an iframe remains limited to that frame unless native fullscreen is
permitted by the host. Browser chrome may remain visible in fallback mode.

Expansion never clones/remounts the drawing or changes saved content, revision,
selection, history, tool or sidebar preference. It preserves zoom and the world-space
viewport center rather than automatically fitting the artwork. Unfinished drawing or
navigation gestures are cancelled, not committed. Read-only editors can expand too.

While expanded, background page controls are inert and keyboard focus stays in the
editor. Exit/destroy restores prior page focus, scroll and editor-owned style changes.
Only one Etch editor per document expands at a time. Native browser Escape/exit controls
also update the toolbar and view state. Expansion locks both document/body scrolling;
on touch devices it pins the body at its saved offset and restores all changed styles,
priorities and scroll position on exit/destroy.

Canvas gestures stay editor-owned. Local touch/Safari gesture guards and overscroll
containment stop UI boundary drags from scrolling the host while preserving native
scrolling inside toolbars, Layers, properties and dialogs, plus normal form controls.
They do not install document-wide touch blockers or disable host-page zoom. Screen-edge
and OS/browser-reserved gestures cannot be reliably suppressed by a web app. Real iPad
retesting and manual assistive-technology acceptance remain outstanding.

## Lightmetal theme integration

Etch shares the suite's CSS-only `data-lightmetal-theme="auto|light|dark"` contract.
Set it on the mount container or any ancestor. Without a setting, Etch follows live
system preference. The nearest attribute wins; a nested `auto` follows the system
even inside a forced light/dark section.

```html
<section data-lightmetal-theme="auto">
  <div id="notes" class="lightmetal"></div>
  <div id="attachment-editor" style="height: 400px"></div>
</section>
```

Change that one attribute to `light` or `dark` to pin the section. Each library works
independently: Etch does not need Lightmetal's CSS/JS, a theme adapter, or a shared
runtime. Its stylesheet includes the same tiny mode declarations and uses inherited
`--lightmetal-color-scheme`, native `color-scheme`, and `light-dark()` colors.
Browsers must support CSS `light-dark()`, as required by Lightmetal. Iframes need
an explicit setting inside their own document; CSS does not cross frame boundaries.

The default surface, panel, text, border and accent palettes match Lightmetal's
base colors. Mode sharing is not skin sharing: Frost/Substantial/etc. remain
Lightmetal-specific skins. A shared semantic skin palette is recorded as a future
Lightmetal suggestion in `etch-maintenance.md`. Do not add `.lightmetal` classes to
Etch to try to apply an editor skin.

The demo's **Appearance** selector demonstrates Auto/Light/Dark on the whole page.
The setting is presentation only: it never changes native drawing colors/background,
history, selection or revision, and does not dirty a saved attachment. `--etch-canvas`
controls the CSS viewport backdrop, not the exported document background. Default
paper stays **white in both modes**, keeping existing dark ink readable without
recoloring artwork. A non-null native background paints over this backdrop.
Hosts choosing another paper color must account for artwork contrast; optional
`--etch-paper-ink` controls only empty-viewport help text.

Existing inherited `--etch-*` overrides still win in either mode. `--etch-panel`
optionally sets toolbar/sidebar/status color independently; without it, a host's
`--etch-bg` also applies to those panels. For example:

```css
.attachment-card {
  --etch-bg: #16181c;
  --etch-panel: #1e2126;
  --etch-ink: #e6e9ee;
  --etch-border: #2c313a;
  --etch-canvas: #ffffff;
  --etch-paper-ink: #64748b;
  --etch-muted: #9aa4b2;
  --etch-accent: #8fa0ff;
  --etch-focus: #8fa0ff;
  --etch-hover: #262b33;
  --etch-active-bg: rgba(143, 160, 255, .18);
}
```

## Development and embedding

Etch ships with the `lightmetal` package. It remains independent of the other
libraries. Load only its JavaScript and CSS; no shared runtime is required.
Etch uses its own transactional drawing history, not the text editors' native Undo.

Build tracked bundles with `npm run build`. Builds include `dist/etch.js` (browser
`etch` global), `dist/etch.min.js`, `dist/etch.esm.js`, and plain/minified CSS.
The source entry is `src/etch.js`; its modules live in `src/etch/`.
JavaScript never injects CSS. Mounting needs a browser DOM and an explicit height.
Serve module examples over HTTP(S); file:// is not a supported Etch workflow.

```html
<link rel="stylesheet" href="./dist/etch.css">
<div id="drawing" style="height:400px"></div>
<script src="./dist/etch.js"></script>
<script>
  const editor = etch.createEtch(document.getElementById('drawing'));
  editor.on('change', () => {
    const snapshot = editor.save();
    // Save through your application's own code.
  });
  // await editor.load(snapshot);
  // editor.destroy();
</script>
```

For bundlers, import `createEtch` and `EtchError` from
`lightmetal/dist/etch.esm.js`, and import `lightmetal/dist/etch.css`.
The ESM entry can be imported in Node without DOM globals; mounting still needs
a browser. There is no separate `lightmetal-etch` package or package export map.

```sh
npm run build
npm run dev
# http://localhost:5000/examples/etch/index.html
npm run test:etch
npm run test:etch:browser              # Chromium and Firefox
BROWSERS=chromium npm run test:etch:browser
npm run test:package
```

Tests use the suite's existing global Playwright installation. Browser tests own
loopback servers and use four workers to avoid the observed Node 26 worker crash.
They preserve the original drawing, geometry, import/export, security, history,
resource-limit, responsive UI and lifecycle checks. The original foundation suite
runs only in Chromium: its corrupt-PNG fixture depends on that engine's decoder
behavior. Other browser suites run in Chromium and Firefox. Chromium-only synthetic
pen/touch cases do not establish real-device support. WebKit is optional and is
not native Safari coverage. See [verification limits](etch-verification.md).

### Implemented public API

- `createEtch(container, {readOnly = false, limits = {}, drawWithTouch = true, sidebarOpen = false})`.
  `drawWithTouch` enables single-touch Pen/Shapes/Select/Eraser/Move Layer input; false keeps touch as navigation.
- `load(documentOrJSONString): Promise<void>`, `save()`, `getRevision()`.
- `importDocument(documentOrJSONString)`: Promise of `{layerId,revision,warnings}`;
  visible source layers become one new layer, source background/hidden layers omitted
  with structured warnings as documented above. No automatic Fit or replacement.
- `importSVG(svgTextOrBlob)`: Promise of `{layerId,revision,warnings:[]}`;
  supported editable vectors only, bounded UTF-8 input, no options or automatic fallback.
- `importImage(blob, {format = 'webp', quality = 0.8} = {})`: Promise of `{layerId,revision,warnings:[]}`.
  Formats `webp`/`png`; finite quality in [0,1]; unknown option keys reject.
- `exportSVG({padding = 16, bounds?} = {})`: synchronous `{svg,revision}`;
  scalable committed picture with embedded original assets and bounded output text.
- `exportPNG({padding = 16, bounds?, scale = 1} = {})`: Promise of `{blob,revision}`.
  Explicit finite positive world bounds replace auto bounds; padding applies afterwards.
- `on(name, callback)` returning an idempotent unsubscribe.
- `createLayer({name}?)`, `getActiveLayer()`, `setActiveLayer(id)`.
- `renameLayer(id, name)`, `deleteLayer(id)`, `reorderLayer(id, index)`.
- `setLayerVisibility(id, visible)`, `setLayerLocked(id, locked)`.
- `translateLayer(id, [dx,dy])`, `mergeDown(id = activeLayerId)`.
- `rotateLayer(id = activeLayerId)`, `rotateSelection()`: clockwise 90° around the
  target's combined painted center, one Undo step; visible/unlocked layers only.
  Empty targets are no-ops. Preserve image bytes, view and selection.
- `getSelection()`, `setSelection(ids)`, `deleteSelection()` (also used by Select UI).
- `setBackground(null | '#RRGGBB' | {type:'dots'|'graph'|'ruled'|'engineering', spacing})`:
  integer spacing 8–128; unknown setter keys reject. One undoable document edit.
- `undo()`, `redo()`, `canUndo()`, `canRedo()`.
- `getViewState()`: detached `{zoom, pan: [x,y], expanded}`.
- `setViewState({zoom?, pan?})`, `fit()`.
- `setExpanded(boolean)`: Promise for native fullscreen or expanded-page fallback;
  native entry requires browser user activation. Concurrent requests settle at the
  latest requested mode. This is session view state, never a history/content edit.
- `getTool()`, `setTool('pen' | 'hand' | 'select' | 'eraser' | 'highlighter' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'move-layer')`; other names reject.
- `getToolSettings('pen')`: detached `{color, width, pressure}`; Hand, Select and Move Layer return `{}`.
- `setToolSettings('pen', {color?, width?, pressure?})`: opaque hex color, width in [0.5, 64],
  and boolean pressure (default true, stylus only).
- `getToolSettings('highlighter')`: detached `{color, width, opacity}`; defaults `#FDE047`, 20, 0.35.
- `setToolSettings('highlighter', {color?, width?, opacity?})`: opaque hex color, width
  in [0.5, 64] and opacity in [0.05, 1]. Highlighter never varies width with pressure.
- `getToolSettings('eraser')`: detached `{radius, mode}`;
  `setToolSettings('eraser', {radius?, mode?})` accepts a finite radius in [1, 128]
  **CSS pixels** (default 10) and mode `'partial'` (default: Pen/ink and straight lines)
  or `'object'`. No paint/pressure settings. Preferences affect subsequent gestures.
- `getToolSettings('line' | 'arrow')`: detached `{stroke, strokeWidth}`; rectangle/ellipse also have `fill`.
- `setToolSettings('line' | 'arrow' | 'rect' | 'ellipse', {stroke?, strokeWidth?, fill?})`:
  opaque `#RRGGBB` paints and border width in [0.5, 64]. `fill` is rectangle/ellipse-only;
  `null` means no fill. Their `stroke` may be `null` for fill-only; both paints cannot
  be null. Line and Arrow always require `stroke`. Colors normalize to uppercase. Border-width
  preference stays positive when disabled; the native fill-only element has width 0.
- `getDrawWithTouch()`, `setDrawWithTouch(boolean)`: per-instance session preference.
- `cancel()` cancels navigation, previews and pending load/import; `destroy()` is idempotent.

Layer order is bottom-to-top; the panel displays topmost first. Merge Down preserves
world transforms and object order without rasterization. Native schema and limits
are in SPEC sections 4–5. Unknown keys are discarded, unknown types/versions rejected.
Native embedded images must be still PNG or WebP with verified MIME/container/header
dimensions and successful browser decoding. Exact compressed bytes persist on save. No raw SVG or external URLs are retained. Default limit overrides
can only reduce known limits (`layers`, `elements`, `pointsPerElement`, `points`,
`assets`, `assetBytes`, `jsonBytes`, `rasterDimension`, `assetPixels`, `totalPixels`,
`derivedSegmentsPerElement`, `derivedSegments`). Derived path work is limited to
500,000 commands per element and 2,000,000 across a document, including hidden layers;
outline move/close commands count too. Validation counts outlines without retaining
them and stops at the remaining aggregate allowance. Each viewport backing canvas
is separately capped at 8192 per dimension and 16,777,216 pixels; oversized viewports
report `LIMIT_EXCEEDED` without making an oversized allocation.

Eraser input separately caps distinct captured positions at `pointsPerElement` (it
does **not** consume stored document points). Lazy hit geometry is gesture-local,
with fixed safety ceilings of 500,000 accounted geometry vertices per element,
2,000,000 per gesture and 20,000,000 query/build work units. Exact native path tests
are charged by command count; broad-phase rejections also count. These are additional
interactive-work guards, not new document schema/limit keys. Exceeding any ceiling
reports `LIMIT_EXCEEDED` and cancels the whole gesture. Pathological geometry may
therefore load successfully but exceed the interactive eraser budget. Partial mode
shares the same work/geometry guards across line and ink cutting, plus ceilings of
20,000 affected output pieces and 20,000 additional fragment-ID allocations per gesture.
Native ink additionally permits at most 20,000 closed convex parts per element. Native
command/range/precision limits can reject extreme outlines safely. Full combined document
limits apply independently, and may be configured lower than those ceilings.

Events currently emitted: `change`, `load`, `historychange`, `selectionchange`,
`viewchange` and `error` for UI/rendering failures. `viewchange` carries detached
`{zoom, pan, expanded}` and coalesces to a frame; it is not a content edit.
`change` is once per committed content gesture/edit/import/undo/redo; source is `import`
for image imports. UI/session state is not content.
`load` replaces atomically, clears history, and advances revision without firing `change`. A failed load keeps prior content/history/revision. Latest
load wins; cancelled/superseded work rejects `CANCELLED`. Durable mutations while
loading/importing reject `BUSY`; old committed content remains saveable/exportable.
Read-only permits load/save/export, navigation, fullscreen and session selection, but blocks all content mutations and
undo/redo.
Methods throw/reject `EtchError` with `code`, `message`, and detached `details`.
Methods fail `DESTROYED` after destruction, except destroy/unsubscribe.

Listener exceptions are reported asynchronously (`reportError` where available,
otherwise console) without breaking other listeners. Reentrant mutations wait until
the current event batch completes; avoid issuing dependent synchronous mutations
from listeners. Destroying inside a callback stops remaining notifications and rejects
queued async operations with `CANCELLED`, including queued fullscreen requests. Their
owned resources are closed rather than leaving promises or image resources abandoned.
There is no network or storage side effect inside the editor.

### Host save race handling

Capture token and snapshot in the same JavaScript turn. Serialize host writes (or
use conditional writes) so an old request cannot overwrite a newer attachment.
Token comparison by itself only protects the UI's saved indicator:

```js
const revision = editor.getRevision();
const snapshot = editor.save();
await hostSaveAttachment(snapshot);
if (editor.getRevision() === revision) hostMarkSaved(revision);
```

The demo illustrates serialized in-memory host writes and native JSON reopen/download.
Saving and exporting never mean a storage write succeeded. Native JSON is the durable
editing format; history, selection, tool/view state, and revision tokens are not saved.

## Implementation boundaries

No reference implementation code or fixtures are shipped or used as test oracles.
Fixtures are independently authored/generated. Wet geometry currently
validates the complete destination once per frame, favoring correctness over speed
on large attachments. The internal import/lifecycle security pass and its fixes are
recorded in `etch-security-review.md`. Host-specific security checks, independent assurance,
manual accessibility and real-device acceptance remain open. SVG image fallback, Text and general vector opacity
are deferred beyond v1; formal performance baselining is also deferred by agreement.
See SPEC sections 13–14 and etch-verification.md for current scope and verification.
