# Markdown source commands

Command selection, editing and state rules for headings, inline formatting,
code/link/image templates, lists/tasks/quotes, writing keys, tables, toolbar
separators and shortcuts. See
[the specification](specs/markdown-editor-spec.md) for deferred scope and
[syntax rules](markdown-syntax.md) for recognition.

## Bold, Italic, and Strike-through

These controls use recognized Markdown pairs, not marker-shaped text:

| Action | Existing syntax | New markers |
| --- | --- | --- |
| `bold` | Paired `**` or `__` | `**` |
| `italic` | Paired `*` or `_` | `*` |
| `strikethrough` | Matching one- or two-tilde runs | `~~` |

Escapes, Unicode delimiter boundaries, nested emphasis, and link-label boundaries
follow the same syntax rules as painting. The controls do not strip literal
punctuation just because a selection starts and ends with similar markers.

### Toggle and selection behavior

- A caret or partial selection inside a format removes its innermost enclosing
  pair. It does not split that pair into separately formatted pieces.
- Selecting the whole pair, including its markers, also removes it. Other
  emphasis markers stay intact: Italic on `***metal***` gives `**metal**`; Bold
  gives `*metal*`.
- With no enclosing pair, selected text gains the new markers. Leading and
  trailing delimiter whitespace stays outside. Whitespace-only selections do
  nothing. The selected content stays selected, without the new markers.
- New wrapping is single-line. An existing pair may cross soft lines within its
  paragraph; removing it preserves the line endings and container prefixes.
  Commands never pair across blocks or table cells.
- An unformatted caret inserts an empty pair and stays between the markers.
  Repeating the same action there removes that pair. This temporary affordance
  clears on input, replacement, composition, or teardown. It is not recognized
  formatting or a separate history stack; native undo/redo restores source.

Caret endpoints at the beginning/end of a pair's content count as inside.
Unwrapping maps the original selection into the surviving source. Each
text-changing command sends one `onChange` and uses one native insertion for
undo/redo. No-ops send no content notification.

### Protected source and marker collisions

A caret or partial selection inside code, HTML literals, autolinks, or link
URL/title/reference suffixes cannot toggle emphasis. Block prefixes and reference
definitions are also outside the inline command area. The controls are disabled
there and during composition; shortcuts respect the same guards.

A whole inline construct, such as `` `code` ``, may be selected and wrapped from
outside. Its contents stay untouched. Link and image label text can be formatted.
Reference labels still match definitions by their Markdown spelling; use an
explicit `[label][id]` reference when label formatting must not change the target.
The commands do not convert references or rewrite definitions for you.

Some selections cannot use the new markers under Markdown's delimiter rules.
For example, bold markers around just the emoji in `bravo🦊` would stay literal.
The command leaves source unchanged and shows a toolbar note rather than adding
ineffective markers or changing adjacent text. It also refuses colliding marker
runs when removing the proposed pair would not restore the exact original source.

Active states use the same enclosing pairs and eligibility rules as commands.
Custom action results/states keep their application-defined behavior.
Ctrl/Cmd+B and Ctrl/Cmd+I invoke the configured actions. Strike-through has no new
shortcut; all three controls support native button keyboard activation. The
default toolbar is unchanged.

## Inline Code

`code` toggles recognized code spans. A caret or partial selection inside a span
removes its backtick pair. Selecting the whole span also removes it. Active state
uses the same recognition, including multi-backtick delimiters and soft lines
within one paragraph. Commands never pair across blocks or table cells.

New wrapping is single-line. Backtick runs inside the selection determine a safe
delimiter length. Unlike emphasis, code keeps selected whitespace inside the
wrapper, including whitespace-only selections. It adds one padding space at each
end when the content starts/ends with a backtick, or when both edges have spaces
and the content is not all spaces. Removing a span removes one actual space at
each padded edge under Markdown's code-span rules. It keeps source newlines,
container prefixes, tabs, and all-space content.

An unformatted caret inserts two backticks and stays between them. Repeating the
action there removes this transient empty pair. Input, replacement, composition,
and teardown clear that affordance. Literal adjacent backticks loaded from source
are not an empty span. Ctrl/Cmd+backtick invokes the configured action.

HTML literals, URLs, link destinations/titles/reference suffixes, definitions,
block prefixes, and block code are protected. Code-span contents remain eligible
for removal. Whole inline constructs can be selected and wrapped from outside.
If neighboring backticks or an escape prevent a valid new span, the command
leaves source unchanged and shows a toolbar note.

## Code Block

`codeblock` wraps whole touched source lines in a fenced block. A caret wraps its
current line; a blank line creates an empty block. An end at the next line's
start excludes that line. The selection stays on the original content, without
the new fence lines. A trailing selected line break stops at the code body's end.

New fences use at least three backticks and exceed every backtick run in the
selected lines. Commands preserve body indentation and whitespace. List and quote
containers stay in place. List markers move to the opening fence line; body and
closing lines use continuation prefixes. Lazy selected lines gain missing
explicit prefixes so they stay in the container.

Inside a recognized fenced block, the action removes the whole block's opening
and closing fence lines, even when only part of the block is selected. This also
works on either fence line. Existing tilde fences and longer closing fences are
supported. Unclosed blocks lose only their opening line. Removing fences discards
the opening line's language/info text, not body text. A list marker on the opening
line moves back to the first body line. An empty block leaves a blank line or its
container prefix. A caret on a removed fence moves to the nearest body edge.

The control is active throughout a recognized fenced block. Literal HTML and
four-column-indented lines are protected when creating a block. Selections that
cross container boundaries, list items, or an existing fence boundary are disabled
and leave source unchanged. Commands confirm that new fences form the intended
block before inserting them. There is no new Code Block shortcut; its button
supports normal keyboard activation.

Both code commands are disabled during composition. Text changes use one native
insertion, send one `onChange`, and support native undo/redo. No-ops send no
content notification. Custom results/states keep their application-defined rules.

## Link templates

`link` inserts `[link](https://www.example.com)` at a caret. With a single-line
selection, that text becomes the label; brackets and backslashes are escaped.
The URL stays selected so typing replaces it immediately. The control and
Ctrl/Cmd+K do not open a prompt or fetch the address. Multiline selections are
disabled and do nothing. Composition blocks insertion. Each insertion sends one
change notification and uses one native undo step.

This is template insertion, not an existing-link editing workflow. Edit the URL
or other source directly. Typed URLs stay inert; safe rendering and publication
remain the application's responsibility.

Link protects fenced/indented code, literal HTML blocks, four-column-indented
source, and list/quote/task prefixes. A caret or partial selection inside an inline
literal is refused. Selecting a whole inline code span from outside still permits
a code-formatted label: `` `metal` `` becomes `` [`metal`](https://www.example.com) ``.
Whitespace and inline formatting in selected labels remain intact.

Existing links, images, autolinks, and resolved reference constructs cannot be
wrapped or split, even when selected whole. Their recognized full source ranges
include the label, markers, destination, and title. A caret immediately before or
after a construct stays outside it and may insert an adjacent template. Unresolved
marker-shaped text is ordinary source, not a guessed link. Reference definitions
and source without an eligible inline area stay protected.

An empty bare list item or heading gains a space when needed to keep its marker.
A caret at a checkbox's end also gets a body separator, preserving checked state.
Ordinary body text gains no extra space, including at the end of a list/task line
or inside a quote. For example, `- metal` becomes
`- metal[link](https://www.example.com)` when the caret follows `metal`.
Before editing, candidate recognition confirms the exact generated link and
preserves surrounding containers, literal blocks, and untouched task markers.
Unsafe candidates leave source unchanged with a toolbar note. For example,
inserting into a tab-padded empty item must not release an unselected child heading
or turn a later task marker into ordinary text.

The Link button and its command share these guards, including keyboard-only
bindings. Refused commands do not notify or add history. Custom result/state
callbacks retain their own behavior. Link remains an insertion command, not a
pressed-state toggle or existing-link editing UI.

## Image templates and existing URLs (M4)

`image` appears beside Link in the default toolbar. Explicit `actions` arrays
can include or omit it, and it can be bound to a keyboard-only shortcut. There is
no default image shortcut; the existing four default bindings stay unchanged.

```js
maiden.init({
  element,
  actions: ["bold", "italic", "link", "image"],
  shortcuts: { image: "Alt+Shift+m" }
});
```

Outside an existing image, Image inserts `![image](https://www.example.com/image.png)`
at a caret. With selected single-line text, it replaces the selection with
`![image](selected-url)`.
The text supplies the **destination**, not the alt label. The label stays `image`;
edit it directly in source. The inserted URL stays selected for immediate
replacement. There is no prompt, picker, preview, resource probe, or upload.

Selected URL text is trimmed at its edges. HTTP(S), protocol-relative URLs, and
relative paths are accepted without changing their spelling or adding a scheme.
For example, `www.example.com/a.png` remains a relative path, not an inferred HTTPS
address. Syntax validation uses an inert HTTP base, not the demo document's
`file:` origin; it never sends a request. Data/blob/file/mailto and other schemes,
malformed URLs, whitespace-only selected URLs, and interior ASCII controls are refused with a
toolbar note. This does not authenticate image bytes or rewrite URLs typed manually.

Spaces or parentheses use an angle-wrapped destination, for example
`![image](<photo (large).png>)`. Backslashes, angle brackets, and ampersands receive
Markdown escapes so decoding preserves the selected destination. The selected
replacement range excludes the angle wrapper but includes any necessary escapes.
Outer selected whitespace is replaced with the template, not kept outside it.

Inside a recognized inline image, Image selects its destination instead of
inserting a template. A selection wholly inside the image, including its entire
source, works too. For nested images, the smallest containing inline image wins.
The selected URL includes its source escapes/entities but not surrounding angle
brackets. Empty destinations leave a caret in the URL slot. Alt text, optional
titles, and surrounding source stay untouched, including container prefixes and
soft lines. Carets immediately before or after the image still insert a template.
Selections that cross an image boundary remain protected.

Selecting alone does not rewrite the editing DOM, notify `onChange`, or create an
undo step. Repeating selects the same URL without nesting templates. Typing edits
source directly through native editing and history; it does not automatically
escape or validate the replacement. Existing manually typed URLs are not filtered
by the insertion URL policy. Reference images remain protected: Image does not
select or change a shared definition. Edit those destinations directly in source.

The shared insertion guards protect container/task prefixes, literal blocks,
partial inline literals, reference definitions, and existing links/images. Whole
selected bare URL/autolink text is allowed as a destination; partial URLs and angle
autolinks stay protected. Required spaces preserve bare headings/items and task
markers. Candidate recognition confirms an image and preserves untouched owners,
literal blocks, and task markers before editing.

Each successful insertion sends one `onChange` and uses one native undo step.
Refused commands do not notify or add history. Composition, custom result/state
callbacks, keyboard ownership, teardown, and iframe behavior follow the existing
command rules. Image has no pressed-state toggle. Button state reflects insertion
or existing-URL selection eligibility; insertion URL validation happens on invocation.

Shared reference-image editing is deferred to a possible future enhancement, not
required for M4. Reference images remain protected. Image-file picking, image
paste/drop, uploads, base64 embedding, and advanced table conversion are also
future nice-to-haves, not M4 requirements. Revisit them only with separate agreement. This slice adds no image form or cancellation workflow;
use native Undo to reverse insertion. It does not change the Link command.

## Help, preview, and fullscreen (M5)

`fullscreen` (Fullscreen) appears before Help by default. It toggles a fixed
viewport layout, not the browser Fullscreen API, and works in source or preview.
Escape exits unless Help or the table picker handles it first. It preserves
source DOM/selection/history and restores editor/page scroll. Destroy removes
owned layout/scroll-lock classes. Only one instance per document expands at a
time. Iframes fill their own document; outer-frame expansion is app-owned.
No default shortcut. Explicit action arrays may omit it; configured shortcuts
can make it keyboard-only. Custom result/state behavior remains unchanged.


`guide` (Help) is the last default button. It opens a local quick-start dialog with
syntax, editing tips, default shortcut guidance, and an explicit external
CommonMark specification link. Escape/Close restores editor focus. It does not edit
source or notify. No default shortcut is added.

`side-by-side` (Side-by-side) shows editable source beside live rendered output,
stacking preview below source on narrow screens. It requires the same renderer as
Preview and appears beside it in renderer-enabled defaults. Click again for source
only; clicking Preview switches to rendered-only mode. Pressed states are mutually
exclusive. Formatting and native history remain available in split view. Vertical scroll
positions follow proportionally in both directions, not by exact source lines.
Horizontal scrolling stays independent. No default shortcut is added.
Fullscreen, filtering, errors and stale-result guards apply to both rendered views.
Live preview reuses nodes rather than removing children, preserving native typing
groups. View changes never notify or rewrite source.

`preview` (Preview) toggles rendered output when `preview: { render }` is configured.
Default actions add it before Help only with a renderer; explicit action arrays
opt in. A built-in Preview action without a renderer fails before host mutation.
The renderer receives raw source and returns HTML or a Promise of HTML. Core
filters output, blocks resource elements, and preserves safe highlighting classes.
Image placeholders and task symbols stay inert. The app must disable raw HTML in
its parser. Formatting/history buttons disable while preview is open; return to
source preserves native DOM, selection and scroll. View changes do not notify or
write native history. Failed rendering shows a message; stale async completion
cannot replace a newer preview or write after exit/destroy. No default shortcut.
Custom action results retain their existing application-owned behavior.

## Table insertion (M4)

`table` appears beside Image in the default toolbar. It opens a menu with Insert
Table…, Format Table, row/column add/delete, and the four column-alignment commands.
Commands follow their source-selection rules and disable when unavailable. Arrow
keys and Home/End move among enabled items. Enter/Space invokes; Escape closes and
returns focus to Table. Tab closes and continues native toolbar traversal.
Opening or cancelling the menu does not edit source or native history.

Explicit `actions` arrays can include or omit the menu. All its commands also work
as individual buttons or keyboard-only shortcuts. `table-insert` opens the size
picker directly; `table-format` pads the current table. No table shortcut is added
by default. For example:

```js
maiden.init({ element, actions: ["bold", "italic", "table"] });
```

At a collapsed caret on an empty source-body line, Insert Table… opens a size picker.
Choose a size from the 10 × 8 grid, or enter Columns and Rows and click Insert.
Both fields default to 3. Rows include the header; the Markdown delimiter line
does not count. One row creates a header-only table. The default 3 × 3 produces:

```markdown
| Column 1 | Column 2 | Column 3 |
| -------- | -------- | -------- |
|          |          |          |
|          |          |          |
```

New tables start formatted, with padded columns and matching delimiter widths.
This happens in the insertion itself, not a second edit. `Column 1` stays selected
for immediate native replacement. Columns must be
integers from 1 to 100, rows from 1 to 1,000, with at most 10,000 cells (rows ×
columns). Invalid dimensions show a picker note without editing. These limits
apply to creation only; imported tables and existing row/column commands retain
their behavior. No new size configuration or insertion API is added.

Arrow keys move through grid sizes; Enter/Space chooses one. Tab reaches the
numeric fields and Insert. Escape or an outside click cancels. Table exposes
expanded/menu state; a direct Insert Table… button exposes expanded/dialog state.
Neither is a pressed-state toggle. The picker saves the
insertion point before taking focus. A setter closes it; direct source mutations
invalidate it. Confirmation refuses a stale position rather than inserting at
the current caret or the end. Closing/cancelling adds no source history or change
notification. The picker reuses the shared HTML-editor CSS, not its JavaScript.
UI, source selection, and native history stay in the same editing document,
inline or inside a whole-editor iframe. A non-popover fallback uses the same UI.

Edit cells directly as Markdown source. There is no text conversion or editable
DOM table grid. The command does not accept arbitrary cell text or escape later
manual typing.

Only ASCII spaces/tabs count as empty; NBSP and BOM are source text. A selection,
nonempty line, heading, task-checkbox body, literal context, or endpoint inside a
container prefix is refused. Four-column indentation remains protected. An empty
list/quote body may receive a table; generated rows use the current continuation
prefix. The original prefix and all source outside the insertion remain intact.
Bare list markers gain their required space. Blank boundaries keep preceding
HTML blocks/tables and following source separate from the new table.

The candidate must contain the requested columns and rows, with a recognized
header/delimiter and any body rows in the same container. Untouched owners,
headings, tables, literal blocks, and task state must stay unchanged. If locally
eligible whitespace produces code or would change surrounding Markdown, the
picker shows a note and does not edit, notify, or add history. Button state uses
local empty-line eligibility; full candidate validation runs on confirmation.

Each insertion sends one `onChange` and uses one native undo step. Typing replaces
the selected header normally; Undo restores that header, then undoes the table.
Composition remains native. Custom result/state callbacks retain their overrides,
and keyboard-only invocation and whole-editor iframe use follow the existing rules.
Table has no built-in pressed-state toggle. Save/reload preserves plain Markdown,
not a hidden DOM table model. Text conversion needs separate agreement. Native
Undo reverses the confirmed insertion.

## Table source formatting

`table-format` (Format Table) appears in the default Table menu. A caret or selection
inside one recognized, non-ragged table targets that whole table, including its
header and delimiter. A selection may span cells or rows within the table. Literal
blocks, container-prefix positions, ragged tables, and selections crossing table
boundaries are refused.

Formatting uses one space inside each outer pipe, pads each column to its widest
cell, and adjusts the delimiter to that width with at least three dashes. Alignment
colons remain unchanged. Outer pipes become consistent; ASCII spaces/tabs around
cells are normalized. Cell content, internal tabs, escapes, inline Markdown, and
container prefixes stay intact. NBSP and BOM are content, not removable padding.

This is monospace source formatting. It counts source characters and four-column
tab stops, not rendered glyph widths. Wide or combining characters may not align
perfectly. It does not measure fonts, support proportional fonts, right-justify
cell text, or reformat while typing. Insertion generates formatted source directly;
other edits leave spacing alone until Format Table is requested.

The selected cell text stays selected after padding. Candidate recognition protects
cell content, alignment, table membership, containers, and neighboring Markdown.
Unsafe candidates show a note without editing. A change sends one `onChange` and
uses one native undo step. Identical output preserves source nodes, callbacks, and
history. Composition disables the command. Custom action results retain their
overrides. Inline and whole-editor iframe use share these rules.

```js
// Optional direct buttons instead of the Table menu.
maiden.init({ element, actions: ["table-insert", "table-format", "undo", "redo"] });
```

## Table body rows (M4)

`table-row-after` (Add Row After) and `table-row-delete` (Delete Row) appear in the
Table menu. They can also be individual buttons, keyboard-only actions, or custom
result/state overrides:

```js
maiden.init({
  element,
  actions: ["table", "table-row-after", "table-row-delete", "undo", "redo"],
  shortcuts: {
    "table-row-after": "Alt+Shift+r",
    "table-row-delete": "Alt+Shift+d"
  }
});
```

Place the caret or a single-line selection in a recognized table row. Endpoints
inside container prefixes and selections spanning a newline are refused. Inline
code, links, images, and escaped pipes within cells do not block these whole-row
operations. Literal blocks and source outside recognized tables stay protected.

Add Row After inserts an empty body row below the current body row. From the
header or delimiter, it inserts the first body row instead. It matches the
recognized header's column count, not a possibly ragged body row. It puts a caret
inside the first empty cell. Existing cells, alignment markers, pipes, escapes,
spacing, and container prefixes stay untouched; only the new row uses a generated
continuation prefix. Repeating adds another row below the new one.

Delete Row removes the current body row, never a header or delimiter. It puts the
caret in the first cell of the next body row, or the previous body row, or the
header if no body rows remain. Deleting the last body row leaves a valid GFM
header-only table. It does not remove the table or replace it with a blank row.
The original blank boundary and following paragraph stay intact.

Candidate recognition confirms the body-row change, the same table identity and
column count for untouched rows, and unchanged surrounding containers, tables,
headings, literal blocks, and task state. Unsafe candidates show a toolbar note
without editing, notifying, or adding history. Button eligibility follows the
recognized row; full candidate validation runs on invocation.

Each successful operation uses one native undo step and one `onChange`. Refused
and state-only operations do not notify or add history. Composition, callbacks,
native focus/history ownership, teardown, and whole-editor iframe use follow the
existing rules. Neither action has a built-in pressed state. These commands do
not resize columns, change alignment, normalize cells, or add table navigation.

## Table columns (M4)

`table-column-after` (Add Column After) and `table-column-delete` (Delete Column)
appear in the Table menu. They can also be individual buttons or keyboard-only
actions, with no default shortcuts. For example:

```js
maiden.init({
  element,
  actions: ["table", "table-column-after", "table-column-delete", "undo", "redo"],
  shortcuts: {
    "table-column-after": "Alt+Shift+c",
    "table-column-delete": "Alt+Shift+x"
  }
});
```

Place the caret or a selection wholly within one recognized header/body cell.
A caret immediately before a separator belongs to the cell on its left; after
it, to the cell on its right. Outer-pipe positions outside cells, container
prefixes, the delimiter row, and multi-cell/multirow selections are refused.
Inline code, links/images, and escaped pipes within a cell do not block the
operation. Header-only tables work. Ragged tables (any body row with a different
cell count from the header) are refused rather than filled or truncated. Row
commands retain their existing ragged-table behavior.

Add Column After inserts a column after the current cell's column in every row.
The new header is `Column`, the new delimiter is `---` without alignment, and body
cells are empty. The header text stays selected for native replacement, even
when invoked from a body cell. Repeating adds another column after that header.

Delete Column removes the current column from the header, delimiter, and all
body rows. It refuses deletion of the final column. The caret stays in the same
row, in the next cell or the previous cell when deleting the last column.

Both commands preserve every retained cell's raw bytes, including spaces, tabs,
escapes, inline source, and alignment markers. Existing container prefixes and
outer borders stay intact. They add an outer pipe only when needed to keep a
new empty edge cell, an exposed blank cell, or a one-column table recognizable.
They do not normalize cells or rewrite alignment. A candidate reparse verifies
exact cell preservation, column counts, table membership/row counts, and untouched
container, heading, literal, and task state. An unsafe candidate (for example, an
exposed heading or an escaped new separator) shows a toolbar note without editing,
notifying, or adding history. Buttons share local cell/ragged eligibility; full
candidate validation runs on invocation.

Each successful edit uses one native undo step and one `onChange`. Composition,
custom result/state callbacks, keyboard-only invocation, focus/history ownership,
teardown, and whole-editor iframe use follow the existing rules. Neither command
has a built-in pressed state. There is no grid, column resizing, multi-cell
navigation, alignment editing, or text conversion.

## Table-column alignment (M4)

Four Table menu actions set the current column's alignment:

| Action | Button | Delimiter example |
| --- | --- | --- |
| `table-align-left` | Align Column Left | `:---` |
| `table-align-center` | Center Column | `:---:` |
| `table-align-right` | Align Column Right | `---:` |
| `table-align-none` | Clear Column Alignment | `---` |

They can also be individual buttons or keyboard-only actions. No default shortcuts
are added. For example:

```js
maiden.init({
  element,
  actions: ["table", "table-align-left", "table-align-center", "table-align-right", "table-align-none", "undo", "redo"],
  shortcuts: { "table-align-center": "Alt+Shift+c" }
});
```

Eligibility matches column editing: place the caret or a selection wholly within
one header/body cell. Header-only and one-column tables work. Delimiter positions,
container prefixes, multi-cell/multirow selections, and ragged tables are refused.
The separator-boundary convention is unchanged. Inline code, image/link source,
escaped pipes, and empty cells may supply the selection.

Only the target delimiter cell's colons change. Its dash count and all whitespace,
including tabs, stay intact. All other cells, alignment markers, container
prefixes, borders, and surrounding source stay untouched. The caret or selected
source range stays in its original header/body cell, mapped through the edit.
These commands edit GFM source markers; they do not visually align source text or
create a DOM grid.

The menu's checked state and individual buttons' pressed state reflect the
recognized column alignment. Unaligned
(`---`) and explicitly left-aligned (`:---`) are distinct modes. Outside an eligible
cell, all four controls are disabled and unpressed. Applying the current mode
again does not rewrite source nodes, notify, or add history. Native selection
changes refresh the state without source edits. Composition disables the controls.
Custom result/state callbacks retain their overrides.

Candidate recognition protects table identity/columns/row membership, containers,
headings, literal blocks, and task state. An unsafe edit shows a toolbar note with
no mutation, callback, or history entry. For example, removing the colon from a
single-dash delimiter can expose a list marker; the command refuses rather than
adding dashes or rewriting prefixes. Every actual change uses one native undo
step and one `onChange`. Keyboard-only invocation, teardown, and whole-editor
iframe use retain the editing document's focus/history ownership.

## Native Undo/Redo availability

Undo and Redo follow `document.queryCommandEnabled` in the editing document.
Each native button is disabled when the browser reports its operation unavailable,
and both are disabled during composition. If availability cannot be queried, the
controls stay disabled rather than invent a history model. Invocation restores the
source selection and checks availability again before calling the native command.
Custom result callbacks are not disabled by these built-in availability checks.

Updates follow input, undo/redo, selection, and focus changes. Document-wide input
can change availability even when it happens outside this editor. History-only
updates do not repaint source, call custom state callbacks, change selection or
focus, notify content changes, or create undo steps. They change only the native
buttons' disabled state. Neither native button is a pressed-state toggle.

This is browser-owned, document-wide history, not per-editor history. An inline
editor's native Undo can affect another editable in the same document. The iframe
examples use the child document's flags even when the toolbar lives in the parent.
Setters do not create native undo entries or promise to clear document history.
Disabled buttons naturally leave Tab order; Escape then Shift+Tab reaches the last
enabled control, not necessarily Redo. No custom focus order or undo stack is added.

## Lists, tasks, and quotes

| Action | Behavior |
| --- | --- |
| `ulist` | Set unordered items; remove that level when all targets are unordered. |
| `olist` | Set ordered items; remove that level when all targets are ordered. |
| `quote` | Add a quote level, or remove the innermost recognized quote. |
| `checklist` | Add/remove task markers while keeping the underlying list. |
| `task-toggle` | Check selected tasks; uncheck them when all are checked. |

`checklist` and `task-toggle` are optional. Add them to `actions` explicitly;
the default toolbar is unchanged. They have no new shortcuts. All five controls
support native button keyboard activation.

### Command units and selection

A caret on a list continuation targets its owning item. A selection targets each
touched item once; an end at the next line's start excludes that line. When a
list or quote command targets a parent item, its descendants travel with it;
the command does not strip another nested level just because the selection also
touches a child. Task actions instead edit each touched item's own task marker,
including selected children.

Ordinary unlisted lines become separate items. New unordered items use `- `;
new ordered groups start at `1. ` and count through the affected adjacent items.
Existing matching items keep their marker spelling and numbers in mixed
selections. Switching list type changes only the marker and the continuation
indentation needed to keep descendants in place. Existing tasks keep their
checked state. Removing a list level also removes that item's recognized task
marker, rather than leaving a literal checkbox in body text.

Quote removal targets the whole innermost recognized quote block, including its
lazy lines. Adding Quote to an unquoted item wraps that whole item and subtree;
adding it to ordinary text affects the touched lines. In mixed selections,
already quoted targets stay unchanged while unquoted targets gain a quote.
List structure and relative indentation stay intact.

Commands preserve source text and useful caret/selection positions. New markers
stay outside the selection at its edges; prefixes inserted between selected
lines naturally fall within that selection. Structural prefix edits preserve
tabs where possible. If an edit crosses a tab's interior, only that tab expands
to spaces so its surviving Markdown columns stay intact. Tab stops are four
columns. Changing a marker before a tab does not blindly shift child indentation.

### Task markers and protected source

`checklist` adds `[ ] ` to existing items, or creates `- [ ] ` on ordinary text.
If all targets are tasks, it removes their checkboxes, not their list markers.
`task-toggle` ignores non-task targets. Mixed checked/unchecked tasks become
checked; an all-checked selection becomes unchecked. Already checked `[X]`
spelling stays intact when checking a mixed selection. The controls use the
recognizer's first-paragraph task rules, including source tabs in brackets.
Headings and literal task-looking text are not treated as existing tasks.

Click a recognized source checkbox (`[ ]`, `[x]`,
or `[X]`) to toggle that single task. This works without adding task actions to
the toolbar. It uses the same recognition and native edit path as the commands.
Only the character inside the brackets changes; Undo restores its original
spelling, including tabs or uppercase `X`. An existing editor caret or selection
returns after the click. Click beside the marker to move the caret instead.
Dragging and modified clicks keep their native behavior and do not toggle tasks.
Composition disables toggling. The source half of split view supports clicks;
the rendered preview remains read-only.

Direct targets inside fenced/indented code or literal HTML are skipped. All-skipped
selections disable the controls. Wrapping or moving a parent item/quote may change
its children's container prefixes, including prefixes around code, but leaves
literal body text intact. Existing literal marker-shaped text is never stripped
as if it were a recognized list or task.

New markers must produce the intended recognized structure. If they cannot—for
example, adding `- ` to `--` would create a thematic rule—the source stays
unchanged and the toolbar shows a note. Commands are disabled during composition.
Each text-changing action uses one native insertion and sends one `onChange`;
no-ops do not notify. Custom results/states keep their own eligibility rules.

## Enter and Shift+Enter

Enter continues a recognized list item, task, or quote at the caret. A single-line
selection is replaced first. Splitting an item creates a new sibling at that
list level; a soft/lazy continuation still uses its owning item's marker.
New nested lines retain outer quote prefixes and list continuation indentation.
Inside a quote nested in an item, Enter continues the quote within that item.

- Unordered items keep their bullet and separator spelling.
- Ordered items increment only the new number. Existing later numbers stay
  unchanged. Closing `.`/`)` style and leading-zero width stay intact. The
  nine-digit Markdown limit remains; at its maximum, Enter stays native.
- A new task always starts unchecked, even after `[x]` or `[X]`.
- Enter on an empty marker line removes just its innermost level, without adding
  another line or deleting neighboring source. Only spaces/tabs count as empty;
  NBSP and other literal characters stay intact. For example, `> - [ ] ` becomes
  `> `, then another Enter exits the quote. An empty nested list leaves the outer
  item's continuation indentation; it does not invent a parent sibling item.
- Shift+Enter inserts a plain newline without continuing any marker.

Literal code/HTML, inline code, URL/title syntax, prefix endpoints, multiline
selections, and composition input stay with native editing. Marker-shaped text
that recognition treats as a paragraph continuation does not gain special Enter
behavior. Cancelable `beforeinput` paragraph events also support continuation;
already prevented, noncancelable, and composing events stay untouched. These
checks do not claim real mobile keyboard or IME validation.

Automatic continuation/exit uses one native insertion and sends one content
notification. Native undo/redo owns history.

## Tab, Shift+Tab, and leaving the editor

Tab indents whole touched lines, even at a caret. Shift+Tab unindents. A selection
ending at the next line's start excludes that next line. The source selection and
caret stay on the surviving content where possible. Each edit uses one native
insertion and one `onChange`; no-ops do not notify. Composition and application-
prevented Tab events stay native. This slice adds no toolbar actions or options.

### Ordinary text and code bodies

Outside list items, Tab advances leading indentation to the next four-column
Markdown stop. Shift+Tab removes one stop, down to zero. Indentation is relative
to the body after quote/container prefixes; tabs use the recognizer's four-column
stops, not the painter's two-column visual tab width. Existing tabs stay intact
where possible. A tab crossed by a prefix edit splits into spaces that preserve
its surviving columns. Other whitespace and literal characters stay untouched.

Quote prefixes stay in place. Lazy quoted lines gain explicit prefixes when
needed. A bare `>` gains a separator so the new body indentation has the intended
number of columns. New whitespace uses spaces, not tabs.

Code bodies allow explicit whitespace indentation, including indented code.
Unindenting can turn indented code back into ordinary Markdown. Fence lines and
literal HTML blocks are skipped; a mixed selection can still indent eligible
code-body/text lines. Direct indentation inside a list's code body changes that
body's whitespace rather than moving its owning list item.

### Lists and tasks

Elsewhere inside a list, a caret or continuation targets the owning item. Its
continuation lines and descendants move with it. A selected parent carries its
children without applying another indentation step to them. Task markers,
checked state, bullet spelling, and ordered numbers stay unchanged.

Tab nests a continuous group of sibling items under its preceding sibling. The
new indentation uses that sibling's actual content width, not a fixed two/four
spaces. Shift+Tab lifts the group one list level. Top-level items stay unchanged;
use the list toggle to remove a bullet. Moves across an intervening quote level
are not automatic.

Unsafe moves leave all source unchanged and show a note in the keyboard hint.
Examples include no preceding sibling, mixed item/text targets, different parent
containers, or lifting items that would adopt unselected siblings or trailing
parent content. Nesting must also produce valid Markdown without changing
numbers, adding blank lines, or reordering text. Container ownership and literal
block boundaries are checked throughout the candidate document, not just at the
selected marker.

### Keyboard focus escape

Press **Escape, then Tab** to move focus forward normally. **Escape, then
Shift+Tab** moves backward. The browser owns focus order, including iframe
boundaries. The editor does not search for the next focusable element or simulate
Tab. Protected/no-op indentation does not move focus; use this escape sequence.

The escape applies to one Tab only. Other keys, pointer input in the editor, blur,
composition, document replacement, or insertion clear it. It never enters saved Markdown,
changes content callbacks, or adds an undo step.

A visible hint below the writing area reads:

> Tab indents · Shift+Tab unindents · Esc then Tab moves focus

The source references this per-instance hint through `aria-describedby`. Its
polite live text announces the armed escape and unsafe moves. The hint stays
available with an empty toolbar and is removed on teardown. Browser checks cover
native focus movement inline and within the whole-editor iframe. Cross-document
focus routing has a separate native diagnostic. These checks do not claim manual
screen-reader or Safari validation.

## Headings

Use these names in `actions`:

| Action | Behavior |
| --- | --- |
| `heading1`–`heading6` | Set the corresponding heading level. |
| `paragraph` | Remove heading syntax. Keep inline formatting and list/quote prefixes. |
| `heading`, `heading-smaller` | Cycle paragraph → H1 → H2 → … → H6 → paragraph. |
| `heading-bigger` | Cycle paragraph → H6 → H5 → … → H1 → paragraph. |

The default toolbar is unchanged. Add cycle controls explicitly. All controls
work with pointer activation or native button keyboard activation. This slice
assigns no heading keyboard shortcuts by default.

### Lines and selection

A caret affects its source line. A selection affects every touched line; an end
at the next line's start excludes that next line. Mixed selections transform each
line from its own level. Blank selected lines can become empty headings.

Commands keep the caret collapsed or retain the selected content where possible.
They do not expand the selection to include newly inserted heading markers.
Replacing/removing an existing marker maps endpoints into the surviving content.
A caret on a removed Setext underline moves to the end of the heading text.

Direct heading actions are setters, not toggles. Repeating a setter on an ATX
heading at that level changes nothing and sends no content notification. Paragraph
on ordinary text also changes nothing. Each text-changing command sends one
`onChange` and uses one native insertion for browser undo/redo.

### Heading spelling

ATX headings use one to six opening hashes, as in `### Title`. Changing their level
changes only the opening hashes. Existing separators and optional closing hashes
stay intact. A bare marker gains a separator when its level changes.

Paragraph removes the opening hashes and their separator. It also removes a
recognized closing-hash sequence and its leading separator, while keeping trailing
whitespace. Literal hashes, escapes, inline formatting, and content stay intact.

Setext headings use `=` or `-` underlines. Their whole paragraph and underline form
one command unit, even when the selection touches only one line or the caret is
on the underline. Heading actions convert each eligible content line to ATX and
remove the underline. Over-indented lines stay untouched, as described below.
Paragraph removes only the underline line:

```markdown
First line
Second line
-----------
```

Applying H3 gives:

```markdown
### First line
### Second line
```

Commands remove the underline's line separator too, without consuming neighboring
blank lines. At the document end they remove its preceding separator instead.
Painting alone never converts heading spelling.

### Containers and literal source

Headings inside lists and quotes keep their existing container prefixes. A lazy
continuation can omit these prefixes in source. To make a heading stay inside
that container, the command inserts the missing continuation prefixes on the
targeted line. Existing indentation and tabs stay intact.

Fenced code (including both fence lines) and literal HTML blocks are protected.
Heading commands also skip lines with four or more columns of indentation after
any list/quote prefix, even when they continue an ordinary paragraph rather than
form indented code. Tabs count toward four-column Markdown tab stops. Commands
never reduce indentation to force a heading; valid headings with up to three
spaces of indentation remain supported.

Heading and Paragraph commands skip protected lines in mixed selections. The
controls are disabled when the whole selection is protected, and during
composition. Skipping all lines changes no source and sends no content
notification. Custom action results retain their application-defined behavior.

Direct heading and Paragraph buttons show an active state when all affected,
unprotected lines share that level. Setext underlines count as their heading's
level. Mixed levels show no direct heading as active. Cycle buttons are commands,
not pressed-state toggles.

## Horizontal Line

The existing `line` action inserts `---` at the caret or replaces the selected
source. It adds paragraph boundaries so the rule cannot become a Setext underline.
It does not trim whitespace, renumber items, or normalize existing Markdown.
Repeating inserts another rule; this is not a pressed-state toggle.

Inside lists and quotes, new lines use explicit continuation prefixes for the
current container. New quote prefixes use `> `; list continuation spaces use the
item's recognized content width. Existing prefix spelling and tabs stay untouched.
At the beginning of an item, the command leaves its marker on an empty line and
puts the rule on a continuation line. This prevents `- ---` from becoming a
root-level rule instead of a list item. Lazy prefixes become explicit when needed.

The caret lands after the rule, before any surviving suffix, inside the same
container. A selection ending at the next line's start leaves that line's existing
prefix intact and puts the caret after it. Selection endpoints cannot split list,
quote, or task markers. Selections can span prose blocks in one container, but
cannot cross sibling items or different container levels.

The control is disabled for fenced code, literal HTML blocks, four-column-indented
source, reference-definition source, and partial inline literals. Inline code,
HTML, autolinks, destinations, and titles cannot be split. A whole inline literal
can be replaced when selected from outside. A mixed selection containing protected
block source is refused as a whole, not partly edited. Composition stays untouched;
custom `result` and `state` callbacks retain their own behavior.

Before insertion, the command checks that the candidate really contains a rule
in the original container. It also checks untouched lines for changes in container
ownership or literal blocks. If that fails, source stays unchanged and a toolbar
note explains why. For example, inserting at the end of a quoted paragraph must
not silently release an unselected lazy continuation into root text.

Each successful command uses one native insertion and one `onChange`. Refused
commands do not notify or add history. Native button keyboard activation works;
this slice adds no rule shortcut or default-toolbar change.

## Optional toolbar separators

Use the string `"|"` in a Markdown `actions` array to divide controls:

```js
actions: ["bold", "italic", "|", "heading1", "paragraph", "|", "line"]
```

An explicit array replaces the default toolbar, in the order given. Omit `actions`
to keep the defaults; use `[]` to hide the toolbar. Leading/trailing separators and
consecutive duplicates are ignored. An array containing only separators also hides
the toolbar. Defaults automatically separate formatting, structure, blocks, code,
insertion, history and views. Help follows views without an extra divider.
Empty or hidden groups omit their separators;
disabled controls stay in their group. Explicit action lists keep their exact
order and receive no automatic separators. No buttons or shortcuts are added.

Separators use `role="separator"` and vertical orientation. They are not buttons,
focus stops, editing actions, or pressed states. They use the shared theme border
color at reduced opacity. Toolbars scroll horizontally instead of wrapping. Pointer use and keyboard traversal still
reach normal/custom buttons; configured shortcuts still resolve those actions.
Only the string `"|"` is a separator. Object actions retain their usual validation
and callbacks. Destroy removes the owned toolbar and leaves application DOM intact.

Clean Block is intentionally omitted at the user's request. There is no `clean`
action or button.

## Configurable command shortcuts and hints

`init({ shortcuts })` configures this editor's command bindings. Omit it, or use
`null`/`{}`, to keep defaults for configured toolbar actions:

| Action | Default |
| --- | --- |
| `bold` | `Mod+b` |
| `italic` | `Mod+i` |
| `link` | `Mod+k` |
| `code` | `` Mod+` `` |

An object overrides only the named bindings. Set an action to `false` to disable
its binding, or set `shortcuts: false` to disable all command bindings. Buttons
still work. Explicit bindings can invoke any known built-in without adding its
button. Named custom actions must appear in `actions`; their result callbacks and
existing built-in overrides keep their normal behavior. If several buttons share
one name, the first action receives its binding and hint, as with prior shortcuts.

```js
shortcuts: {
  italic: false,
  codeblock: "Alt+Shift+c"
}
```

Chords have one printable logical key and at least one of `Mod`, `Ctrl`/`Control`,
`Cmd`/`Meta`/`Command`, or `Alt`. `Shift` is optional. Names are case-insensitive;
spaces around tokens are ignored. `Mod` accepts Ctrl or Cmd separately, not both
at once. Do not combine `Mod` with explicit Ctrl/Cmd. Bare keys, Shift-only chords,
and repeated modifiers are invalid. Use `Space`, `Plus`, or `Backtick` for those
keys; `Ctrl++` is ambiguous and invalid. Function/navigation keys are not supported.

Matching uses `KeyboardEvent.key`, not physical key codes, with exact modifiers.
Letters ignore case; Shift still needs an explicit token. For shifted punctuation,
use the character the keyboard produces, not the unshifted keycap. Choose bindings
that your target browser, keyboard layout, and OS actually deliver. The library
does not claim system-wide shortcut control or guarantee browser-reserved chords.

Each action has one chord; `Mod` supplies its two alternatives. Duplicate effective
chords are rejected, including overlap between `Mod+b` and `Ctrl+b`. Validation
checks the final merged map, so swapping two default bindings works. Unknown action
names, invalid maps/values, and conflicts throw `TypeError` before host changes or
listeners. Initialization snapshots the map; later application mutations do not
rebind a live editor.

Enter, Tab, Escape, and native Ctrl/Cmd+Z/Y (with or without Shift, without Alt)
cannot be rebound. Enter continuation, Tab indentation, Escape/Tab focus escape,
and native undo/redo stay unchanged, even with `shortcuts: false`. Unbound keys
pass through except native Ctrl/Cmd+B/I/U rich formatting, which stays suppressed
to keep Markdown source plain. The existing `beforeinput` format guard also stays.

Command dispatch requires focus inside the writing surface. It does not steal
focus from a toolbar, another editor, a parent-frame application field, or an
unfocused source receiving synthetic events. Composition state, `isComposing`,
legacy IME key code 229, AltGraph, and default-prevented key events stay untouched.
Built-ins retain their literal/selection guards. Successful text edits still use
one native insertion and one notification. No-op commands do not notify. Custom
callbacks retain their existing application-defined edit behavior.

Bound buttons show their chord in the native tooltip and `aria-keyshortcuts`.
Accessible names and custom text/icons stay unchanged. Disabled/rebound bindings
never advertise the old key; unbound buttons and separators gain no shortcut hint.
These are command hints, not a new toolbar, help panel, or keyboard trap. The
whole-editor iframe keeps command handling in its child document. Manual
screen-reader, real IME/AltGr, and Safari checks remain open.

## Verification

After building, run the focused Chromium/Firefox checks:

```sh
NODE_PATH=$(npm root -g) node tests/markdown-headings.js
NODE_PATH=$(npm root -g) node tests/markdown-formatting.js
NODE_PATH=$(npm root -g) node tests/markdown-code.js
NODE_PATH=$(npm root -g) node tests/markdown-writing.js
NODE_PATH=$(npm root -g) node tests/markdown-indentation.js
NODE_PATH=$(npm root -g) node tests/markdown-rules.js
NODE_PATH=$(npm root -g) node tests/markdown-shortcuts.js
NODE_PATH=$(npm root -g) node tests/markdown-state.js
NODE_PATH=$(npm root -g) node tests/markdown-images.js
NODE_PATH=$(npm root -g) node tests/markdown-tables.js
NODE_PATH=$(npm root -g) node tests/markdown-table-rows.js
NODE_PATH=$(npm root -g) node tests/markdown-table-columns.js
NODE_PATH=$(npm root -g) node tests/markdown-table-alignment.js
NODE_PATH=$(npm root -g) node tests/markdown-table-format.js
NODE_PATH=$(npm root -g) node tests/markdown-table-picker.js
```

Run the driver for the command you are changing, not every driver after each edit.
The full `npm run test:markdown` includes these checks. They cover separate native
blocks, LF text, and nested BR paste shapes; Setext/container conversion and nested
inline pairs; code-span padding and fence containers; prompt-free link templates;
list/task/quote units and Enter continuation/exit; indentation and native focus
escape across inline/iframe integrations; rule boundaries and accessible toolbar
separators; configurable and keyboard-only shortcuts with tooltips/ARIA hints;
recognized Link boundaries and native history availability; image URL templates,
existing-URL selection without source/history edits, escaping, guards, and
no-fetch behavior; table size picking, cancellation/stale guards, row/column/alignment edits, mapped
selection, pressed state and no-ops with container/literal guards, header-only/
ragged tables, and save/reload; protected source, selection, callbacks, state, composition, and native
undo/redo.
Package smoke checks exercise nested emphasis and code toggles, literal
protection, link templates, container-aware rules, separators, shortcut hints, and
custom/keyboard-only bindings (including image insertion and existing URLs), Link
guards, grid/manual table insertion/row/column/alignment edits/save/reload, pressed/no-op
states, and native history states
in IIFE,
minified, ESM, and bundled builds. Browser
history remains document-owned. These checks do not claim Safari or real IME
coverage.
