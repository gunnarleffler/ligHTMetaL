# Project Notes

Durable constraints, maintenance gotchas, and unresolved work. Git holds completed
work and debugging history.

## Documentation map

- `README.md`: introduction, quickstarts, themes, and build/test entry points.
- `docs/reference.md`: editor API, integration, safety, and browser limits.
- `docs/specs/markdown-editor-spec.md`: Markdown scope and milestone requirements.
- `docs/markdown-commands.md`: command selection, state, and editing rules.
- `docs/markdown-syntax.md`: supported dialect, limits, and manual checks.
- `docs/MeltDown.md`: parser and trusted highlighting-hook contract.
- `docs/poliSH.md` and `docs/specs/polish-spec.md`: highlighter usage and internals.
- `docs/specs/toolbar-grouping-substantial-spec.md`: toolbar and skin design.
- `docs/releasing.md`: release procedure and approved validation scope.
- `docs/security-review.md`: security findings and native browser diagnostic.
- `docs/performance-review.md`: focused diagnostic and large-document limitations.
- `docs/skills/`: maintenance review and approval rules.

## Current state and next steps

- Final `0.6.0` metadata, release notes, and validation are ready for a release
  snapshot. Publication is pending; master still holds the independent, unpublished
  0.5.0 RC snapshot. Snapshot the complete reviewed tree, not just the final dev
  commit's diff. No master change, tag, push, or publication is authorized.
- Validated archive: `/tmp/lightmetal-060-release-nJAYnw/lightmetal-0.6.0.tgz`
  (128 files). Full npm test and exact-archive Chromium/Firefox package checks pass,
  including script-free installation. Repacking or changing packaged files requires
  validating the new archive; final metadata does not establish npm availability.
- Focused usability, native 200% zoom, all-skin selection, and performance reviews
  are complete for 0.6.0. Accepted limitations and deferred validation live in
  `docs/releasing.md`; do not reopen them as release gates without a maintainer
  decision. Do not claim WCAG conformance, screen-reader compatibility, real-device
  input validation, or native Safari coverage.
- The focused performance pass is closed. Rare large-document latency and retained
  DOM high-water behavior are accepted 0.6.0 limitations, not resolved performance
  guarantees. No incremental parser, virtualization, pool trimming, or scheduling
  redesign is authorized.
- M2 recognition and agreed M3/M4 editing scope are implemented. M5 Help, Preview,
  Fullscreen, Side-by-side, and proportional split scrolling exist; do not
  reimplement them. Broader M5/M6 goals remain distinct from 0.6.0 release gates.
- Markdown image picking/paste/drop/uploads/base64, reference-image editing, and
  advanced table conversion are deferred enhancements. Clean Block is excluded.
  An optional MeltDown output stylesheet is unimplemented and needs discussion.
- Ask before commits, release snapshots, tags, pushes, publication, or history
  rewriting. Checkpoint approval does not authorize release operations.

## Architecture and working agreements

- Refine awkward interfaces before 1.0. From 1.0, preserve public calls, options,
  returns, callbacks, defaults, and documented asset/CSS hooks. Prefer additive
  capabilities. Independent libraries must not require theme adapters or a shared
  runtime.
- Vanilla JavaScript/CSS, no runtime dependencies. Native contenteditable and
  `document.execCommand` own editing and Undo. Do not add an editing engine or
  custom history stack to mask browser behavior.
- Data sovereignty is permanent: no accounts, telemetry, analytics, vendor cloud,
  or automatic uploads. Persistence and opt-in uploads belong to applications.
  HTML resource URLs can still make requests; Markdown source painting is inert.
- Consult the maintainer before meaningful syntax/dialect, API, dependency,
  toolbar-default, or tokenizer-structure changes. Cleanup requires the approval
  process in `docs/skills/code-cleanup.md`; it does not authorize unrelated refactors.
- Names are intentional: `ligHTMetaL`, `ligHTMetaL::MaiDEn — the lightMarkDown Editor`,
  `ligHTMetaL::MeltDown`, and `poliSH`. HTML assets/global use `lightmetal`;
  Markdown assets/global use `maiden`; the parser global is `meltDown`.
  Preserve MIT/Pell credit.
- `src/lightmetal.js` and `src/maiden.js` are sibling editors. MaiDEn initializes
  synchronously. Support inline editing or the entire editor inside one iframe,
  including split view. Parent-toolbar/child-writing-surface integration is outside
  scope. Closure size alone does not justify extracting instance-state modules.
- `src/markdown-preview.js` owns inert preview filtering and retained-node updates.
  Editors import no parser or highlighter. MeltDown and poliSH ship separately;
  `examples/polish-demo.js` connects optional hooks. Legacy hljs classes remain
  supported without loading highlight.js or Marked.
- `src/polish.js` stays catalog-free; `src/polish-languages.js` is opt-in.
  Full builds expose the highlighter, catalog, and themes. ES2022 is required for
  capture indices. `build/polish-css.mjs` generates polish.css from theme data;
  do not hand-edit generated CSS.
- `data-lightmetal-theme="auto|light|dark"` uses the nearest setting; auto resets
  to the system. Legacy editor host classes win locally; explicit poliSH theme-*
  palettes own their subtrees. Theme-class detection must match class tokens,
  including HTML whitespace separators, not arbitrary substrings.
- Skins live in `src/skins/` and build into `dist/skins/`. Load shared CSS, optional
  skin, then Markdown CSS. Keep skins independent of light/dark mode; forced light
  overrides system dark. No remote fonts or frameworks.
- MaiDEn selection uses `--lightmetal-selection-bg` and
  `--lightmetal-selection-color`, independently of code shading. The default text
  color follows the skin foreground. `tests/markdown-selection.js` exercises all
  skins, modes, plain/minified CSS, native selection, and independent overrides.
- Toolbar grouping preserves button order. Explicit action arrays belong to the
  application; MaiDEn supports manual `"|"` separators. Disabled controls retain
  groups. Observe owned toolbar-root class/style changes, not ancestors or the
  whole page, and ignore the observer's own divider mutations.
- esbuild generates tracked bundles; rebuild `dist/` with source changes. Packages
  ship prebuilt assets without install hooks. Pack/install with scripts disabled.
  Preserve the ignored npm lockfile policy. Python/Flask are demo/test tooling only.

## Native editing and DOM gotchas

- History is document-wide, not per inline editor. Same-origin whole-editor frames
  isolate history in tested Chromium/Firefox. Linux WebKit can share history across
  frames without library code; do not mask this with UA hacks or custom Undo.
- Retain painter, preview, and live-demo nodes. Removing unrelated children,
  replacing DOM, or assigning textarea values during input can split Chromium
  typing Undo into character steps. Update Text.data and hide spare elements.
  This includes status messages changed by asynchronous application callbacks.
- Retained DOM follows the structure's high-water mark. Skip unchanged token
  visibility, class, and Text.data writes; already-cleared spare nodes must remain
  mutation-free. Tests that inspect retained preview nodes must scope visible
  content. See `tests/markdown-painter.js` and `tests/markdown-preview.js`.
- Source mapping must tolerate native DIV/P/BR and LF shapes without normalizing
  live DOM. A final BR may be a caret placeholder; a nested BR before following
  inline content is a real newline. Empty trailing Text nodes must not change
  placeholder classification. Firefox may delete a real BR during replacement;
  preserve the boundary in the same native insertion.
- Fenced backgrounds use measured full-content-width bands, not token glyph
  backgrounds. Empty-line glyphs are paint-only. ResizeObserver must remeasure and
  disconnect on destroy. Inline code keeps a separate text-sized background.
- Build one local model snapshot per render; never cache it across events. Batch
  built-in edits until selection restoration, preserving synchronous setters and
  custom callbacks. Keep lifecycle/version guards after reentrant callbacks.
  Inactive selection updates must not render or steal focus.
- Use sequential child indexing and iterative syntax handling. Avoid argument-limit
  spreads and repeated failed suffix scans. Failed-search caches and whole-run
  delimiter indexes prevent pathological work.
- Syntax tabs use four-column stops mapped to original UTF-16; export preserves
  tabs. Visual width is separate. A right-biased source map inside a tab points
  after it; do not treat the next tab as the same partial tab when editing prefixes.
- Keep heading/source fonts monospaced to align paint and caret. Firefox BR-separated
  headings may fall back to body sizing.
- Native paragraph/CSS settings are document-wide: apply on focus/commands, not
  initialization. Deferred formatting must recheck focus, mode, selection, and
  destruction, and cancel on replacement or teardown.

## Editing and UI constraints

- Preserve native history, composition, selection, callback counts, and untouched
  source/node identity. Candidate recognition guards unsafe Markdown edits; do not
  loosen it by trimming or globally normalizing live source.
- Markdown blank markers use ASCII spaces/tabs, not JS trim(): NBSP/BOM are content.
  Marker edits before tabs require recalculating content columns. New whitespace
  uses spaces; preserve existing whole tabs.
- Container ownership and literal boundaries extend beyond selected text. Do not
  adopt unselected siblings, release task markers, or expose text as headings/lists.
  Reference images remain protected.
- Table formatting is explicit, monospace-only source padding, not automatic typing
  behavior. Count source characters/four-column tabs; do not add font measurement
  or Unicode glyph-width machinery. New table insertion pads in the same native
  edit/callback. Preserve cell bytes, alignment, containers, selection, and Undo.
- Markdown table Rows includes the header, not the delimiter. Creation limits do
  not cap imported tables or later growth. Row edits allow ragged tables;
  column/alignment edits refuse them.
- Deleting a Markdown row before a blank native block must remove the preceding
  newline plus row text. Deleting through the next block's start can swallow the
  blank boundary in Firefox and absorb the following paragraph into the table.
- HTML contextual table growth has fixed caps independent of creation limits.
  Clone/replace only the selected table via native insertion. Preserve header
  references and section semantics; do not broaden merged-cell support without
  agreement. Markdown padding has no place in the HTML Table menu.
- Picker positions are snapshots, not fallback carets. Check pending mutation
  records on submit: same-text synchronous edits invalidate positions too.
  Composition, replacement, and destruction must close or invalidate pending UI.
- Tab entry is writing-first. Owned toolbar buttons have tabindex=-1 outside the
  editor and 0 inside. Host focus changes affect only owned buttons; do not redirect
  focus or use positive tabindex. Keep main toolbar containers and the Markdown
  scroll wrapper out of native scrolling-container Tab stops.
- Escape priority is Help/picker, then Fullscreen, then source's one-shot Escape/Tab
  traversal. Pointer toolbar input can prevent blur; explicitly clear the source
  focus-escape state. Wait for Help's close event before activating another control.
- Fullscreen has one owner per editing document and fills an iframe viewport, not
  its parent. Transformed/contained ancestors can constrain fixed layout. Restore
  scroll/selection and preserve application-owned classes/styles on exit.
- Split scrolling is proportional vertically, not source-line mapping. Horizontal
  scrolling stays local. Ignore expected programmatic positions to prevent feedback.
- CSS may override [hidden]; owned hidden UI needs explicit display rules. Do not
  hide contextual controls while toolbar focus needs them: scroll clamping can
  make clicks miss. Preserve usability in narrow, short frames.
- Validate actions/shortcuts before installing UI/listeners. Preserve custom result
  callbacks and null/undefined built-in fallbacks. Custom state results must feed
  selected styling and aria-pressed without extra callback calls. Teardown is
  idempotent, removes only owned UI/listeners/classes, and suppresses late results.

## Safety boundaries and demos

- `docs/reference.md` owns the HTML safety matrix. Import filtering is not a
  sanitizer guarantee: live editing and Source mode are unfiltered. Applications
  validate exported HTML. Normal HTML drops are rejected independently of image
  settings; raw/unrestricted modes are intentional trusted-content paths.
- Unrestricted mode bypasses URL/file checks, not attribute escaping, explicit
  image switches, table limits, or lifecycle guards. Relative HTML insertion URLs
  must resolve to HTTP(S); file:// relative URLs differ from Markdown templates.
- File.type is read-only. Use a typed Blob slice for FileReader fallback, passing
  the original File to application hooks. Recheck mode/destruction after awaits
  and before loading returned URLs. Do not duplicate native input notifications.
- Preview is inert filtered output, not an export API or publication-safety promise.
  Keep renderer raw-HTML escaping enabled. Opening preview must not load resources;
  images become placeholders and tasks become text. Table-cell styles stay blocked.
  MaiDEn allows fixed token classes, not ANSI inline styles; standalone poliSH
  supports ANSI colors. Custom highlighting HTML is trusted application output.
- Async rendering discards stale results after edits, replacement, view exit, or
  destroy. Renderer failures must not mutate source or history.
- Demo routes must work at root, `/examples/`, and file://. The custom HTML upload
  demo returns a local data URI and uploads nothing. Shared showcase assets stay local.
- `examples/code-blocks.js` retains live output nodes. The poliSH playground uses
  `followTheme: false` to preserve its selected palette and ANSI styles.
  `examples/POLISH.ANS` stays editable: test colors from the fixture, not a fixed
  palette. File:// uses a local ANSI picker rather than blocked fetch.
- Only the repository-owned README showcase uses MeltDown `html: 'allow'`. Its
  opaque sandbox preview strips active markup and navigation, and permits only the
  app-selected local logo resource through CSP. This is a demo-specific policy,
  not a general HTML sanitizer. README fetch uses no-store; file:// shows a
  local-server instruction rather than attempting fetch.
- An iframe owns its theme setting; sandbox preview choices require an application
  bridge. Public examples lead with useful features; detailed limits belong in
  reference docs. Preserve intentional brand capitalization and humor.

## Testing and operational gotchas

- Use focused real Chromium/Firefox checks while developing, broader suites at
  release gates. Do not rerun unchanged matrices without reason. README/reference
  own test commands. Documentation-only changes do not require product rebuilds.
- Markdown's default syntax schedule retains all fixtures and repeats representative
  cases across extra shapes/widths. `-- --exhaustive` runs the full cross-product.
  Do not reduce fixture coverage to speed unrelated checks.
- Scope toolbar queries to the named formatting group. Use native history
  availability rather than assuming Redo is the last enabled control.
- Use real keyboard/pointer interaction and explicit geometry/animation signals,
  not sleeps. Real Tab establishes focus-visible; Firefox need not outline
  programmatically restored focus. Await document.getAnimations() for skin checks.
- Firefox Selection.toString() normalizes NBSP. Test exact selected source with
  Range.cloneContents().textContent, then native replacement. Firefox insertText
  strips ESC; ANSI fixtures must assign actual controls and dispatch input.
  Set initial textarea values programmatically: fill('') adds a native clear entry.
- Menu clicks bubble after opening a picker. The outside-click handler must ignore
  that menu event target. Compare complete formatted table candidates before native
  replacement to avoid identical-output Undo entries.
- Tests use global Playwright. Match Node/module paths and installed browser
  revisions. Do not rename browser caches, download replacements, or add automatic
  fallbacks. Linux WebKit is opt-in and has known iframe-history failures.
- Keep the no-editor cross-document diagnostic and assertions intact, separate from
  npm test. `docs/security-review.md` owns runtime observations. No editor workaround
  or stock-Firefox check is required for 0.6.0.
- Native Firefox zoom automation needs viewport:null: resize the X11 window before
  OS zoom. Playwright viewport resizing can stall after native zoom.
- Show hidden preview panels before checking computed styles: Firefox can return
  empty styles while the containing panel is hidden.
- Pass Node values explicitly into Playwright evaluations. Synthetic DataTransfer
  needs Object.defineProperty. README snippets need HTTP; do not weaken server CORS
  to bypass opaque about:blank restrictions.
- Smoke port is 5059; stop only the server you own. Chromium blocks 5060/5061.
  Demo server defaults to 5000; LM_TEST_PORT overrides it.
- npm pack JSON can be name-keyed or an array. Size reports use system gzip -c;
  Node zlib defaults can produce different sizes.

## Release and sharing constraints

- `dev` retains full history. `master` has independent release-snapshot history;
  add release snapshots atop it, never merge dev history. Return to dev for work.
  Only master and selected release tags may go to public GitHub; never push --all
  or --mirror. Review snapshot contents for private information.
- The remote is private. Never expose its hostname/URL in public files or metadata.
  Leave repository/homepage/bugs unset until a public destination is chosen.
  Sharing development history requires removing the private URL in commit 2d8cecd;
  rewriting history needs approval.
- Preserve ignored release archives lightmetal-0.3.0.tgz, lightmetal-0.4.0.tgz,
  and lightmetal-0.5.0.tgz. Old archive checks do not validate current files.
  Inspect/test the exact release tarball with scripts disabled and verify registry
  integrity when publishing.
- Preserve the centered 320px README logo, responsive gallery logo outside saved
  content, gallery navigation, and packaged logo. The public README uses jsDelivr
  lightmetal@latest; verify it after publication. Quickstarts pin 0.6.0, which is
  not yet published.
