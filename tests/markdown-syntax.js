/* Styled-source fixtures through the built editor, not a parser-only mock. */
const assert = require("node:assert/strict");
const fixtures = require("./fixtures/markdown-syntax.json");
const containers = require("./fixtures/markdown-containers.json");
const emphasis = require("./fixtures/markdown-emphasis.json");
const links = require("./fixtures/markdown-links.json");
const references = require("./fixtures/markdown-references.json");
const html = require("./fixtures/markdown-html.json");
const gfm = require("./fixtures/markdown-gfm.json");
assert.equal(gfm.extensions, "GFM 0.29-gfm (2019-04-06), selected extensions");
for (const part of [containers, emphasis, links, references, html, gfm]) assert.equal(part.standard, fixtures.standard);
const deep = 64, stars = "*".repeat(2048);
const cases = [...fixtures.cases, ...containers.cases, ...emphasis.cases, ...links.cases, ...references.cases, ...html.cases, ...gfm.cases, {
  name: "Deep quote prefixes use iterative tracking, not recursive parsing",
  markdown: "> ".repeat(1024) + "# Deep", headings: [1],
  marker: ["> ".repeat(1024), "# "]
}, {
  name: "Deep emphasis uses iterative delimiter pairing",
  markdown: "*a ".repeat(deep) + "core" + " z*".repeat(deep), headings: [0],
  marker: Array(deep * 2).fill("*"),
  italic: [...Array(deep - 1).fill("a "), "a core z", ...Array(deep - 1).fill(" z")]
}, {
  name: "Long delimiter runs preserve all markers without nested DOM",
  markdown: stars + "metal" + stars, headings: [0], marker: [stars, stars], bold: ["metal"]
}, {
  name: "Unmatched mixed delimiters cannot repeatedly rescan old openers",
  markdown: "a" + "*_ ".repeat(1024) + "z", headings: [0]
}, {
  name: "Every ASCII punctuation escape stays literal",
  markdown: "Escapes: " + [..."!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"].map(char => "\\" + char).join(" "),
  headings: [0]
}, {
  name: "Deep balanced label brackets use iterative tracking",
  markdown: "[".repeat(1024) + "metal" + "]".repeat(1024) + "(local)", headings: [0],
  marker: ["[", "](", ")"], link: ["[".repeat(1023) + "metal" + "]".repeat(1023)], url: ["local"]
}, {
  name: "Nested image descriptions keep paint flat",
  markdown: "![".repeat(deep) + "metal" + "](image)".repeat(deep), headings: [0],
  marker: ["![".repeat(deep), "](", ...Array(deep - 1).fill(")]("), ")"],
  link: ["metal"], url: Array(deep).fill("image")
}, {
  name: "Repeated unfinished destinations cannot rescan old suffixes",
  markdown: "[a](".repeat(1024), headings: [0]
}, {
  name: "Unfinished inline comments cannot rescan every suffix",
  markdown: "body " + "<!-- literal ".repeat(2048), headings: [0]
}, {
  name: "Long HTML attribute lists do not require recursive parsing",
  markdown: "body <x " + "attribute ".repeat(2048) + "> **metal**", headings: [0],
  marker: ["**", "**"], bold: ["metal"]
}, {
  name: "Long unfinished quoted tags stay editable",
  markdown: "body " + '<x title="'.repeat(2048), headings: [0]
}, {
  name: "Deep strike uses the iterative delimiter stack",
  markdown: "~a ".repeat(deep) + "core" + " z~".repeat(deep), headings: [0],
  marker: Array(deep * 2).fill("~"),
  strike: [...Array(deep - 1).fill("a "), "a core z", ...Array(deep - 1).fill(" z")]
}, {
  name: "Unmatched strike openers do not recurse",
  markdown: "~a ".repeat(2048), headings: [0]
}, {
  name: "Wide tables keep cell scans and paint flat",
  markdown: "| a ".repeat(1024) + "|\n" + "|---".repeat(1024) + "|", headings: [0, 0],
  marker: [...Array(1025).fill("|"), "|---".repeat(1024) + "|"]
}, {
  name: "Long unfinished email candidates do not rescan each suffix",
  markdown: "mail.".repeat(8192), headings: [0]
}, {
  name: "Overlapping invalid hosts reuse their domain scan",
  markdown: "www._".repeat(8192) + "bad_name.invalid", headings: [0]
}, {
  name: "Deep unresolved labels need at most one ownership retry",
  markdown: "[".repeat(1024) + " www.example.invalid/x`code`/tail " + "]".repeat(1024), headings: [0],
  link: ["www.example.invalid/x`code`/tail"]
}, {
  name: "Deep destination parentheses do not require recursion",
  markdown: "[metal](" + "a(".repeat(1024) + "z" + ")".repeat(1025), headings: [0],
  marker: ["[", "](", ")"], link: ["metal"], url: ["a(".repeat(1024) + "z" + ")".repeat(1024)]
}];

// Repeat mapping/layout risks, not every syntax permutation. Names make this
// deliberate coverage: fixture renames fail here instead of silently dropping it.
const representativeNames = [
  "ATX closing markers and empty content",
  "Setext headings preserve Unicode and trailing lines",
  "Setext applies to the whole preceding paragraph",
  "Empty and trailing lines remain source",
  "An unclosed fence stays literal through trailing empty lines",
  "Multiline code keeps source spaces instead of renderer normalization",
  "Thematic indentation and mixed space-tab code indentation",
  "A partially consumed indentation tab stays one source character",
  "Tab list padding sets the continuation column",
  "Quoted headings and inline emphasis",
  "A multiline Setext heading inside a list",
  "Fenced code in a list in a quote",
  "Code spans cross lazy quote continuations",
  "Combined emphasis inside a quoted list",
  "Hard-break backslashes stay visible inside emphasis",
  "Soft lines are permitted in labels and titles",
  "Typed dangerous URLs remain inert source",
  "Multiline definition destination and title",
  "HTML attributes support a soft line ending",
  "Raw blocks accept a different case-insensitive closing tag",
  "Two-column table with inline formatting",
  "Task marker tabs remain source tabs",
  "Mailto and XMPP source protocols"
];
const byName = new Map(cases.map(fixture => [fixture.name, fixture]));
assert.equal(byName.size, cases.length, "Syntax fixture names must be unique");
const representative = representativeNames.map(name => {
  assert.ok(byName.has(name), `Missing representative syntax fixture: ${name}`);
  return byName.get(name);
});

function syntaxMatrix(exhaustive = false) {
  const matrix = [];
  for (const width of [1200, 390]) for (const shape of ["blocks", "lf", "br"]) {
    matrix.push({ width, shape, fixtures: exhaustive || (width === 1200 && shape === "blocks") ? cases : representative });
  }
  return matrix;
}

async function runSyntaxFixtures(page, name, { exhaustive = false } = {}) {
  const started = performance.now(), matrix = syntaxMatrix(exhaustive);
  const failures = [];
  const viewport = page.viewportSize();
  console.log(`${name}: syntax ${exhaustive ? "exhaustive" : "layered"} matrix (${matrix.reduce((sum, layer) => sum + layer.fixtures.length, 0)} configurations): running`);
  for (const { width, shape, fixtures: selected } of matrix) {
    const layerStarted = performance.now(), before = failures.length;
    await page.setViewportSize({ width, height: 900 });
    for (const fixture of selected) {
      const actual = await page.evaluate(({ markdown, shape }) => {
        const api = window.__markdownEditor, source = api.content;
        api.setMarkdown(markdown);
        const changes = window.__markdownChanges.length;
        // Model native multiline paste shapes. Only tests change source DOM;
        // the production painter must leave these nodes and characters alone.
        if (shape !== "blocks") {
          const block = document.createElement("div");
          const lines = shape === "lf" ? [markdown] : markdown.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (i) block.append(document.createElement("br"));
            const span = document.createElement("span");
            span.append(document.createTextNode(lines[i])); block.append(span);
          }
          block.append(document.createElement("br"));
          source.replaceChildren(block);
        }
        function nodes() {
          const walker = document.createTreeWalker(source, NodeFilter.SHOW_ALL), result = [];
          while (walker.nextNode()) result.push(walker.currentNode);
          return result;
        }
        const before = nodes(), values = before.map(node => node.nodeValue);
        source.dispatchEvent(new Event("input", { bubbles: true }));
        source.dispatchEvent(new Event("input", { bubbles: true }));
        const after = nodes(), paint = source.previousElementSibling;
        function paintText(block) {
          return [...block.children].filter(node => !node.hidden).map(wrapper => {
            const [child, inline] = wrapper.children;
            return child.hidden ? [...inline.children].filter(node => !node.hidden).map(node => node.textContent).join("") : paintText(child);
          }).join("\n");
        }
        const result = {
          markdown: api.getMarkdown(), paint: paintText(paint),
          changes: window.__markdownChanges.length - changes,
          unchanged: before.length === after.length && before.every((node, i) => node === after[i] && node.nodeValue === values[i]),
          headings: [...source.children].map(node => Number(node.dataset.mdHeading || 0)),
          active: source.querySelectorAll("a,img,iframe,svg,script,style,input,table").length + paint.querySelectorAll("a,img,iframe,svg,script,style,input,table").length,
          geometry: [...source.children].map((node, i) => {
            const target = [...paint.children].filter(node => !node.hidden)[i].firstElementChild;
            const a = node.getBoundingClientRect(), b = target.getBoundingClientRect();
            return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height));
          })
        };
        for (const style of ["marker", "code", "bold", "italic", "strike", "link", "url"]) {
          result[style] = [...paint.querySelectorAll(".lightmarkdown-" + style)].filter(node => !node.closest("[hidden]")).map(node => node.textContent);
        }
        return result;
      }, { markdown: fixture.markdown, shape });
      const label = `${fixture.name} (${width}px/${shape})`;
      try {
        assert.equal(actual.markdown, fixture.markdown, label + ": source");
        assert.equal(actual.paint, fixture.markdown, label + ": painted text");
        assert.equal(actual.changes, 0, label + ": style-only repaint must not notify");
        assert.equal(actual.unchanged, true, label + ": painter must not rewrite source nodes/text");
        assert.equal(actual.active, 0, label + ": source must not create active HTML");
        assert.ok(actual.geometry.every(delta => delta < 1), label + ": geometry " + actual.geometry);
        // One native block cannot vary heading size across its BR/LF lines.
        const levels = shape === "blocks" || !fixture.markdown.includes("\n") ? fixture.headings : [0];
        assert.deepEqual(actual.headings, levels, label + ": heading sizes");
        for (const style of ["marker", "code", "bold", "italic", "strike", "link", "url"]) assert.deepEqual(actual[style], fixture[style] || [], label + ": " + style);
      } catch (error) { failures.push(error.message); }
    }
    console.log(`${name}: syntax ${width}px/${shape}, ${selected.length} cases: ${failures.length === before ? "ok" : "FAILED"} (${((performance.now() - layerStarted) / 1000).toFixed(1)}s)`);
  }
  await page.setViewportSize(viewport);
  assert.deepEqual(failures, [], failures.join("\n"));
  // Nested empty native blocks still occupy logical lines in the paint plan.
  const nested = await page.evaluate(() => {
    const api = __markdownEditor;
    api.setMarkdown("Title\n=\n\n## Later\nbody");
    const changes = __markdownChanges.length;
    api.content.innerHTML = "<div><div>Title</div><div>=</div><div></div></div><p>## Later</p>body";
    const title = api.content.firstChild.firstChild.firstChild;
    api.content.dispatchEvent(new Event("input", { bubbles: true }));
    const levels = node => [...node.querySelectorAll("[data-md-heading]")].filter(node => !node.closest("[hidden]")).map(node => Number(node.dataset.mdHeading));
    return { text: api.getMarkdown(), source: levels(api.content), paint: levels(api.content.previousElementSibling),
      same: title === api.content.firstChild.firstChild.firstChild, changes: __markdownChanges.length - changes };
  });
  assert.deepEqual(nested, { text: "Title\n=\n\n## Later\nbody", source: [1, 2], paint: [1, 2], same: true, changes: 0 });

  // Keep long separators intact, with or without a valid closing hash run.
  for (const suffix of ["", "###", "###x"]) {
    const text = "# title" + " ".repeat(8192) + suffix;
    const actual = await page.evaluate(text => {
      __markdownEditor.setMarkdown(text);
      return { text: __markdownEditor.getMarkdown(), markers: [...document.querySelectorAll(".lightmarkdown-paint .lightmarkdown-marker")]
        .filter(node => !node.closest("[hidden]")).map(node => node.textContent.length) };
    }, text);
    assert.equal(actual.text, text);
    assert.deepEqual(actual.markers, suffix === "###" ? [2, 8195] : [2]);
  }

  // Closing a fence changes later styling, not later source nodes or history.
  const original = "````\n# literal\n```\n## after";
  await page.evaluate(text => {
    const api = window.__markdownEditor; api.setMarkdown(text);
    window.__syntaxFollowingNode = api.content.children[3].firstChild;
    const range = document.createRange(), node = api.content.children[2].firstChild;
    range.setStart(node, node.length); range.collapse(true); api.content.focus();
    getSelection().removeAllRanges(); getSelection().addRange(range);
  }, original);
  await page.keyboard.type("`");
  const state = () => page.evaluate(() => ({
    text: __markdownEditor.getMarkdown(),
    level: Number(__markdownEditor.content.children[3].dataset.mdHeading || 0),
    node: __syntaxFollowingNode === __markdownEditor.content.children[3].firstChild
  }));
  const changed = original.replace("\n```\n", "\n````\n");
  assert.deepEqual(await state(), { text: changed, level: 2, node: true });
  await page.keyboard.press("Control+z");
  assert.deepEqual(await state(), { text: original, level: 0, node: true });
  await page.keyboard.press("Control+Shift+z");
  assert.deepEqual(await state(), { text: changed, level: 2, node: true });
  await page.evaluate(() => {
    const api = __markdownEditor; api.setMarkdown("Title\n");
    window.__setextTitle = api.content.firstChild.firstChild;
    const range = document.createRange(); range.selectNodeContents(api.content.children[1]); range.collapse(true);
    api.content.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  await page.keyboard.type("---");
  const setextState = () => page.evaluate(() => ({ text: __markdownEditor.getMarkdown(),
    level: Number(__markdownEditor.content.firstChild.dataset.mdHeading || 0),
    node: __setextTitle === __markdownEditor.content.firstChild.firstChild }));
  assert.deepEqual(await setextState(), { text: "Title\n---", level: 2, node: true });
  await page.keyboard.press("Control+z");
  assert.deepEqual(await setextState(), { text: "Title\n", level: 0, node: true });
  await page.keyboard.press("Control+Shift+z");
  assert.deepEqual(await setextState(), { text: "Title\n---", level: 2, node: true });
  // Container prefixes control block scope, but changing them stays one native
  // edit. Neither repaint nor history may replace an untouched following node.
  for (const edit of [{
    text: "> ```\n> **literal**\n> ``\n> ## after", line: 2, start: 4, end: 4, type: "`",
    changed: "> ```\n> **literal**\n> ```\n> ## after", before: 0, after: 2,
    codeBefore: ["**literal**", "``", "## after"], codeAfter: ["**literal**"]
  }, {
    text: "- ```\n  **literal**\n  ```\n  ## after", line: 1, start: 0, end: 2,
    changed: "- ```\n**literal**\n  ```\n  ## after", before: 2, after: 0,
    codeBefore: ["**literal**"], codeAfter: ["  ## after"]
  }]) {
    await page.evaluate(edit => {
      const api = __markdownEditor; api.setMarkdown(edit.text);
      window.__containerFollowingNode = api.content.children[3].firstChild;
      const range = document.createRange(), node = api.content.children[edit.line].firstChild;
      range.setStart(node, edit.start); range.setEnd(node, edit.end); api.content.focus();
      getSelection().removeAllRanges(); getSelection().addRange(range);
    }, edit);
    const state = () => page.evaluate(() => ({ text: __markdownEditor.getMarkdown(),
      level: Number(__markdownEditor.content.children[3].dataset.mdHeading || 0),
      same: __containerFollowingNode === __markdownEditor.content.children[3].firstChild,
      code: [...__markdownEditor.content.previousElementSibling.querySelectorAll(".lightmarkdown-code")]
        .filter(node => !node.closest("[hidden]")).map(node => node.textContent) }));
    const before = { text: edit.text, level: edit.before, same: true, code: edit.codeBefore };
    const after = { text: edit.changed, level: edit.after, same: true, code: edit.codeAfter };
    assert.deepEqual(await state(), before);
    if (edit.type) await page.keyboard.type(edit.type);
    else await page.keyboard.press("Backspace");
    assert.deepEqual(await state(), after);
    await page.keyboard.press("Control+z");
    assert.deepEqual(await state(), before);
    await page.keyboard.press("Control+Shift+z");
    assert.deepEqual(await state(), after);
  }
  // Repainting different delimiter matches must not split a typing group.
  for (const edit of [{
    text: "***metal*\n\nuntouched", changed: "***metal***\n\nuntouched", at: "end", type: "**",
    before: { bold: [], italic: ["metal"] }, after: { bold: ["metal"], italic: ["metal"] }
  }, {
    text: "***metal***\n\nuntouched", changed: "\\***metal***\n\nuntouched", at: 0, type: "\\",
    before: { bold: ["metal"], italic: ["metal"] }, after: { bold: ["metal"], italic: [] }
  }]) {
    await page.evaluate(edit => {
      const api = __markdownEditor; api.setMarkdown(edit.text);
      window.__inlineFollowingNode = api.content.children[2].firstChild;
      const node = api.content.firstChild.firstChild, range = document.createRange();
      range.setStart(node, edit.at === "end" ? node.length : edit.at); range.collapse(true);
      api.content.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
    }, edit);
    const state = () => page.evaluate(() => {
      const api = __markdownEditor, paint = api.content.previousElementSibling;
      const styled = name => [...paint.querySelectorAll(".lightmarkdown-" + name)]
        .filter(node => !node.closest("[hidden]")).map(node => node.textContent);
      return { text: api.getMarkdown(), same: __inlineFollowingNode === api.content.children[2].firstChild,
        bold: styled("bold"), italic: styled("italic") };
    });
    const before = { text: edit.text, same: true, ...edit.before };
    const after = { text: edit.changed, same: true, ...edit.after };
    assert.deepEqual(await state(), before);
    await page.keyboard.type(edit.type);
    assert.deepEqual(await state(), after);
    await page.keyboard.press("Control+z");
    assert.deepEqual(await state(), before);
    await page.keyboard.press("Control+Shift+z");
    assert.deepEqual(await state(), after);
  }
  // Completing or escaping a link changes paint, not the following source node
  // or the browser's native edit group.
  for (const edit of [{
    text: "[**metal**\n\nuntouched", changed: "[**metal**](local)\n\nuntouched", at: "end", type: "](local)",
    before: { link: [], url: [] }, after: { link: ["metal"], url: ["local"] }
  }, {
    text: "[metal](local)\n\nuntouched", changed: "\\[metal](local)\n\nuntouched", at: 0, type: "\\",
    before: { link: ["metal"], url: ["local"] }, after: { link: [], url: [] }
  }, {
    text: "[metal]: /local\n\n[metalx]", changed: "[metalx]: /local\n\n[metalx]", at: 6, type: "x",
    before: { link: [], url: ["/local"] }, after: { link: ["metalx"], url: ["/local"] }
  }, {
    text: "[metal]: /local\n\n[metal]", changed: "\\[metal]: /local\n\n[metal]", at: 0, type: "\\",
    before: { link: ["metal"], url: ["/local"] }, after: { link: [], url: [] }
  }]) {
    await page.evaluate(edit => {
      const api = __markdownEditor; api.setMarkdown(edit.text);
      window.__linkFollowingNode = api.content.children[2].firstChild;
      const node = api.content.firstChild.firstChild, range = document.createRange();
      range.setStart(node, edit.at === "end" ? node.length : edit.at); range.collapse(true);
      api.content.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
    }, edit);
    const state = () => page.evaluate(() => {
      const api = __markdownEditor, paint = api.content.previousElementSibling;
      const styled = name => [...paint.querySelectorAll(".lightmarkdown-" + name)]
        .filter(node => !node.closest("[hidden]")).map(node => node.textContent);
      return { text: api.getMarkdown(), same: __linkFollowingNode === api.content.children[2].firstChild,
        link: styled("link"), url: styled("url") };
    });
    const before = { text: edit.text, same: true, ...edit.before };
    const after = { text: edit.changed, same: true, ...edit.after };
    assert.deepEqual(await state(), before);
    await page.keyboard.type(edit.type);
    assert.deepEqual(await state(), after);
    await page.keyboard.press("Control+z"); assert.deepEqual(await state(), before);
    await page.keyboard.press("Control+Shift+z"); assert.deepEqual(await state(), after);
  }
  // Completing inert HTML/autolinks must keep native edit groups and callbacks.
  for (const edit of [{
    text: "<!--\n**literal**\n--\n**after**\n\nuntouched", line: 2, type: ">",
    changed: "<!--\n**literal**\n-->\n**after**\n\nuntouched",
    before: { bold: [], link: [] }, after: { bold: ["after"], link: [] }
  }, {
    text: "<https://example.invalid\n\nuntouched", line: 0, type: ">",
    changed: "<https://example.invalid>\n\nuntouched",
    before: { bold: [], link: [] }, after: { bold: [], link: ["https://example.invalid"] }
  }, {
    text: 'body <x title="**literal**"\n\nuntouched', line: 0, type: ">",
    changed: 'body <x title="**literal**">\n\nuntouched',
    before: { bold: ["literal"], link: [] }, after: { bold: [], link: [] }
  }]) {
    const changes = await page.evaluate(edit => {
      const api = __markdownEditor; api.setMarkdown(edit.text);
      window.__htmlFollowingNode = api.content.lastChild.firstChild;
      const node = api.content.children[edit.line].firstChild, range = document.createRange();
      range.setStart(node, node.length); range.collapse(true);
      api.content.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
      return __markdownChanges.length;
    }, edit);
    const state = () => page.evaluate(() => {
      const api = __markdownEditor, paint = api.content.previousElementSibling;
      const styled = name => [...paint.querySelectorAll(".lightmarkdown-" + name)]
        .filter(node => !node.closest("[hidden]")).map(node => node.textContent);
      return { text: api.getMarkdown(), same: __htmlFollowingNode === api.content.lastChild.firstChild,
        bold: styled("bold"), link: styled("link"), changes: __markdownChanges.length };
    });
    assert.deepEqual(await state(), { text: edit.text, same: true, ...edit.before, changes });
    await page.keyboard.type(edit.type);
    assert.deepEqual(await state(), { text: edit.changed, same: true, ...edit.after, changes: changes + 1 });
    await page.keyboard.press("Control+z");
    assert.deepEqual(await state(), { text: edit.text, same: true, ...edit.before, changes: changes + 2 });
    await page.keyboard.press("Control+Shift+z");
    assert.deepEqual(await state(), { text: edit.changed, same: true, ...edit.after, changes: changes + 3 });
  }
  for (const edit of [{
    text: "~metal\n\nuntouched", line: 0, type: "~", changed: "~metal~\n\nuntouched",
    before: { marker: [], strike: [], link: [], bold: [] },
    after: { marker: ["~", "~"], strike: ["metal"], link: [], bold: [] }
  }, {
    text: "- [ ]metal\n\nuntouched", line: 0, start: 5, type: " ", changed: "- [ ] metal\n\nuntouched",
    before: { marker: ["- "], strike: [], link: [], bold: [] },
    after: { marker: ["- ", "[ ]"], strike: [], link: [], bold: [] }
  }, {
    text: "| **metal** |\n| -x |\n\nuntouched", line: 1, start: 3, end: 4, type: "-",
    changed: "| **metal** |\n| -- |\n\nuntouched",
    before: { marker: ["**", "**"], strike: [], link: [], bold: ["metal"] },
    after: { marker: ["|", "**", "**", "|", "| -- |"], strike: [], link: [], bold: ["metal"] }
  }, {
    text: "https:/example.invalid\n\nuntouched", line: 0, start: 7, type: "/",
    changed: "https://example.invalid\n\nuntouched",
    before: { marker: [], strike: [], link: [], bold: [] },
    after: { marker: [], strike: [], link: ["https://example.invalid"], bold: [] }
  }, {
    text: "[ www.example.invalid/x`code`/tail ]\n\nuntouched", line: 0, type: "(local)",
    changed: "[ www.example.invalid/x`code`/tail ](local)\n\nuntouched",
    before: { marker: [], strike: [], link: ["www.example.invalid/x`code`/tail"], bold: [] },
    after: { marker: ["[", "`", "`", "](", ")"], strike: [],
      link: [" www.example.invalid/x", "code", "/tail "], bold: [], code: ["code"], url: ["local"] }
  }]) {
    const changes = await page.evaluate(edit => {
      const api = __markdownEditor; api.setMarkdown(edit.text);
      window.__gfmFollowingNode = api.content.lastChild.firstChild;
      const node = api.content.children[edit.line].firstChild, range = document.createRange();
      const start = edit.start ?? node.length;
      range.setStart(node, start); range.setEnd(node, edit.end ?? start);
      api.content.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
      return __markdownChanges.length;
    }, edit);
    const state = () => page.evaluate(() => {
      const api = __markdownEditor, paint = api.content.previousElementSibling;
      const styled = name => [...paint.querySelectorAll(".lightmarkdown-" + name)]
        .filter(node => !node.closest("[hidden]")).map(node => node.textContent);
      return { text: api.getMarkdown(), same: __gfmFollowingNode === api.content.lastChild.firstChild,
        marker: styled("marker"), strike: styled("strike"), link: styled("link"), bold: styled("bold"),
        code: styled("code"), url: styled("url"), changes: __markdownChanges.length };
    });
    const before = { text: edit.text, same: true, code: [], url: [], ...edit.before };
    const after = { text: edit.changed, same: true, code: [], url: [], ...edit.after };
    assert.deepEqual(await state(), { ...before, changes });
    await page.keyboard.type(edit.type);
    const typed = changes + edit.type.length;
    assert.deepEqual(await state(), { ...after, changes: typed });
    await page.keyboard.press("Control+z");
    assert.deepEqual(await state(), { ...before, changes: typed + 1 });
    await page.keyboard.press("Control+Shift+z");
    assert.deepEqual(await state(), { ...after, changes: typed + 2 });
  }
  console.log(`${name}: all ${cases.length} syntax fixtures (${fixtures.standard}), ${exhaustive ? "full" : representative.length + "-case representative"} desktop/mobile block/LF/BR matrix, source/paint/callback invariants and native-edit undo/redo: ok (${((performance.now() - started) / 1000).toFixed(1)}s)`);
}

module.exports = { runSyntaxFixtures, syntaxMatrix };
