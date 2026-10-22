/* Horizontal-rule boundaries and optional toolbar separators, in real browsers. */
const assert = require("node:assert/strict");

async function ruleChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [], remote = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(base + "/")) remote.push(request.url()); });
  try {
    await page.goto(base + "/tests/fixtures/markdown.html");
    await page.waitForFunction(() => window.__markdownEditor);
    const source = page.locator(".lightmarkdown-input");
    const toolbar = page.getByRole("group", { name: "Markdown formatting" });
    const rule = toolbar.getByRole("button", { name: "Horizontal Line", exact: true });
    const get = () => page.evaluate(() => __markdownEditor.getMarkdown());
    const count = () => page.evaluate(() => __markdownChanges.length - __ruleBefore);
    const prepare = (text, start, end = start, shape = "blocks") => page.evaluate(({ text, start, end, shape }) => {
      const api = __markdownEditor; api.setMarkdown(text);
      const source = api.content;
      if (shape !== "blocks") {
        const block = document.createElement("div");
        if (shape === "lf") block.append(document.createTextNode(text));
        else text.split("\n").forEach((line, index) => {
          if (index) block.append(document.createElement("br"));
          const span = document.createElement("span"); span.append(document.createTextNode(line)); block.append(span);
        });
        block.append(document.createElement("br")); source.replaceChildren(block);
        source.dispatchEvent(new Event("input", { bubbles: true }));
      }
      function point(position) {
        if (shape === "lf") return [source.firstChild.firstChild, position];
        const before = text.slice(0, position).split("\n"), line = before.length - 1, column = before[line].length;
        const node = shape === "br" ? source.querySelectorAll("span")[line].firstChild : source.children[line].firstChild;
        return node.nodeName === "BR" ? [node.parentNode, 0] : [node, column];
      }
      const range = document.createRange(); range.setStart(...point(start)); range.setEnd(...point(end));
      source.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
      source.dispatchEvent(new Event("focus")); window.__ruleBefore = __markdownChanges.length;
    }, { text, start, end, shape });
    const cases = [
      ["", 0, 0, "---\n\n"],
      ["metal", 0, 0, "---\n\nmetal"],
      ["metal", 2, 2, "me\n\n---\n\ntal"],
      ["metal", 5, 5, "metal\n\n---\n\n"],
      ["Title\nbody", 6, 6, "Title\n\n---\n\nbody"],
      ["Title\n \nbody", 8, 8, "Title\n \n---\n\nbody"],
      ["Title\n \n  body", 10, 10, "Title\n \n  ---\n\nbody"],
      ["one\ntwo\nlast", 0, 8, "---\n\nlast"],
      ["one\n\ntwo", 0, 8, "---\n\n"],
      ["Title\n-----", 0, 11, "---\n\n"],
      ["🦊 café", 0, 2, "---\n\n café"],
      ["\u00a0metal", 1, 1, "\u00a0\n\n---\n\nmetal"],
      ["\ufeffmetal", 1, 1, "\ufeff\n\n---\n\nmetal"],
      ["> metal", 4, 4, "> me\n> \n> ---\n> \n> tal"],
      [">metal", 1, 1, ">---\n> \n> metal"],
      [">\tmetal", 2, 2, ">\t---\n> \n> metal"],
      ["> first\n> second", 10, 10, "> first\n> \n> ---\n> \n> second"],
      ["> first\nsecond", 8, 8, "> first\n> \n> ---\n> \n> second"],
      ["> one\n> two\n> last", 2, 12, "> ---\n> \n> last", 11],
      ["- metal", 4, 4, "- me\n  \n  ---\n  \n  tal"],
      ["- metal", 2, 2, "- \n  ---\n  \n  metal"],
      ["- metal", 2, 7, "- \n  ---\n  \n  "],
      ["-", 1, 1, "-\n  ---\n  \n  "],
      ["-\tmetal", 2, 2, "-\t\n    ---\n    \n    metal"],
      ["12) metal", 6, 6, "12) me\n    \n    ---\n    \n    tal"],
      ["> - metal", 6, 6, "> - me\n>   \n>   ---\n>   \n>   tal"],
      ["- [X] metal", 8, 8, "- [X] me\n  \n  ---\n  \n  tal"],
      ["- first\nsecond", 8, 8, "- first\n  \n  ---\n  \n  second"],
      ["- first\n  second\n- untouched", 12, 12, "- first\n  se\n  \n  ---\n  \n  cond\n- untouched"],
      ["`metal`", 0, 7, "---\n\n"],
      ["before\n\nuntouched", 3, 3, "bef\n\n---\n\nore\n\nuntouched"]
    ];
    for (const shape of ["blocks", "lf", "br"]) for (const [text, start, end, expected, typedAt] of cases) {
      await prepare(text, start, end, shape);
      const label = `${name}/${shape}: ${JSON.stringify(text)} at ${start}:${end}`;
      assert.equal(await rule.isEnabled(), true, label + ": enabled");
      await rule.click(); assert.equal(await get(), expected, label);
      assert.equal(await count(), 1, label + ": one change");
      assert.equal(await page.evaluate(() => getSelection().isCollapsed && __markdownEditor.content.contains(getSelection().anchorNode)), true);
      assert.equal(await source.locator('[data-md-heading="2"]').count(), 0, label + ": no accidental Setext");
      await page.keyboard.insertText("TYPE");
      // The restored caret sits before the surviving suffix, inside the same container.
      const caret = typedAt ?? expected.length - text.slice(end).length;
      assert.equal(await get(), expected.slice(0, caret) + "TYPE" + expected.slice(caret), label + ": caret");
      await page.keyboard.press("Control+z"); assert.equal(await get(), expected, label + ": undo typing");
      await page.keyboard.press("Control+z"); assert.equal(await get(), text, label + ": undo rule");
      await page.keyboard.press("Control+Shift+z"); assert.equal(await get(), expected, label + ": redo");
    }
    for (const [text, start, end = start] of [
      ["```\nliteral\n```", 8], ["~~~\nliteral\n~~~", 0], ["```\nliteral\n```", 0, 15],
      ["    literal", 7], ["text\n    continuation", 12], ["<div>\nliteral\n</div>", 9],
      ["text\n\n```\nliteral\n```", 0, 21], ["`literal`", 4], ["`literal`", 1, 5],
      ["[metal](https://example.com)", 15], ["left <b>bold</b> right", 7],
      ["<https://example.com>", 8], ["[label]: /path", 10],
      ["> metal", 1], ["- metal", 0, 7], ["- [X] metal", 4],
      ["- one\n- two", 2, 11], ["> one\n\nplain", 2, 12], ["> one\n> > two", 2, 13]
    ]) {
      await prepare(text, start, end);
      assert.equal(await rule.isDisabled(), true, `${name}: protected ${JSON.stringify(text)}`);
      await rule.evaluate(button => button.click()); assert.equal(await get(), text); assert.equal(await count(), 0);
    }
    await prepare("", 0); await rule.click(); await rule.click();
    assert.equal(await get(), "---\n\n---\n\n"); assert.equal(await count(), 2);
    assert.equal(await rule.getAttribute("aria-pressed"), null);
    await page.keyboard.press("Control+z"); assert.equal(await get(), "---\n\n");
    await page.keyboard.press("Control+z"); assert.equal(await get(), "");
    await prepare("> metal", 4); await rule.focus(); await page.keyboard.press("Enter");
    assert.equal(await get(), "> me\n> \n> ---\n> \n> tal"); assert.equal(await count(), 1);
    // A locally eligible move can still lose an unselected lazy continuation.
    await prepare("> first\nlazy", 7);
    assert.equal(await rule.isEnabled(), true); await rule.click();
    assert.equal(await get(), "> first\nlazy"); assert.equal(await count(), 0);
    assert.match(await page.getByRole("status").textContent(), /surrounding Markdown/);
    await prepare("metal\n\nuntouched", 2);
    await page.evaluate(() => { window.__ruleTail = __markdownEditor.content.lastChild; });
    await rule.click(); assert.equal(await page.evaluate(() => __ruleTail === __markdownEditor.content.lastChild), true);
    await prepare("metal", 2); await source.dispatchEvent("compositionstart");
    assert.equal(await rule.isDisabled(), true); await rule.evaluate(button => button.click());
    assert.equal(await get(), "metal"); assert.equal(await count(), 0); await source.dispatchEvent("compositionend");

    // Configuration trims separators without changing default buttons or custom callbacks.
    assert.equal(await toolbar.getByRole("button").count(), 19);
    assert.equal(await toolbar.getByRole("separator").count(), 6);
    const lifecycle = await page.evaluate(() => {
      const host = document.createElement("div"), owned = document.createElement("p"); owned.textContent = "Application child";
      host.append(owned); document.body.append(host);
      let invalid = false;
      try { __initMarkdown({ element: host, actions: ["bold", "|", "not-real"] }); } catch (error) { invalid = error instanceof TypeError; }
      const untouched = host.childNodes.length === 1 && !host.className;
      const api = __initMarkdown({ element: host, actions: ["|", "|", "bold", "|", "|", "italic", "|", "line", "|", "|"] });
      window.__separatorEditor = api;
      const bar = host.querySelector('[role="group"]'); bar.id = "separator-toolbar";
      const order = [...bar.children].filter(node => !node.hidden).map(node => node.getAttribute("role") === "separator" ? "|" : node.getAttribute("aria-label"));
      api.destroy();
      const preserved = host.childNodes.length === 1 && host.firstChild === owned && !host.className;
      for (const actions of [[], ["|"], ["|", "|"]]) {
        const empty = __initMarkdown({ element: host, actions });
        if (!host.querySelector('[role="group"]').hidden || host.querySelector('[role="separator"]')) throw new Error("Empty toolbar visible");
        empty.destroy();
      }
      host.remove(); return { invalid, untouched, order, preserved };
    });
    assert.deepEqual(lifecycle, { invalid: true, untouched: true, order: ["Bold", "|", "Italic", "|", "Horizontal Line"], preserved: true });
    await page.evaluate(() => {
      __markdownEditor.destroy(); window.__separatorCalls = 0;
      window.__markdownEditor = __initMarkdown({ element: document.getElementById("editor"),
        actions: ["bold", "|", "italic", "|", { name: "line", result: () => __separatorCalls++, state: () => true }, "|", { name: "|", title: "Custom pipe", result: () => __separatorCalls++ }],
        onChange: value => __markdownChanges.push(value) });
    });
    const separators = toolbar.getByRole("separator");
    assert.equal(await separators.count(), 3);
    for (const node of await separators.all()) {
      assert.equal(await node.getAttribute("aria-orientation"), "vertical");
      assert.equal(await node.getAttribute("tabindex"), null);
      assert.equal(await node.evaluate(node => node.tabIndex), -1);
      const box = await node.boundingBox(); assert.ok(box.width > 0 && box.height > 0);
    }
    await toolbar.getByRole("button", { name: "Bold", exact: true }).focus(); await page.keyboard.press("Tab");
    assert.equal(await toolbar.getByRole("button", { name: "Italic", exact: true }).evaluate(node => node === document.activeElement), true);
    await page.keyboard.press("Shift+Tab");
    assert.equal(await toolbar.getByRole("button", { name: "Bold", exact: true }).evaluate(node => node === document.activeElement), true);
    await prepare("metal", 0, 5); await page.keyboard.press("Control+b"); assert.equal(await get(), "**metal**");
    await prepare("```\nliteral\n```", 8);
    assert.equal(await rule.isEnabled(), true); await rule.click();
    await toolbar.getByRole("button", { name: "Custom pipe", exact: true }).click();
    assert.equal(await page.evaluate(() => __separatorCalls), 2); assert.equal(await count(), 0);
    assert.equal(await rule.getAttribute("aria-pressed"), "true");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await toolbar.evaluate(node => node.scrollWidth <= node.clientWidth), true);
    const scrolling = await page.evaluate(() => {
      const host = document.createElement("div"); document.body.append(host);
      const api = __initMarkdown({ element: host, actions: ["bold", "italic", "strikethrough", "|", "heading1", "heading2", "paragraph", "|", "quote", "ulist", "olist", "|", "code", "codeblock", "line", "link", "|", "undo", "redo"] });
      const bar = host.querySelector('[role="group"]'), rect = bar.getBoundingClientRect();
      const rows = new Set([...bar.querySelectorAll("button")].map(node => node.offsetTop)).size;
      const contained = [...bar.querySelectorAll('[role="separator"]')].every(node => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.left >= rect.left && box.right <= rect.left + bar.scrollWidth;
      });
      const overflow = bar.scrollWidth > bar.clientWidth;
      api.destroy(); host.remove(); return { rows, contained, overflow };
    });
    assert.equal(scrolling.rows, 1); assert.equal(scrolling.contained, true); assert.equal(scrolling.overflow, true);
    assert.deepEqual(errors, []); assert.deepEqual(remote, []);
    console.log(`${name}: rules, literal/container guards, native history, caret/callbacks and optional accessible separators: ok`);
  } finally { await page.close(); }
}
module.exports = { ruleChecks };
if (require.main === module) (async () => {
  const { chromium, firefox } = require("playwright");
  const { pathToFileURL } = require("node:url");
  const path = require("node:path");
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch();
    try { await ruleChecks(browser, pathToFileURL(path.resolve(__dirname, "..")).href, name); }
    finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
