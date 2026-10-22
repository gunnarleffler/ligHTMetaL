<p align="center">
  <img src="ligHTMetaL.png" alt="ligHTMetaL logo" width="320">
</p>

# ligHTMetaL

Two editors. One parser. Your content. Vanilla JavaScript and CSS. Zero runtime dependencies.

- **ligHTMetaL** edits rich HTML, with images, tables, and source mode.
- **ligHTMetaL::MaiDEn** edits styled Markdown source, with preview and split views.
- **ligHTMetaL::MeltDown** turns Markdown into HTML in browsers and Node.js.

Use each library on its own, or combine MaiDEn and MeltDown for a complete Markdown workflow.
The examples below start with the HTML editor.

- Format text, headings, lists, quotes, and links.
- Insert images from URLs, files, clipboard, or drag and drop.
- Create tables and edit rows and columns.
- Edit HTML source, customize the toolbar, and choose light or dark themes.
- Keep the browser's native undo and redo.

**Your content belongs to you.** Data sovereignty is a permanent design
constraint. No accounts, telemetry, analytics, vendor cloud, or automatic
document uploads. We will not add tracking or send your documents to a vendor
cloud. The editor runs in your browser. Your application chooses where content
is saved and whether anything is uploaded.

Browsers still load image URLs you provide, and an upload hook you configure
can send files to your server. Self-host the assets and use local/base64 images
for offline use. Unfiltered HTML can also load resources or execute code; see
[HTML and safety](#html-and-safety).

- [Use without a build](#use-without-a-build)
- [Use with npm](#use-with-npm)
- [Content and API](#content-and-api)
- [Toolbar](#toolbar)
- [Images](#images)
- [Tables](#tables)
- [Themes and styling](#themes-and-styling)
- [HTML and safety](#html-and-safety)
- [Development and tests](#development-and-tests)

## Use without a build

Copy `dist/lightmetal.js` and `dist/lightmetal.css` from this repository beside
your HTML file. No package manager, framework, or server is required:

```html
<link rel="stylesheet" href="lightmetal.css">
<script src="lightmetal.js"></script>

<div id="editor" class="lightmetal"></div>

<script>
  const editor = lightmetal.init({
    element: document.getElementById("editor"),
    onChange: (html) => console.log(html)
  });

  editor.setHTML("<p>Hello, ligHTMetaL!</p>");
</script>
```

Use `lightmetal.min.js` and `lightmetal.min.css` for smaller downloads.
For native browser modules, copy `lightmetal.esm.js` too and replace the scripts
above with:

```html
<script type="module">
  import { init } from "./lightmetal.esm.js";
  const editor = init({ element: document.getElementById("editor") });
</script>
```

Keep the stylesheet and host div. Run module examples over HTTP(S); the
standalone example also works over `file://`.

## Use with npm

```bash
npm install lightmetal --ignore-scripts
```

The package ships ready-built JS and CSS with no runtime dependencies or
install hooks. With a bundler:

```js
import { init } from "lightmetal/dist/lightmetal.esm.js";
import "lightmetal/dist/lightmetal.css";

const editor = init({
  element: document.getElementById("editor"),
  onChange: (html) => console.log(html)
});
```

Add `<div id="editor" class="lightmetal"></div>` to your page. The editor needs
a browser DOM; do not initialize it in Node.js or during server-side rendering.

## Content and API

The examples below use the standalone `lightmetal` global. With ES modules,
import `init` and `exec` instead.

```js
editor.setHTML("<h2>A fresh start</h2><p>Write something here.</p>");
const html = editor.getHTML();
const text = editor.getText();
// Save or export these values using your application's own code.
```

`init(options)` returns:

| Member | Purpose |
| --- | --- |
| `element` | Host DOM element. |
| `content` | Contenteditable div. |
| `source` | HTML source textarea. |
| `getHTML()` | Current HTML in either visual or source mode. |
| `setHTML(html)` | Replace content in either mode; sanitize by default and fire `onChange`. |
| `getText()` | Plain text from the current HTML in either mode. |
| `insertImage(urlOrFile)` | Insert a URL, data URI, or File/Blob; resolve to a boolean. |
| `insertTable(rows = 3, columns = 3)` | Insert a table; return a boolean. |
| `destroy()` | Remove editor-owned UI and listeners; preserve the host and other host content. |

Call `editor.destroy()` when removing an editor. Image and table insertion
refuse Source mode and destroyed instances. Multiple editors keep their own
configuration and listeners.

### Options

| Option | Default | Purpose |
| --- | --- | --- |
| `element` | Required | Host element; add `class="lightmetal"` for the built-in styles. |
| `onChange(html)` | None | Receive content updates. Persistence is up to your application. |
| `actions` | All built-ins | Ordered toolbar action names or objects. |
| `defaultParagraphSeparator` | `"div"` | Use `"div"` or `"p"` for new paragraphs. |
| `styleWithCSS` | `false` | Ask native formatting commands to use CSS styles. |
| `classes` | Built-in names | Override generated class names; supply matching CSS. |
| `images` | See below | Image insertion settings. |
| `tables` | See below | Picker size and insertion limits. |
| `rawMode` | `false` | Bypass HTML import/paste filtering; insertion checks remain. |
| `unrestrictedMode` | `false` | Also bypass URL, file-type, and file-size checks. Trusted content only. |

## Toolbar

Choose actions and their order:

```js
const editor = lightmetal.init({
  element: document.getElementById("editor"),
  actions: ["bold", "italic", "heading2", "ulist", "link", "image", "table", "source"]
});
```

The built-ins are `bold`, `italic`, `underline`, `strikethrough`, `heading1`,
`heading2`, `paragraph`, `quote`, `olist`, `ulist`, `code`, `line`, `link`,
`table`, `image`, and `source`. Omit `actions` to show all; use `[]` for no
main toolbar buttons.

Mix names with objects to customize a built-in or add an action:

```js
actions: [
  "bold",
  { name: "heading2", title: "Section heading" },
  {
    icon: "H₃",
    title: "Heading 3",
    result: () => lightmetal.exec("formatBlock", "<h3>")
  },
  "source"
]
```

An optional `state()` function controls the selected appearance. Custom
`result()` callbacks replace built-in behavior; image/table actions with a
null or undefined result use their built-in workflow. Invalid actions throw
`TypeError` before listeners or editor UI are installed. Icons accept HTML:
only use trusted configuration.

`exec(command, value = null)` wraps native `document.execCommand`. Use it for
custom editing commands to keep native undo/redo.

Click **Source** to edit HTML and click again to return to visual mode. Changes
in both modes reach `onChange`. Source edits are not sanitized. Text remains
exact in the textarea, but browsers may normalize HTML when returning to visual
mode. Omit `"source"` from `actions` to leave out this button.

## Images

The **Image** button prompts for a URL. Files can also be pasted, dropped, or
inserted from code. Files stay in the document as base64 unless you supply an
upload hook:

```js
await editor.insertImage("/images/photo.png");
const file = document.querySelector("input[type=file]").files[0];
if (file) await editor.insertImage(file);
```

Insertion resolves to `true` on success or `false` on failure; rejected images
show a toolbar note. JPEG, PNG, GIF, and WebP are supported, with a default
2 MiB file limit. Missing MIME types fall back to the filename extension.
These checks do not authenticate file contents.

Pass these settings under `images`:

| Option | Default | Purpose |
| --- | --- | --- |
| `enabled` | `true` | Enable image APIs and file insertion. |
| `allowURL` | `true` | Show a URL prompt; `false` opens a file picker instead. |
| `allowBase64` | `true` | Allow base64 insertion and base64 sources in sanitized imports. |
| `dragDrop` | `true` | Handle dropped files. |
| `paste` | `true` | Handle clipboard image files. |
| `maxSize` | `2 * 1024 * 1024` | Maximum file size in bytes. |
| `onInsert` | `null` | Async file hook returning a URL or data URI. |

`allowURL` only changes the toolbar; programmatic URLs and upload results still
work. These switches do not filter raw/unrestricted HTML or Source edits.
Base64 images have uneven HTML email support; handle CID attachments in your
application.

### Upload to your own server

Uploads are opt-in application code, not an editor service. The same hook
handles picked, dropped, pasted, and programmatically inserted files:

```js
const editor = lightmetal.init({
  element: document.getElementById("editor"),
  images: {
    allowBase64: false,
    onInsert: async (file) => {
      const body = new FormData();
      body.append("image", file);
      const response = await fetch("/upload", { method: "POST", body });
      if (!response.ok) throw new Error("Upload failed");
      return (await response.json()).url;
    }
  }
});
```

Your application must provide `/upload` and return `{ "url": "..." }`. URL
checks also apply to hook results; returning base64 requires `allowBase64: true`.
Pending uploads do not insert in Source mode or after destruction.

## Tables

Click **Insert table**, choose a grid size, or enter **Columns** and **Rows**.
The display shows columns × rows; manual fields default to 3, clamped to your
limits. Arrow keys move through the grid; Enter/Space inserts. Escape or an
outside click closes the picker.

```js
editor.insertTable();     // 3 rows, 3 columns
editor.insertTable(3, 4);  // 3 rows, 4 columns
```

Insertion uses the current selection, or the end if the selection is outside
the editor. The picker saves the position before it opens. Focus moves into the
first cell; a blank paragraph follows the table. Nested insertion is refused.

Pass these positive-integer settings under `tables`:

```js
tables: {
  gridColumns: 10,
  gridRows: 8,
  maxColumns: 100,
  maxRows: 1000,
  maxCells: 10000
}
```

These are the defaults. Grid/manual defaults clamp to your limits. Insertion
limits do not restrict imported tables. Contextual growth has separate fixed
caps: 1,000 rows, 100 columns, and 10,000 logical cells (rows × columns).

Click a cell to insert or delete rows/columns, or delete the table. Row edits
stay within the current section; column edits span sections. Tab/Enter work
on the controls. Added cells are blank and preserve header type/scope without
duplicating IDs. References to deleted headers are removed. Removing the last
row or column removes the table. Insertion and edits use native undo/redo.

Sanitized imports preserve captions, sections, column groups, spans, `scope`,
`headers`, and cell IDs. Single-cell, full-width section headings support row
edits; column edits from ordinary cells adjust heading spans. Other merged
cells, rowspans, uneven rows, and nested tables disable structural edits.
Column groups disable only column edits. Whole-table deletion remains available.
Use Source for unsupported structures; cell merging and resizing are not built in.

Table presentation comes from editor CSS, not styles added to new table HTML.
Supply table styles wherever your application publishes the exported content.

## Themes and styling

The editor follows the system theme. Pin it with `lightmetal-dark` or
`lightmetal-light` on the host; remove both to follow the system again:

```html
<div id="editor" class="lightmetal lightmetal-dark"></div>
```

Styles are scoped under `.lightmetal`. Override CSS variables and editor size:

```css
#editor { --lightmetal-accent: #c05020; }
#editor .lightmetal-content,
#editor .lightmetal-sources { height: 240px; }
```

Toolbar icons use `currentColor` to follow the theme.

### Toolbar grouping

Both editors organize their default controls into groups with quiet vertical
separators. The HTML editor keeps Underline and Source in their existing order;
MaiDEn groups its formatting, structure, blocks, code, insertion, history, and
view controls. Help follows the views without an extra divider. Missing or hidden groups leave no stray separators. Disabled
controls remain visible in their group. Narrow toolbars scroll horizontally rather
than wrapping buttons onto extra rows.

Explicit `actions` arrays stay application-owned: their order and contents are
unchanged, with no automatic separators. MaiDEn still supports manual `"|"` entries.
Grouping works across all skins; it adds no actions or shortcuts.

### Optional skins

Preview all seven skins alongside the default by opening `examples/skins.html`
from the checkout; it also works over `file://`. With the demo server running,
visit `http://localhost:5000/skins.html`.

| Skin | Host class | Appearance |
| --- | --- | --- |
| Bootstrap | `lightmetal-bootstrap` | Familiar form controls and blue accents. |
| Material Classic | `lightmetal-material-classic` | Filled toolbar, round buttons, and an accented baseline. |
| Material Outline | `lightmetal-material-outline` | Outlined frame and active controls. |
| Frost | `lightmetal-frost` | Spacious layout, cool colors, and lighter icon strokes. |
| Patina | `lightmetal-patina` | Crisp toolbar chrome with blue accents. |
| Sterling | `lightmetal-sterling` | Compact, neutral toolbar chrome. |
| Substantial | `lightmetal-substantial` | Premium developer-tool chrome. Generous proportions, commanding presence, and frankly, a pretty substantial amount of visual equity. |

Load the default CSS first, then the skin. Add one skin class to the host:

```html
<link rel="stylesheet" href="dist/lightmetal.css">
<link rel="stylesheet" href="dist/skins/frost.min.css">
<div id="editor" class="lightmetal lightmetal-frost"></div>
```

Initialize the editor as usual. Both plain and minified skin files are built
from `src/skins/` into `dist/skins/`. Each skin supports the same system,
`lightmetal-light`, and `lightmetal-dark` modes as the default. Different skins
can coexist on one page. Skins add no JavaScript, frameworks, fonts, or external
requests; they use the editor's existing icons.

Substantial keeps the default's rounded, flat style with a 47px toolbar, 32px
button hit areas, 20px icons and slightly stronger borders. Its MaiDEn footer is
about 29px high. It works with HTML Source and MaiDEn source, preview, split and
fullscreen modes. Load `dist/skins/substantial.css` (or `.min.css`) and add
`lightmetal-substantial`; no extra configuration is needed.

All skins are original ligHTMetaL CSS. Bootstrap and Material describe the
design inspiration, not dependencies or affiliations. The default appearance stays unchanged if you load no skin.

## HTML and safety

**Use a maintained HTML sanitizer before rendering or publishing untrusted
content, including on the server.** The editor filters imported HTML; live typing
and Source edits remain under your application's control.

| Mode | HTML paste and `setHTML()` | HTML drops | Link/image insertion and files |
| --- | --- | --- | --- |
| Normal (default) | DOMParser allowlist filter | Rejected | URL, type, and size checks |
| `rawMode: true` | Unfiltered | Native browser behavior | Checks remain |
| `unrestrictedMode: true` | Unfiltered | Native browser behavior | URL, type, and size checks bypassed |

Normal imports remove scripts/styles with their contents, strip handlers,
styles, and classes, and unwrap unknown elements while cleaning their children.
HTML drops are rejected regardless of image settings; use paste for filtered
rich-text import. Plain-text paste uses native editing.

In normal/raw mode, link insertion allows HTTP(S), relative URLs resolving to
HTTP(S), and `mailto:`. Image insertion allows HTTP(S), relative HTTP(S), and
syntactically valid base64 JPEG/PNG/GIF/WebP data URIs when enabled. Normal
imports use the same URL policy. SVG data URIs and other schemes are rejected.
Relative URLs under `file://` do not resolve to HTTP(S).

Remote images can reveal your IP and make tracking requests; the editor does
not enforce an origin allowlist. Local/base64 images need no remote image host.

Use raw mode only when your application handles the imported HTML's safety.
**Unrestricted mode and unfiltered HTML can execute code in your application.**
Unrestricted mode includes raw mode's bypass; there is no need to enable both.
Explicit image switches, attribute escaping, table limits, and insertion guards
still apply to their own workflows. Browsers may normalize or refuse markup;
unrestricted does not mean every script will execute. Keep untrusted input out
of these bypass paths, including Source mode.

## MaiDEn — Markdown editor

The bottom status bar shows `lines: 1   words: 0   1:1`. Counts use raw Markdown
source, not rendered text. Words are separated by whitespace; an empty document
has one line. The final pair is the active cursor's 1-based line and column.
Columns count UTF-16 source units, with each tab counting as one. When you select
text, the position follows the moving end of the selection.

**ligHTMetaL::MaiDEn — the lightMarkDown Editor** keeps Markdown source visible
while you write. It ships alongside the HTML editor in 0.5.0. Try
`examples/markdown.html` or `http://localhost:5000/markdown.html` with the demo
server running.

It keeps Markdown markers visible while styling `#` and underline-style headings,
emphasis, code, and links. The writing area uses a local monospace font. It shares
the HTML editor's CSS and skins, but loads no HTML-editor JavaScript or parser
dependency.

```html
<link rel="stylesheet" href="dist/lightmetal.css">
<!-- Optional: load a skin here, before maiden.css. -->
<link rel="stylesheet" href="dist/maiden.css">
<div id="markdown" class="lightmetal"></div>
<script src="dist/maiden.js"></script>
<script>
  const editor = maiden.init({
    element: document.getElementById("markdown"),
    actions: ["bold", "italic", "heading2", "ulist", "link", "image"],
    shortcuts: { codeblock: "Alt+Shift+c" }, // No Code Block button needed.
    onChange: (markdown) => console.log(markdown)
  });
  editor.setMarkdown("## Hello\n\nKeep the **Markdown**.");
  const markdown = editor.getMarkdown();
  // editor.destroy();
</script>
```

For bundlers, import the named `init` export from
`lightmetal/dist/maiden.esm.js`, plus `lightmetal/dist/lightmetal.css`
and `lightmetal/dist/maiden.css`.
Plain and minified standalone/CSS builds are available. Filename casing matters.
The main package entry point remains the HTML editor. MaiDEn is the display name;
`maiden` is used in filenames and the browser global.

### Help and optional rendered preview

The default Help button (`guide`) opens a local quick-start dialog. Escape or Close
returns focus to the editor. Its CommonMark specification link is an explicit
external action; opening Help needs no network access.

Supply a rendering chain to enable Preview. The editor bundle contains no parser
or highlighter. The optional **ligHTMetaL::MeltDown** parser ships separately, and
the MaiDEn demo uses it by default:

```html
<script src="dist/MeltDown.js"></script>
<script src="dist/maiden.js"></script>
<script>
  const editor = maiden.init({
    element: document.getElementById("markdown"),
    preview: { render: meltDown.parse }
  });
</script>
```

For modules, import `parse` from `lightmetal/dist/MeltDown.esm.js`. Standalone,
minified (`MeltDown.min.js`), and ESM builds share the same parser. It focuses on everyday Markdown: headings, lists, tasks, tables, links, images,
and code. Less-used extensions stay out to keep the parser small. See the
[ligHTMetaL::MeltDown guide](docs/MeltDown.md) for syntax, options, and safety.

Applications can still supply another renderer through the same hook. Our demo
and parser integration tests use ligHTMetaL::MeltDown.

With a renderer configured, the default toolbar adds Preview and Side-by-side
before Fullscreen and Help. Explicit
`actions` lists must include `"preview"` to show it. A built-in Preview action
without `preview.render` is a configuration error. No default shortcut is added.
The renderer receives source and returns an HTML string or a Promise of one.
Toggle Preview again to restore source, selection, and scroll. Formatting controls
are disabled in preview. Rendering failures leave source intact; stale async
results after replacement, exit, or destroy are ignored. View changes do not call
`onChange` or add source undo entries.

Keep raw HTML escaping enabled in your renderer (MeltDown's default). The editor also rebuilds output through
a restricted formatting allowlist. It removes scripts, embeds, handlers, styles,
and unsafe links. Images become text placeholders; task checkboxes become text
symbols. Code-highlighting classes named `hljs`, `hljs-*`, and `language-*` survive.
Load trusted highlighting CSS yourself. For publishing, render the source through
your parser and sanitize untrusted output with a maintained HTML sanitizer.

No third-party parser or syntax-highlighter dependency is required. highlight.js
is used only as a development dependency to test MeltDown's optional highlighting
hook; applications supply their own highlighter if desired.

### Side-by-side

Side-by-side (`side-by-side`) shows editable source and live rendered output.
It uses the same `preview.render` hook as Preview, with the same filtering and
async-result guards. Click it again to return to source only. Preview switches to
rendered-only view; Side-by-side switches back to both panes. The pressed buttons
show the current view. Source editing and native undo/redo remain available in
split view; view changes do not call `onChange` or rewrite source.

On narrow screens the preview sits below source. Vertical scrolling follows in
both directions by percentage: halfway down source means halfway down preview.
This is proportional, not exact line mapping. Horizontal scrolling stays local.
Split view also works in Fullscreen.
Explicit action lists can include `"side-by-side"`; a renderer is required. No
default shortcut is added. Preview nodes are reused to preserve native typing
history; spare nodes are hidden, so retained DOM follows the rendered structure's
high-water mark.

### Fullscreen

The default Fullscreen button (`fullscreen`) expands MaiDEn to its document's
viewport without hiding browser controls. It works in source and preview modes.
Click again or press Escape to return. Help and the table picker receive Escape
first. Text, native history, source selection, editor scroll, and page scroll
remain intact. Exiting or destroying the editor removes its fullscreen layout and
page-scroll lock. Only one MaiDEn instance per document expands at a time.

Explicit `actions` arrays can omit Fullscreen. No default shortcut is added;
`shortcuts: { fullscreen: "Alt+f" }` enables keyboard-only access if desired.
Iframe editors fill their own viewport; expanding the outer iframe belongs to the
application. Keep the editor outside transformed or containment-styled ancestors
if it must fill the page: those CSS properties can constrain fixed positioning.

| Member | Purpose |
| --- | --- |
| `element`, `content` | Host and native editable element. |
| `getMarkdown()` | Read Markdown, including its markers and trailing newlines. |
| `setMarkdown(value)` | Replace the document, normalize CRLF/CR to LF, and call `onChange`. Not a native undo step. |
| `insertText(value)` | Replace the current/saved selection through native editing. Useful for custom actions. |
| `destroy()` | Remove owned UI/listeners. Preserve application-owned host content. Safe to call twice. |

Options are `element`, `actions`, `shortcuts`, `onChange`, `classes`, and optional
`preview: { render }`.
`init()` starts empty and does not call `onChange`. `setMarkdown()` always notifies; edits notify when
the text changes. Getters remain readable after teardown; setters/insertion return
`false` after teardown or during composition. Use one instance per host.

Built-ins are `bold`, `italic`, `strikethrough`, `heading1` through `heading6`,
`heading`, `heading-smaller`, `heading-bigger`, `paragraph`, `quote`, `ulist`,
`olist`, `checklist`, `task-toggle`, `code` (inline), `codeblock`, `line`, `link`,
`image`, `undo`, and `redo`. Omit `actions` for the default toolbar; use `[]` to hide it.
Named objects can override `icon`, `title`, `result(editor)`, and `state(editor)`.
A null/undefined result uses the named built-in. Custom icons accept **trusted
application HTML only**. Custom actions can call `editor.insertText(...)`.
`classes` overrides `actionbar`, `button`, `content`, `selected`, and `error`;
supply your own CSS for replaced names. Structural Markdown classes stay in place.

Use `"|"` for optional, non-focusable toolbar separators:

```js
actions: ["bold", "italic", "|", "heading1", "paragraph", "|", "line"]
```

An explicit array replaces the default toolbar; it does not append to it. Leading,
trailing, and repeated separators are ignored. Separators do not edit source or
add buttons to the defaults.

By default, Ctrl/Cmd+B/I/K and Ctrl/Cmd+backtick invoke the configured bold,
italic, link, and inline-code actions. Rebind or disable commands per editor:

```js
shortcuts: {
  italic: false,                // Disable its default binding, not its button.
  codeblock: "Alt+Shift+c"      // Bind a built-in even without a toolbar button.
}
```

Unspecified actions keep their current defaults; `shortcuts: false` disables all
command bindings. `Mod` means either Ctrl or Cmd. Chords use one printable key
with `Mod`, `Ctrl`/`Control`, `Cmd`/`Meta`/`Command`, `Alt`, and/or `Shift`.
Named `Space`, `Plus`, and `Backtick` keys are supported. Matching uses the logical
key, not a physical key position, and requires the exact modifiers. Enter, Tab,
Escape, and native undo/redo remain outside command rebinding.

Bindings work only in the focused writing surface. Composition, AltGr, and
application-prevented events stay untouched. Button tooltips show actual bindings;
`aria-keyshortcuts` exposes them without changing accessible button names. Invalid
or duplicate bindings fail before mounting. Native underline/rich formatting stays
suppressed even when command shortcuts are disabled. Bold, Italic,
and Strike-through remove recognized enclosing pairs, including underscore
emphasis and single-tilde strike. They preserve other emphasis markers and protect
literal code/HTML and URL contents. New wrapping is single-line; existing pairs
can be removed across soft lines within one paragraph. An unformatted caret
inserts an empty pair; repeating the action there removes it. Marker collisions
leave source unchanged and show a toolbar note. Inline Code toggles recognized
backtick spans; new wraps are single-line, while existing spans can be removed
across soft lines. Code Block wraps whole touched lines and removes an enclosing
fenced block on repeat. Both code controls preserve list/quote containers and
protect other literal contexts. Link inserts `[link](https://www.example.com)`
without a prompt, using selected text as the label and selecting the URL for
replacement. It does not fetch the address. The default Image button (`image`) inserts
`![image](https://www.example.com/image.png)`. Highlighted text supplies the image
**URL**, not the alt text; the URL stays selected after insertion. For example,
selecting `photo.png` produces `![image](photo.png)`. Explicit `actions` lists can
omit it, and an optional shortcut can invoke it. Image URLs must use HTTP(S) or a
relative path. Inside a recognized inline image, Image selects its URL without
changing source, notifying, or adding an undo step. Typing then replaces the URL
in source; alt text and titles stay untouched. Reference images remain protected.
Neither helper opens a prompt or fetches a resource. Edit alt text directly in
source; file handling is a separate future slice.
Link refuses multiline or protected
selections and does not nest or edit existing links/images/autolinks. A whole
selected inline code span can still become a code-formatted label. Direct heading
actions set a level; Paragraph removes heading syntax. `heading` and
`heading-smaller` cycle paragraph → H1 → … → H6 → paragraph; `heading-bigger`
cycles in reverse. Heading commands convert whole Setext headings to per-line ATX
headings, preserve list/quote containers, and skip literal code/HTML blocks.
They also skip lines indented four or more columns after container prefixes;
commands never reduce indentation to force a heading.

The default Table button (`table`) opens a size picker at a collapsed caret on an
empty source-body line. Choose from a 10 × 8 grid, or enter Columns and Rows and
click Insert. Fields default to 3 × 3. Rows include the header, not the Markdown
delimiter; one row creates a header-only table. Limits are 100 columns, 1,000 rows,
and 10,000 cells. Arrow keys move through the grid; Escape or an outside click
cancels. The picker saves the insertion position and refuses stale positions.
Insertion selects `Column 1` and uses one native undo step and one change
notification. Opening, cancelling, and invalid dimensions do not edit source.
It preserves list/quote containers and refuses selections, literal contexts,
and unsafe placements. Explicit `actions` lists can omit it. There is no default
table shortcut. Optional `table-row-after` and `table-row-delete` add empty body rows
or delete the current body row without rewriting other cells. Header and delimiter
rows stay protected from deletion; deleting the last body row leaves a valid
header-only table. Optional `table-column-after` and `table-column-delete` add or
remove a column across the table from a single cell. Add selects a new `Column`
header; Delete protects the final column. Column edits refuse ragged tables and
preserve retained cell source and alignment. These actions add no default buttons
or shortcuts. Optional `table-align-left`, `table-align-center`, `table-align-right`,
and `table-align-none` change only the current column's delimiter colons. They
preserve the selected source range, dash count, and whitespace. Pressed state
shows the current alignment; applying it again is a no-op. These edit Markdown
markers, not a visual table editor. Text conversion remains future work.

Undo/Redo buttons follow native browser availability in the editing document.
State-only updates do not notify or change focus. History remains document-wide,
not per inline editor; the iframe examples keep their child-owned availability.
Unavailable buttons leave Tab order, so Escape then Shift+Tab reaches the last
enabled toolbar control.

List controls use recognized items, including their continuation lines, and keep
nested content and quote containers in place. Quote adds/removes one recognized
level. Optional `checklist` adds/removes task markers; `task-toggle` checks/unchecks
existing tasks. Enter continues lists, tasks, and quotes; new tasks start unchecked,
and empty marker lines exit their innermost level. Shift+Enter inserts a plain
newline. Literal contexts and composition stay native for these commands.

Horizontal Line inserts `---` at the caret or replaces selected source, with safe
paragraph boundaries inside the current list/quote container. It leaves the caret
after the rule, protects literal source, and refuses ambiguous container changes.
Each insertion is one native undo step and one change notification.

Tab/Shift+Tab indents/unindents whole lines or list subtrees. Ordinary indentation
uses four-column Markdown stops; code bodies allow whitespace edits, while fence
lines and literal HTML stay protected. List nesting uses the preceding sibling's
content width and refuses moves that would reparent unrelated content. Press
**Escape, then Tab or Shift+Tab** for normal browser focus traversal. A visible,
screen-reader-associated hint explains the escape. Composition stays native.
See `docs/markdown-commands.md` in this checkout for selection and state rules. The
default toolbar includes Link, Image, and Table. There are no HTML-only modes, image
uploads, a visual table grid, or separate Source mode.

**MaiDEn styles your source; the optional renderer supplies HTML preview.**
The highlighter recognizes underline-style (Setext) headings and multiline code
spans, including inside nested lists and quotes. Nested `*`/`_` emphasis follows
CommonMark delimiter rules, with ASCII punctuation escapes. Indentation and
markers stay visible. Inline links and images support balanced brackets and
parentheses, escaped punctuation, titles, and emphasis/code in labels. Reference
links, HTML-block context, and selected GFM strike/tasks/tables/autolinks are also
recognized. The feature set focuses on everyday Markdown rather than every
CommonMark/GFM extension. Pasted HTML becomes plain
text; HTML/file drops are blocked. Literal links/images never navigate or load
assets. The Link helper inserts a fixed HTTPS placeholder; typed Markdown stays
untouched. Sanitize rendered HTML from untrusted documents before publishing it.

Heading sizing can fall back to body size for Firefox's BR-separated pasted
lines. Real IME/mobile input, accessibility, and large-document behavior still need
hands-on review. Keep the writing font monospaced; proportional fonts can misalign
the paint layer and caret. Undo/redo remains browser-owned, not isolated per
instance: with several editing hosts, it can undo the last edit in another host.
A paint-node cache preserves native typing history, but unrelated DOM rebuilding
in `onChange` can still split Chromium's undo groups. Avoid replacing
DOM or assigning textarea values on every keystroke; update existing Text nodes or
defer those UI updates. This limitation also applies to other native editing hosts.

For separate history in tested Chromium/Firefox, load the editor's JS/CSS and
call `init()` **inside a same-origin iframe**. The core does not create or manage frames. See
`examples/markdown-iframe.html` in this checkout for a whole-editor example with
parent read/set calls and text-only change events. Initialization stays synchronous
inside the frame; parent code waits for the frame to load before using its API.
Linux WebKit can share undo across frames, so this is not a cross-browser history
guarantee. The frame is not a security sandbox.

## Browser support

Tested in Chromium and Firefox. Linux Playwright WebKit passes the Markdown inline
checks, but fails the iframe-history isolation checks. This is not Safari coverage;
Safari still needs manual testing. The editor deliberately
uses deprecated `document.execCommand` to preserve native editing and undo/redo.
Browser-generated HTML can differ.

## Development and tests

The browser library has no dependencies. Building uses Node.js/npm, Bash, and
esbuild; the optional demo server uses Python 3.14+, uv, and Flask:

```bash
npm ci
uv sync --frozen
npm run build
uv run python examples/server.py
```

Open `http://localhost:5000/`, or open `examples/index.html` directly with the
tracked bundles. The landing page showcases the HTML editor, MaiDEn, and MeltDown.
Each has a detail page with live demos and quickstarts: `examples/html.html`,
`examples/markdown.html`, and `examples/meltdown.html`. Compare editor skins in
`examples/skins.html` and `examples/markdown-skins.html`.
The HTML detail page also has custom-hook and raw-mode examples. Its custom hook
returns a local data URI; it uploads nothing. Python/Flask are not needed to use
any library in your application.

Tests use a global Playwright installation and its Chromium/Firefox browsers:

```bash
npm install --global playwright
playwright install chromium firefox
npm test
npm run test:package
```

`npm test` rebuilds bundles, runs browser/security checks in both browsers, and
checks the standalone demo over `file://` in Chromium. After building,
`npm run test:security` runs just security regressions. `npm run test:package`
packs and installs the package with scripts disabled, then checks standalone,
minified, ESM, and bundled use. It publishes nothing. Keep rebuilt `dist/` files
with source changes.

After building, `npm run test:markdown` runs all 318 Markdown syntax cases plus
editing and integration checks in Chromium and Firefox. A representative subset
repeats across the extra DOM shapes and mobile width. Use
`npm run test:markdown -- --exhaustive` to repeat every syntax case across both
widths and all three DOM shapes. Both modes report elapsed times. No fixture
cases are removed from the default run.

## License

MIT. See [LICENSE](LICENSE). Inspired by [Pell](https://github.com/jaredreich/pell).
