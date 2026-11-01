# ligHTMetaL::MaiDEn — the lightMarkDown Editor: next-step specification

## 1. Purpose and status

Turn the Markdown developer preview into a dependable, full-featured source
editor. Keep Markdown visible, use a monospace writing font, and keep the
interface and setup familiar to ligHTMetaL users.

This is an implementation plan, not a claim that the features below exist.
The starting point is commit `f62743d`. The companion remains unpublished;
npm 0.4.0 contains only the HTML editor and skins.

EasyMDE supplies a useful coverage baseline, not a feature ceiling or a codebase
to copy. Built-in buttons need functional counterparts unless explicitly omitted.
Clean Block is omitted at the user's request. We can improve supported behavior
and add capabilities beyond that baseline.

Architecture changes, dependencies, new public API names, and toolbar defaults
need review before implementation. This document does not authorize publication,
commits, tags, pushes, or changes to the HTML editor.

## 2. Commitments

- Keep the HTML editor's source, behavior, and existing bundles unchanged unless
  separate work receives approval.
- Keep `maiden.js` independent of the HTML-editor JavaScript. Share CSS,
  skins, visual conventions, and API patterns where their meanings match.
- Keep source text authoritative. Styling, preview, and view changes must not
  rewrite the document. Retain all characters except the documented CRLF/CR-to-LF
  normalization and changes the user explicitly requests.
- Keep zero runtime dependencies as the default constraint. Do not add an engine,
  parser, framework, or vendored library silently. Present the need, alternatives,
  size, license, and maintenance costs before asking for approval.
- Keep all bundled assets local. No external fonts, icon services, CDN loaders,
  analytics, accounts, vendor cloud, or automatic document uploads.
- Leave persistence and upload destinations under application control. No silent
  autosave, browser storage, remote spelling service, or document recovery store.
- Keep original CSS and local SVG artwork. Preserve required notices if approved
  third-party code or test material is reused.
- Do not mistake highlighting for HTML rendering, or a parser for an editing
  engine. These are separate responsibilities.

## 3. Reference coverage

Reference: EasyMDE 2.21.0, checkout revision `a484341`. The inventory comes from
its `toolbarBuiltInButtons` registry in `src/js/easymde.js`, checked against the
README's toolbar table and the action implementations. Reference sources stay
outside this repository.

The registry contains **26 buttons and five separator entries**. Thirteen buttons
have `default: true`. Optional buttons count toward coverage too.

### Button coverage

**Preview** means a counterpart exists, not that it has passed the completion
criteria in this spec. **Missing** means the capability still needs implementation.
**Omitted** means the user declined the capability. Action IDs in Missing rows are proposals. Existing IDs must remain compatible.
Milestone numbers refer to section 5.

| EasyMDE button | Default | Companion action | Now | Required result |
| --- | --- | --- | --- | --- |
| `bold` | Yes | `bold` | Preview | M3: wrap/unwrap emphasis with correct selection and history. |
| `italic` | Yes | `italic` | Preview | M3: wrap/unwrap without confusing bold delimiters. |
| `strikethrough` | No | `strikethrough` | Preview | M3: add/remove paired strike markers. |
| `heading` | Yes | `heading` | Preview | M3: heading cycle; alias the smaller-heading operation. |
| `heading-smaller` | No | `heading-smaller` | Preview | M3: paragraph → H1 → H2 → … → H6 → paragraph. |
| `heading-bigger` | No | `heading-bigger` | Preview | M3: paragraph → H6 → H5 → … → H1 → paragraph. |
| `heading-1` | No | `heading1` | Preview | M3: set H1 on the affected source lines. |
| `heading-2` | No | `heading2` | Preview | M3: set H2 on the affected source lines. |
| `heading-3` | No | `heading3` | Preview | M3: set H3 on the affected source lines. |
| `code` | No | `codeblock` | Preview | M3: insert/wrap fenced code and choose a safe fence length. |
| `quote` | Yes | `quote` | Preview | M3: add/remove quote prefixes without dropping indentation. |
| `unordered-list` | Yes | `ulist` | Preview | M3: add/remove unordered-list markers. |
| `ordered-list` | Yes | `olist` | Preview | M3: add/remove numbered-list markers. |
| `check-list` | Yes | `checklist`, `task-toggle` | Preview | M3: separate task-list formatting from checking/unchecking items. |
| `clean-block` | No | — | Omitted | User declined this action and button. |
| `link` | Yes | `link` | Preview | M3: insert a prompt-free template with an escaped label and selected URL. |
| `image` | Yes | `image` | Preview | M4: prompt-free template; selected text supplies its URL. Select an existing inline image's URL for replacement. |
| `upload-image` | No | `image-file` | Deferred | Future nice-to-have: file picking with an explicit local/app strategy. Not required for M4. |
| `table` | No | `table` | Preview | M4: default menu for formatted insertion, source padding, row/column editing, and alignment. |
| `horizontal-rule` | No | `line` | Preview | M3: insert a rule with safe paragraph boundaries. |
| `preview` | Yes | `preview` | Preview | M5: toggle an optional, safely rendered preview. |
| `side-by-side` | Yes | `side-by-side` | Preview | M5: show editable source and rendered preview together. |
| `fullscreen` | Yes | `fullscreen` | Preview | M5: expand the editor and restore the original page/focus state. |
| `guide` | Yes | `guide` | Preview | M5: open useful offline help without a network dependency. |
| `undo` | No | `undo` | Preview | M1/M3: follow native document history; demonstrate independent history in the iframe example. |
| `redo` | No | `redo` | Preview | M1/M3: replay the corresponding edit predictably. |

There are 24 mapped Preview controls, one Deferred control, and one Omitted
control. Do not mark a row complete just because an icon appears or a callback
exists.

### Toolbar structure

Cover these interface facilities as well as the commands:

- The five reference separators, `separator-1` through `separator-5`, are layout
  entries, not editing commands. The optional `"|"` entry can express all five
  positions. It creates a non-focusable, vertical accessible separator; leading,
  trailing, and repeated separators are ignored. No numbered APIs or default
  toolbar changes are needed.
- Support ordered action lists, hidden/omitted actions, custom buttons, titles,
  icons, selected states, and disabled states.
- Plan accessible grouped/dropdown actions so the complete interface fits on
  small screens. A `children` configuration is a proposal, not an existing API.
- A compact default toolbar need not show every available control. Defaults and
  grouping get a separate review once the controls work.
- `shortcuts` now configures per-editor command bindings, including keyboard-only
  built-ins. Tooltips and `aria-keyshortcuts` reflect actual bindings. No new default
  bindings claim browser address, print, hide, or fullscreen commands.

This is functional coverage, not drop-in EasyMDE configuration compatibility.
In particular, keep our existing `code` action as **inline code** and `codeblock`
as **fenced code**. Do not rename `ulist`, `olist`, `line`, or `heading1`–`heading6`.
Any compatibility aliases need an explicit decision and tests.

EasyMDE also exposes heading 4–6 functions outside the built-in button registry.
Our existing `heading4`, `heading5`, and `heading6` must remain available.

## 4. Scope beyond the reference

The first complete release should retain inline code, direct H1–H6 selection,
and Paragraph. These already go beyond the reference button registry. It should
also support good list continuation, indentation, task editing, and a developer
API suited to real page integration.

Keep a separate extension backlog so baseline coverage does not become a ceiling:

- Table row/column editing and alignment, beyond inserting a template.
- Local find/replace, search navigation, and selection counts.
- Explicit Markdown import, copy, and `.md` download, without automatic storage.
- Optional local word/line/character counts and reading estimates.
- Configurable line numbers, wrapping, and editor height where useful.
- Documented extension points for additional dialects or host workflows.

Footnotes, math, diagrams, mentions, attachments, and collaborative editing are
candidates for later proposals, not implied requirements for the first release.
Remote services and accounts remain outside the core. Any future persistence or
recovery helper must be a separate, explicit opt-in with clear data ownership.

## 5. Implementation milestones

### M1 — Decide and prove the editing architecture

**Architecture decided:** keep the minimal inline core and synchronous `init()`.
The user approved browser-owned native history as the default. A whole-editor
iframe provides a separate editing document, not a cross-browser history guarantee.
Linux WebKit can share history across frames, and the current automated Firefox
runtime has native cross-document focus/input limitations. These do not call for
a new engine or custom history.
Applications can load the whole editor inside their own iframe;
see `examples/markdown-iframe.html`. The library does not create or manage frames.
Supported integration keeps toolbar, source, preview, and dialogs in one document.
The parent-toolbar/child-writing-surface experiment is removed. Side-by-side
source/preview remains supported inline and inside a whole-editor iframe.

[M1 findings](../markdown-m1-findings.md) summarizes the architecture constraints
and optional diagnostics. Input, accessibility, and performance validation
remain open; this decision is not a production-readiness claim.

Resolve the highest-risk findings before adding more controls:

1. Undo is document-owned. In both tested browsers, Undo in editor A can undo
   the latest edit in B. Keep this approved native behavior explicit and test the
   whole-editor iframe's native editing and history.
2. Removing unrelated DOM children or assigning another textarea's value can
   split Chromium typing groups. The paint cache avoids our own mutations, but
   an application callback can reintroduce the problem.
3. Firefox can paste BR-separated lines into one native block. Text survives,
   but separate heading sizes cannot be applied to those lines today.
4. Native DOM shapes change during joins, splits, selection replacement, and
   paste. Prove text export and caret mapping across those shapes.

The isolation comparison is complete enough to choose an application-owned
example instead of library integration. Keep its focus, selection, local assets,
file use, lifecycle, and callbacks tested. An iframe does not fix syntax, geometry,
IME behavior, or performance.

Keep native editing as the starting point. Do not create a custom undo stack to
hide symptoms. If the native options cannot meet the requirements, bring a
measured engine proposal back for approval. A parser alone cannot fix history.

**Exit gate:** faithful source, aligned paint, predictable native typing/action
undo within the approved document-history policy, and tested integration/lifecycle
behavior. Independent per-instance history is not an inline-core requirement.
Test native typing/action undo inside the whole-editor iframe without a new
engine or a custom history stack. Cross-document focus and history routing remain
browser-owned; retain separate native diagnostics and document known limitations.
Document host-callback mutations that can split Chromium typing groups; use
persistent Text nodes in examples.

Establish representative document sizes and agree latency, memory, and bundle
budgets before making production claims. Do not promise unmeasured limits.

### M2 — Define the dialect and reliable syntax model

**Complete for the agreed recognition scope.** [Syntax fixtures and limits](../markdown-syntax.md)
pins CommonMark 0.31.2 for block, container, emphasis/escape, and inline link/image
work. There are 318 recognition fixtures, including nested lists/quotes, relative indentation/
fences, Setext headings, multiline code, Unicode emphasis delimiters, punctuation
escapes, balanced link destinations, titles, formatted labels, reference links/images,
document-wide definitions, HTML context, angle-bracket autolinks, and selected
GFM strike/task/table/bare-autolink recognition.
Private container tracking and iterative delimiter pairing add no parser dependency
or public API. The browser suite covers exact source, paint geometry, DOM identity,
callbacks, and fence/Setext/container/emphasis-edit undo.
Selected extensions use GFM 0.29-gfm (2019-04-06) over the CommonMark 0.31.2 core.
The three bare-link review findings are fixed. Chromium/Firefox Markdown and
package checks pass; the final syntax run covers all 318 cases. The final diff
has been reviewed. Broader conformance testing and formal performance/cache
budgets remain follow-up work, not M2 closure gates. This is not a full
CommonMark/GFM-conformance or production-readiness claim.

Use CommonMark 0.31.2 as the baseline, plus selected GFM features: strike-through,
task lists, tables, and autolinks. Pin the standard/fixture versions and document
any exclusions before claiming compliance.

Cover ATX and Setext headings, nested emphasis, escapes, code spans with variable
backticks, fenced/indented code, nested lists/quotes, links, reference links,
images, rules, and the selected extensions. Code contents must stay literal.
Handle parentheses, escaped pipes, reference definitions, and ambiguous markers.

Source HTML stays text in the editor. Preserve indentation, tabs, trailing spaces,
empty/trailing lines, Unicode, and user spelling of Markdown. Do not pretty-print
or canonicalize the whole document during typing or painting.

Compare improving our tokenizer with an approved local parser/tokenizer. Consider
source positions, incremental work, security, fixture coverage, size, and license.
A full HTML renderer must not be required just to edit or highlight Markdown.

**Exit gate:** agreed syntax fixtures pass; source/paint geometry stays aligned;
unsupported syntax remains editable and intact. A style-only change never emits
a content change. Keep the writing font monospaced unless another font model is
separately proven.

**Review checkpoint satisfied:** the earlier implementation review and cleanup,
plus focused review of the new M2 syntax passes, are complete. The review covered
mapping, painting, selection/history boundaries, lifecycle, tests, and cost risks.
Do not repeat a holistic review as another gate before M3. Broader validation and
formal budgets remain follow-up work. Propose future refactors for approval;
completion does not authorize modules, a dependency, or a rewrite.

### M3 — Finish source commands and writing ergonomics

**Agreed scope implemented.** The heading slice implements direct setters, Paragraph,
Setext conversion, forward/reverse cycles, container-aware selection and toolbar
state, and literal code/HTML guards. The default toolbar is unchanged.
[Command behavior](../markdown-commands.md) documents the agreed rules.
`tests/markdown-headings.js` covers Chromium/Firefox commands, callbacks,
selection, and native undo/redo across block/LF/BR shapes. Heading commands skip
lines with four or more columns of indentation after container prefixes, including
ordinary paragraph continuations. All-skipped selections disable the controls;
commands never reduce indentation. Tabs use Markdown column stops.

The inline-emphasis slice implements recognized Bold/Italic/Strike toggles and
active/disabled states, including nested star/underscore pairs and single/double
tilde strike. It preserves literal contexts, supports removal across soft lines,
and keeps new wrapping single-line. Marker collisions leave source untouched.
`tests/markdown-formatting.js` covers selection, callbacks, composition/lifecycle,
and native undo/redo; package smoke checks exercise the shipped build formats.
The code slice now uses recognized inline spans and fenced blocks for commands
and state. Inline Code supports safe delimiters/padding, protected contexts,
soft-line removal, and transient empty pairs. Code Block wraps whole touched lines,
preserves list/quote containers, and removes enclosing backtick/tilde fences.
Ambiguous cross-container/fence selections stay unchanged. `tests/markdown-code.js`
covers native DOM shapes, selection, callbacks, state, and undo/redo.

The link action now inserts `[link](https://www.example.com)` without a prompt.
Selected single-line text becomes an escaped label; the URL stays selected for
replacement. Existing-link editing is outside this agreed template slice. See the
command document for caret, whitespace, partial-selection, and empty-pair rules.

The writing slice now uses recognized list items and quotes for toggles/state,
including continuation ownership and subtree prefix adjustment. Optional
`checklist` adds/removes task syntax; `task-toggle` checks/unchecks existing tasks.
Defaults stay unchanged. Enter continues lists/tasks/quotes, resets new tasks to
unchecked, and exits empty marker lines one level at a time. Shift+Enter inserts
a plain newline. Literal contexts and composition stay native. The focused
`tests/markdown-writing.js` covers block/LF/BR shapes, selection/state, callbacks,
keyboard and beforeinput behavior, tab stops, and native undo/redo. Real mobile
input remains a manual integration check.

The indentation slice implements whole-line four-column stops, structural list/
task nesting and lifting, code-body whitespace edits, protected fence/HTML lines,
and refusal of moves that would change unselected ownership. Escape then Tab/
Shift+Tab passes one native focus step through the browser. A visible, per-instance
accessible hint explains it. `tests/markdown-indentation.js` checks source/history
and native focus inline and within the whole-editor iframe. No new toolbar actions,
options, or custom focus-order implementation are added.

The rule/separator slice hardens `line` with protected selections, safe paragraph
boundaries, container-aware continuation prefixes, useful caret restoration, and
candidate checks for unselected structure. Optional `"|"` entries divide configured
actions without adding default buttons or keyboard stops. `tests/markdown-rules.js`
covers both features across native DOM shapes, history, callbacks, accessibility
attributes, and narrow toolbar wrapping. Clean Block is intentionally omitted.

The shortcut/hint slice adds the approved `shortcuts` map and `false` opt-out.
It preserves the four defaults, allows named rebinding/disabling and keyboard-only
built-ins, and respects focused-source ownership, composition, AltGr, and prevented
events. Tooltips and `aria-keyshortcuts` expose actual bindings without renaming
buttons. Native writing keys/history and default toolbar contents stay unchanged.
`tests/markdown-shortcuts.js` checks configuration, validation, callbacks, guards,
native history and the whole-editor iframe. Package checks cover shipped formats.

The Link/history-state slice protects recognized literal/prefix and existing-link
boundaries. It permits whole inline-code labels, preserves required body separators,
and rejects candidates that change surrounding ownership or task/literal source.
Native Undo/Redo buttons follow browser-reported availability, including document-
wide input and focus changes. State-only refresh does not render, notify, or steal
focus. The whole-editor iframe retains child-owned flags and keyboard traversal.
`tests/markdown-state.js` covers these guards, native history states, custom overrides,
and block/LF/BR shapes; package checks cover the shipped formats.

The following requirements define the agreed M3 scope. Harden controls rather than
treating unreviewed behavior as done.

- Specify collapsed-caret, selected-text, multiline, whitespace, and repeat-action
  behavior. Preserve text outside the affected range and restore useful selection.
- Keep direct heading actions as setters, with Paragraph returning to body text.
  Define cycles separately. For mixed selections, transform each selected line
  from its own level. Do not copy reference quirks accidentally.
- Enter continues a list/task/quote; Enter on an empty item exits it. Continue the
  new ordered item without silently renumbering unrelated source.
- Tab/Shift+Tab indent/unindent selected lines or nested items. Define how users
  leave the editor with the keyboard; never create an inescapable Tab trap.
- Task editing changes only the intended markers. `checklist` controls task syntax;
  `task-toggle` controls checked state. Both are optional, not default-toolbar
  additions. No Clean Block control is planned; the user declined it.
- Inline/fenced code chooses delimiters that do not collide with its contents.
  Rules receive boundaries that do not accidentally create Setext headings.
- Link inserts a prompt-free template, escapes selected labels, and selects its
  fixed HTTPS placeholder for replacement. It never fetches a URL. Users edit
  source directly; there is no URL prompt or cancellation workflow.
- Provide active/disabled states and shortcut hints. Keep formatting out of
  composition sessions and suppress unwanted native rich-text commands.

**Exit gate:** each command passes click and keyboard tests, selection boundary
cases, callbacks, and the M1 undo policy. Supported command behavior is documented.

### M4 — Add image and table workflows

**Complete for the agreed scope.** File workflows, shared reference-image editing,
and advanced table conversion are future nice-to-haves, not completion blockers.
The user approved a prompt-free first slice: `image`
inserts `![image](https://www.example.com/image.png)` at a caret. Selected text
supplies the URL, not the alt label; the inserted URL stays selected. HTTP(S) and
relative destinations are validated without fetching, then escaped for Markdown.
Shared recognized boundaries protect literal/prefix and existing-link/image
source. Candidate checks preserve surrounding structure. No dialog, image fetch,
file strategy, API method, or default shortcut is added. At the user's request,
Image now appears beside Link in the default toolbar. Explicit action lists still
control which buttons appear.
`tests/markdown-images.js` covers source shapes, callbacks/history, guards, custom
and keyboard-only paths, no requests, and the whole-editor iframe. See
[command behavior](../markdown-commands.md) for URL and selection rules.

Inside a recognized inline image, Image now selects its source URL for native
replacement. It preserves alt text, optional titles, containers, and surrounding
source. Selection alone does not edit, notify, or add history. Repeating does not
nest templates. Reference images remain protected; shared-definition editing needs
separate agreement. Users edit alt text directly in source. The immediate template
has no pending form or Cancel button; native Undo reverses insertion. Do not add an image
form merely to satisfy the original helper/cancellation proposal. Neither the
source editor nor a future helper may fetch the image.

**Future nice-to-have — image files (not implemented).** File picking, image
paste/drop, uploads, and base64 embedding are deferred. Keep persistence and
uploads application-owned. If revisited, agree the API and policy first.
The following constraints apply to any future implementation, not current M4:

A file button would open a local picker. File handling must have an explicit strategy:
application-supplied URL resolution/upload, or an explicitly enabled local data
URI policy. It must not assume a vendor endpoint or silently send a file anywhere.
Without a configured strategy, explain why the action is unavailable. Ship a
working local example; a permanently inert button does not count as coverage.

Apply type/size limits and visible error states. Checks do not authenticate file
bytes. Capture the insertion point before the picker/hook. Cancellation, failure,
composition, document replacement, and teardown must not insert at a stale point
or produce late callbacks. Do not save temporary object URLs as durable Markdown
without an explicit application policy; release owned resources.

The default `table` action opens a Table menu with insertion, source formatting,
row/column editing, and alignment. Individual commands remain configurable as
buttons or keyboard-only actions. `table-insert` opens a 10 × 8 grid plus
Columns/Rows fields (default 3 × 3) and Insert. New tables start padded, including
the delimiter and empty cells, as part of one native insertion. Rows include the
header, not the delimiter. One row is header-only.
Creation bounds are 100 columns, 1,000 rows and 10,000 cells; no new configuration
or public insertion method is added. Arrow keys move through the grid; Enter/
Space inserts; Escape/outside click cancels. The picker saves the empty-body caret
and refuses stale positions. It reuses shared picker CSS without HTML-editor
JavaScript. UI, source editing, and native history stay in the
same editing document.

Insertion still requires a collapsed caret on an empty body line and selects
`Column 1`. It adds no default shortcut, text conversion, or document grid.
Explicit action lists can omit Table. Candidate recognition preserves containers,
neighboring table/HTML boundaries, and untouched block/task state. Invalid sizes,
stale positions, cancellations and unsafe placements add no edit/history or
callback. Confirmed insertion uses one native undo step and one `onChange`.
Browser checks cover default/grid/manual/header-only/limit cases, block/LF/BR
source, save/reload, callback/history/guard/composition/custom/keyboard-only paths,
geometry, no requests, teardown and the whole-editor iframe. Package smoke
covers grid/manual insertion in all JS formats.

The Table menu includes `table-row-after` and `table-row-delete`, also available
as individual actions. Add matches the table's column count and inserts below
the current row (first body row from the header/delimiter). Delete protects the
header/delimiter and leaves a valid header-only table after the last body row.
Single-row selections work; multirow selections are refused. Candidate checks
preserve untouched cells, table identity, containers, and neighboring block/task
state. Each edit is one native undo step and one `onChange`. Carets stay useful
for continued source editing. Browser/package coverage includes native deletion
boundaries, callbacks/history, custom/keyboard-only paths, and the whole-editor iframe.

The Table menu includes `table-column-after` and `table-column-delete`, also
available as individual actions without default shortcuts. A caret or selection in one header/body
cell targets a whole-table edit. Add inserts selected `Column` header text, an
unaligned delimiter and empty body cells. Delete protects the final column and
keeps a caret in the same row's next/previous cell. Header-only tables work;
ragged tables, delimiter positions and multi-cell/multirow selections are refused.
Retained cells keep their exact source and alignment. Minimal outer pipes keep
empty edges and one-column tables valid. Candidate checks preserve table identity,
row counts, retained cells, containers, and neighboring block/task state. Each
edit is one native undo step and one `onChange`. Browser/package coverage includes
all three source shapes, guards, callbacks/history, custom/keyboard-only paths,
and the whole-editor iframe.

The Table menu includes `table-align-left`, `table-align-center`,
`table-align-right` and `table-align-none`, also available as individual actions. It shares
column-cell eligibility and changes only the target delimiter's colons. Dash
count, whitespace and all other source stay intact. The original caret/selected
range maps through the edit. Pressed state reflects recognized alignment;
reapplying it changes no source/history and sends no callback. Unsafe candidates
are refused rather than normalizing markers. Actual edits remain one native undo
step and one `onChange`. Browser/package checks cover all four modes, no-ops,
state/selection, callbacks/history, containers/literals and the whole-editor iframe.
These actions set GFM markers, not source padding or a DOM table grid.

The approved `table-format` action appears in the default Table menu. It pads the
current recognized, non-ragged table for monospace source, standardizes outer
pipes, and adjusts delimiter dashes while preserving alignment colons and cell
content. It supports a caret or selection within one table, including its
delimiter. Container prefixes and unrelated source stay intact. No font measurement,
proportional-font support, automatic typing-time formatting, or custom history is
added. Formatting is one native edit and one callback; identical output adds
neither edits nor history. New table insertion generates this layout directly.
Wide/combining glyphs are outside the simple source-column width model. Tests
cover source shapes, selection, no-ops, callbacks/history, guards, menu keyboard
use, narrow layout, and whole-editor iframe split view.

**Future nice-to-have — advanced tables.** Text-to-table conversion and other
advanced table operations are deferred, not required for M4. There is no arbitrary
cell-text input in the size picker. Before adding text
conversion, agree handling for pipes, backslashes, inline code, alignment, empty
cells, and size limits. Reject unsupported multiline
cells without losing text or turning them into active HTML. Row, column, and
alignment commands are implemented beyond-baseline extensions. No HTML spans or
DOM table editing belong in the Markdown source model.

**Exit gate (met for the agreed scope):** image template insertion and inline-URL
selection work; tables survive save/reload; error, cancellation, native history,
and lifecycle checks pass without unexpected requests or document changes.
Deferred image-file and advanced-table workflows do not block completion.

### M5 — Add optional view modes and local help

Implemented controls: `guide` opens a default local quick-start modal after
Fullscreen. With `preview: { render }` configured, the default toolbar adds
Preview and Side-by-side before Fullscreen and Help. The application owns the
renderer chain. It returns HTML synchronously or through a Promise; core imports
no parser/highlighter. Explicit built-in Preview
without a renderer fails initialization. Preview filters returned HTML, replaces
images/task inputs with inert text, preserves safe highlighting classes, and
ignores stale async results. Applications disable raw HTML in the renderer.
MeltDown is the dogfooded renderer; poliSH supplies code highlighting through
its optional `highlight` hook. Neither library is imported by the editor core.
No third-party parser or highlighter dependency is needed.
Browser tests bundle their adapter in memory; no third-party code or test bundle
is shipped.
The MaiDEn demo now supplies the separately shipped, optional
`ligHTMetaL::MeltDown` parser through the same hook. Its source, three builds,
[guide](../MeltDown.md), parser tests, and browser integration tests live here.
Core still imports no parser. Table-cell styles remain filtered; no alignment
exception was added. Fullscreen is implemented as a fixed viewport layout with
Escape/button exit, source/preview support, owned page-scroll locking and teardown
restoration. It fills the editing document's viewport, not an outer iframe.
Side-by-side is implemented through the same renderer: live editable source and
filtered output, bidirectional proportional vertical scrolling, responsive stacking and fullscreen
integration. Source/preview/split transitions preserve native source DOM/history.
Preview rendering reuses DOM nodes and hides spares to avoid splitting Chromium
native typing groups. Async guards apply to both rendered views. The
[security review](../security-review.md) covers the rendering boundaries and
remaining risks. Broader M5 accessibility review remains open.

Preview, side-by-side, fullscreen, and guide are required for complete button
coverage. They need not be enabled or loaded in the default source-only editor.
A renderer hook by itself is not complete preview coverage: provide a tested local
renderer integration/example that makes both preview controls usable.

- Keep rendering optional through explicit imports/configuration, not runtime CDN
  loading. Source editing must work without a renderer.
- Treat generated HTML as untrusted. Define an allowlist/sanitization boundary;
  a Markdown parser is not a sanitizer. Raw HTML is disabled by default in preview.
- Block executable URLs, handlers, unsafe embeds, and unapproved resource loads.
  Show image placeholders until a configured resource policy permits loading.
  External images need explicit permission; opening preview alone must not trigger
  remote content requests. Test this boundary separately from insertion checks.
- Preview-only mode preserves source and selection; formatting controls reflect
  whether editing is available. Returning to source restores focus and scroll.
- Split view works without forcing fullscreen. Provide a usable narrow-screen
  arrangement and sensible scroll behavior; do not copy desktop-only exclusions.
- Fullscreen restores the previous page state on Escape, exit, and destroy.
  Support a viewport-expansion fallback where native fullscreen is unsuitable.
- Guide opens local help for syntax, supported dialect features, and shortcuts.
  External documentation is an optional, explicit user action, not a dependency.
- Async rendering must discard stale results after edits, replacement, or destroy.

**Exit gate:** all four controls work by keyboard and pointer, retain Markdown
exactly, and meet focus, teardown, and security tests. They do not change the
source editor's content-callback contract.

### M6 — Harden integration, accessibility, and performance

Preserve `init({ element, actions, onChange, classes })`, content methods, and
lifecycle behavior. Per-editor configurable shortcuts are implemented. Proposed
additions include placeholder, read-only state, accessible labels, and focus/view
callbacks. Review names and semantics before adding them; do not copy every
reference setting.

Read-only blocks user edits, not application-driven document loading. Define
focus/selection behavior after replacement and view changes. Keep `onChange` tied
to content changes, with the existing explicit-setter notification contract.
Callbacks must remain usable in real applications, not only in our demo.

Validate mounting, reinitialization, multiple instances, custom actions/classes,
coexistence with the HTML editor, async cancellation, and repeated teardown.
Test embedding and CSP without adding `unsafe-eval` or weakening server policy.

Use keyboard and screen-reader checks, visible focus, accessible names/states,
contrast, zoom, and responsive controls. Test real IME composition, mobile
keyboards, autocorrect, dictation, and mixed RTL/LTR text. Synthetic composition
events alone do not prove those work.

Measure ordinary documents, large documents, long single lines, many syntax
markers, repeated paste/delete cycles, and repeated document replacement. Watch
input latency, scrolling, DOM nodes, cache high-water behavior, and memory released
after teardown. Fix hotspots based on profiles, not speculative rewrites.

**Exit gate:** agreed performance budgets and browser/accessibility support are
met. Publish the tested support matrix and any remaining limits.

### M7 — Prepare the complete release

- Reconcile every matrix row against implementation and tests. Required optional
  workflows must work when configured, with clear unavailable states otherwise.
- Review a compact default toolbar and responsive grouping. Availability does not
  require displaying all 26 reference controls at once.
- Update usage examples, API docs, help, changelog, safety boundaries, and known
  limits. Do not advertise full dialect compliance unless fixtures support it.
- Keep the package's main entry point as the HTML editor. Ship the companion and
  any approved optional modules through stable, case-correct paths.
- Choose a new version and align npm/Python metadata and lockfiles. Never replace
  published 0.4.0. Commit, tag, push, and publication each need approval.
- Build, test, inspect the package allowlist, and test the exact release archive.
  Confirm local assets, licenses, no install hooks, and no unexpected dependencies.
- After publication, verify registry integrity, a clean script-free install, and
  representative browser use. Do not rerun a full matrix for a simple status check
  when a checksum and targeted install check answer the question.

## 6. Test plan and completion rules

Use the existing Node/assert and Playwright setup. Add no testing framework just
for this work. Use Chromium/Firefox for editing behavior, not jsdom. Add Safari
and real mobile/IME checks before claiming support for them.

Use layers rather than multiplying every test across every setting:

1. Pure syntax/transform fixtures for text rules, where appropriate.
2. Focused real-browser tests for each command and editing boundary.
3. Representative skin/palette/width tests for geometry and accessibility.
4. Small IIFE/minified/ESM/bundler and package smoke checks.
5. Broader browser/security/regression checks at milestone and release gates.

The default syntax suite runs all 318 fixtures in a standard block/desktop shape,
then repeats a named 23-case mapping/layout subset across the other shapes and
mobile width. `npm run test:markdown -- --exhaustive` retains the full cross-product
for deliberate audits. Keep command tests focused during development; both suite
modes report elapsed times. See [the syntax test plan](../markdown-syntax.md#invariants-and-browser-checks).

Every action needs applicable cases for normal use, caret/selection boundaries,
empty input, repeat action, cancellation, read-only/composition/destroyed state,
callback count, and undo/redo. Async workflows need replacement and stale-result
cases. View-only controls must leave the source and content callback count alone.

Retain regression cases for the issues already found: cross-host undo, Chromium
history grouping during host updates, Firefox BR paste, UTF-16 selection offsets,
literal HTML, code literals, empty/file-only paste, and stale callbacks. Use real
geometry/focus signals instead of arbitrary sleeps. Keep test timing visible.

A control is complete only when it is usable, documented, accessible, tested,
and compatible with the chosen editing/history policy. A visible icon, a happy
path, or a disabled placeholder is not enough. Full baseline coverage requires
the 25 supported reference buttons plus the toolbar facilities. Clean Block is
explicitly excluded; extensions remain welcome.

## 7. Current work

M2, the pre-M3 review checkpoint, and the agreed M3 command/writing scope are
implemented. `markdown-commands.md` documents headings, emphasis, code/template
links, lists/tasks/quotes, writing keys, rules, separators, shortcuts/hints, and
native command states. Clean Block is omitted, not unfinished work. M4 is complete
for the agreed scope: image templates, inline-image URL selection, table-size
picking, and row/column/alignment editing. Shared reference-image editing, image
file workflows, and advanced table conversion remain future nice-to-haves, not
M4 blockers. Keep reference images protected. M5 Help, Preview, Side-by-side, and
Fullscreen are implemented, including the optional MeltDown/poliSH rendering chain.
The supported-scope regression suite and package checks pass in Chromium/Firefox.
Next: complete M5 accessibility review, then proceed with M6 integration,
accessibility, and performance hardening.
[The security report](../security-review.md#firefox-runtime-diagnosis) records the
separate native cross-document runtime limitations. The
report also records the completed rendering-boundary security checks and their
limits. Agree performance budgets and any new API, toolbar-default, dependency,
or configuration changes before implementation.

Preserve the synchronous API, native editing/history, and application-owned iframe
examples. Remaining M1 manual input/accessibility checks and broader performance
validation stay open; they do not reopen M2 or block M3.
