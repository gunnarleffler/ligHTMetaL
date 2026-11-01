# Performance and retained-DOM review

## Scope

Run the focused diagnostic with:

```sh
NODE_PATH=$(npm root -g) node tests/markdown-performance.js
```

It uses real headless Chromium and Firefox, prebuilt browser assets, and the
optional MeltDown/poliSH preview chain. Checks cover mixed Markdown at about
20 KiB and 200 KiB, native typing/Undo, Bold/Undo, Preview and Side-by-side,
parser/highlighter stress, repeated grow/shrink cycles, and teardown.

This is a local diagnostic, not a controlled benchmark, supported document-size
limit, percentile measurement, or heap-leak test. Action timings include Playwright
round trips and a two-frame rendering boundary. The typing sample contains 13
characters; its total is not a single-keystroke latency measurement. Documents
repeat dense sections with headings, formatting, links, and JavaScript fences.
The inputs contain 20,572 and 204,886 ASCII bytes, not a representative corpus.
Preview follows editing checks; samples are not independent cold-page trials.

## Current findings

Observed local typing totals, rounded to milliseconds:

| Type 13 characters and render | Chromium | Firefox |
| --- | ---: | ---: |
| ~20 KiB | 481 ms | 442 ms |
| ~200 KiB | 3879 ms | 3832 ms |

At ~200 KiB, entering Preview took about 1.1–1.3 seconds and entering Side-by-side
about 1.5–1.9 seconds. Source integrity, native typing/Undo, Bold/Undo, and
preview/split preservation passed in both engines, without page errors.

The source editor traverses and paints the document synchronously and measures
fence geometry. Skipping unchanged token visibility, class, and Text.data writes
avoids unnecessary mutations while preserving node identities. The regular
Markdown suite includes mutation, spare-token revival, identity, and native
Undo/Redo regressions in `tests/markdown-painter.js`. This does not eliminate
full-document traversal or layout work.

## Retained DOM

Four 200 KiB → small-document cycles reached the same warmed counts in both
engines:

- Source paint: 116,459 elements.
- Preview: 28,006 elements.
- Whole editor after shrinking: 144,556 elements.
- Whole editor at the large document: 162,245 elements.

Counts plateau after warmup. Retained paint/preview nodes intentionally follow
the high-water mark to preserve native typing history. Shrinking the source does
not return the editor to a small DOM. The diagnostic counts elements, not Text
nodes, JavaScript caches, detached objects, or heap bytes.

Destroy removes owned descendants from the host; a later setter and window resize
do not recreate them. This does not prove collection of every object or absence
of every listener leak.

## 0.6.0 disposition

The maintainer accepted the focused performance pass. Rare large-document latency
and retained-DOM high-water behavior remain known 0.6.0 limitations, not release
blockers. These observations do not establish a performance guarantee or memory
bound. No document-size cap or numeric performance budget is defined.

Incremental parsing, virtualization, delayed painting, and pool trimming are not
part of this decision. Changes to those behaviors need separate review, including
native history, selection, and layout risks. See [release scope](releasing.md).
