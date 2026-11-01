# Security review

Reviewed the 0.6.0 development working tree on 2026-10-22. This review covers
ligHTMetaL, MaiDEn, MeltDown, and poliSH. It is not a security certification or
a replacement for application-side sanitization.

## Result

No reproducible default-path execution or preview resource-loading bug was found
in the inspected code and tested corpus. No production-code fix was needed.

The review found a test coverage gap: the HTML security runner recorded async
image failures, file results, and file-protocol behavior without asserting all
expected outcomes. It now asserts those results, checks positive imports and
editor integrity, and runs the Markdown/parser/highlighter security checks.

## Reviewed boundaries

- HTML import and paste: tag/attribute allowlists, namespace/parser repair,
  table metadata and IDs, URL filtering, insertion, and a second HTML parse.
- HTML insertion: link/image prompts, programmatic images, file picker,
  clipboard/drop handlers, Blob/File conversion, upload results, and Source or
  destruction during pending uploads. File paths share validation; browser smoke
  tests exercise picker, paste, drop, and native editing.
- Intentional bypasses: HTML raw, Source, and unrestricted modes; MeltDown raw
  HTML and trusted highlighting hooks. Controlled sentinels confirm that these
  paths can preserve executable HTML. Their documented restrictions remain.
- MaiDEn: text-only source construction and paste, rejected drops, renderer and
  highlighting-hook output in Preview and Side-by-side, retained-node updates,
  safe link attributes, and filtered ANSI styles. Existing integration tests
  cover async stale results, renderer errors, teardown, and native undo.
- MeltDown: default raw-HTML escaping, generated text/attribute escaping, direct
  and reference destinations, autolinks, and trusted hook semantics.
- poliSH: HTML escaping and fixed token categories, all 49 grammars, unknown and
  unlabelled input, ANSI numeric/fixed styles, terminal-control escaping, theme
  validation, and explicit trusted loader manifests. No user label becomes an
  import path.
- Demo adapters: optional library wiring, retained source/output painting, and
  parser preview navigation removal, opaque sandbox, and restrictive CSP.

## Verification

Browsers: Chromium 156.0.8078.4 and Firefox 157.0 on Linux.

`npm run test:security` passed in both browsers. Per browser it checks:

- 54 HTML import/paste cases, 24 image URL/upload cases, and 22 file cases.
- Link/image prompts, native same-page and cross-origin-frame HTML drops,
  async failures, feature switches, bypass modes, and `file://` policy.
- 120 hostile renderer/highlighting-hook cases across Preview and Side-by-side.
- 1,620 parser/highlighter cases, including DOM insertion and reparsing.
- 74 Markdown destination cases and 90 source setter/paste/drop cases.

The Markdown checks observe requests and execution sentinels. The tested inert
paths produced neither payload resource requests nor execution. External review
traffic is blocked. Source paste/drop events in this added corpus are synthetic;
they do not establish OS clipboard or mobile-input support.

`npm run test:package` passed in both browsers: 127 packaged files, script-free
installation, standalone/minified/ESM/bundler use, and seven skins.

The supported integration scope is inline editing or the entire editor inside
one iframe, including Side-by-side source/preview in both. The parent-toolbar /
child-writing-surface experiment is removed. Required tests retain native editing,
selection, command state, keyboard toolbar use, history, preview, and split-view
coverage in the supported arrangements. Native cross-document focus/input checks
remain a separate diagnostic, not an editor release gate.

The release-readiness `npm test` passed in current Chromium/Firefox: build,
HTML/showcase/skin/theme checks, 204 parser tests, 211 poliSH units, MeltDown integration,
native-module browser checks, all Markdown groups, and the expanded security suite.
After the README.md showcase changes, updated browser smoke and focused checks
also pass: only the repository-owned README opts into raw HTML, inside an opaque
sandbox. Its logo source resolves against README.md; filtering and CSP permit
only that app-selected local image URL. Active tags/handlers and external navigation
targets are removed; same-document heading links work, and other resources remain blocked. The arbitrary-file picker and exact
logo-header special case are removed. Test payloads produce no payload requests
or execution. Normal parser/editor previews keep raw HTML escaped. This demo
policy is not a general-purpose HTML sanitizer.
The current `0.6.0-dev.0` archive passed package smoke separately with 128 files,
including the new editor reference. Final full-suite and archive logs are
`/tmp/lightmetal-single-document-{full,package}.log`.
The native cross-document diagnostic still fails on Firefox 157.0 as described
below; a passing product suite does not mean that runtime issue is fixed.

### Firefox runtime diagnosis

Cross-document cases formerly mixed into three Markdown test groups failed in
Firefox. A focused HTTP rerun reproduced them. The no-editor fixture
`tests/fixtures/native-frame-focus.html` isolates the same focus/input problems
in Playwright 1.64.1's bundled Firefox 157.0 (build 1555):

- Native Tab/Shift+Tab out of an iframe does not reach the adjacent parent
  control. The child reports `hasFocus() === false`, while the parent's
  `activeElement` still points at the iframe. Waiting for focus does not fix it.
- After native child Undo/Redo, Playwright's fill of the parent textarea inserts
  `outside` into the child instead. The next keyboard input reaches the parent.
  A subsequent child Ctrl+Z removes the misdirected input, not the earlier child
  edit. The editor's toolbar Undo itself is not the failing operation.

The reproducer fails over HTTP and `file://` in Firefox 157.0. It passes in
Chromium 156.0.8078.4 and the already-installed Firefox 155.0 (build 1543). All
three original Markdown groups also pass in the Firefox 155.0 comparison on the
same working tree. No browser was downloaded, replaced, or selected as a fallback.
This identifies a regression in the tested Firefox/Playwright runtime, not an
editor-dependent reproducer. It does not establish behavior in stock Firefox;
a separate manual check is still needed.

The standalone diagnostic checks parent and child contents before Ctrl+Z. This
reports misrouted parent input directly instead of presenting it as an undo
failure. Required editor state checks keep typing, toolbar and keyboard Undo/Redo,
command availability, and focus traversal inside the frame.

Run the standalone diagnostic without building the libraries:

```sh
npm run test:markdown:native-frame
npm run test:markdown:native-frame -- --chromium
# Optional comparison with an explicitly selected, already-installed binary:
NODE_PATH=$(npm root -g) node tests/native-frame-focus.js --firefox-executable=/path/to/firefox
```

The diagnostic prints all observed results and exits nonzero on a mismatch;
its expectations have not been weakened. It is deliberately outside `npm test`
after the user narrowed integration scope. Do not silently pin an older browser,
add UA workarounds, or replace native undo. No core editing code was changed.

## Remaining risks and limits

- Safari and real mobile/IME input remain untested by this review. Accessibility
  and screen-reader checks are separate work.
- These built-in filters are not maintained general-purpose HTML sanitizers.
  Applications must sanitize untrusted HTML before publishing or rendering it.
  Live HTML editing and Source edits do not pass through the import filter.
- Allowed HTML image URLs can load remote resources and track users. There is no
  origin allowlist. File MIME/extension checks do not authenticate image bytes.
- Raw/unrestricted HTML, custom icons/callbacks, raw parser HTML, highlighter
  hooks, grammars, scanners, and loaders require trusted application code/input.
- MeltDown and poliSH have no hard document-size or execution-time limit.
  Nesting/step budgets cannot interrupt a pathological regex or trusted callback.
  Hosts must bound large/adversarial input. Performance and retained-cache memory
  budgets remain separate, unresolved hardening work.
- The corpus and passing suites do not prove the absence of XSS or cover every
  browser parsing behavior. Application CSP, navigation, and resource policies
  remain application responsibilities.
