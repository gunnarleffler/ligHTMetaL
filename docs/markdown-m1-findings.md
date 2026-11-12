# Markdown editing architecture

## Decision

MaiDEn uses a small inline core, synchronous `init()`, and browser-owned editing
and history. Applications can initialize it in their main document or load the
entire editor inside a same-origin iframe. Toolbar, source, preview, and dialogs
stay in the same document. Side-by-side source/preview works in either arrangement.

The parent-toolbar/child-writing-surface experiment is removed. Its async facade,
DOM adoption, and style bridge are not supported integration paths. The library
does not create or manage frames.

See [the specification](specs/markdown-editor-spec.md#m1--decide-and-prove-the-editing-architecture)
and `examples/markdown-iframe.html` for the whole-editor arrangement. Initialize
with the frame's own library and document, not a foreign host passed to the
parent's initializer. Parent code waits for load before reading or setting text.
A same-origin iframe is not a security sandbox.

## Constraints

- Native undo is document-wide, not isolated per inline editor. A toolbar action
  can undo the most recent edit in another host in the same document.
- Iframe history and parent/child focus behavior depend on the browser/runtime.
  Linux WebKit can share history across frames. The current automated Firefox
  runtime has native cross-document focus/input regressions; see the
  [security review diagnosis](security-review.md#firefox-runtime-diagnosis).
  Do not mask these with a custom undo stack or UA workarounds.
- Removing unrelated DOM children or assigning another textarea's value during
  input can split Chromium typing groups. Retain painter and preview nodes, and
  update persistent Text nodes in application callbacks.
- Native input produces block, BR, and LF shapes. Preserve source and selection
  without normalizing live DOM. Firefox's BR-separated headings can retain body
  sizing; iframe isolation does not solve that presentation limit.
- Map offsets in UTF-16 and walk blocks sequentially. Repeated child-node searches
  can make source mapping quadratic on large documents.
- CSS does not inherit across iframe documents. Load local JS/CSS inside the
  frame. Fullscreen fills the frame's viewport, not its parent's viewport.

## Optional diagnostics

The production suite covers inline and whole-editor iframe behavior. The separate
M1 fixture compares document-owned history, host callbacks, native DOM shapes,
CSP, and whole-editor integration. Its observations are not a readiness badge:

```sh
NODE_PATH=$(npm root -g) node tests/markdown-isolation.js --serve
NODE_PATH=$(npm root -g) node tests/markdown-isolation.js --profile --chromium
npm run test:markdown:native-frame
```

The profiler samples inline and whole-editor documents. Its timings are not
agreed budgets. `--plaintext` probes native plaintext-only editing in this fixture;
it does not change the production core's `contenteditable="true"` contract.
The native-frame diagnostic contains no editor and can fail independently of
supported editor workflows. It is not part of `npm test`.

Real IME/mobile input and screen-reader behavior remain unverified. The
[performance review](performance-review.md) records accepted latency and retained-DOM
limits, not controlled budgets or heap/collection guarantees. Native Safari testing
is outside the [required suite scope](releasing.md#approved-validation-scope).
Synthetic events and timing samples do not establish those claims.
