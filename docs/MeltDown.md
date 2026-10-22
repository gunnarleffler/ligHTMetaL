# ligHTMetaL::MeltDown

**Markdown in. HTML out. No dependencies.**

Parse headings, nested lists, tables, code, and inline formatting in browsers or Node.js. Bring your own syntax highlighter through a code-block hook. MeltDown escapes raw HTML by default. The prebuilt files need no build step.

The source lives in `src/MeltDown.js`. Optional standalone builds live in
`dist/MeltDown.js`, `dist/MeltDown.min.js`, and `dist/MeltDown.esm.js`.
MaiDEn's demo uses it through `preview: { render: meltDown.parse }`.
The editor remains independent: applications can choose another renderer.

## Quickstart

Copy `dist/MeltDown.esm.js` into your project and import `parse`:

```js
import { parse } from './MeltDown.esm.js';

parse('# Hello'); // '<h1>Hello</h1>'
parse('A **bold** paragraph.'); // '<p>A <strong>bold</strong> paragraph.</p>'
```

Use a modern browser or Node.js 18+. In Node.js, use an ES module context, such as a package with `"type": "module"`.

MeltDown focuses on everyday Markdown. Less-used extensions stay out to keep the parser small and maintainable. For untrusted documents, sanitize rendered HTML with a maintained sanitizer; see [Destination policy and escaping](#destination-policy-and-escaping).

### Browser global

Load the prebuilt standalone script to expose `window.meltDown`:

```html
<script src="dist/MeltDown.js"></script>
<script>
  console.log(meltDown.parse('# Hello'));
</script>
```

## Supported syntax

| Feature | Syntax / behavior |
| --- | --- |
| Paragraphs | Blank-line separated; soft line breaks remain newlines in HTML. |
| ATX headings | `# Heading` through `###### Heading`; optional space-separated closing markers. |
| Setext headings | A single heading line followed by `===` or `---` (three or more markers). |
| Horizontal rules | Three or more matching `-`, `*`, or `_` characters, optionally space-separated. |
| Unordered lists | `-`, `*`, or `+` markers, including nested lists. |
| Ordered lists | `1.` or `1)` markers, with a `start` attribute when the first number is not 1. |
| Task items | `[ ]`, `[x]`, or `[X]` at the start of a list item; disabled checkboxes. |
| Blockquotes | `> text`, including nested quotes, lists, headings, tables, and code. |
| Fenced code | Three or more backticks or tildes; optional language token. |
| Indented code | Four spaces or a leading tab; cannot interrupt an existing paragraph. |
| Tables | Pipe tables with optional outside pipes and column alignment. |
| Bold / italic | `**bold**`, `__bold__`, `*italic*`, `_italic_`, including nesting. |
| Strikethrough | `~~deleted~~`, including nested inline formatting. |
| Inline quotation | Custom syntax: `:"quoted text":` → `<q>`. |
| Inline code | Matching backtick runs, including multi-backtick spans and soft newlines. |
| Hard line breaks | Two or more spaces, or an unescaped backslash, before a newline. |
| Links / images | Inline destinations, optional quoted titles, and reference forms. |
| Autolinks | Angle-bracket HTTP(S), telephone, mailto, and email links; no bare-URL/number detection. |
| Raw HTML | Escaped by default; inline tags and HTML blocks are passed through with `{ html: 'allow' }`. |
| Image dimensions | Optional numeric `=W`, `=WxH`, `=Wx`, or `=xH`; pixels or percentages. |
| Escapes | Backslash-escaped ASCII punctuation outside code. |
| Prose entities | Semicolon-terminated named, decimal, and hexadecimal HTML character references. |

Block markers allow up to three leading spaces. List continuation lines and nested blocks must be indented to at least the item's content column. Tabs in indentation use four-column stops. Blank-separated items/multiple paragraphs produce loose lists; tight lists omit direct paragraph wrappers. Switching ordered/unordered type at the same level starts a new list.

```markdown
- **Parent**
  3. Nested ordered item
     - [x] Nested task
  4. Another item

- A second parent with another paragraph.

  This paragraph belongs to that item.
```

Inline markup is parsed within headings, paragraphs, list items, quotes, table cells, and link labels. Code is always literal. Nested Markdown anchors are not generated; an image inside a link is supported. Image alt text is plain text with supported formatting markers removed, then attribute-escaped.

Fences close with the same character and at least the opener's marker count. Unclosed fences consume the rest as code. The newline immediately before the closing fence is omitted; internal newlines/blank lines are retained. Language tokens use letters, digits, `_`, `+`, and `-` and generate `class="language-TOKEN"`.

Code spans require equal-length backtick runs, turn internal newlines into spaces, and remove one surrounding space when both sides have a space and the content is not entirely spaces. Unmatched delimiters remain readable rather than manufacturing closing tags.

### Links, titles, references, and images

```markdown
[**Project**](https://example.com "Project homepage")
[Documentation][docs]
[docs][]
[docs]

[docs]: ./guide "Guide"

![A **diagram**](./diagram.png =120x80 "Overview")
![Responsive diagram](./diagram.png "Overview" =60%)
```

- Balanced parentheses and backslash-escaped punctuation work in destinations. `<destination>` form is also supported.
- Titles use single or double quotes; escaped quotes are allowed. Titles and image dimensions can appear in either order.
- Definitions are single-line and can precede or follow use. Reference identifiers are case-insensitive with whitespace normalized; the first definition wins. Full, collapsed, and shortcut reference links/images are supported.
- Definitions inside code are never collected. Definitions in lists/quotes are available throughout that parse call.
- Missing references remain literal. Rejected links/images preserve their entire original syntax, including formatting markers. Unsafe reference definitions also remain visible rather than being silently dropped.
- Image dimensions generate only fixed `width`/`height` styles from digit/percentage values, not arbitrary CSS.
- External links do not force a new tab; that is the consumer's policy.

### Autolinks and phone/email links

```markdown
<https://example.com>
<you@example.com>
<tel:+15551234567>
<mailto:you@example.com>

[Call me](tel:+15551234567)
[Call extension 42](tel:+15551234567;ext=42)
[Email me](mailto:you@example.com?subject=Hello%20there)
```

These work in both HTML modes. Autolink labels remain literal rather than interpreting underscores or other Markdown inside the URL. Email autolinks add `mailto:` without changing the displayed address.

- `tel:` is **links-only**. Numbers may have a leading `+`, digits, parentheses, dots, and hyphens, plus an optional numeric `;ext=` suffix. At least one digit is required; spaces, USSD strings, and other telephone URI parameters are outside this subset. Put a nicely formatted number in the link label and a compact number in its destination.
- `mailto:` is **links-only**. It supports unquoted ASCII mailbox syntax, comma-separated recipients, and optional query parameters such as `subject`/`body`. Encode query spaces as `%20` and use a raw `&` between parameters. This is syntax checking, not verification that an address exists; quoted/internationalized addresses and the full mailto RFC grammar are not implemented.
- Both schemes also work through reference links and are rejected for **direct and reference Markdown images**.
- Bare phone numbers, email addresses, and URLs remain text. Autolinks are not activated inside code, escaped angle brackets, or Markdown link labels.
- Clicking a link may open the device's dialer/mail client; behavior depends on the browser, OS, installed handlers, and host application. Parsing itself never initiates a call or sends mail.

### Tables

```markdown
| Name | Count | Note |
| :--- | ---: | :---: |
| **Apples** | 3 | fresh |
| Pears | 2 | ripe |
```

Tables use `<thead>`/`<tbody>`. Each delimiter cell needs at least three hyphens, optionally surrounded by colons. Header and delimiter column counts must match. Colons select left/right/center alignment through fixed `text-align` styles.

Outside pipes are optional, but headers and body rows must contain a delimiter pipe. Short rows are padded. Over-wide rows end the table and remain subsequent content—extra cells are never discarded. Blank lines and recognized block openers also end a table.

The splitter respects escaped pipes, matching code spans, bracketed link/image syntax, autolinks, and HTML tags. Thus `` `a|b` ``, `[label](./a|b)`, and `<span title="a|b">x</span>` do not split inside their protected spans. `\|` is a literal pipe in normal cell text; escapes inside code remain literal.

## Optional raw HTML — trusted input only

```js
parse('Hello <em>there</em>.');
// '<p>Hello &lt;em&gt;there&lt;/em&gt;.</p>'

parse('Hello <em>there</em>.', { html: 'allow' });
// '<p>Hello <em>there</em>.</p>'
```

**Allow mode passes recognized HTML through unchanged**, including scripts, event handlers, styles, resource URLs, and executable destinations. Raw HTML bypasses the Markdown-generated destination policy. Use it for trusted documents. If you accept untrusted HTML, sanitize the **complete rendered output** with a maintained sanitizer before insertion.

Recognition and block behavior:

- Inline opening/closing/self-closing tags, quoted/unquoted attributes, comments, processing instructions, declarations, and CDATA are recognized. Tag/attribute source is opaque to Markdown; attribute quotes and `>` inside quoted values are preserved.
- Inline tags can surround Markdown text, e.g. `Text <span>**bold**</span>`. In escape mode the tags are literal text, with their attributes protected from Markdown processing.
- Structural HTML blocks (including `div`, `details`, `summary`, and table/list tags) run until a blank line. They can interrupt a paragraph. The fixed structural tag set is `HTML_BLOCK_TAGS` in `MeltDown.js`.
- A complete standalone tag, including a custom element, can also start a blank-line-terminated block, but cannot interrupt an existing paragraph.
- `script`, `style`, `pre`, and `textarea` blocks run through their matching closing tag; comments/processing instructions/CDATA/declarations use their terminators. Missing terminators consume the remaining input in that container.
- Content inside a raw block is **not parsed as Markdown**, and reference definitions there are not collected. Blank lines end ordinary HTML blocks even if their tags are still open; Markdown parsing resumes afterward. This is block recognition, not recursive HTML-tree parsing.
- Code spans, fenced/indented code, and backslash-escaped angle brackets remain escaped. HTML inside image alt text remains attribute-escaped, never active markup.

For example, separate a raw details block from following Markdown with a blank line:

```html
<details>
<summary>More information</summary>
<p>Additional details.</p>
</details>

Markdown resumes here.
```

HTML is passed through without validation of tag balance or DOM structure. LF normalization and list/quote outdenting still apply. Malformed or unsupported inline forms remain text; this is not a complete HTML parser or a claim of full CommonMark HTML compatibility. Raw markup can break surrounding generated HTML or contain arbitrary DOM nesting—the Markdown nesting limit is not an HTML limit.

## Destination policy and escaping

Accepted Markdown-generated link/image destinations:

- Absolute `http://` and `https://` URLs with a valid host.
- Relative paths (`image.png`, `./page`, `../page`, `/page`).
- Fragments (`#section`) and relative queries (`?page=2`).
- For links only: the documented `tel:` and `mailto:` forms above.

Rejected: other schemes (including `data:` and executable schemes), protocol-relative URLs (`//host`), remaining backslashes, whitespace/control characters, and HTML character-reference spellings in destinations. Markdown punctuation escapes are resolved **before** validation. Use raw `&` in query strings, not `&amp;`; output attributes escape it once.

Generated text and attribute quotes are escaped. In prose, valid-looking semicolon-terminated character references are preserved for the HTML renderer, so `&copy;` can display as ©. Code, rejected syntax, and generated attributes use strict escaping instead: their entities stay literal. No DOM/entity-decoding library is used, and entity spellings are never decoded into URL schemes.

**Sanitize HTML from untrusted documents before rendering it.** Choose navigation, CSP, and resource policies for your application. Rendering an `<img>` can fetch its URL even though parsing never does. CSP may restrict the fixed inline styles used for image dimensions and table alignment.

## Deliberate limits

- Not full CommonMark/GFM: no bare-URL/email/number linking, footnotes, multiline reference definitions/titles, arbitrary fence info strings, or lazy/unindented list/quote continuations. Raw HTML recognition follows the bounded rules above, not a full HTML grammar.
- Setext headings are single-line. List marker numbers are limited to nine digits. Quoted lines must retain their `>` marker.
- Emphasis uses a bounded token-pairing implementation, not an exhaustive CommonMark delimiter implementation. Ambiguous malformed inputs may render differently from other parsers.
- References are matched textually, not by decoding HTML entities in identifiers. Attribute entities stay literal even when the equivalent prose entity displays as a glyph.
- Block nesting and recursive inline processing are each capped at 64. Inline formatting and link/image labels share a budget; block/label source past the cutoff stays literal. Excess delimiter nesting is flattened with its markers retained, while code and simple link/image tokens can still render. No document-size/time limit or streaming API is provided. Delimiter and bracket searches can revisit input; linear-time processing is not guaranteed. Bound unusually large or adversarial documents at the host application's boundary.

## API contract

The source and ESM build export `parse(markdown, options = {})`; the standalone build exposes `meltDown.parse`. It accepts a primitive string and returns an HTML string synchronously, not DOM nodes or a Promise.

- Other input types throw `TypeError`; input is not coerced.
- Empty/whitespace-only input returns `''`. LF, CRLF, and CR are normalized.
- The optional second argument accepts `html: 'escape'` (default) or `html: 'allow'`, and an optional `highlight(code, language)` function.
- Non-object options, arrays, and other `html` values throw `TypeError`. Omitted/undefined `html` uses the default; unknown keys are ignored.
- Options are not mutated. The parser has no shared mutable state or global configuration. A custom hook owns its own behavior and side effects.
- The core module assigns no globals and performs no DOM access, network requests, storage, or navigation. The standalone browser build exposes `meltDown`.

### Code-highlighting hook

`highlight(code, language)` runs synchronously for each fenced or indented code
block, including nested blocks. It does not run for inline code. `code` is the raw,
unescaped code text; `language` is the fence language token, or `''` for unlabelled
and indented code. MeltDown does not choose or detect a language.

Return an HTML string for the inside of the code element, without a
`<pre><code>` wrapper. MeltDown keeps that wrapper and its `language-*` class.
Return `null` or `undefined` to use normal escaped code. An empty string is valid
and produces an empty code element. Other results, including Promises, throw
`TypeError`; a non-function `highlight` option also throws. Omit the option or use
`undefined` to disable it. Hook exceptions propagate to the caller.

**Hook output is trusted HTML, not escaped or sanitized.** Only return markup from
a trusted highlighter. Raw-HTML escaping does not sanitize this output. Consumers
still own their sanitization and resource policy; MaiDEn applies its separate
preview filter. MeltDown has no highlighter or sanitizer dependency.

## Examples

### MaiDEn preview

```js
import { parse } from './dist/MeltDown.esm.js';

const editor = maiden.init({
  element: document.getElementById('editor'),
  preview: { render: parse }
});
```

### highlight.js with explicit languages

Install highlight.js in your application and register only the languages you need.
This example uses a bundler; load your chosen highlight.js theme CSS separately.
The library remains optional and is not bundled into MeltDown or MaiDEn.

```js
import { parse } from './dist/MeltDown.esm.js';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import bash from 'highlight.js/lib/languages/bash';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('bash', bash);

const render = markdown => parse(markdown, {
  highlight(code, language) {
    if (!language || !hljs.getLanguage(language)) return null;
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  }
});

const editor = maiden.init({
  element: document.getElementById('editor'),
  preview: { render }
});
```

A fence such as ` ```bash ` selects Bash; unknown languages and unlabelled code
remain escaped plain text. For opt-in auto-detection, return
`hljs.highlightAuto(code, ['javascript', 'bash']).value` when `language` is empty.
Auto-detection considers registered languages only, can misidentify short snippets,
and adds work. The explicit-language approach is the recommended default.

## Maintenance

Edit `src/MeltDown.js`, then run `npm run build` to update the tracked builds.

Preserve these internal constraints when modifying the parser:

- **Parse source, not generated HTML.** Block parsing creates a node tree; inline scanning creates opaque code/link/HTML tokens before delimiter pairing and rendering.
- **Collect references during block parsing, then render.** This resolves forward references without collecting definitions from code or raw HTML. Each call owns its reference `Map` and HTML policy.
- **Validate destinations at their use site.** A reference can become either a link or an image; link-safe schemes are not necessarily image-safe. The definition-time check separately determines whether an unsafe definition remains visible.
- **Keep escaping policies distinct.** Prose entities, literal code/rejected syntax, and generated attributes have different contracts. Do not decode entity spellings into Markdown or URL schemes.
- **Share the inline depth budget.** Formatting, label recursion, and fallback rendering must not reset it. Flatten excess delimiter nesting iteratively while preserving markers.
- **Preserve collected list whitespace.** Retain each blank line and any spaces left after outdenting; nested code depends on them. Keep whitespace preservation separate from list-boundary and looseness decisions.
- **Protect table spans even without resolved references.** `splitRow` intentionally uses `linkAt` without a reference map. `codeAt` requires a backtick at its starting position and returns a literal token for an unmatched run, never null.

Additional edge cases: undefined bracketed references retain formatting markers literally; image alt entities are not HTML-decoded; containers containing only consumed definitions can remain empty.

### Verification

Run `npm run test:meltdown` for the parser and highlighting-hook tests in `tests/meltdown/`, using
Node's built-in test runner. Coverage includes the API contract, feature
interactions, rejected destinations, HTML policy, malformed input, depth limits,
and absence of browser-global side effects. `npm run test:markdown` additionally
checks standalone/minified/ESM builds and MaiDEn preview integration in Chromium
and Firefox. Keep these tests when maintaining a modified copy. `npm test` also
runs the parser suite as part of the project's broader checks.

Core side-effect tests use an isolated Node process with a stand-in `window`.
Mobile dialer and mail-client behavior still needs manual integration testing.
