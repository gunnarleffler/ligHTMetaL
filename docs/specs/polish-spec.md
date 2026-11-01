# ligHTMetaL::poliSH specification

Technical contracts, grammar authoring, and language boundaries. See [the poliSH guide](../poliSH.md) for setup, usage, integration, and maintenance commands.

## Scope and design

poliSH is an independent, DOM-free JavaScript ESM highlighter in the lightmetal editor suite. It has zero runtime dependencies and requires no TypeScript compiler or build step. Development uses Node.js 22+; browser targets are current evergreen Chrome/Edge, Firefox, and Safari, including native regex capture indices.

The current catalog contains **49 opt-in lexical starter grammars**, plus a built-in ANSI-to-HTML rendering mode. Starter coverage means representative classification fixtures, malformed/source-preservation tests, and integration checks exist—not full language conformance or mature real-world accuracy. Complete snippets and source display are the intended use; editing/incremental highlighting is not implemented.

Architecture:

```text
Native language modules → isolated registry / compilation
                                      ↓
Source + explicit language → tokenizer → ranges + diagnostics
                                      ↓
                          HTML / optional ANSI renderer
```

Design constraints:

- Separate syntax classification, appearance, rendering, and asynchronous loading.
- Preserve all syntax source, including malformed input, whitespace and line endings.
- Match forward with deterministic precedence; never rewrite already emitted tokens.
- Use native grammars for controlled semantics and modularity rather than inheriting another engine's grammar ecosystem.
- Prefer explicit dependencies and narrow scanners over hidden engine-specific language branches.
- Only the HTML facade guesses unlabelled input, with an opt-out; tokenization and embedding require explicit languages. Never infer languages from filenames or extensions.
- Treat grammars/scanners as trusted executable code; cooperative budgets are not hard timeouts.

## Source layout and packaging

| Path/export | Responsibility |
| --- | --- |
| `src/polish.js` | Public factory, HTML renderer, partition validation, composition and loader exports |
| `src/polish.css` / `dist/polish.css` | Generated base styles and eleven category palettes |
| `src/polish-full.js` / `dist/polish.*` | Full-catalog standalone (`polish` global), minified, and ESM builds |
| `src/polish-languages.js` | Explicit full catalog: `allLanguages`, default catalog export and individual named grammars |
| `src/polish/languages/*.js` | Individual opt-in language modules |
| `src/polish/highlighter.js` | Callback-safe public facade, reserved modes and ANSI dispatch |
| `src/polish/index.js`, `src/polish/captures.js` | Lean tokenizer/registry, partition/HTML APIs and capture flattening |
| `src/polish/render-text.js` | Shared HTML escaping and surrogate-safe token text for HTML/terminal rendering |
| `src/polish/compose.js`, `src/polish/clone-grammar.js` | Isolated native-data composition |
| `src/polish/loader.js` | Explicit asynchronous preparation |
| `src/polish/themes/index.js` | Theme data, validation and CSS generation |
| `src/polish/ansi-to-html.js` | Native SGR grammar plus style-state rendering |
| `src/polish/ansi.js` | Opt-in source-to-terminal renderer and terminal-text escaping |
| `tests/polish/`, `tests/polish-browser.mjs`, `examples/polish.html` | Regression fixtures, smoke checks, generation and example output |

The core source entry includes ANSI-input conversion, but does not import the language catalog or source-to-terminal renderer. Full builds include the catalog and theme exports. All builds keep registration instance-owned. See the [README](../poliSH.md#quickstart) for source/package imports; `src/polish.js` requires its internal modules.

## Public API

```js
import {
  createHighlighter, renderHTML, validateTokens,
  composeLanguage, createLanguageLoader,
} from './src/polish.js';

const polish = createHighlighter({
  languages: [],
  maxDepth: 64,
  maxSteps: 100000,
  guessLanguage: true,
});
```

`languages` is an array of native definitions. Limits are positive safe integers. `guessLanguage` must be a boolean and defaults to true. Every instance owns its registry and compiled regexes; there is no global configuration.

### HTML facade

- `highlight(source, language)`: synchronous HTML **contents** string, callback-safe without binding.
- `highlightHTML(source, { language, strict = false })`: the same operation with explicit strict control.
- `hasLanguage(name)`: registered IDs/aliases plus reserved `ansi`, `plain`, `text` modes. Non-string names return false.
- `register(language)`: compile/snapshot a definition; conflicting names and invalid grammars throw before that registration commits.
- `tokenize(source, { language, strict })`: detailed syntax result, not an ANSI style interpreter.

The HTML methods require primitive string source/language arguments, except omitted/undefined language; they do not coerce input. Invalid options/strict values throw `TypeError`. Options are not mutated. Empty source has no contents to render, but argument validation and strict language checks still apply. Names are trimmed/lowercased.

| Requested language | HTML behavior |
| --- | --- |
| Registered ID/alias | Syntax tokens rendered with escaped source and fixed classes |
| `ansi` | Native SGR interpretation and escaped HTML text |
| Missing, empty | Guess registered syntax when enabled; otherwise escaped plain text, including in strict mode |
| `plain`, `text` | Escaped plain text, including in strict mode |
| Unknown name | Escaped plain text normally; strict mode throws |

`ansi`, `plain`, and `text` cannot be registered over. HTML methods return contents without wrappers, DOM nodes, or Promises. Strict mode exposes engine/grammar errors, not syntax-validation failures. The ordinary HTML hook discards diagnostics.

`tokenize` requires an explicit string language option. An unknown syntax language produces plain tokens and an `unknown-language` warning, or throws in strict mode. `plain`/`text` produce no warning. Requesting `ansi` here does not interpret SGR state: use the HTML facade or converter instead.

### Language guessing

With `guessLanguage: true`, an empty trimmed label uses signatures from `src/polish/guess-language.js`. Only registered candidates participate; detection never imports grammars, tokenizes candidates, uses filenames/extensions, or detects ANSI. Strict mode does not require a successful guess.

Detection inspects at most 8,192 UTF-16 code units. Signatures cover SQL, Python, TypeScript, JavaScript, Rust, Go, PHP, Bash, Ruby, Java, C#, C++, C, HTML, XML, CSS, Dockerfile and Markdown. JSON requires a valid whole object/array within the same size bound.

- Code signatures mask single/double/backtick and Python triple-quoted strings, backslash/doubled escapes, and `#`, `//`, `--`, `/* */` comments. SQL inside ordinary Python strings/comments is not SQL evidence.
- Structural signatures (Bash, Ruby, C/C++, HTML/XML, CSS, Dockerfile, Markdown) mask strings but retain significant comment-like punctuation. Complete single-line quoted `#include` headers after line-leading directives remain visible; directives inside outer strings stay masked. C recognizes `stdio.h`, `stdlib.h`, `string.h`, and `stdint.h` in angle brackets or quotes.
- Conflicting candidates produce plain text, except distinctive TypeScript overrides shared JavaScript syntax and non-Markdown evidence overrides a Markdown heading.

Masks preserve line breaks and do not modify source. They are approximate, not dialect lexers or interpolation/nested-comment parsers; structural comment-like text can mislead detection. Short, ambiguous, or unsignalled fragments remain plain. Results depend on current registrations.

## Tokens and diagnostics

Offsets are zero-based UTF-16 code units with exclusive ends, matching JavaScript string slicing. A token is:

```js
{ start: 0, end: 5, kind: 'keyword', language: 'javascript' }
```

Supported categories:

```text
plain comment keyword string number boolean constant function
 type variable property operator punctuation tag attribute
```

`tokenize` returns `{ tokens, diagnostics }`. Tokens are a complete, ordered, non-overlapping partition of the original source. There are no empty tokens; empty input has no tokens. Adjacent tokens can coalesce when kind and language agree. Concatenating original-source slices must reproduce the input exactly. Embedded tokens carry the embedded canonical ID; host delimiters retain the host ID. No scope-stack metadata is currently emitted.

`validateTokens(source, tokens)` checks the partition. `renderHTML(source, tokens)` validates it and escapes source into fixed `.token.KIND` classes; plain text is unwrapped. Neither function normalizes line endings. Browser HTML parsing may normalize CRLF in DOM text nodes.

HTML and source-to-terminal rendering keep surrogate pairs intact: when a token boundary splits a pair, the following token styles the complete character. No markup/SGR separates the halves, and empty adjusted chunks produce no spans/styles. Token offsets remain unchanged; lone surrogates are not repaired.

Diagnostics contain `code`, `severity`, `message`, `language`, and optional `rule`/`offset` fields. Runtime failures diagnose and preserve the affected remainder as plain text, or throw in strict mode. Capture failures fall back to the affected match's default classification in graceful mode. Compilation and registration errors throw independently of tokenization strict mode.

## Native grammar authoring

A module's default export is `{ id, aliases?, rules, repository? }`. Grammars are native definitions, not TextMate/Prism imports. Dependencies belong in the explicit loader manifest.

Canonical IDs use lowercase letters/digits/underscores/hyphens. Aliases additionally allow `+`/`#` and must contain an alphanumeric character. Names normalize at registration; duplicate normalized names are rejected. IDs are unique within each rule list. Registration snapshots native data and compiles instance-owned regexes, so later declarative mutations do not alter registered instances.

### Matching and precedence

1. Search active rules for the next candidate at/after the current cursor.
2. Earliest start wins; declaration order breaks equal-start ties.
3. A region close wins equal-start ties with children.
4. Emit gaps using the current context's default category.
5. Consume matches, push consuming begins, and pop closes. Do not retroactively rematch output.

Zero-width matches and begins are invalid. Zero-width closes are allowed because they pop context without losing a character. Unclosed regions extend to the current hard bound/EOF. Regex searches retain original-source anchor/lookaround context rather than using sliced subjects; consumed ranges are bounded. A Unicode regex can rewind to the start of a surrogate pair when the cursor points at its low surrogate. The search helper skips that pre-cursor match and retries one code unit later; unmatched code units remain in the current context's default category. This preserves forward-only partitions when a non-Unicode rule or scanner consumes only half a pair. Next regex matches are cached per tokenization, never across calls; scanner candidates are not cached across cursors.

### Match rules and captures

```js
{
  id: 'declaration',
  pattern: /(const)\s+([A-Za-z_$][\w$]*)/,
  kind: 'plain',
  captures: { 1: 'keyword', 2: 'variable' },
}
```

Ordinary matches consume their full range. JavaScript regex semantics apply; sticky patterns are rejected, global scanning is added, and caller `lastIndex` is not used as shared state. Capture-enabled expressions automatically receive the native `d` flag.

Capture keys are numeric group indices, including 0 for the whole match, not named groups. Nested captures override enclosing spans; equal spans prefer the higher group index. Missing optional and empty groups are ignored. Crossing spans, nonexistent groups and out-of-match lookaround groups diagnose as `invalid-captures`; graceful rendering uses the match default. Precedence and crossing checks use the original, unclipped capture ranges, including captures beyond an embedded host bound. Only emitted spans are clipped to the bound, so truncation cannot turn nested ranges into equal-span ties or conceal invalid crossings. Flattening completes before token emission, preserving a valid partition.

### Regions

```js
{
  id: 'quoted-string',
  begin: /"/,
  end: /"|(?=\r|\n)/,
  kind: 'string',
  rules: [{ id: 'escape', pattern: /\\(?:\r\n|[^])/, kind: 'string' }],
}
```

`kind` classifies delimiters; `contentKind` defaults to `kind`. Optional child `rules` classify content. An earlier escape match can consume an escaped quote before it becomes the next close. `beginCaptures` and `endCaptures` style delimiter groups using the same capture semantics.

`rules: '$self'` recurses through the current language's top-level rules, useful for braces/interpolation. Direct cyclic arrays are rejected. Use consuming regions with `$self` or productive repository recursion instead.

### Local repositories/includes

```js
const language = {
  id: 'example',
  repository: {
    escapes: [{ id: 'escape', pattern: /\\[^]/, kind: 'string' }],
  },
  rules: [{
    id: 'quoted', begin: /"/, end: /"/, kind: 'string',
    rules: [{ id: 'shared-escapes', include: 'escapes' }],
  }],
};
```

Includes contain only `id` and `include`. References are local repository keys, not TextMate scopes or external paths. Expansion preserves order; both raw and expanded IDs must be unique. Unknown entries, invalid include shapes, excessive include chains and non-productive cycles fail registration atomically. Repository entries are shape-checked, but only referenced contents are expanded/compiled.

Recursive includes inside a consuming region are productive: compilation reuses a region shell, and runtime depth limits bound nesting. JavaScript/TypeScript share escapes through repositories; nested-comment grammars use productive recursion.

### Embedding

```js
{ id: 'script', begin: /<script>/i, end: /<\/script\s*>/i,
  kind: 'tag', embed: 'javascript' }
```

`embed` names a static canonical language and cannot coexist with child `rules`. The host close is authoritative even inside an embedded unclosed string, comment, or nested region. Host delimiters are not passed to the embedded grammar. Missing embeddings remain plain with a diagnostic (strict mode throws); registering the embedded language later resolves it without rebuilding the host.

Depth and scan budgets are shared through embedding. Original-source regex context is retained, but emitted ranges cannot cross the host bound. HTML uses these rules for script/style content; it does not inspect script types or embed inline attributes. Dynamic Markdown fence-language selection is not implemented.

### Scanners

```js
{
  id: 'special', kind: 'string',
  scan({ source, start, end }) {
    const index = source.indexOf('SPECIAL', start);
    return index < 0 || index + 7 > end
      ? null : { start: index, end: index + 7 };
  },
}
```

A scanner receives frozen `{ source, start, end, language }` and returns the next absolute consuming `{ start, end }` range, or exactly `null`. A candidate must start at/after the cursor and end at/before the hard bound. Callbacks may inspect earlier context but must be stateless and avoid registry/global mutation. They compete by normal earliest-start/order rules, with closes winning ties.

Scanner rules have one fixed category. They cannot combine regex/region/capture behavior or return child tokens/actions. Invalid ranges, exceptions and async results diagnose as `invalid-scanner` and preserve the remainder (strict mode throws).

Shipped uses include dynamic raw strings/heredocs, paired quote operators, YAML scalar indentation and Markdown delimiter runs. See [limits and safety](#limits-and-safety) for callback trust and execution bounds.

### Composition and shared helpers

```js
const derived = composeLanguage(base, {
  id: 'my-language', aliases: ['mine'],
  edits: [
    { op: 'insertBefore', target: 'identifier', rules: extraRules },
    { op: 'replace', target: 'keyword', rule: replacementKeywordRule },
    { op: 'remove', target: 'unwanted-rule' },
  ],
});
```

`insertAfter` is also supported. Ordered edits target top-level rules only; targets must exist when used. Unknown operations/targets and duplicate IDs fail. Base aliases are not inherited. Native plain objects, arrays, regexes, captures and repositories are cloned; scanner callbacks retain their identity because closures cannot be cloned. Arbitrary host/class instances are not supported as grammar data. `$self` resolves to the derived language. TypeScript derives from JavaScript; C++/Objective-C derive from C and Delphi from Pascal.

Internal helpers reuse mechanics, not a universal grammar/vocabulary:

- `shared/starter.js`: fresh ordered comments, literals, vocabulary and identifier rules; `quoted()` constructs escape/doubled-delimiter regions.
- `shared/c-family.js`, `shared/basic.js`: common lexical construction with explicit dialect vocabularies.
- `shared/nested-comments.js`, `shared/delimited.js`: productive comment recursion and bounded delimiter scanners.
- `shared/config.js`: sections and assignment keys for INI/TOML/systemd units. TOML opts into array tables/dotted keys; INI keeps values untyped and dots do not imply TOML path semantics. These helpers do not evaluate configuration.

Ordering remains significant: a broad identifier before keywords wins same-position ties. Test whole literals and following real code, not only the first character's category.

## Asynchronous preparation

```js
const highlighter = createHighlighter();
const loader = createLanguageLoader(highlighter, {
  javascript: { load: () => import('./src/polish/languages/javascript.js') },
  css: { load: () => import('./src/polish/languages/css.js') },
  html: {
    load: () => import('./src/polish/languages/html.js'),
    dependencies: ['javascript', 'css'],
  },
}, { js: 'javascript' });
await loader.prepare('html');
```

Manifest keys are canonical IDs. Entries provide `load()` returning a default language export and optional dependency IDs; aliases needed before registration are explicit loader metadata. No user language becomes an arbitrary import path. Dependencies are not inferred from grammars.

`prepare(...names)` validates the complete requested graph before importing. Cycles are visited once without recursively awaiting one another. Concurrent preparations share import/registration promises, and successful results are cached. Failed imports can retry on a later call. Module IDs must match manifest IDs. Registration collisions are errors; use a fresh highlighter rather than mixing eager registration with the same loader entries.

Preparation is **not transactional**: successful registrations survive partial failure, with no rollback. Imports may run concurrently; do not depend on dependency module execution order. Await preparation before synchronous highlighting or MeltDown parsing; never pass an async highlighting hook.

## Themes

A theme has `name`, `appearance: 'light'|'dark'`, foreground/background, and a `tokens` category map. Styles support optional `foreground`, `bold`, `italic`, `underline`. Missing categories use base foreground and normal flags. Colors require six-digit hex strings; names, categories and flags are validated. Grammar definitions do not contain colors.

`src/polish/themes/index.js` exports `light`, `dark`, `paperLight`, `paperDark`, `quietLight`, `quietDark`, `tomorrow`, `dracula`, `cyberpunk`, `vaporwave`, `atomInspired`, `allThemes`, `validateTheme`, and `themeToCSS`. `allThemes` is a frozen array; its theme objects are not deep-frozen. Palette definitions live in that module and `src/polish/themes/palettes.js`. See [README themes](../poliSH.md#themes) for palette names, descriptions, and markup examples.

`themeToCSS(theme)` validates the theme and generates `.code.theme-NAME .token.KIND` and `.polish.theme-NAME pre .token.KIND` rules using `--code-KIND` variables. Every category has explicit fallback color/style values so switching themes retains no previous theme's styles and requires no retokenization. Themes are category-based; contextual scopes and VS Code theme imports are not supported.

Built-in foreground/token colors must meet 4.5:1 contrast against their theme background. Contrast tests do not replace visual/accessibility review. See [MeltDown / MaiDEn integration](../poliSH.md#meltdown-and-maiden) for hook usage and [application policy](../poliSH.md#rendering-policy) for sanitization and CSP.

## ANSI conversion and terminal display

### ANSI input → HTML

Use `highlight(source, 'ansi')`, or `ansiToHTML(source, { maxSteps, strict })` from the separate converter export. The native `ansi-sgr` grammar recognizes complete semicolon-form numeric SGR sequences; a state renderer interprets them without a third-party parser.

Supported: 16-color, 256-color and truecolor foreground/background; resets; bold, dim, italic, underline, strikethrough and reverse. The palette is fixed, not a guarantee to match a customized terminal. Reverse without explicit colors uses black/white fallbacks. Blink/conceal are ignored rather than hiding text.

Input is decoded Unicode. Preserve art spacing in a `<pre>`. Unsupported controls become visible escape spellings. No cursor emulation, terminal layout, CP437 decoding, streaming, colon-form SGR or hyperlink handling is provided. Printable `\\x1b` text is not decoded. Colors/fixed properties are the only generated inline styles; text remains HTML-escaped.

The facade passes its instance `maxSteps` to conversion. Graceful exhaustion displays the remainder literally; strict conversion throws.

### Source → ANSI terminal

`renderANSI(source, tokens, theme, { colors })` validates tokens/theme, escapes source controls and adds trusted truecolor foreground plus bold/italic/underline. Default theme is dark and colors default to true. No background output, 256-color quantization or terminal-capability detection is included. Styled tokens reset before/after; surrounding terminal styles are not preserved. The [token rendering rules](#tokens-and-diagnostics) keep surrogate pairs intact. Applications own TTY/`NO_COLOR` policy; the terminal demo demonstrates it.

`escapeTerminalText(source)` applies the display policy alone:

- Preserve tabs and LF; normalize CRLF to LF, including across token boundaries in rendering.
- Render other C0, DEL and C1 controls as visible `\\xNN` text.
- Render Unicode bidi controls as visible `\\uNNNN` text.
- Preserve other printable/Unicode text.

Embedded source ANSI sequences are displayed literally, not honored; `colors: false` still escapes controls. This display policy changes text, not token offsets. It is not comprehensive Unicode-spoofing protection, and has no trusted-input bypass.

## Language catalog and boundaries

All entries are lexical starters. Many identifiers are ASCII-oriented; contextual keywords can overclassify, and compiler/version/dialect semantics are not guaranteed. Most interpolation remains string-colored; JavaScript/Kotlin have expression regions. Plain text and ANSI are rendering modes, not catalog entries.

| Language / canonical ID | Aliases | Distinctive coverage | Important omissions |
| --- | --- | --- | --- |
| ABAP `abap` | — | Column/quote comments, field symbols, string templates | Template expressions, full SQL/ABAP parsing/version semantics |
| Ada `ada` | — | Doubled quotes, characters/attributes, based numbers | Full grammar, aspects/name resolution, numeric validation |
| Apache `apache` | `apacheconf`, `httpd` | Quote-aware containers, directives, line-leading comments | Expressions/rewrite regexes, full macros/directive validation |
| Bash `bash` | `sh`, `shell` | Simple dynamic heredocs, tab-stripped closes, variables | Heredoc header tails are string-colored; no queued heredocs, full quote removal/expansion, nested substitutions; aliases are not certified POSIX sh |
| Batch/CMD `batch` | `bat`, `cmd` | Comments, labels, percent/FOR/delayed expansions, caret escapes | Execution/expansion phases, full quoting/parenthesis context, delayed-expansion state |
| C `c` | — | Directive continuations, headers, prefixed literals | Preprocessing, complete C23 forms, typedef resolution |
| C++ `cpp` | `cxx`, `c++` | Custom raw delimiters, digit separators | Template parsing; raw strings in inherited directive content are limited |
| C# `csharp` | `cs`, `c#` | Verbatim quotes, quote-counted raw strings | Interpolation expressions and full compiler semantics |
| COBOL `cobol` | `cob` | Common fixed/free comment lines, PICTURE clauses | Complete columns/continuations, COPY, embedded SQL/dialects |
| CSS `css` | — | Comments, strings, lexical property/value forms | Full selector/value parsing |
| Dart `dart` | — | Nested comments, raw/triple strings | Interpolation expressions, complete parser/type semantics |
| Delphi `delphi` | — | Object Pascal vocabulary/types on Pascal | Full directives, generics, compiler-version semantics |
| Dockerfile `dockerfile` | `docker` | Instructions, flags, parser directives, continuations | Heredoc bodies, shell/JSON embedding, custom escapes/full continuation context |
| dotenv `dotenv` | `env` | Export/assignments, quotes, comments, variable forms | Loader-specific evaluation, backticks, general shell syntax |
| Go `go` | `golang` | Raw strings, runes, specific numeric forms | Semicolon insertion, Unicode name scanner, type resolution |
| Groovy `groovy` | — | Triple and dollar-slashy strings | General slashy/division disambiguation, GString expressions, AST transforms |
| Haskell `haskell` | `hs` | Nested comments, prime names, constructors/chars | Layout, quasiquotes, promoted names, extension-complete syntax |
| HTML `html` | `htm` | Quote-aware tags/attributes, hard-bounded JS/CSS | Script-type detection, inline attribute embedding; script/style opening tags use one category |
| INI `ini` | `cfg` | Sections, assignments, line-leading comments, untyped values | Dialect-specific inline comments, interpolation/escaping; no universal INI standard |
| Java `java` | — | Text blocks, annotations | Unicode-escape preprocessing, string-template processors |
| JavaScript `javascript` | `js` | Nested template expressions/braces, regex heuristic | Full regex/division disambiguation, JSX, semantic symbols |
| JSON `json` | — | Property/string/number/boolean/null categories | Validation; properties use colon lookahead and malformed strings remain lexical |
| Julia `julia` | `jl` | Nested comments, macro/triple strings, characters | Full macro/interpolation/transpose semantics; raw-macro escaping approximate |
| Kotlin `kotlin` | `kt` | Nested comments, raw strings, recursive interpolation | Full type/parser semantics, experimental multi-dollar interpolation |
| Lua `lua` | — | Equals-counted long strings/comments | Dialect extensions, complete escape validation/parser semantics |
| Markdown `markdown` | `md` | Headings, simple links/emphasis, exact code-span and variable fence runs | Fence-language embedding, nested-container fences, complete CommonMark/link resolution |
| MATLAB `matlab` | — | Block comments, doubled quotes, transpose heuristic | Spaced transpose/string ambiguity, command-form syntax, full Octave |
| nginx `nginx` | — | Same-line directives, blocks, variables, quoted values | Module validation, complete escaped/unquoted argument and regex handling |
| Objective-C `objective-c` | `objc` | At-keywords, NSString literals, runtime words | Message-send resolution, Objective-C++, complete boxed expressions |
| Pascal `pascal` | — | Doubled quotes, character codes, mixed nested comments | Directives/standard conformance; comment nesting varies by dialect |
| Perl `perl` | `pl` | Perl 5 POD/sigils, nested paired quote operators | General heredocs, substitution/transliteration, slash regexes; not Raku |
| PHP `php` | — | Tags, variables, heredoc/nowdoc close lines | HTML embedding, full interpolation/indentation validation |
| PowerShell `powershell` | `ps1` | Nested comments, here-strings, variables/cmdlets | Execution/binding, complete expandable-string expressions/parser |
| Python `python` | `py` | Multiline/prefixed strings | f-string expressions; raw-prefix escape semantics approximate |
| R `r` | — | Raw delimiters, backtick names, infix operators | Full formulas/namespaces/Unicode and semantic classification |
| Ruby `ruby` | `rb` | Documentation, symbols/sigils, nested percent literals | Heredocs, full interpolation, regex/division disambiguation |
| Rust `rust` | `rs` | Nested comments, hash raw strings, lifetimes/chars, macro calls | Complete attributes/token-tree macros/Unicode names/edition conformance |
| Scala `scala` | — | Nested comments, interpolator-prefixed triple strings | Interpolation expressions, complete symbol/quote grammar |
| SSH client `ssh-config` | `sshconfig` | Directives, percent/environment tokens, quotes | sshd_config validation, Match/ProxyCommand execution, full argument semantics |
| SQL `sql` | — | Case-insensitive common keywords/types, function calls, line/block comments, doubled single-quoted strings and double-quoted identifiers | Dialect-specific backticks/brackets/dollar quotes, backslash string escapes, nested comments, procedural grammar and validation |
| Swift `swift` | — | Nested comments, hash/multiline strings, escaped names | Interpolation expressions, regex literals, operator/semantic disambiguation |
| systemd units `systemd` | — | Assignments/sections, percent specifiers, continuations | Directive-version validation, shell parsing, complete multiline/quoting semantics |
| TOML `toml` | — | Dotted/inline keys, tables, multiline strings, timestamps | Document/table resolution, all quote-run/nested-array edge cases |
| TypeScript `typescript` | `ts` | Declarations, builtins, modifiers, decorators, common generics | General type resolution/parser, TSX; uppercase values may be types and lowercase type references missed |
| VBA `vba` | — | Doubled strings, date/hex forms, comments | Office object models, complete directive/version semantics |
| Visual Basic `visual-basic` | `vb`, `vbnet` | Modern VB.NET words, interpolated string prefixes | Interpolation expressions, XML literals, VB6 |
| XML `xml` | — | Tags/attributes, CDATA, processing instructions, DOCTYPE subsets | DTD evaluation, entity expansion, namespace validation, full XML name grammar |
| YAML `yaml` | `yml` | Anchors/tags, scalar indentation/dedents, document markers | Schema validation, complex quoted/explicit keys, full plain-scalar/indentation contexts |
| Zig `zig` | — | Multiline literal lines, builtins, integer-width types | comptime evaluation, complete numeric/version validation |

## Limits and safety

`maxDepth` and `maxSteps` are shared across nested/embedded scans. Registration also bounds include depth. Runtime exhaustion follows the [diagnostic fallback contract](#tokens-and-diagnostics).

Grammars, scanner callbacks, and loader functions are trusted executable JavaScript, not sandboxed data. A regex or callback can block before a budget check; there is no hard deadline, document/token quota, worker isolation, or guaranteed linear-time processing. Audit grammars and bound untrusted/large inputs at the host boundary. No telemetry or implicit remote loading is built in.

Highlighter escaping does not sanitize a whole document. Follow the host [sanitization/CSP policy](../poliSH.md#rendering-policy), especially when preserving ANSI inline styles.

## Maintenance and verification

Run the [README maintenance commands](../poliSH.md#maintenance-and-verification). Default Node tests are self-contained; browser and MeltDown integration checks exercise separate runtime/host contracts. Preserve licenses/notices when importing external material.

Coverage is split by responsibility:

- Node tests cover engine contracts, renderer safety, grammar classification, package exports, and theme CSS/contrast. `tests/polish/stress.test.js` checks 400 deterministic malformed inputs across all 49 grammars (19,600 combinations).
- Playwright checks native ESM/capture indices, classification fixtures, DOM text/escaping, ANSI colors, and standalone/preview theme switching in Chromium, Firefox, and WebKit. These are smoke checks, not certification of every browser/OS.
- The optional MeltDown harness checks all syntax modes plus ANSI, unknown/unlabelled/indented code, guessing/opt-out, nested fences, inline code exclusion, empty blocks, wrapper ownership, and escaping.

Fixtures live in `tests/polish/fixtures/c-family/`, `tests/polish/fixtures/language-examples.js`, and `tests/polish/fixtures/config-examples.js`. Expected classifications are hand-authored, not copied from another highlighter. Shared fixture inputs do not make engine, renderer, browser, and integration assertions interchangeable.

When changing a grammar/engine, preserve checks for exact ranges/categories and reconstruction; Unicode/surrogates, CRLF and trailing whitespace; malformed delimiters; earliest/tie/close precedence; captures; productive/non-productive recursion; scanner failures/bounds; shared budgets; composition/registration isolation; loader cycles/concurrency/retry; escaping and theme fallback/contrast.

## Future work — not implemented

Prioritize representative real-file fixtures, visual/accessibility review in lightmetal, and scanner/pathological-input scaling before adding language breadth. Numeric performance budgets remain undefined. Measure initialization, import cost, warm tokenization, rendering, and malformed/adversarial scaling separately before setting them.
