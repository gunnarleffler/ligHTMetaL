/* Size-picker GFM insertion: source/container/history checks at a 2×2 size. */
const assert = require("node:assert/strict");
const rows = ["| Column 1 | Column 2 |", "| -------- | -------- |", "|          |          |"];
const table = rows.join("\n");
const within = prefix => rows.join("\n" + prefix);

async function tableChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [], requests = [];
  let monitor = false;
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (monitor) requests.push(request.url()); });
  try {
    await page.goto(base + "/tests/fixtures/markdown.html");
    await page.waitForFunction(() => window.__markdownEditor);
    const toolbar = page.getByRole("group", { name: "Markdown formatting" });
    const defaultTable = toolbar.getByRole("button", { name: "Table", exact: true });
    assert.equal(await defaultTable.count(), 1, "table belongs to the default toolbar");
    assert.equal(await defaultTable.getAttribute("aria-keyshortcuts"), null, "no new default shortcut");
    assert.deepEqual(await toolbar.getByRole("button").evaluateAll(nodes => nodes.slice(-7).map(node => node.getAttribute("aria-label"))), ["Link", "Image", "Table", "Undo", "Redo", "Fullscreen", "Help"]);
    const choose = async () => {
      const insert = page.getByRole("menuitem", { name: "Insert Table…", exact: true });
      if (await insert.isVisible()) await insert.click();
      await page.getByRole("dialog", { name: "Insert table", exact: true }).getByRole("button", { name: "2 columns, 2 rows", exact: true }).click();
    };
    await defaultTable.click(); assert.equal(await page.evaluate(() => __markdownChanges.length), 0); await choose();
    assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), table);
    assert.equal(await page.evaluate(() => getSelection().toString()), "Column 1");
    assert.equal(await page.evaluate(() => __markdownChanges.length), 1);
    await page.keyboard.press("Control+z"); assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), "");
    const mount = options => page.evaluate(options => {
      __markdownEditor.destroy(); window.__markdownChanges = [];
      window.__markdownEditor = __initMarkdown({ element: document.getElementById("editor"), actions: ["table-insert", "undo", "redo"],
        shortcuts: { "table-insert": "Alt+Shift+t" }, ...options, onChange: value => __markdownChanges.push(value) });
      window.prompt = () => { throw new Error("Unexpected table prompt"); };
    }, options);
    await mount({ actions: ["bold"], shortcuts: false });
    assert.equal(await toolbar.getByRole("button", { name: "Table", exact: true }).count(), 0, "explicit actions can omit table");
    await mount({ shortcuts: false });
    assert.equal(await toolbar.getByRole("button", { name: "Insert Table…", exact: true }).getAttribute("aria-keyshortcuts"), null);
    await mount({}); monitor = true;
    const source = page.locator("#editor .lightmarkdown-input");
    const button = () => toolbar.locator('button[aria-label="Insert Table…"],button[aria-label="Table"]');
    const get = () => page.evaluate(() => __markdownEditor.getMarkdown());
    const count = () => page.evaluate(() => __markdownChanges.length - __tableBefore);
    const prepare = (text, start = 0, end = start, shape = "blocks") => page.evaluate(({ text, start, end, shape }) => {
      const api = __markdownEditor; api.setMarkdown(text); const source = api.content;
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
      source.dispatchEvent(new Event("focus")); window.__tableBefore = __markdownChanges.length;
    }, { text, start, end, shape });
    const cases = [
      ["", 0, table], ["   ", 0, table + "   "], ["   ", 3, "   " + table],
      ["before\n\nafter", 7, "before\n" + table + "\n\nafter"],
      ["🦊\n\nuntouched", 3, "🦊\n" + table + "\n\nuntouched"],
      ["> ", 2, "> " + within("> ")], [">", 1, ">" + within("> ")],
      [">\t", 2, ">\t" + within("> ")], ["- ", 2, "- " + within("  ")],
      ["-", 1, "- " + within("  ")], ["12)", 3, "12) " + within("    ")],
      ["> - ", 4, "> - " + within(">   ")], ["- >", 3, "- >" + within("  > ")],
      ["> > -", 5, "> > - " + within("> >   ")], ["1. - ", 5, "1. - " + within("     ")],
      ["- first\n  ", 10, "- first\n  " + within("  ")],
      ["- [X] first\n  \n- next", 14, "- [X] first\n  " + within("  ") + "\n  \n- next"],
      ["- first\n\t", 9, "- first\n\t" + within("  ")],
      ["> first\n> \n> after", 10, "> first\n> " + within("> ") + "\n> \n> after"],
      ["<div>\n\nafter", 6, "<div>\n\n" + table + "\n\nafter"],
      ["    code\n\n    after", 9, "    code\n" + table + "\n\n    after"],
      ["text\n    continuation\n", 22, "text\n    continuation\n" + table],
      [table + "\n\nafter", table.length + 1, table + "\n\n" + table + "\n\nafter"]
    ];
    for (const shape of ["blocks", "lf", "br"]) {
      for (const [text, start, expected] of cases) {
        const label = `${name}/${shape}: ${JSON.stringify(text)} at ${start}`;
        await prepare(text, start, start, shape); assert.equal(await button().isEnabled(), true, label);
        await button().click(); await choose(); assert.equal(await get(), expected, label); assert.equal(await count(), 1);
        assert.equal(await page.evaluate(() => getSelection().toString()), "Column 1", label + ": header selected");
        assert.equal(await button().getAttribute("aria-pressed"), null);
        assert.equal(await button().isDisabled(), true, "selection cannot insert another table");
        assert.equal((await page.locator(".lightmarkdown-marker:visible").allTextContents()).includes(rows[1]), true, "recognized delimiter");
        const header = expected.indexOf("Column 1", start);
        await page.keyboard.insertText("Name"); assert.equal(await get(), expected.slice(0, header) + "Name" + expected.slice(header + "Column 1".length)); assert.equal(await count(), 2);
        await page.keyboard.press("Control+z"); assert.equal(await get(), expected);
        await page.keyboard.press("Control+z"); assert.equal(await get(), text);
        await page.keyboard.press("Control+Shift+z"); assert.equal(await get(), expected);
        await page.evaluate(() => { const value = __markdownEditor.getMarkdown(); __markdownEditor.setMarkdown(value); });
        assert.equal(await get(), expected, "save/reload preserves table source");
      }
      for (const [text, start, end = start] of [
        ["text", 0], ["text", 4], [" \n ", 0, 3], ["   ", 0, 1], ["\u00a0", 0], ["\ufeff", 0],
        ["    ", 4], ["\t", 1], ["```\n\n```", 4], ["~~~\n \n~~~", 5], ["<script>\n\n</script>", 9],
        ["## ", 3], ["- [ ] ", 6], ["> ", 1], ["- ", 0], [table, 2], ["[ref]: /path", 5]
      ]) {
        await prepare(text, start, end, shape); const history = await source.evaluate(() => [document.queryCommandEnabled("undo"), document.queryCommandEnabled("redo")]);
        assert.equal(await button().isDisabled(), true, `${name}/${shape}: protected ${JSON.stringify(text)}`);
        await button().evaluate(node => node.click()); await page.keyboard.press("Alt+Shift+t");
        assert.equal(await get(), text); assert.equal(await count(), 0);
        assert.deepEqual(await source.evaluate(() => [document.queryCommandEnabled("undo"), document.queryCommandEnabled("redo")]), history);
      }
    }
    // Container matching consumes blank tabs, but the header would become indented code.
    await prepare("- first\n\t\t", 10); assert.equal(await button().isEnabled(), true);
    const refusedHistory = await source.evaluate(() => [document.queryCommandEnabled("undo"), document.queryCommandEnabled("redo")]);
    await button().click(); await choose(); assert.equal(await get(), "- first\n\t\t"); assert.equal(await count(), 0);
    assert.deepEqual(await source.evaluate(() => [document.queryCommandEnabled("undo"), document.queryCommandEnabled("redo")]), refusedHistory);
    assert.match(await page.getByRole("status").textContent(), /surrounding Markdown/);
    await prepare("\nuntouched", 0);
    await page.evaluate(() => { window.__tableTail = __markdownEditor.content.lastChild; });
    await button().focus(); await page.keyboard.press("Enter"); await choose(); assert.equal(await get(), table + "\n\nuntouched");
    assert.equal(await count(), 1); assert.equal(await page.evaluate(() => __tableTail === __markdownEditor.content.lastChild), true);
    await prepare("", 0); await source.dispatchEvent("compositionstart"); assert.equal(await button().isDisabled(), true);
    await page.keyboard.press("Alt+Shift+t"); assert.equal(await get(), ""); assert.equal(await count(), 0);
    await source.dispatchEvent("compositionend");
    await mount({ actions: [], shortcuts: { "table-insert": "Alt+Shift+t" } }); await prepare("", 0);
    assert.equal(await page.locator('#editor [aria-label="Markdown formatting"]').evaluate(node => node.hidden), true);
    await page.keyboard.press("Alt+Shift+t"); await choose(); assert.equal(await get(), table); assert.equal(await count(), 1);
    await page.keyboard.press("Alt+Shift+t"); assert.equal(await get(), table); assert.equal(await count(), 1);
    await page.evaluate(() => {
      __markdownEditor.destroy(); window.__customTables = 0;
      window.__markdownEditor = __initMarkdown({ element: document.getElementById("editor"),
        actions: [{ name: "table", result: () => __customTables++, state: () => true }], shortcuts: { table: "Alt+Shift+t" },
        onChange: value => __markdownChanges.push(value) });
    });
    await prepare("literal", 2); await button().click();
    assert.equal(await page.evaluate(() => __customTables), 1); assert.equal(await get(), "literal"); assert.equal(await count(), 0);
    assert.equal(await button().getAttribute("aria-pressed"), "true");
    await page.evaluate(() => { window.__deadTableContent = __markdownEditor.content; __markdownEditor.destroy(); });
    assert.equal(await page.evaluate(() => !__deadTableContent.dispatchEvent(new KeyboardEvent("keydown", { key: "T", altKey: true, shiftKey: true, bubbles: true, cancelable: true }))), false);
    monitor = false;
    {
      await page.goto(base + "/examples/markdown-iframe.html");
      await page.waitForFunction(() => !document.getElementById("read-markdown").disabled);
      const view = page.frameLocator("#isolated-editor");
      const input = view.locator(".lightmarkdown-input"), bar = view.getByRole("group", { name: "Markdown formatting" });
      await input.evaluate(node => {
        const win = node.ownerDocument.defaultView, host = node.closest(".lightmarkdown"); win.__markdownEditor.destroy(); win.__tableChanges = 0;
        win.__markdownEditor = win.maiden.init({ element: host, actions: ["table", "undo", "redo"], onChange: () => win.__tableChanges++ });
      });
      const read = () => input.evaluate(node => node.ownerDocument.defaultView.__markdownEditor.getMarkdown());
      await input.evaluate(node => {
        const doc = node.ownerDocument, range = doc.createRange(); range.selectNodeContents(node); range.collapse(false);
        node.focus(); doc.getSelection().removeAllRanges(); doc.getSelection().addRange(range); node.dispatchEvent(new Event("focus"));
      });
      const frameTable = "| Column 1 | Column 2 | Column 3 | Column 4 |\n| -------- | -------- | -------- | -------- |";
      const before = await input.evaluate(node => node.ownerDocument.defaultView.__tableChanges);
      monitor = true; await bar.getByRole("button", { name: "Table", exact: true }).click();
      await view.getByRole("menuitem", { name: "Insert Table…", exact: true }).click();
      const popup = view.getByRole("dialog", { name: "Insert table", exact: true });
      await popup.getByRole("spinbutton", { name: "Columns", exact: true }).fill("4");
      await popup.getByRole("spinbutton", { name: "Rows", exact: true }).fill("1");
      await popup.getByRole("button", { name: "Insert", exact: true }).click();
      assert.equal(await read(), frameTable); assert.equal(await input.evaluate(node => node.ownerDocument.getSelection().toString()), "Column 1");
      assert.equal(await input.evaluate(node => node.ownerDocument.defaultView.__tableChanges), before + 1);
      await page.keyboard.insertText("Name"); assert.equal(await read(), frameTable.replace("Column 1", "Name"));
      await page.keyboard.press("Control+z"); assert.equal(await read(), frameTable);
      await page.keyboard.press("Control+z"); assert.equal(await read(), ""); monitor = false;
    }
    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    console.log(`${name}: default/configurable table picker insertion, empty-line/container guards, first-header selection, callbacks/native history, save/reload, composition, custom/keyboard-only and whole-editor iframe: ok`);
  } finally { await page.close(); }
}
module.exports = { tableChecks };
if (require.main === module) (async () => {
  const { chromium, firefox } = require("playwright"), { pathToFileURL } = require("node:url"), path = require("node:path");
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch();
    try { await tableChecks(browser, pathToFileURL(path.resolve(__dirname, "..")).href, name); }
    finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
