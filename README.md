<p align="center">
  <img src="https://cdn.jsdelivr.net/npm/lightmetal@latest/ligHTMetaL.png" alt="ligHTMetaL logo" width="320">
</p>

# ligHTMetaL

Two text editors. A sketch editor. A parser. A syntax highlighter. Your content.
Vanilla JavaScript and CSS. Zero runtime dependencies.

- **[ligHTMetaL](#quickstart-cdn)** edits rich HTML, with images, tables, and source mode.
- **[ligHTMetaL::MaiDEn](#markdown-editing-with-maiden)** edits styled Markdown source, with preview and split views.
- **[ligHTMetaL::MeltDown](#markdown-parsing-with-meltdown)** turns Markdown into HTML in browsers and Node.js.
- **[ligHTMetaL::poliSH](#syntax-highlighting-with-polish)** highlights code in 49 languages, with eleven color themes.
- **[ligHTMetaL::Etch](#sketching-with-etch)** draws layered sketches, with image import and PNG/SVG export.

Use each library on its own, or combine MaiDEn, MeltDown, and poliSH for a complete
Markdown workflow. Both editors offer configurable toolbars, seven optional skins,
light and dark themes, and browser-native undo/redo.

## Built to stay useful

- **Your content stays yours.** No telemetry, accounts, vendor cloud, or automatic uploads.
- **Simple to adopt.** Ready-built files, sensible defaults, and no runtime dependencies.
- **Independent by design.** Use one library or combine them without adopting a framework.
- **Stable by intent.** Treat interface changes as a cost to users, not a routine maintenance task.
- **Small enough to understand.** Prefer focused code over layers of machinery.
- **Useful without ceremony.** Everyday features should work without a configuration project.

Self-host the assets for offline use. Your application decides where documents
are saved and whether files are uploaded.

The quickstarts below pin **lightmetal 0.7.0**.

## Quickstart: CDN

No build step needed. Load the HTML editor's CSS and JavaScript from jsDelivr:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/lightmetal@0.7.0/dist/lightmetal.min.css">
<script src="https://cdn.jsdelivr.net/npm/lightmetal@0.7.0/dist/lightmetal.min.js"></script>

<div id="editor" class="lightmetal"></div>
<script>
  const editor = lightmetal.init({
    element: document.getElementById('editor'),
    onChange: html => console.log(html)
  });
  editor.setHTML('<p>Hello, ligHTMetaL!</p>');
</script>
```

jsDelivr serves public npm packages automatically. Its URL pattern is
`https://cdn.jsdelivr.net/npm/lightmetal@VERSION/PATH`.
Use `@0.7.0` to pin this version, or `@latest` to follow npm's latest release.
Updates to `@latest` can take time to appear because of caching. Pin JavaScript
and CSS versions in applications; this README's logo uses `@latest`.

To self-host, copy the same files from `dist/` beside your HTML and use local
URLs. Standalone builds also work over `file://`.

## Install with npm

```bash
npm install lightmetal@0.7.0 --ignore-scripts
```

The package includes ready-built assets and has no install hooks. With a bundler:

```js
import { init } from 'lightmetal/dist/lightmetal.esm.js';
import 'lightmetal/dist/lightmetal.css';

const editor = init({ element: document.getElementById('editor') });
editor.setHTML('<h2>A fresh start</h2><p>Write something here.</p>');
const html = editor.getHTML();
// Save html using your application's own code.
```

Add `<div id="editor" class="lightmetal"></div>` to your page.
Editors need a browser DOM; the parser and highlighter can also run in Node.js.

## Markdown editing with MaiDEn

MaiDEn keeps Markdown markers visible while styling your source. It shares the
HTML editor's CSS and skins, but loads no HTML-editor JavaScript.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/lightmetal@0.7.0/dist/lightmetal.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/lightmetal@0.7.0/dist/maiden.min.css">
<script src="https://cdn.jsdelivr.net/npm/lightmetal@0.7.0/dist/MeltDown.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/lightmetal@0.7.0/dist/maiden.min.js"></script>

<div id="markdown" class="lightmetal"></div>
<script>
  const editor = maiden.init({
    element: document.getElementById('markdown'),
    preview: { render: meltDown.parse },
    onChange: markdown => console.log(markdown)
  });
  editor.setMarkdown('## Hello\n\nKeep the **Markdown**.');
</script>
```

MeltDown enables Preview and Side-by-side. Omit it and the `preview` option for
source-only editing. Help and Fullscreen work without a renderer.

Click a task's `[ ]` or `[x]` marker in the source
to toggle it. Each click is one native Undo step. The source half of split view
works the same way; the HTML preview stays read-only.

For bundlers, import `init` from `lightmetal/dist/maiden.esm.js` and `parse` from
`lightmetal/dist/MeltDown.esm.js`, along with the two stylesheets.

## Markdown parsing with MeltDown

**Useful Markdown. Sensible defaults. No switches for routine features.**

MeltDown turns Markdown into HTML in browsers and Node.js. Heading links, tables,
tasks, and ordinary web addresses just work. Raw HTML stays escaped and executable link schemes stay
blocked by default. When you explicitly choose raw mode, raw HTML means raw HTML.

Use it on its own for rendering documents, or connect it to MaiDEn for live
preview—no editor required.

- **Everyday Markdown:** headings, nested lists, blockquotes, links, images, and code.
- **Tables and task lists**, plus strikethrough and reference links.
- **Heading links that work automatically:** `[Details](#details)` links to `## Details`.
- **Raw HTML escaped by default**, with an explicit option for trusted HTML.
- **Optional code highlighting** through a hook; no highlighter dependency.

### Quickstart: CDN

```html
<script src="https://cdn.jsdelivr.net/npm/lightmetal@0.7.0/dist/MeltDown.min.js"></script>

<div id="document"></div>
<script>
  document.getElementById('document').innerHTML =
    meltDown.parse('# Hello\n\nMarkdown with **bold** and *italic* text.');
</script>
```

MeltDown returns HTML without adding a stylesheet. Style the output to suit your
application. For untrusted documents, use the sanitization guidance below.

### Use with npm

In a bundler or Node.js ES module:

```js
import { parse } from 'lightmetal/dist/MeltDown.esm.js';

const html = parse('## Shopping\n\n- [x] Coffee\n- [ ] Tea');
```

To enable MaiDEn's preview and split views, pass `preview: { render: parse }` when
initializing the editor. Add poliSH through the highlighting hook shown below.
See the [MeltDown guide](docs/MeltDown.md) for syntax, options, and rendering hooks.

## Syntax highlighting with poliSH

poliSH turns source code into highlighted HTML. Use it on its own for code blocks,
configuration files, Markdown source, or ANSI-colored terminal output—no editor
or parser required.

- **49 languages**, including JavaScript, TypeScript, Python, Rust, SQL, and Bash.
- **Eleven themes**, switchable with CSS classes without highlighting again.
- **Full catalog or selected imports**, so you can bundle only what you need.
- **Browser and Node.js support**, with zero runtime dependencies.

### Quickstart: CDN

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/lightmetal@0.7.0/dist/polish.min.css">
<script src="https://cdn.jsdelivr.net/npm/lightmetal@0.7.0/dist/polish.min.js"></script>

<pre class="code theme-dark"><code id="code"></code></pre>
<script>
  const highlighter = polish.createHighlighter({ languages: polish.allLanguages });
  document.getElementById('code').innerHTML =
    highlighter.highlight('const answer = 42;', 'js');
</script>
```

Use `theme-light` for a light background. Other themes include `dracula`,
`paper-dark`, and `quiet-light`. Change the `theme-NAME` class to switch palettes.

### Import selected languages

With a bundler, the core entry lets you leave the full catalog out:

```js
import { createHighlighter } from 'lightmetal/src/polish.js';
import javascript from 'lightmetal/src/polish/languages/javascript.js';
import json from 'lightmetal/src/polish/languages/json.js';
import 'lightmetal/dist/polish.css';

const highlighter = createHighlighter({ languages: [javascript, json] });
const html = highlighter.highlight('const answer = 42;', 'js');
```

For the full catalog, import `createHighlighter` and `allLanguages` from
`lightmetal/dist/polish.esm.js`. See the [poliSH guide](docs/poliSH.md) for the
language list, themes, ANSI conversion, and optional terminal output.

### Highlight Markdown code blocks

MeltDown parses everyday Markdown: headings, lists, tasks, tables, links, images,
and code. Connect poliSH through its highlighting hook:

```js
const highlighter = polish.createHighlighter({ languages: polish.allLanguages });
const html = meltDown.parse('```js\nconst answer = 42;\n```', {
  highlight: highlighter.highlight
});
```

Add `dist/MeltDown.min.js` to the poliSH browser quickstart above. Apply
`polish theme-dark` (or another theme) to the container displaying the result.
The same rendering hook adds code colors to MaiDEn's preview and split views.

You can also color fenced and inline code
while editing. Load `polish.css`, then add this option to `maiden.init()`:

```js
const editor = maiden.init({
  element: document.getElementById('markdown'),
  sourceHighlight: highlighter.highlightTokens
});
```

Fence labels select the language. Unlabeled fences and inline code use poliSH's
conservative guesser. Colors appear as you type, without changing your source or
native Undo. The hook works with or without Preview. See the
[MaiDEn reference](docs/reference.md#optional-live-code-colors) for the contract.

## Sketching with Etch

**ligHTMetaL::Etch — Leave your mark.** Draw with Pen, Highlighter, shapes,
and an eraser. Work with layers, import images or supported SVG vectors, and
export PNG, SVG, or native JSON. Your application owns saving and storage.

Etch is independent of the text editors, parser, and highlighter. From this
checkout, run `npm run build` and load its assets:

```html
<link rel="stylesheet" href="dist/etch.css">
<div id="drawing" style="height:400px"></div>
<script src="dist/etch.js"></script>
<script>
  const editor = etch.createEtch(document.getElementById('drawing'));
  editor.on('change', () => console.log(editor.save()));
  // await editor.load(snapshot);
  // editor.destroy();
</script>
```

For modules, import `createEtch` from `dist/etch.esm.js`. Etch has its own drawing
history; it does not use the text editors' native undo. Try
`examples/etch/index.html` over HTTP. See the [Etch guide](docs/Etch.md) for the
API, imports, resource limits, and unverified device/accessibility behavior.
Etch has not completed v1 acceptance.

## Themes that fit together

Set one mode on a page, section, or component. Editors and highlighted code follow
it without a JavaScript theme adapter:

```html
<section data-lightmetal-theme="dark">
  <div id="editor" class="lightmetal"></div>
  <pre class="code"><code><!-- poliSH output --></code></pre>
</section>
```

Use `light`, `dark`, or `auto`. With no setting, follow the system. Nested settings
let parts of a page choose their own mode. Existing editor light/dark classes and
explicit poliSH palettes still work as local overrides. Skins keep their own
colors, and MaiDEn preview code follows the editor automatically when `polish.css`
is loaded. Each stylesheet works independently; no shared runtime is needed.

MeltDown returns unstyled HTML. Wrap its rendered code blocks in `class="polish"`
to use poliSH's automatic colors, or choose a named palette. An iframe has its own
document: set the mode inside that document too.

## Guides and examples

- [Editor API and integration reference](docs/reference.md): options, commands,
  images, tables, skins, preview, iframe integration, and browser limits.
- [MeltDown guide](docs/MeltDown.md): parser API, supported syntax, and hooks.
- [poliSH guide](docs/poliSH.md): languages, themes, selective imports, and ANSI.
- [Etch guide](docs/Etch.md): drawing, layers, imports, exports, and embedding.
- [Changelog](CHANGELOG.md).

The checkout's `examples/index.html` introduces all five libraries, including
Etch's standalone sketch demo. Detail pages
are `html.html`, `markdown.html`, `meltdown.html`, and `polish.html` in `examples/`.
Compare skins in `skins.html` and `markdown-skins.html`.
The Markdown demos open an editable showcase document: try its task checkboxes,
change the code, or compare the source with Preview. Skin cards and the iframe
use a shorter version of the same idea.

## React and Vue

Version 0.7.0 includes optional adapter files in the main package:

```js
import { LightmetalEditor, MaidenEditor } from 'lightmetal/adapters/react/index.js';
// Or: import { LightmetalEditor, MaidenEditor } from 'lightmetal/adapters/vue/index.js';
```

Both offer an initial value, native options, change notifications, and instance
access. They leave native editing and Undo alone. React and Vue are optional
peers: install only your framework. Bare-JS users need neither. This checkout uses
them as development dependencies for tests and optional demos.

See the [framework guide](docs/frameworks.md) for installation, refs,
mount-only options, SSR, and styling. No separate adapter package is needed.
Run `npm run build:framework-examples` to build the local React and Vue demos in
`examples/frameworks/`. No framework code is loaded by the main gallery.

## Content safety and browser support

Use a maintained HTML sanitizer before publishing untrusted HTML. The HTML
editor filters imports by default, but Source edits and intentional raw modes
bypass that filtering. MeltDown escapes raw HTML by default; custom rendering
and highlighting hooks are trusted application code. See the
[reference's safety section](docs/reference.md#html-and-safety) for the boundaries.
Remote image URLs and application-configured upload hooks can make network requests.

Tested in Chromium and Firefox. Linux Playwright WebKit provides additional
coverage, not a Safari support guarantee. Editing and undo use the browser's
native `document.execCommand`; history is document-wide, not per inline editor.

## Development

```bash
npm install
npm run build
```

Open `examples/index.html` with the tracked bundles, or run the optional local
server (Node.js, no additional dependencies):

```bash
npm run dev
```

The server uses tracked bundles; run `npm run build` after source changes.
It binds to `0.0.0.0`, allowing access from other devices on your network.
Use `PORT=5001 npm run dev` for another port, or `HOST=127.0.0.1 npm run dev`
to restrict access to this computer.

Visit `http://localhost:5000/`. Tests use the existing global Playwright setup:

```bash
npm test
npm run test:release-docs
npm run test:package
```

The release-docs check scans the documentation npm ships for stale lightmetal
versions. Pass a `.tgz` path to check an exact archive instead of the checkout.
Changelog history keeps its original versions.

See [development and tests](docs/reference.md#development-and-tests) for setup,
focused commands, and optional diagnostics.

## Why ligHTMetaL exists

ligHTMetaL grew out of a personal app used as a knowledge base for
sensitive information since 2012. Modernizing it brought a familiar problem into
focus: useful software can outlive the libraries it depends on.

Dependencies age. Interfaces change. Projects change direction or stop receiving
attention. A small application can gradually inherit a toolchain and maintenance
burden much larger than its actual needs.

We wanted something simpler: editors, Markdown parsing, and syntax highlighting
that we could understand, self-host, and keep using. No telemetry. No accounts.
No runtime dependency tree. No build step just to get started.

That became a suite of independent libraries, built around everyday features and
sensible defaults. Use the parts you need. Your application keeps control of its
content, storage, and presentation.

The goal is not to do everything. It is to do useful things well, with interfaces
worth keeping stable and code small enough to maintain. If that sounds like your
kind of software, welcome. If not, we still have a set of tools we enjoy building
things with.

**Serious about your data. Less serious about capitalization.**

## License

MIT. See [LICENSE](LICENSE).
