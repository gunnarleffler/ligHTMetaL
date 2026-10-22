# Markdown M1: editing-document experiment

## Status

The user chose the minimal inline core with synchronous `init()` and
browser-owned native history. Isolation belongs to application examples, not the
library. Input, accessibility, and performance checks still remain; M1 is not a
production-readiness claim.
See [the specification](specs/markdown-editor-spec.md#m1--decide-and-prove-the-editing-architecture).

Initial comparisons used the unchanged editor from `f62743d`. The fixture now
compares three arrangements: a shared document, a whole-editor `srcdoc` frame,
and an isolated writing surface with a parent-page toolbar. A third editable
field stays in the parent application document.

The probes are experiments, not production wrappers or API changes. Targeted
paint, offset-mapping, and empty-heading fixes improve the inline core without
adopting isolation, plaintext-only mode, a dependency, or a custom history stack.
The iframes isolate editing history in tested Chromium/Firefox, **not Linux
WebKit**. They are same-origin, not a security sandbox for untrusted HTML.

## Try it in the example

Start with `/markdown-iframe.html` for the simple approach: the whole editor,
including its toolbar, loads and initializes inside a same-origin frame. The
parent reads/sets Markdown after load and receives text-only change events.
This keeps the real library API intact, without a proxy or style bridge.

With the Flask example server running, open `/markdown.html?mode=isolated`, or
choose **Editing mode → Isolated surface (experiment)** on `/markdown.html`.
Standard editing remains the default. Both nested and direct-file routes work.

Changing mode keeps the Markdown but resets editor undo. The application-note
field lets you compare the two history scopes. If the isolated bundle cannot
load, the demo restores standard mode with the document intact. This is an
explicit demo experiment, not a new public initializer or a library-managed frame.

## Reproduce

Build first if the existing bundles are missing. Then run from the repository:

```sh
NODE_PATH=$(npm root -g) node tests/markdown-isolation.js
NODE_PATH=$(npm root -g) node tests/markdown-isolation.js --plaintext
NODE_PATH=$(npm root -g) node tests/markdown-isolation.js --surface --plaintext
NODE_PATH=$(npm root -g) node tests/markdown-isolation.js --profile --plaintext --chromium
```

Use `--chromium` or `--firefox` for a focused run. For manual exploration:

```sh
NODE_PATH=$(npm root -g) node tests/markdown-isolation.js --serve
```

The server prints its local URL and stays running until Ctrl+C. It does not use
or stop the Flask development server. Select shared, whole-editor, or surface-only
isolation and the host callback. `--surface` focuses the surface candidate and
adds its integration checks; combine it with `--serve` for manual use. Skin and
palette controls apply to both editors. Changing document or callback mode reloads
the page and loses test text. Add `plaintext=1` to the
URL, or combine `--serve --plaintext`, to probe native plaintext-only editing.

A successful command means its assertions passed. The JSON output deliberately
records known paste-layout gaps and CSP violations instead of treating them as
completed requirements. This diagnostic stays outside `npm test` while we compare
architectures. It must not become a green production-readiness badge.

## Tested environment

- Playwright 1.63.0.
- Chromium 153.0.8010.12 and Firefox 155.0, headless on this Linux environment.
- Both ordinary `contenteditable="true"` and the fixture-only `plaintext-only`
  variant. The production editor still uses `true`.
- HTTP under the test server's CSP and direct `file://` use without browser
  security flags. The HTTP policy permits local scripts/styles/frames/images,
  forbids connections and objects, and permits no inline script/style or eval.
- Default skin plus all six optional skins, pinned light/dark palettes, and
  representative desktop/390px layouts.

The Markdown browser suite passes after both fixes. Current-checkout package
smoke also passes in both browsers. This is not a new release or a republish of
0.4.0. The published archive's checksum and the HTML source/bundles are unchanged.

## Observations

This matrix records Chromium/Firefox in both native editing modes unless noted
otherwise. Linux WebKit's cross-frame history differs; see the follow-up below.

| Probe | Shared document | Isolated documents |
| --- | --- | --- |
| Edit A, edit B, press A's Undo | Both browsers undo B, not A. | Both browsers undo A and leave B intact. |
| Edit an unrelated application field, then press A's Undo | History remains document-owned. | A's Undo leaves the application field alone; its own Undo also leaves A alone. |
| Chromium typing with a persistent Text-node callback | One Undo removes the continuous typing group. | Same. |
| Chromium callback replaces unrelated children or assigns textarea.value | One Undo removes only the final character in this probe. | One Undo removes the full typing group. |
| Firefox callback variants | All three preserve the typing group. | All three preserve the typing group. |
| Plain multiline paste | Exact Markdown survives in both browsers. | Same; isolation does not change the native paste shape. |
| Paragraph split/join, undo/redo, emoji and combining-text formatting | Checked cases preserve text and selection offsets. | Same. |
| Synthetic composition guards | Setters/insertion refuse edits during composition. | Same; this does not validate a real OS IME. |

### Linux WebKit follow-up

Node 26.11.1 / Playwright 1.64.0 / WebKit 26.6 passes the inline Markdown API,
syntax/source/geometry, native editing/undo, and normal demo checks. It fails
history isolation in both iframe arrangements: Undo in the editor reverts the
parent application's textarea instead of the editor edit.

`tests/fixtures/native-frame-history.html` reproduces this without any library or
scripts. It also fails with a real Ctrl+Z. The child has focus during the command;
explicit window focus did not change the result. Do not add a focus workaround or
custom history stack based on this evidence.

`npm run test:markdown -- --webkit` now runs all check groups and stays nonzero
for the three history failures, including the native counterexample. Default
Chromium/Firefox checks remain green. Later iframe integration assertions are
not reached after the history failure. The examples now warn that frame history
isolation depends on the browser. Real Safari behavior remains unverified.

### Paste layout: one fix, one remaining limitation

The probe pastes `## Pasted 🦊\nbody **bold**\n\n` into an empty editor.

- Chromium creates four blocks. The heading uses 24px type over a 16px body.
  Source/paint block bounds match in this case.
- Firefox creates one block containing BR-separated lines in ordinary mode.
  Plaintext-only mode uses literal newlines plus a trailing BR. Both retain the
  heading at the 16px body size.
- Initially, both Firefox modes had a native/paint height difference of about
  25.6px: one body line. This was a separate trailing-empty-line geometry bug.
- The focused fix adds a zero-width paint-only pseudo-element when a trailing BR
  placeholder reserves a final empty line. It changes no source characters or
  editable nodes, and creates no custom undo entry. Native BR, LF, nested-span,
  empty-line, and cache-reuse regressions pass in both browsers.
- The latest surface probes measure zero block-height difference in both browsers.
  Firefox's per-line heading-size limitation remains. Isolation and plaintext-only
  mode did not solve it; do not rewrite live input DOM speculatively.

### CSP and native plaintext mode

With ordinary editing, Chromium reports two blocked `style-src-attr` attempts
around the paragraph merge/undo/redo sequence. The recorded style sample begins
with `font-family: ui-monospace`. The fixture and editor initialize under the
strict policy; the violations appear during native editing in all three document
arrangements. The text assertions still pass. Firefox reports no such violation
in these probes.

The same probes in native `plaintext-only` mode report no CSP violations in either
browser. The tested marker-based commands, history, paragraph operations, and
paste preservation still work. This makes plaintext-only a promising candidate,
not an approved production switch. It does not fix shared-document history,
Chromium's host-callback grouping problem, or Firefox's paste layout.

We kept the policy strict. Do not resolve the warnings by adding `unsafe-inline`
or by changing the Flask server policy to suit the experiment.

### Focus, appearance, and lifecycle

- Keyboard traversal reaches each toolbar and source and can leave the editors.
  Firefox takes an extra Tab to enter the first frame's document before reaching
  Bold. Chromium reaches Bold in one Tab. The probe records this difference.
- Both frames receive matching skin/palette variables. Stylesheet links and
  classes are explicitly installed inside each frame; CSS does not inherit
  across the document boundary.
- The tested narrow layout stays within the page and frame widths. Each source
  keeps its accessible textbox name, and each frame has a distinct title. These
  are structural checks, not a screen-reader audit.
- Destroy removes the editor's listeners; late insertion/setters refuse work.
  Removing/remounting a frame produces a fresh editor. This does not establish
  garbage-collection or long-run memory behavior.
- Local `srcdoc` assets and parent-to-child API calls work under HTTP and direct
  file use in both tested browsers.

## Why wrappers stay in examples

The full-editor frame changes integration boundaries. The existing `init()`
rejects a foreign-document host. The fixture therefore loads the unchanged
library in each frame and calls that frame's initializer. Its returned `element`
is the inner host, not the caller's outer mount. Parent `querySelector()` calls
cannot reach those toolbar/content nodes. Custom parent CSS and variables do not
cross into the frame automatically. Nested focus also differs between browsers.

Do not ship that wrapper as if it preserved the public API. Copying every parent
stylesheet is a fixture convenience, not a reviewed production style strategy.

## Writing-surface-only follow-up

The demo-only `examples/markdown-surface.js` keeps the mount and toolbar in the
parent. The M1 fixture and `markdown.html` share this adapter.
It loads the existing editor in the child, adopts its toolbar into the parent,
and forwards the documented methods and custom callbacks through a test facade.
It mirrors theme classes and computed editor variables into the child.

In both browsers, the plaintext-only surface candidate passes the history and
host-callback probes, parent-toolbar commands, UTF-16 formatting, tested Tab
navigation, skin/palette propagation, custom action state/result callbacks, custom
classes, font/caret variables, composition guards, and owned-content teardown.
Both tested Tab transitions to parent toolbars take one step. Direct file use
also works. These are targeted checks, not a full input/accessibility audit.

This adapter still cannot ship as the public initializer:

- It initializes asynchronously; the current `init()` returns an API synchronously.
  A production design must preserve that contract rather than quietly return a
  Promise. Loading a separate library realm belongs in the application example.
- `element` is the parent mount, but `content` belongs to the child document.
  `element.contains(content)` is false. Parent selectors and bubbled source events
  do not cross that boundary; applications must use the returned content node and
  its ownerDocument. Review this integration cost explicitly.
- Sharing the parent's duplicate-mount registry, validation-before-mutation, and
  failure/cancellation cleanup needs a proper initializer design, not this facade.
- Arbitrary parent selectors, late stylesheet/CSSOM edits, relative font units,
  and all custom-class combinations are not proven by the theme bridge.

## First performance finding and fix

A small Chromium profile used cold pages, 20/200 KiB ASCII documents, and the
fixture's persistent raw-output callback. It timed synchronous `insertText("x")`
at the document end, not OS keystroke-to-paint latency. Every sample checked exact
source before and after insertion.

The initial 200 KiB sample had 3,724 blocks. Insertion took about 1.9 seconds in
both arrangements. A CPU profile identified `textModel`'s block walk as the main
hotspot: it searched the parent's NodeList for each child, producing quadratic
work. Runs already preserve child order, so a sequential index gives the same
offsets without those repeated searches.

| Chromium sample | Before | After |
| --- | --- | --- |
| Shared document, 20 KiB | 48.6ms | 22.6ms |
| Shared document, 200 KiB | 1,922.7ms | 193.5ms |
| Writing-surface frame, 20 KiB | 40.4ms | 24.3ms |
| Writing-surface frame, 200 KiB | 1,914.4ms | 209.9ms |

These are individual diagnostic samples, not statistical guarantees or agreed
budgets. Loading the 200 KiB sample still took roughly 0.5 seconds, and insertion
still has noticeable work. The stage contains roughly 80,000 elements at this
size. Isolation is not a performance fix. Further profiles, ordinary keyboard
latency, larger/long-line documents, cache memory, and mobile limits remain open.
Mixed native runs, nested emoji selection, and a 1,024-block end insertion now
have browser regressions. The Markdown suite and package smoke pass in both
browsers. HTML bundles stay unchanged.

## Inline syntax follow-up

Bare ATX markers (`#` through `######`) are valid empty headings. The painter,
heading action, and selected-button matcher required whitespace after the marker
and treated these lines as paragraphs. Allowing end-of-line as the other delimiter
fixes all three without changing the source or editing engine. Browser regressions
cover exact whitespace, heading levels, invalid/indented markers, paint geometry,
Paragraph/heading commands, and native undo.

## Decision and next work

The architecture question is settled: keep the inline core small and synchronous.
Use the whole-editor iframe example for optional history isolation. Keep the more
complex parent-toolbar surface adapter demonstrational; do not make its async
setup or CSS bridge a new library responsibility.

1. Keep the whole-editor example working over HTTP, nested routes, and files.
   Verify its frame-owned API, parent read/set/change integration, and undo scope.
2. Continue inline syntax/source-command regressions without normalizing live DOM.
   Empty ATX headings are now covered; broader dialect fixtures remain M2 work.
3. Treat native plaintext-only as an experiment until broader input checks justify
   a separate change. It is not required by the isolation example or the core.
4. Investigate Firefox's per-line heading presentation without losing source,
   selection, or history. The trailing-line geometry fix remains independent.
5. Extend profiles to ordinary/large/long-line cases, cache high-water behavior,
   replacement, and teardown. Establish budgets before performance claims.
6. Test Safari, real IME/mobile input, screen readers, and mixed-direction text.

No new engine, parser, or history stack is approved. The remaining input and
performance checks still matter, but iframe API integration no longer blocks
continued work on the minimal inline editor.
