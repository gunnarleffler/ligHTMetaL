# Markdown syntax work (M2)

**M2 is complete for the agreed recognition scope.** The suite has 318 cases.
Broader conformance and formal performance/cache budgets remain follow-up work,
not blockers for M3. This is not a production-readiness claim.

## Baseline and scope

Use **CommonMark 0.31.2** as the baseline:
<https://spec.commonmark.org/0.31.2/>. The cases in
`tests/fixtures/markdown-syntax.json`, `markdown-containers.json`,
`markdown-emphasis.json`, `markdown-links.json`, `markdown-references.json`, and
`markdown-html.json` are original tests for those rules, not a copy of the upstream
conformance suite. `markdown-gfm.json` pins selected extension rules to
**GFM 0.29-gfm (2019-04-06)**: <https://github.github.com/gfm/>. CommonMark 0.31.2
remains the core baseline. These fixtures do not establish full compliance.

This batch improves the existing source tokenizer. It adds no parser dependency,
renderer, editing engine, public API, or toolbar defaults.

| Area | Covered in this batch |
| --- | --- |
| ATX headings | Empty content, levels 1–6, opening separators, optional closing hashes, escaped/attached hashes, and code in heading content. |
| Setext headings | Underlines apply to the whole preceding ordinary paragraph. Blank lines, indentation, ATX headings, and container boundaries prevent false matches. |
| Thematic breaks | Three or more matching markers, allowed spaces/tabs, and invalid mixed/short runs. A dashed underline takes precedence when it belongs to a paragraph. These remain text, not `<hr>` elements. |
| Fenced code | Matching character, closing length/indentation/whitespace, backtick info restrictions, tilde info, and an unclosed fence. Both boundary lines use marker styling. |
| Indented code | Four-column indentation, including space/tab combinations, starts code outside a paragraph but does not interrupt an open paragraph. Tabs stay untouched. |
| Inline code | Equal-length backtick runs can span soft paragraph line breaks, not separate blocks. Longer runs cannot partly close a span; unmatched runs cannot reopen from a suffix. |
| Paragraphs | List interruption rules, blank/heading/fence boundaries, and lazy list/quote continuations. |
| Emphasis and escapes | Nested/multiline `*` and `_`, Unicode flanking, intraword underscores, rule-of-three pairing, and ASCII punctuation escapes. Code stays literal and can inherit surrounding emphasis. |
| Inline links/images | Balanced label brackets and destination parentheses, escapes, angle destinations, quoted/parenthesized titles, soft lines, emphasis/code in labels, and innermost-link precedence. Images remain source, never assets. |
| Reference links/images | Full, collapsed, and shortcut references; document-wide forward definitions; normalized labels, multiline destinations/titles, and definition/Setext/list/code boundaries. Definitions and references remain inert source. |
| Containers | Nested lists/quotes, headings and fences within them, relative indentation, item boundaries, and empty items. Prefixes stay visible; this is not rendered list/quote HTML. |
| HTML context and autolinks | Seven HTML-block forms, literal inline tags/comments/declarations, and angle-bracket URI/email autolinks. HTML uses normal text styling; autolinks use link styling, never active anchors. |
| Selected GFM extensions | Single/double-tilde strike, list-item task markers, pipe tables with per-cell inline recognition, and bare URL/email/protocol links. Recognition only; no checkboxes, grids, active links, or source rewriting. |
| Source safety | HTML and URLs remain text. No source creates an element or requests an asset. |

## Logical paragraphs, native editing

The highlighter now analyzes logical Markdown lines before painting. It groups
ordinary paragraph lines, resolves Setext underlines, and splits inline tokens
back into their original source lines. Browser-created DIV, P, BR, and nested-span
shapes do not decide Markdown paragraph boundaries.

This is private styling work, not a new editing engine or public syntax API.
The existing painter still caches nodes and changes only heading metadata on the
source. Export and selection mapping share logical-run BR placeholder detection:
a BR ending a nested inline span is a real newline if inline content follows
outside that span. Native insertion includes/reinserts that specific newline to
avoid Firefox deleting it during replacement. Mixed headings within one native BR/LF block keep the existing base-size
fallback rather than wrapping or rewriting live text.

An iterative stack tracks open list items and quotes. Each has its own paragraph
and fence state. New items, missing required prefixes, and block boundaries stop
formatting from leaking into a different container. Lazy continuation applies only
to paragraph text, not to fences or headings. A lazy equals line remains text;
it cannot turn earlier quoted text into a Setext heading.

A non-one ordered marker or an empty item cannot interrupt an open ordinary
paragraph; leading zeros do not change the numeric list start value. Empty items
can accept immediate indented content, but an intervening blank closes them.

The private syntax view counts four-column Markdown tab stops. Token boundaries
map back to original UTF-16 positions, so even a partly consumed indentation tab
appears exactly once in the paint. Export and editable text never expand tabs.
The existing two-column visual tab width stays unchanged; changing that default
needs a separate decision.

## Inline emphasis and escapes

An iterative delimiter pass pairs `*` and `_` using Unicode flanking and original
run lengths for the rule of three. Failed-opener bounds avoid repeated searches
through unmatched runs. A sweep combines style intervals into flat paint spans;
deep emphasis does not create deeply nested DOM. Markers stay visible and dim.

Only ASCII punctuation is escapable. Delimiter whitespace follows CommonMark:
Unicode Zs plus TAB, LF, FF, and CR; BOM and vertical tab are not whitespace here.
Whole backtick runs are indexed once per inline range, including the shorter
opener left by an escaped first tick. Unmatched runs do not repeatedly scan later
text. Inline Code commands and state share the recognized spans and source maps;
fenced-code commands also share the block recognizer. List/task/quote commands
and Enter use its container ownership, task markers, and tab/source maps. Link
boundaries use full recognized link/image/reference/autolink ranges; candidate
checks preserve containers and untouched literal/task source.

Code, link destinations, and titles are protected during pairing. Single/double
strike now shares the iterative delimiter stack; runs of three or more tildes stay
literal. Code keeps its existing code style inside strike. Bold/Italic/Strike
commands and active states now share resolved pairs and protected ranges from
this pass. Source positions map through the same tab/container boundaries as
painting. The metadata lives only in the local syntax snapshot, not in a
cross-event cache. See [command behavior](markdown-commands.md).

## Inline links and images

An iterative bracket stack scopes label emphasis and resolves inline links/images.
Paragraph construction excludes blank lines before this scanner runs; the scanner
trusts that boundary rather than checking it twice.
An inner link prevents enclosing links, including through image descriptions;
images can contain links or other images. Successful labels resolve their own
emphasis and discard unmatched delimiters before outer text is processed. Code
spans protect their brackets. Label text inherits enclosing emphasis.

A suffix scanner recognizes balanced bare destinations, angle destinations, and
optional double-quoted, single-quoted, or parenthesized titles. Delimiters and
separating whitespace stay visible and dim; destination/title content uses the
existing URL style without interpreting its Markdown. Labels use the link style
combined with emphasis/code. No new CSS, API, URL loading, or source rewriting.

Bare-destination endings are computed lazily in one backward pass per inline
range, with escape-aware balanced-parenthesis jumps. This avoids quadratic work
on repeated unfinished `[a](` sequences. These temporary maps are not a
cross-event cache. Deep brackets, images, and destinations do not recurse.
Reference, strike, and HTML/autolink recognition share these precedence rules.
Focused GFM integration review and its three bare-link fixes are complete.

## Invariants and browser checks

Run after building:

```sh
npm run build
npm run test:markdown
```

`tests/markdown-syntax.js` keeps all **318 recognition fixtures**, including the
generated stress cases. The default run uses layers instead of repeating every
syntax case across every layout:

- All 318 cases run at 1200px in separate native blocks, in Chromium and Firefox.
- A named 23-case subset also runs as LF text and BR-separated nested spans at
  1200px, then in all three DOM shapes at 390px. It covers ATX/Setext headings,
  Unicode, tabs and partial tab consumption, empty/trailing lines, fences, lazy
  containers, multiline emphasis/code/links/references/HTML, tasks, tables, and
  long URL/protocol text that wraps at narrow widths.
- Native-edit, undo/redo, node-identity, callback, and targeted mapping regressions
  still run. The matrix reduction does not skip those checks.

That is **433 fixture configurations per browser**, down from 1,908. Every
configuration retains the same source, style, geometry, identity, callback, and
inert-HTML assertions. No syntax fixtures were removed. Subset names live beside
the matrix in `tests/markdown-syntax.js`; missing or renamed fixtures fail loudly.

For a deliberate mapping, painting, or layout audit, run the full cross-product:

```sh
npm run test:markdown -- --exhaustive
```

This repeats all 318 cases at both widths in all three shapes: 1,908 configurations
per browser. `--exhaustive` also works with the opt-in `--webkit` flag; it does not
change WebKit's known history failures. Both modes print per-layer, per-check-group,
and total elapsed times. Use the focused command drivers while developing commands,
then run the default suite at the checkpoint. Keep exhaustive runs for changes
that warrant them, not every edit.

The assertions cover:

- Exact Markdown export and painted text, including tabs and trailing/empty lines.
- No source-node replacement or text mutation during painting.
- No content callback from a style-only repaint.
- Matching source/paint block geometry, including the existing base-size fallback
  for mixed headings inside one native BR/LF block.
- Code/marker/emphasis boundaries and no active source HTML.
- Native undo/redo when closing a fence changes styling on a later heading.
- Grouped native undo/redo while typing a Setext underline, retaining the title's
  original text node, plus nested empty native-block mapping.
- Native undo/redo after closing a quoted fence or deleting a list continuation's
  indentation, including the following untouched source node and code/heading state.
- Long closing-hash separators, including lines with no valid closing run.
- Grouped two-star typing and escape editing with native undo/redo and untouched
  following-node identity.
- Grouped link-completion typing and escaped-opening-bracket editing with native
  undo/redo, exact source restoration, and untouched following-node identity.

`tests/markdown-review.js` adds separate-page regressions for high-token lines,
nested BR export/formatting/insertion, code/rule commands, one built-in render,
inactive/external selection, and custom callback reentrancy/destruction. Large
paint pools stay on that page. The 180,000-character emphasis line checks exact
paint/export, notification, later typing, and undo without argument spreading.
Custom result callbacks retain their refresh and synchronous per-setter
notifications; only built-ins/API insertions batch their native-input/fallback
render requests. Render snapshots never persist across events.

Package smoke tests also exercise quoted list fences, Setext headings, balanced
link destinations/titles, and formatted link/image labels in all four build formats. A development-only diagnostic compared heading levels,
literal-code recognition, and exact source preservation for 1,158 deterministic
container/indent/fence samples against the already installed cmark 0.30.2 library.
It found no differences. That older reference is not a 0.31.2 conformance test,
and is not a project dependency or part of CI.

A second development-only diagnostic compared 24,912 selected inline samples with
installed MarkdownIt 4.2.0. Letter styles, marker counts, and source preservation
agreed. This is not full conformance or a CI dependency. The vertical-tab fixture
follows CommonMark's normative whitespace definition, not that parser's output.
A further 5,696 selected inline link/image samples agree on letter styles and source
preservation (HTML recognition disabled in that diagnostic). These comparisons
are not full conformance; later reference and HTML work has separate diagnostics.

The existing 20/200 KiB profile still checks exact export and end insertion.
After the review fixes, Chromium 200 KiB diagnostic samples took about
0.27–0.28s to set and 126–132ms to insert at the end. Other development probes
ran concurrently; do not treat these as controlled speed comparisons. Mixed unmatched-delimiter
probes also preserved text/style at 1K/4K/16K pairs. These are samples, not latency
guarantees, controlled comparisons, or agreed budgets.

The closing-hash matcher consumes one separator before walking back across the
rest. Repeating the separator inside the unanchored matcher caused quadratic
backtracking on long trailing whitespace. A 20,000-space Node probe took about
294ms with the repeated separator and 0.09ms with a single separator. These are
individual regex samples, not editor latency budgets.

## HTML context and angle-bracket autolinks

HTML stays inert source. Each container tracks its own HTML-block state alongside
fences and paragraphs. The seven CommonMark block forms end at their specified
terminator, a blank line, or their container boundary. Code takes precedence.
HTML-block contents do not supply Markdown delimiters or reference definitions.

Inline tags, attributes, comments, processing instructions, declarations, and CDATA
stay in the normal text style, even inside emphasis or link labels. Markdown can
still occur between inline tags. A source scanner reads the grammar directly;
it never invokes an HTML parser or creates source elements. Closing-position
lookups include failed searches so unfinished comments do not repeatedly scan
the remaining inline range.

CommonMark angle-bracket URI/email autolinks protect their contents from Markdown
parsing and prevent enclosing links. Angle brackets use marker styling; labels
use link styling. Typed schemes are not insertion URLs: even executable-looking
source remains inert and unchanged. GFM bare autolinks are described below.

There are 41 original HTML/autolink fixtures plus three generated stress cases.
Browser tests cover completion, callbacks, untouched source nodes, and native
undo/redo. The existing HTML safety fixture now correctly treats fence-looking
lines after an unclosed type-seven block as literal HTML-block contents.

Development comparisons use installed MarkdownIt, not a runtime dependency.
Across 2,650 normative/generated samples, remaining differences are confined to
self-closing raw-tag names and DEL in autolinks. Follow CommonMark 0.31.2: `<pre/>`
does not satisfy type one and cannot start type seven; DEL is an ASCII control
and cannot appear in a URI autolink. Both rules have fixtures. With HTML enabled,
the earlier 1,511 reference samples now agree, including the former autolink
precedence difference. These diagnostics do not establish conformance.

## Reference links and definitions

The block pass collects valid definitions at paragraph starts. It removes them
from paragraph semantics, not from source. Definition-only paragraphs do not
create Setext headings or prevent following lists and indented code. Destinations
and titles use the existing URL style; definition punctuation uses marker styling.

Inline resolution waits until all definitions are known, including for ATX
headings. Full, collapsed, and shortcut references share the existing bracket and
emphasis pass. Labels retain escapes literally, fold case without locale rules,
and collapse spaces, tabs, and line endings. Definitions are document-wide; the
painter needs only label membership, not resolved URLs or rendered HTML. Duplicate
definitions remain visible and never overwrite application source.

The 23 original reference fixtures cover recognition, invalid definitions,
multiline titles, empty components, container scope, and block boundaries. Native
edits to definitions update reference paint without replacing untouched source
nodes; undo/redo restores the corresponding paint. HTML/autolink precedence is
covered by the context pass above.

## Selected GFM extensions

The user approved GFM 0.29-gfm extension rules over the existing CommonMark 0.31.2
baseline, including single-tilde strike. Implementation and focused review are
complete. The work remains unpublished.

- Strike uses the existing iterative delimiter stack. Equal one- or two-tilde
  runs pair; longer runs remain literal. Labels scope delimiters as they do for
  emphasis. No recursive strike parser remains.
- Tasks dim `[ ]`, `[x]`, and `[X]` only in a list item's first paragraph, not
  headings or later paragraphs. Raw-source marker checks preserve tab spelling
  and distinguish a tab from multiple spaces in brackets. No checkbox is created.
- Tables require matching header/delimiter cell counts. Escaped pipes remain in
  cells, including inside code. Inline recognition runs independently per cell;
  separator syntax is dim. Extra body cells stay visible but literal. Nothing
  pads, aligns, trims, or deletes exported source. Container and block boundaries
  end tables; no rendered table or new CSS is added.
- Bare links cover `www.`, HTTP(S), email, `mailto:`, and `xmpp:` forms, with domain,
  boundary, punctuation, parenthesis, and entity-suffix checks. URI candidates
  are recognized during inline scanning, before code/emphasis in their paths can
  become formatting. Ambiguous bracketed URLs get at most one ownership retry:
  successful labels retain normal Markdown, while failed labels do not hide URLs.
  A separate final pass handles email/protocol forms in eligible text, excluding
  code, HTML, destinations, markers, and resolved labels. Overlapping domain
  suffixes share host validation rather than rescanning invalid tails.

There are 69 original GFM fixtures and six generated GFM stress cases. Together
with the earlier fixtures, the suite has **318 cases**. Existing single/triple
strike snapshots now reflect the approved dialect. Chromium/Firefox full Markdown
checks pass, including native edits to strike, task markers, table delimiters, and
bare links. Those tests assert callbacks and untouched following nodes through
undo/redo. Inert-source checks now also reject generated inputs and tables.

Development-only diagnostics agree with all 27 selected published GFM examples
on source preservation, styled letters, and task counts. An expanded 1,782-sample
comparison has three differences: MarkdownIt treats four-tilde runs in nested
strike as delimiters, while the pinned GFM rules leave runs of three or more
literal. These checks are not a conformance claim or a new project dependency.

The focused review fixed all three bare-link findings: quadratic invalid-host
rescans, missed underscore boundaries inside failed labels, and Markdown parsing
inside failed-label URL paths. Regression fixtures cover successful inline,
reference, and image labels too. A native edit test turns a failed label into a
valid link and checks callbacks, grouped undo/redo, and untouched following nodes.

Verification: builds are updated; full Chromium/Firefox Markdown and package
checks pass. After the last three fixture additions, the targeted syntax suite
passes all 318 cases in both browsers. The final diff is reviewed. A development
host-scanner differential probe matches 132,645 candidate offsets across 12,000
samples; the prior 24,912 emphasis and 5,696 inline-link comparisons still agree.
No new WebKit run, tag, or release has happened.

## Follow-up validation (not M2 blockers)

- Broader CommonMark/GFM conformance, malformed-input, and container coverage.
- Controlled large-document performance, cache high-water memory, and formal budgets.
- Real input, accessibility, and Safari validation under M1, when app integration
  makes manual testing practical. Existing Linux WebKit isolation limits remain.
- Reassess parser dependencies or tokenizer structure only with approval.

The agreed M3 command/state scope now shares recognition boundaries and literal
context guards; see [command behavior](markdown-commands.md). Candidate checks
protect structural edits, and the browser supplies native history availability.
Neither milestone makes a full CommonMark/GFM, Safari, accessibility, or
production-readiness claim.

## Safari and Linux WebKit

Playwright offers WebKit on Linux. It is a useful engine-level check, **not
Safari**: browser integration, OS services, clipboard, fonts, and input can differ.
The user installed WebKit; the first run used Node 26.11.1, Playwright 1.64.0,
and Linux WebKit 26.6. No packages or browser assets were installed by the agent.

Run the optional checks with the same Node/global Playwright installation that
downloaded the browser:

```sh
npm run test:markdown -- --webkit
```

A mismatched Playwright version can report a missing executable even when another
WebKit build is cached. Do not rename browser-cache folders to hide the mismatch.
The default command still uses Chromium/Firefox.

**Result:** the syntax fixtures, inline API/editing/history checks, and normal
demo passed. Three groups failed the independent iframe-history requirement:
the script-free native fixture, the parent-toolbar surface, and the whole-editor
iframe. The optional command stays nonzero; these failures are not skipped.
Frame integration checks stop at their first failed history assertion, so this
is not a full WebKit audit of later integration cases.

After editing the child, then a parent textarea, Undo in the child reverted the
parent textarea and left the child edit in place. This also occurs with a plain
contenteditable iframe, no editor library, and a real Ctrl+Z. Explicitly focusing
the child window did not fix it; its document already reported focus during Undo.

Open `tests/fixtures/native-frame-history.html` directly for the script-free
reproduction. Both tested iframe arrangements isolate history in Chromium/Firefox,
**not in this Linux WebKit build**. No core workaround, custom history stack, or
browser sniffing was added. Real Safari on macOS/iOS still needs manual testing.

For a manual Safari pass, record the OS and Safari version, then:

1. Open `/markdown.html`. Type/select text, apply formatting, and try native
   Undo/Redo after typing, Enter, Backspace, and paragraph joins.
2. Paste Markdown containing empty/trailing lines, tabs, emoji, headings, and
   fences. Compare **Actual Markdown** with the input. HTML must stay text.
3. Change a fence's closing length and undo it. Later headings must change styling
   without losing source. Check caret/paint alignment while wrapping and scrolling.
4. Try real IME/composition, keyboard focus, touch selection, and the software
   keyboard where available. Synthetic events do not prove real input support.
5. Open `/markdown-iframe.html`. Edit the editor and application note. Record
   whether the frame's Undo leaves the note alone or undoes it instead; Linux
   WebKit fails this isolation check. Compare with the script-free fixture, and
   try parent read/set controls.

Keep failures as reproductions rather than marking Safari supported after a
single smoke pass. The inline core retains document-scoped native history.
