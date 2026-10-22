# Project Notes

Durable constraints, maintenance gotchas, and unresolved work. Git holds completed
work and debugging history.

## Documentation map

- `README.md`: usage, public API, themes, safety boundaries, and test commands.
- `docs/specs/markdown-editor-spec.md`: Markdown scope, requirements, and milestones.
  Its final “Current work” section is stale: M5 features are implemented.
- `docs/markdown-commands.md`: command selection, state, and editing rules.
- `docs/markdown-syntax.md`: supported dialect, limits, and manual checks.
- `docs/MeltDown.md`: optional parser and highlighting contract.
- `docs/specs/toolbar-grouping-substantial-spec.md`: approved grouping and skin design.
- `docs/releasing.md`: release procedure.
- `docs/skills/code-cleanup.md`: review and approval process for source cleanup.
- `docs/skills/project-doc-hygiene.md`: documentation maintenance rules.

## Current state and next steps

- Public naming: Markdown source/build files are `maiden.*`,
  standalone global is `maiden`, display name remains `MaiDEn`. No old asset/global
  aliases; internal CSS classes and Markdown demo/test filenames remain unchanged.
  Source behavior/styles are unchanged beyond display-name banners.
- Examples: `examples/index.html` showcases all three libraries.
  Detail/quickstart pages are `html.html`, `markdown.html`, and `meltdown.html`;
  galleries are `skins.html` (HTML) and `markdown-skins.html` (MaiDEn). Shared showcase
  assets stay local. Parser preview strips navigation and uses an opaque sandbox
  with CSP to block resources/scripts. HTML regression tests now use `html.html`.
  `tests/showcase.js` passes Chromium/Firefox root/nested/file and narrow-layout
  checks and is wired into smoke tests. Landing logo is 640px (responsive), with
  auto/dark/light page and editor switching. Focused checks pass in both browsers.
  Smoke checks cover both browser engines plus Chromium file routes.
- Both editors have grouped default toolbars and horizontal scrolling. Substantial
  is the seventh optional skin; its final toolbar height is 47px.
- M2 recognition, agreed M3 commands, and agreed M4 image/table scope are complete.
  M5 Help, Preview, Fullscreen, and Side-by-side are implemented, including linked
  proportional vertical scrolling. Next: M5 completion review and M6 integration,
  accessibility, and performance hardening. Do not reimplement these features.
- Image file picking/paste/drop/uploads/base64, reference-image editing, and
  advanced table conversion are deferred enhancements, not M4 blockers.
  Clean Block is intentionally excluded.
- Broader preview accessibility/security review, controlled performance budgets,
  cache high-water memory checks, real IME/mobile input, screen-reader checks, and
  Safari validation remain open. Synthetic events and Linux WebKit do not prove
  real-input or Safari support.
- Pending release is 0.5.0; npm/Python metadata and uv.lock agree. Published 0.4.0
  remains HTML-only. Changelog marks 0.5.0 unreleased until publication.
  Release verification passes: build, Chromium/Firefox HTML/showcase/skin smoke,
  192 parser tests, full Markdown suite (501.8s), security, and exact archive package
  checks (47 files, four JS formats, seven skins, script-free install). The aggregate
  npm test run stopped at a security harness route error; security passed after
  restoring its self-hosted root route. File gallery count now includes seven skins
  plus default. No new production-code changes.
- `lightmetal-0.5.0.tgz` is ignored, tested, and byte-matches current shipped files.
  SHA-256: `0b02ff9ba698bf7023bad42b77cfe14e5026ae168fe550d7cca9a81ed3812738`.
  Release prep is included in `Prepare 0.5.0 release and streamline project messaging`.
  No publication, tag, or push is authorized.
- Public examples lead with features and intentional Markdown scope. Keep detailed
  compatibility limits in reference docs. Security guidance directs applications to
  maintained HTML sanitizers; preserve explicit raw-mode/highlighter trust boundaries.
- Ask before commits, tags, pushes, publication, or history rewriting. No push,
  tag, or publication authorization carries over from checkpoint commits.

## Architecture and working agreements

- Branch policy: `dev` retains full development history. `master` has independent
  release-snapshot history, starting with one 0.5.0 RC root commit. Future releases
  add a snapshot commit atop master; do not merge dev history into master. Return
  to dev for development. Only master and deliberately selected release tags may
  go to public GitHub; never push --all or --mirror there. Review snapshot contents
  for private information before publishing. Version metadata stays 0.5.0 while
  this checkpoint remains unpublished.
- Vanilla JavaScript/CSS with no runtime dependencies. Native contenteditable and
  `document.execCommand` own editing and undo. Do not add a custom editing engine
  or undo stack to work around browser behavior.
- Data sovereignty is permanent: no accounts, telemetry, analytics, vendor cloud,
  or automatic document uploads. Persistence and opt-in uploads belong to the app.
  HTML resource URLs can still make requests; Markdown source painting is inert.
- Consult the user before meaningful syntax/dialect, API, dependency, toolbar-default,
  or tokenizer-structure decisions. Source cleanup requires review and approval;
  cleanup guides do not authorize unrelated refactoring.
- Display names are `ligHTMetaL` and `ligHTMetaL::MaiDEn — the lightMarkDown Editor`.
  HTML files/global use `lightmetal`; Markdown files/global use `maiden`.
  The optional parser is `ligHTMetaL::MeltDown`, with browser global `meltDown`.
  Casing is intentional. Preserve MIT/Pell credit.
- `src/lightmetal.js` and `src/maiden.js` are sibling editors. MaiDEn initializes
  synchronously; iframe isolation belongs to application integration, not core.
  Closure size alone does not justify extracting instance state into modules.
- `src/markdown-preview.js` owns inert preview rebuilding and retained-node updates.
  Core imports no parser or highlighter. `src/MeltDown.js` ships separately;
  highlight.js is dev-only. Marked is not a dependency.
- `src/toolbar-groups.js` groups defaults without changing button order. Explicit
  action arrays remain application-owned; MaiDEn supports manual `"|"` separators.
  Disabled controls retain their groups; Help shares the final view group.
- Skins are original, local CSS in `src/skins/`, built into `dist/skins/`. Load shared
  CSS, optional skin, then Markdown CSS. Keep skins independent of light/dark mode.
  Forced light must override system dark. Do not add remote fonts or frameworks.
- esbuild generates tracked bundles. Keep rebuilt `dist/` files with source changes.
  The npm package ships prebuilt assets with no install hooks; pack/install with
  scripts disabled. Preserve the repo's ignored package-lock policy.
- Python/Flask are demo/test tooling only. Demo routes must work at root,
  `/examples/`, and over `file://`. The custom HTML upload demo returns a local data
  URI and uploads nothing.

## Native editing and DOM gotchas

- Browser history is document-wide, not per editor. Same-origin iframe examples
  isolate it in tested Chromium/Firefox. Linux WebKit can share history across
  frames even without library code; do not mask this with UA hacks or custom undo.
- Retain painter and live-preview nodes. Removing unrelated children, replacing
  DOM, or assigning textarea values during input can split Chromium typing undo
  into character steps. Update Text.data and hide spare preview elements instead.
  Retained DOM follows the structure's high-water mark. App callbacks can trigger
  the same problem if they rebuild UI on every keystroke.
- Source mapping must tolerate native DIV/P/BR and LF shapes without normalizing
  live DOM. A final BR may be a caret placeholder; a nested BR before following
  inline content is a real newline. Empty trailing Text nodes must not change
  placeholder classification. Firefox may delete a real BR during replacement;
  preserve the boundary within the same native insertion.
- Fenced code backgrounds use measured full-content-width bands, not token glyph
  backgrounds. Empty-line glyphs are paint-only. ResizeObserver remeasures geometry
  and must disconnect on destroy. Inline code keeps its separate treatment.
- Build one local model snapshot per render, never cache it across events. Batch
  built-in edits until selection restoration, but preserve synchronous setter
  notifications and custom callback semantics. Keep lifecycle/version guards after
  reentrant callbacks. Inactive selection updates must not render or steal focus.
- Use sequential child indexing for source mapping and iterative syntax handling.
  Avoid argument-limit spreads on high-token documents and repeated failed suffix
  scans. Failed-search caches and whole-run delimiter indexes are intentional.
- Syntax tabs use four-column stops mapped to original UTF-16; export preserves
  tabs. Visual tab width is separate. A right-biased source map inside a tab points
  after it: do not treat a following tab as the same partial tab when editing prefixes.
- Keep heading/source font monospaced. Proportional fonts can misalign paint and
  caret. Firefox BR-separated headings may fall back to body sizing.
- Native paragraph/CSS settings are document-wide: apply on focus/commands, not
  initialization. Deferred formatting must recheck focus, mode, selection, and
  destruction, and cancel on replacement or teardown.

## Editing and UI constraints

- Preserve native history, composition, selection, callback counts, and untouched
  source/node identity. Candidate recognition guards unsafe Markdown edits; do not
  loosen them by trimming or globally normalizing live source.
- Markdown blank marker handling uses ASCII spaces/tabs, not JS trim(): NBSP/BOM
  are real content. Marker-length edits before tabs require recalculating actual
  content columns. New whitespace uses spaces; preserve existing whole tabs.
- Container ownership and literal boundaries matter beyond the selected text.
  Do not let edits silently adopt unselected siblings, release task markers, or
  convert exposed text into headings/lists. Reference images stay protected.
- Markdown table Rows includes the header, not the delimiter. Creation limits do
  not cap imported tables or existing Markdown row/column growth. Row edits permit
  ragged tables; column/alignment edits refuse them. Preserve retained cell bytes.
- When deleting a Markdown row before a blank native block, remove its preceding
  newline plus row text. Deleting through the next block's start can swallow the
  blank boundary in Firefox and absorb the following paragraph into the table.
- HTML table contextual growth has fixed caps independent of configurable creation
  limits. Clone/replace only the selected table through native insertion. Preserve
  header references and section semantics; do not broaden merged-cell support
  without agreement. Deletion fast-path optimization has no measured justification.
- UI may live in a different document from source: the parent-toolbar iframe demo
  ports its toolbar. Create Help/picker UI and listeners in toolbar.ownerDocument;
  source selection, mutation observation, insertion, and history stay child-owned.
- Picker positions are snapshots, not fallback carets. Check pending mutation
  records on submit so even same-text synchronous edits invalidate stale positions.
  Composition, replacement, and destruction must close or invalidate pending UI.
- Escape handling must respect Help and picker priority before Fullscreen, then
  source's one-shot Escape/Tab focus traversal. Pointer input on a toolbar can
  prevent blur, so it must explicitly clear the source focus-escape state.
- Fullscreen has one owner per editing document. It fills an iframe's viewport,
  not the parent page. Transformed/contained ancestors can constrain fixed layout.
  Preserve app-owned classes/styles and restore scroll/selection on exit.
- Split scrolling is proportional vertically, not source-line mapping. Horizontal
  scrolling stays local. Ignore expected programmatic positions to prevent feedback.
- CSS may override [hidden]; owned hidden UI needs explicit display rules. Do not
  hide contextual controls while toolbar focus needs them: scroll clamping can make
  pointer clicks miss. Keep constrained iframe layouts usable at narrow heights.
- Validate actions/shortcuts before installing UI/listeners. Preserve custom result
  callbacks and null/undefined built-in fallbacks. Teardown is idempotent and must
  remove only owned UI/listeners/classes and suppress late async results.

## Safety boundaries

- README owns the public HTML mode matrix. Import filtering is not a sanitizer
  guarantee: live editing and Source mode are not filtered. Applications validate
  exported HTML before publishing. Normal HTML drops are rejected independently
  of image settings; raw/unrestricted bypasses are intentional trusted-content paths.
- Unrestricted mode bypasses URL/file checks, not attribute escaping, explicit image
  switches, table limits, or lifecycle guards. Relative HTML insertion URLs must
  resolve to HTTP(S), so file:// relative URLs differ from Markdown templates.
- HTML File.type is read-only. Use a typed Blob slice for FileReader fallback while
  passing the original File to app hooks. Recheck mode/destroyed state after awaits
  and before loading hook-result URLs. Do not duplicate native input notifications.
- Preview is inert filtered output, not an export API or publication-safety promise.
  Keep raw HTML escaping enabled in the renderer. No resource loads on opening
  preview; images become placeholders and task inputs become text. Table-cell style
  attributes stay blocked; no alignment exception is approved.
- MeltDown's optional highlighting hook returns trusted inner HTML. Core/parser
  import no highlighter. See its guide for validation, fallback, and error semantics.
- Async rendering must discard stale results after edits, replacement, view exit,
  or destroy. Renderer failures must not mutate source or source history.

## Testing and operational gotchas

- Use focused real Chromium/Firefox drivers during development, broader suites at
  milestone/release gates. Do not rerun unchanged matrices without a reason.
  README owns build/test commands. Do not claim tests passed unless actually run.
- Markdown's default syntax schedule retains all 318 fixtures, with 23 representative
  cases repeated across extra shapes/widths. `-- --exhaustive` retains the complete
  cross-product. Do not reduce fixture coverage to speed unrelated command checks.
- Scope toolbar queries to the named formatting group: HTML and Markdown can share
  a page and accessible button names. Use actual native history availability rather
  than assuming Redo is the last enabled control.
- Use real keyboard/pointer interaction and explicit geometry/animation signals,
  not sleeps. Real Tab is needed for focus-visible. Firefox need not outline
  programmatically restored focus. Await document.getAnimations() in skin checks.
- Tests use global Playwright. Match Node/module paths and installed browser
  revisions. Do not rename browser caches or download browsers as the agent.
  Linux WebKit checks are opt-in and have known iframe-history failures.
- `tests/markdown-isolation.js` provides focused surface/plaintext/profile diagnostics.
  `tests/fixtures/native-frame-history.html` reproduces native cross-frame history.
- Pass Node values explicitly into Playwright evaluations. Synthetic DataTransfer
  needs Object.defineProperty. README snippets need an HTTP origin; do not weaken
  server CORS to bypass opaque about:blank restrictions.
- Smoke port is 5059; stop only the test server you own. Chromium blocks 5060/5061.
  Demo server defaults to 5000; LM_TEST_PORT overrides it.
- npm pack JSON may be name-keyed or an array depending on npm version. Build size
  reports use system gzip -c; Node zlib defaults can yield different sizes.

## Release and sharing constraints

- Preserve ignored release archives `lightmetal-0.3.0.tgz` and `lightmetal-0.4.0.tgz`.
  Inspect the exact new tarball, test script-free installation, and verify registry
  integrity when publishing. Old archive counts and checks do not validate a new one.
- The remote is private. Never expose its hostname/URL in public files or metadata.
  Leave repository/homepage/bugs unset until a public destination is chosen.
- Before sharing history, remove the private URL in commit `2d8cecd`; rewriting
  history requires approval. Choose a public README logo URL before npm presentation
  work: shipping a relative asset does not ensure npm-site rendering.
- Preserve the centered 320px README logo, responsive gallery logo outside saved
  content, gallery navigation, and packaged logo asset.
