/* Whole-table column edits keep raw cells and browser-owned history. */
const assert = require("node:assert/strict");
const table = "| A | B |\n| :--- | ---: |\n| one | two |", added = "| A | Column | B |\n| :--- | --- | ---: |\n| one |  | two |";

async function tableColumnChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [], requests = []; let monitor = false;
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (monitor) requests.push(request.url()); });
  try {
    await page.goto(base + "/tests/fixtures/markdown.html"); await page.waitForFunction(() => window.__markdownEditor);
    const bar = page.getByRole("group", { name: "Markdown formatting" });
    const titles = ["Add Column After", "Delete Column"], button = title => bar.getByRole("button", { name: title, exact: true });
    for (const title of titles) assert.equal(await button(title).count(), 0);
    const mount = options => page.evaluate(options => {
      __markdownEditor.destroy(); window.__markdownChanges = [];
      window.__markdownEditor = __initMarkdown({ element: document.getElementById("editor"),
        actions: ["table-column-after", "table-column-delete", "undo", "redo"],
        shortcuts: { "table-column-after": "Alt+Shift+c", "table-column-delete": "Alt+Shift+x" }, ...options,
        onChange: value => __markdownChanges.push(value) });
      window.prompt = () => { throw new Error("Unexpected column prompt"); };
    }, options);
    await mount({ shortcuts: false });
    for (const title of titles) assert.equal(await button(title).getAttribute("aria-keyshortcuts"), null);
    await mount({}); monitor = true;
    assert.equal(await button(titles[0]).getAttribute("aria-keyshortcuts"), "Alt+Shift+c");
    assert.equal(await button(titles[1]).getAttribute("aria-keyshortcuts"), "Alt+Shift+x");
    const source = page.locator("#editor .lightmarkdown-input"), get = () => page.evaluate(() => __markdownEditor.getMarkdown());
    const count = () => page.evaluate(() => __markdownChanges.length - __columnBefore);
    const prepare = (text, start = 2, end = start, shape = "blocks") => page.evaluate(({ text, start, end, shape }) => {
      const api = __markdownEditor; api.setMarkdown(text); const source = api.content;
      if (shape !== "blocks") {
        const block = document.createElement("div");
        if (shape === "lf") block.append(document.createTextNode(text));
        else text.split("\n").forEach((line, index) => {
          if (index) block.append(document.createElement("br"));
          const span = document.createElement("span"); span.append(document.createTextNode(line)); block.append(span);
        });
        block.append(document.createElement("br")); source.replaceChildren(block); source.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const point = position => {
        if (shape === "lf") return [source.firstChild.firstChild, position];
        const lines = text.slice(0, position).split("\n"), line = lines.length - 1;
        const node = shape === "br" ? source.querySelectorAll("span")[line].firstChild : source.children[line].firstChild;
        return node.nodeName === "BR" ? [node.parentNode, 0] : [node, lines[line].length];
      };
      const range = document.createRange(); range.setStart(...point(start)); range.setEnd(...point(end));
      source.focus(); getSelection().removeAllRanges(); getSelection().addRange(range); source.dispatchEvent(new Event("focus"));
      window.__columnBefore = __markdownChanges.length;
    }, { text, start, end, shape });
    const wrap = (text, first, rest) => first + text.replaceAll("\n", "\n" + rest);
    const three = "A| B |C\n:---|:---:|---:\na| b |c";
    const cases = [
      ["Add Column After", table, 2, 3, added],
      ["Add Column After", table, 1, 4, added],
      ["Add Column After", table, 4, undefined, added],
      ["Add Column After", table, table.indexOf("one") + 1, undefined, added],
      ["Add Column After", table, 6, undefined, "| A | B | Column |\n| :--- | ---: | --- |\n| one | two |  |"],
      ["Add Column After", table.slice(0, table.lastIndexOf("\n")), 2, undefined, added.slice(0, added.lastIndexOf("\n"))],
      ["Add Column After", three, 3, undefined, "A| B | Column |C\n:---|:---:| --- |---:\na| b |  |c"],
      ["Add Column After", "A |\n---|\nx", 0, undefined, "A | Column |\n---| --- |\nx|  |"],
      ["Add Column After", "A|B\n---|---\nx|y", 2, undefined, "A|B| Column \n---|---| --- \nx|y|  |"],
      ["Add Column After", "| A\t|B |\n|---|---|\n| x\t|y |", 2, undefined, "| A\t| Column |B |\n|---| --- |---|\n| x\t|  |y |"],
      ["Delete Column", table, 2, undefined, "| B |\n| ---: |\n| two |", "two", "B"],
      ["Delete Column", table, table.indexOf("one"), table.indexOf("one") + 3, "| B |\n| ---: |\n| two |", "two"],
      ["Delete Column", table, table.indexOf("two"), undefined, "| A |\n| :--- |\n| one |", "one"],
      ["Delete Column", three, 3, undefined, "A|C\n:---|---:\na|c", "a", "C"],
      ["Delete Column", "A | B\n--- | ---\none | two", 0, undefined, "| B\n| ---\n| two", "two", "B"],
      ["Delete Column", "A | B\n--- | ---\none | two", 4, undefined, "|A \n|--- \n|one ", "one", "A"],
      ["Delete Column", "A | |C\n---|---|---\nx| |z", 0, undefined, "| |C\n---|---\n| |z", "z", "|"],
      ["Delete Column", "|A| |C\n|---|---|---\n|x| |z", 5, undefined, "|A| |\n|---|---\n|x| |", "x", "|"],
      ["Delete Column", "| A | B |\n| --- | --- |", 2, undefined, "| B |\n| --- |", "B"],
      ["Add Column After", table + "\n\n" + table, 2, undefined, added + "\n\n" + table],
      ["Add Column After", table.replace("one", "![alt](photo.png)").replace("two", "🦊 \\| `code`"), 2, undefined,
        added.replace("one", "![alt](photo.png)").replace("two", "🦊 \\| `code`")]
    ];
    const rich = table.replace("one", "![alt](photo.png)").replace("two", "🦊 \\| `code`");
    cases.push(["Add Column After", rich, rich.indexOf("photo"), undefined, added.replace("one", "![alt](photo.png)").replace("two", "🦊 \\| `code`")]);
    for (const [first, rest] of [["> - ", ">   "], [">\t", "> "], ["12. ", "    "]]) {
      const text = wrap(table, first, rest);
      cases.push(["Add Column After", text, text.indexOf("one"), undefined, wrap(added, first, rest)]);
      cases.push(["Delete Column", text, text.indexOf("two"), undefined, wrap("| A |\n| :--- |\n| one |", first, rest), "one"]);
    }
    const task = "- [X] first\n  \n";
    cases.push(["Add Column After", task + wrap(table, "  ", "  ") + "\n- next", task.length + 4, undefined, task + wrap(added, "  ", "  ") + "\n- next"]);
    cases.push(["Add Column After", "- first\nA| B\n  ---|---\n  x| y", 8, undefined, "- first\nA| Column | B\n  ---| --- |---\n  x|  | y"]);
    for (const shape of ["blocks", "lf", "br"]) for (const [title, text, start, end = start, expected, bodyCell, headerCell] of cases) {
      const label = `${name}/${shape}/${title}: ${JSON.stringify(text)} at ${start}:${end}`;
      await prepare(text, start, end, shape); assert.equal(await button(title).isEnabled(), true, label);
      await button(title).click(); assert.equal(await get(), expected, label); assert.equal(await count(), 1);
      assert.equal(await button(title).getAttribute("aria-pressed"), null);
      const add = title === titles[0], cell = headerCell || bodyCell;
      assert.equal(await page.evaluate(() => getSelection().toString()), add ? "Column" : "");
      assert.equal(await source.evaluate(node => node === node.ownerDocument.activeElement), true);
      if (!(cell === "|")) {
        const at = add ? expected.indexOf("Column") : expected.indexOf(cell);
        await page.keyboard.insertText("NEW");
        assert.equal(await get(), expected.slice(0, at) + "NEW" + expected.slice(at + (add ? 6 : 0)), label + ": selection/caret");
        assert.equal(await count(), 2); await page.keyboard.press("Control+z"); assert.equal(await get(), expected);
      }
      await page.keyboard.press("Control+z"); assert.equal(await get(), text);
      await page.keyboard.press("Control+Shift+z"); assert.equal(await get(), expected);
    }
    await prepare("|  | B |\n| --- | --- |\n| x | y |", 5);
    await button(titles[1]).click(); assert.equal(await get(), "|  |\n| --- |\n| x |"); assert.equal(await count(), 1);
    await page.keyboard.insertText("NEW"); assert.equal(await get(), "|  NEW|\n| --- |\n| x |");
    const refusals = [["plain", 1], ["", 0], [table, 0], [table, 9], [table, 2, 7], [table, 2, table.indexOf("one")],
      [table, table.indexOf(":---")], [table + "\nshort", 2], [table + "\n| x | y | z |", 2],
      ["```\n" + table + "\n```", 6], ["<div>\n" + table, 8], [wrap(table, "> - ", ">   "), 1]];
    for (const [text, start, end = start] of refusals) {
      await prepare(text, start, end); const history = await source.evaluate(() => [document.queryCommandEnabled("undo"), document.queryCommandEnabled("redo")]);
      for (const title of titles) { assert.equal(await button(title).isDisabled(), true, `${name}: refused ${JSON.stringify([text, start, end])}`); await button(title).evaluate(node => node.click()); }
      await page.keyboard.press("Alt+Shift+c"); await page.keyboard.press("Alt+Shift+x");
      assert.equal(await get(), text); assert.equal(await count(), 0);
      assert.deepEqual(await source.evaluate(() => [document.queryCommandEnabled("undo"), document.queryCommandEnabled("redo")]), history);
    }
    for (const [text, start, title] of [["A | B\\\n---|---\nx|y", 4, titles[0]], ["A | # B | C\n---|---|---\nx|y|z", 0, titles[1]]]) {
      await prepare(text, start); const history = await source.evaluate(() => [document.queryCommandEnabled("undo"), document.queryCommandEnabled("redo")]);
      assert.equal(await button(title).isEnabled(), true); await button(title).click();
      assert.equal(await get(), text); assert.equal(await count(), 0);
      assert.equal(await page.getByText("This column cannot be changed without changing surrounding Markdown.", { exact: true }).isVisible(), true);
      assert.deepEqual(await source.evaluate(() => [document.queryCommandEnabled("undo"), document.queryCommandEnabled("redo")]), history);
    }
    await prepare("| A |\n| --- |\n| x |", 2); assert.equal(await button("Delete Column").isDisabled(), true);
    await page.keyboard.press("Alt+Shift+x"); assert.equal(await count(), 0);
    await prepare(table, 2); await source.dispatchEvent("compositionstart");
    for (const title of titles) assert.equal(await button(title).isDisabled(), true);
    await page.keyboard.press("Alt+Shift+c"); assert.equal(await count(), 0); await source.dispatchEvent("compositionend");
    await prepare("before\n\n" + table + "\n\nuntouched", 10);
    await page.evaluate(() => { window.__columnHead = __markdownEditor.content.firstChild; window.__columnTail = __markdownEditor.content.lastChild; });
    await button(titles[0]).focus(); await page.keyboard.press("Enter");
    assert.equal(await get(), "before\n\n" + added + "\n\nuntouched");
    await button(titles[1]).click(); assert.equal(await get(), "before\n\n" + table + "\n\nuntouched");
    assert.equal(await page.evaluate(() => __columnHead === __markdownEditor.content.firstChild && __columnTail === __markdownEditor.content.lastChild), true);
    await mount({ actions: [] }); await prepare(table, table.indexOf("one"));
    await page.keyboard.press("Alt+Shift+c"); assert.equal(await get(), added);
    await page.keyboard.press("Alt+Shift+x"); assert.equal(await get(), table); assert.equal(await count(), 2);
    await page.keyboard.press("Control+z"); assert.equal(await get(), added); await page.keyboard.press("Control+z"); assert.equal(await get(), table);
    assert.equal(await page.locator('#editor [aria-label="Markdown formatting"]').evaluate(node => node.hidden), true);
    await page.evaluate(() => {
      __markdownEditor.destroy(); window.__customColumns = 0;
      window.__markdownEditor = __initMarkdown({ element: document.getElementById("editor"),
        actions: ["table-column-after", "table-column-delete"].map(name => ({ name, result: () => __customColumns++, state: () => true })),
        shortcuts: { "table-column-after": "Alt+Shift+c" }, onChange: value => __markdownChanges.push(value) });
    });
    await prepare("plain", 1);
    for (const title of titles) { await button(title).click(); assert.equal(await button(title).getAttribute("aria-pressed"), "true"); }
    await page.keyboard.press("Alt+Shift+c");
    assert.equal(await page.evaluate(() => __customColumns), 3); assert.equal(await count(), 0);
    await page.evaluate(() => { window.__deadColumns = __markdownEditor.content; __markdownEditor.destroy(); });
    assert.equal(await page.evaluate(() => __deadColumns.dispatchEvent(new KeyboardEvent("keydown", { key: "C", altKey: true, shiftKey: true, bubbles: true, cancelable: true }))), true);
    monitor = false;
    {
      await page.goto(base + "/examples/markdown-iframe.html");
      await page.waitForFunction(() => !document.getElementById("read-markdown").disabled);
      const view = page.frameLocator("#isolated-editor");
      const input = view.locator(".lightmarkdown-input"), toolbar = view.getByRole("group", { name: "Markdown formatting" });
      await input.evaluate((node, text) => {
        const win = node.ownerDocument.defaultView, host = node.closest(".lightmarkdown"); win.__markdownEditor.destroy(); win.__columnChanges = 0;
        win.__markdownEditor = win.maiden.init({ element: host, actions: ["table-column-after", "table-column-delete", "undo", "redo"], onChange: () => win.__columnChanges++ });
        win.__markdownEditor.setMarkdown(text); win.__columnChanges = 0;
      }, table);
      const read = () => input.evaluate(node => node.ownerDocument.defaultView.__markdownEditor.getMarkdown());
      await input.evaluate(node => {
        const doc = node.ownerDocument, range = doc.createRange(); range.setStart(node.children[2].firstChild, 2); range.collapse(true);
        node.focus(); doc.getSelection().removeAllRanges(); doc.getSelection().addRange(range); node.dispatchEvent(new Event("focus"));
      });
      monitor = true; await toolbar.getByRole("button", { name: titles[0], exact: true }).click(); assert.equal(await read(), added);
      assert.equal(await input.evaluate(node => node.ownerDocument.getSelection().toString()), "Column");
      await toolbar.getByRole("button", { name: titles[1], exact: true }).click(); assert.equal(await read(), table);
      assert.equal(await input.evaluate(node => node.ownerDocument.defaultView.__columnChanges), 2);
      await page.keyboard.press("Control+z"); assert.equal(await read(), added); await page.keyboard.press("Control+z"); assert.equal(await read(), table);
      monitor = false;
    }
    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    console.log(`${name}: table columns, source/cell selection, alignment/containers, ragged/literal guards, callbacks/native history, keyboard-only/custom/teardown and whole-editor iframe: ok`);
  } finally { await page.close(); }
}
module.exports = { tableColumnChecks };
if (require.main === module) (async () => {
  const { chromium, firefox } = require("playwright"), { pathToFileURL } = require("node:url"), path = require("node:path");
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch();
    try { await tableColumnChecks(browser, pathToFileURL(path.resolve(__dirname, "..")).href, name); }
    finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
