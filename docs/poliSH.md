# ligHTMetaL::poliSH

**Code in. Highlighted HTML out. No runtime dependencies.**

Highlight code, configuration files, Markdown source, and ANSI-colored text in
browsers or Node.js. Register selected languages or use all 49. Switch between
11 themes without highlighting again. Plug directly into MeltDown's code-block
hook and MaiDEn's rendered preview.

poliSH remains independent of the editors and parser.

## Quickstart

The prebuilt standalone script includes the language catalog and exposes `polish`:

```html
<link rel="stylesheet" href="dist/polish.css">
<pre class="code theme-dark"><code id="code"></code></pre>
<script src="dist/polish.js"></script>
<script>
  const highlighter = polish.createHighlighter({ languages: polish.allLanguages });
  document.getElementById('code').innerHTML =
    highlighter.highlight('const answer = 42;', 'js');
</script>
```

Minified JS/CSS and `dist/polish.esm.js` are also available. The full builds export
`createHighlighter`, `allLanguages`, individual grammars, `allThemes`, `themeToCSS`,
and the core rendering/composition/loader APIs. Registration is per instance.

For native modules:

```js
import { createHighlighter, allLanguages } from './dist/polish.esm.js';
const highlighter = createHighlighter({ languages: allLanguages });
```

Use current browsers with native regex capture indices (ES2022), or Node.js 22+.
Serve native browser modules over HTTP(S). Standalone examples work over `file://`.
In Node.js, use an ES module context.

### Select only the languages you need

The core source entry does not import the catalog. With a bundler:

```js
import { createHighlighter } from 'lightmetal/src/polish.js';
import javascript from 'lightmetal/src/polish/languages/javascript.js';
import json from 'lightmetal/src/polish/languages/json.js';
import 'lightmetal/dist/polish.css';

const highlighter = createHighlighter({ languages: [javascript, json] });
const html = highlighter.highlight('const count = 42;', 'js');
```

Import the complete source catalog from `lightmetal/src/polish-languages.js`.
When copying source files, keep `src/polish.js` with the `src/polish/` module tree.
The main `lightmetal` package entry remains the HTML editor.

## Languages

| Group | Languages |
| --- | --- |
| Web and data | JavaScript, TypeScript, HTML, CSS, JSON, XML, SQL |
| C family and related | C, C++, C#, Java, Objective-C, Go, Rust, Swift, Kotlin, Dart, Scala, Groovy, Zig |
| Scripting and scientific | Python, Bash, PowerShell, Ruby, Perl, Lua, R, MATLAB, Julia, Windows Batch/CMD |
| Other programming | Ada, ABAP, COBOL, Haskell, Pascal, Delphi, VBA, Visual Basic (VB.NET) |
| Configuration | YAML, TOML, INI, systemd units, nginx, Apache httpd, dotenv, Dockerfile, OpenSSH client config |
| Document source | Markdown |

Grammars classify source lexically; they do not compile or validate it. Markdown
highlighting colors the original markers, not rendered headings or emphasis.
ANSI conversion is a separate rendering mode, not one of the 49 grammars. See the
[specification](specs/polish-spec.md#language-catalog-and-boundaries) for IDs,
aliases, language-specific coverage, and extension points.

### Unlabelled code

`highlight` and `highlightHTML` conservatively guess missing/empty labels from
registered languages. Uncertain input stays escaped plain text. Explicit labels
always win: `plain`, `text`, and unknown labels do not trigger guessing.

```js
const highlighter = polish.createHighlighter({
  languages: polish.allLanguages,
  guessLanguage: false
});
```

Detection inspects up to 8,192 UTF-16 code units and never imports grammars or uses
filenames. `tokenize` always requires an explicit label.

## Themes

Load `polish.css` and use `class="code"` for a standalone block or `class="polish"`
for rendered Markdown. Colors follow the system automatically. Set
`data-lightmetal-theme="light"`, `"dark"`, or `"auto"` on a surrounding container
or the block itself to choose a mode. Nested settings work, and system changes
need no JavaScript. This works without any editor stylesheet or runtime.

For a fixed palette, apply `code theme-NAME` to a standalone block, or
`polish theme-NAME` to a preview container. Explicit palettes override the shared
mode and own their subtree. No retokenization is needed to switch. The automatic
CSS uses native `color-scheme` and `light-dark()` colors.

| Themes | Appearance |
| --- | --- |
| `light`, `dark` | GitHub-like defaults |
| `paper-light`, `paper-dark` | Warm paper and earthy accents |
| `quiet-light`, `quiet-dark` | Restrained neutrals with mint/peach accents |
| `tomorrow` | Charcoal with balanced accents |
| `dracula` | Dracula colors with brighter comments |
| `atom-inspired` | Blue-gray charcoal, green strings, blue functions, purple keywords |
| `cyberpunk` | Deep blue-black, hot pink, cyan, lime |
| `vaporwave` | Plum with pastel pink, lavender, aqua, peach |

Theme data and CSS generation live in `src/polish/themes/`. Supplied text/token
foregrounds meet 4.5:1 contrast against their theme background. Themes and grammar
classification stay separate.

## MeltDown and MaiDEn

Load the three libraries separately, plus `polish.css`:

```js
const highlighter = polish.createHighlighter({ languages: polish.allLanguages });
const render = markdown => meltDown.parse(markdown, {
  highlight: highlighter.highlight
});

const editor = maiden.init({
  element: document.getElementById('editor'),
  sourceHighlight: highlighter.highlightTokens,
  preview: { render }
});
```

MeltDown owns the code wrappers and `language-*` classes; poliSH returns their
contents. The hook handles fenced and indented blocks, not inline code. Use
`csharp` or `cs` for C# fences: MeltDown language tokens accept `+`, but not `#`.
MaiDEn's optional `sourceHighlight` hook also colors fenced and inline code while
you type. It paints tokens behind the editable text, preserving source and native
history. Explicit fence labels win; unlabeled fences and inline code use guessing.
Short or uncertain snippets may stay plain. Indented code blocks keep their usual
source styling. Omit the hook to keep the existing behavior.

With `polish.css` loaded, default source and preview colors follow the editor's
mode and system changes. Source highlighting changes colors only, not typography.
For a fixed preview palette, add `polish theme-NAME` to `.lightmarkdown-preview`.
This source-highlighting API is available in lightmetal 0.7.0.

MaiDEn preserves poliSH's fixed token classes but continues to remove inline
styles. ANSI colors work in standalone output; ANSI text in MaiDEn remains readable
without those colors. No style-filter bypass is needed.

## API

`createHighlighter({ languages = [], maxDepth = 64, maxSteps = 100000,
guessLanguage = true })` returns an isolated instance:

| Method | Result |
| --- | --- |
| `highlight(code, language)` | Synchronous HTML contents; callback-safe without binding. |
| `highlightHTML(code, { language, strict })` | HTML with explicit strict-mode control. |
| `highlightTokens(code, language)` | Synchronous `{ tokens, diagnostics }`; callback-safe, with the same guessing as `highlight`. |
| `register(grammar)` | Compile and snapshot a native grammar; collisions throw. |
| `hasLanguage(name)` | Check registered IDs/aliases and reserved rendering modes. |
| `tokenize(code, { language, strict })` | `{ tokens, diagnostics }` for an explicit language. |

Source must be a primitive string. Names are trimmed and case-insensitive.
`ansi`, `plain`, and `text` are reserved. Strict mode exposes unknown languages
and engine failures; it does not validate source syntax. Options are not mutated.

`highlightTokens` returns a complete partition of the original UTF-16 source.
Each token has `start`, `end`, `kind`, and `language`. It never consumes or rewrites
text. Explicit `ansi` returns plain tokens rather than interpreting terminal
controls. Use the HTML/ANSI APIs for terminal output. `tokenize` still requires an
explicit language; its behavior has not changed.

The core also exports `renderHTML`, `validateTokens`, `composeLanguage`, and
`createLanguageLoader`. Tokens partition original UTF-16 source ranges exactly,
with exclusive ends. Rendering escapes text without normalizing line endings;
HTML parsing in the browser can normalize CRLF.

The explicit loader prepares trusted, application-owned module manifests before
synchronous highlighting. It does not turn user labels into import paths. See the
[technical contracts](specs/polish-spec.md) for grammar authoring, captures,
embedding, scanner callbacks, loading, and diagnostics.

## ANSI and terminal output

```js
highlighter.highlight('\x1b[31mRed text\x1b[0m', 'ansi');
```

Use actual escape characters, not printable backslash spellings. ANSI-to-HTML
supports semicolon-form 16/256/truecolor foreground/background and common styles.
It preserves art spacing in a `pre`; it does not emulate a terminal or cursor.
Unsupported controls become visible escape spellings.

For separate adapters, import `ansiToHTML` from `src/polish/ansi-to-html.js` or
`renderANSI` / `escapeTerminalText` from `src/polish/ansi.js`. Terminal rendering
escapes source control/bidi characters before adding trusted styling, normalizes
CRLF to LF, and leaves TTY/`NO_COLOR` policy to the application.

## Rendering policy

Syntax output contains escaped text and fixed token classes. ANSI output also
contains inline styles built from numeric colors and fixed properties. Do not
escape the returned markup again. Use a maintained HTML sanitizer for whole
untrusted documents; configure CSP and resource policy for your application.
Sanitizers/CSP may remove ANSI styles.

Grammars, scanners, and loaders are trusted JavaScript. Depth/step budgets cannot
interrupt a pathological regex or callback. Bound large/adversarial inputs at the
application boundary. There is no incremental editing or streaming API.

## Maintenance and verification

Edit `src/polish/` and run `npm run build`. The build regenerates `src/polish.css`
from theme data and produces tracked JS/CSS bundles. Run:

```sh
npm run test:polish
npm run test:polish:browser
npm run test:package
```

The copied unit fixtures cover all 49 grammars, source reconstruction, malformed
input, capture/scanner/loader contracts, ANSI, and theme contrast. The MeltDown
harness uses this repo's parser. Browser tests use the project's global Playwright
installation in Chromium/Firefox; set `BROWSERS=webkit` for an optional WebKit run.
`npm test` includes poliSH alongside the editors and parser.
