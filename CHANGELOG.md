# Changelog

## 0.6.0

Includes MaiDEn and MeltDown from the unpublished 0.5.0 snapshot below.

- Added poliSH: an independent syntax highlighter with 49 opt-in languages,
  eleven themes, ANSI rendering, and standalone, minified, ESM, and CSS builds.
  Optional MeltDown/MaiDEn integration replaces highlight.js in examples and tests;
  existing hljs preview classes remain compatible.
- Added shared light/dark/auto theming through `data-lightmetal-theme`, with local
  editor and syntax-palette overrides and no shared runtime.
- Added Table menus to both editors and explicit monospace table formatting in
  MaiDEn. Native history, existing HTML controls, and configurable actions remain.
- Made Tab entry writing-first. Improved HTML field names, toolbar pressed states,
  keyboard-focus indicators, and MaiDEn selection contrast across skins.
- Added default heading IDs and bare HTTP(S) links to MeltDown. Improved heading
  slug handling, URL/emphasis boundaries, and duplicate-heading performance.
- Reduced unnecessary source/preview DOM writes while retaining nodes and native
  typing undo. Fixed toolbar-group refresh and syntax-palette class detection.
- Expanded the four-library showcase, quickstarts, skin galleries, README preview,
  and ANSI playground. Added browser, security, and script-free package checks.
- Kept inline and whole-editor iframe integration, including split view; removed
  the experimental parent-toolbar/child-writing-surface adapter.

## 0.5.0 (unpublished development snapshot)

- Added ligHTMetaL::MaiDEn, the Markdown editor, with styled source, a monospace
  writing area, and shared editor skins. Assets use `maiden.*`; the browser global
  is `maiden`. The package's main entry remains the HTML editor.
- Added the optional ligHTMetaL::MeltDown Markdown parser with standalone and ESM
  builds, raw-HTML escaping by default, and a code-highlighting hook.
- Added local Help, rendered Preview, Side-by-side with linked vertical scrolling,
  and Fullscreen. Preview rendering preserves source editing and native undo.
- Added Markdown heading and formatting commands, list/task/quote editing,
  indentation, configurable shortcuts, image templates and existing-image URL
  selection, and table creation, row/column editing, and alignment controls.
- Added Markdown source statistics and contiguous full-width fenced-code backgrounds.
- Grouped both editors' default toolbars and added horizontal scrolling on narrow
  screens. Explicit action lists retain application-owned order and contents.
- Added Substantial, the seventh optional CSS skin, for both editors.
- Rebuilt the examples around all three libraries, with detail pages, quickstarts,
  separate editor skin galleries, and a landing-page theme switch.
- Added standalone, minified, and ESM builds; configurable Markdown actions;
  `getMarkdown()`, `setMarkdown()`, `insertText()`, and lifecycle callbacks.
- Added browser/package checks for source editing, toolbar commands, selection,
  native history, literal code, safe insertion, and independent instances.
- Added a whole-editor iframe example for application-owned history isolation;
  the core stays inline and its initializer stays synchronous.
- Fixed empty ATX heading recognition in Markdown paint, state, and commands.
- Tightened Markdown fence/backtick boundaries and heading/rule/code-indent
  styling. Added pinned syntax fixtures and source/paint browser regressions.
- Added Setext heading recognition, paragraph-aware code indentation, multiline
  code spans, and multiline emphasis without rewriting source text.
- Added iterative nested `*`/`_` emphasis pairing, Unicode delimiter flanking,
  rule-of-three handling, and ASCII punctuation escapes. The syntax suite now
  covers 318 cases, including deep and unmatched delimiter/bracket runs.
- Added balanced inline link/image recognition, escaped destinations, titles,
  emphasis/code in labels, and bracket-scoped emphasis. Destinations/titles stay
  literal; links/images never navigate or load assets. Cached destination endings
  avoid repeated scans through unfinished links.
- Added nested list/quote recognition and relative code indentation/fences.
  Container edits preserve source characters, node identity, and native undo.
- Added optional Linux WebKit checks and a script-free native undo reproduction.
  Documented that WebKit can share undo across iframe boundaries.
- Fixed high-token Markdown lines throwing during painting. Preserved nested-BR
  newlines in export, selection mapping, and native insertion.
- Indexed whole backtick runs to avoid repeated scans through unmatched code
  delimiters. Inline Code now uses the same closing-run rules as the painter.
- Fixed Horizontal Line turning the preceding paragraph into a Setext heading.
- Reduced built-in command rendering to one synchronous pass and skipped inactive
  editors during selection updates. Kept custom callback refreshes and synchronous
  setter notifications; guarded replacement/destruction from state callbacks.
- Fixed trailing-empty-line paint alignment for native Markdown paste shapes.
- Removed repeated child-node searches from Markdown selection mapping to improve
  editing in long documents.
- Simplified Markdown escape handling and link-title scanning. Removed duplicate
  blank-line checks already enforced by paragraph construction.
- Kept the HTML editor API unchanged. Shared toolbar styles now include grouping
  and horizontal overflow.

## 0.4.0

- Added six optional CSS skins: Bootstrap, Material Classic, Material Outline,
  Frost, Patina, and Sterling. Each supports system, light, and dark modes.
- Build plain and minified skins alongside the unchanged default stylesheet.
- Added a local skin gallery and browser/package checks for skin appearance,
  keyboard focus, Source mode, tables, contrast, and narrow layouts.

## 0.3.0

- Added configurable formatting toolbar and custom actions.
- Added HTML source mode and content access methods.
- Added image insertion by URL, file picker, paste/drop, base64, and upload hook.
- Added table insertion and contextual row/column controls.
- Added system, light, and dark themes.
- Added import/paste sanitization and normal-mode HTML-drop rejection.
- Added link/image URL validation and support for base64 JPEG, PNG, GIF, and
  WebP images in sanitized imports.
- Added `rawMode` to bypass HTML sanitization while retaining insertion URL
  and file checks.
- Added `unrestrictedMode` to bypass HTML, URL, file-type, and file-size checks.
- Applied `images.enabled` to programmatic image insertion and `allowBase64`
  to upload results and sanitized imports.
- Fixed missing-MIME file conversion in standalone and ES module builds.
- Kept paragraph and CSS formatting settings independent between editor instances.
- Prevented deferred formatting from changing other editors or running after destroy.
- Stopped late upload results from scheduling UI updates or image loads after destroy.
- Validated toolbar actions before registering editor listeners.
- Fixed content loss from leading closing tags during HTML import.
- Added per-instance listener cleanup through `destroy()`.
- Included standalone and ES module bundles with separate CSS.
