/* Recognized Markdown body-row commands, with browser-owned source/history. */
const assert = require("node:assert/strict");
const header = "| A | B |\n| --- | --- |", one = "| one | two |", two = "| three | four |", empty = "|  |  |";

async function tableRowChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [], requests = []; let monitor = false;
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (monitor) requests.push(request.url()); });
  try {
    await page.goto(base + "/tests/fixtures/markdown.html"); await page.waitForFunction(() => window.__markdownEditor);
    const toolbar = page.getByRole("group", { name: "Markdown formatting" });
    for (const title of ["Add Row After", "Delete Row"]) assert.equal(await toolbar.getByRole("button", { name: title, exact: true }).count(), 0);
    const mount = options => page.evaluate(options => {
      __markdownEditor.destroy(); window.__markdownChanges = [];
      window.__markdownEditor = __initMarkdown({ element: document.getElementById("editor"),
        actions: ["table-row-after", "table-row-delete", "undo", "redo"],
        shortcuts: { "table-row-after": "Alt+Shift+r", "table-row-delete": "Alt+Shift+d" }, ...options,
        onChange: value => __markdownChanges.push(value) });
      window.prompt = () => { throw new Error("Unexpected row prompt"); };
    }, options);
    await mount({ shortcuts: false });
    for (const title of ["Add Row After", "Delete Row"]) assert.equal(await toolbar.getByRole("button", { name: title, exact: true }).getAttribute("aria-keyshortcuts"), null);
    await mount({}); monitor = true;
    const source = page.locator("#editor .lightmarkdown-input"), button = title => toolbar.getByRole("button", { name: title, exact: true });
    const get = () => page.evaluate(() => __markdownEditor.getMarkdown());
    const count = () => page.evaluate(() => __markdownChanges.length - __rowBefore);
    const prepare = (text, start = 0, end = start, shape = "blocks") => page.evaluate(({ text, start, end, shape }) => {
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
      function point(position) {
        if (shape === "lf") return [source.firstChild.firstChild, position];
        const lines = text.slice(0, position).split("\n"), line = lines.length - 1, column = lines[line].length;
        const node = shape === "br" ? source.querySelectorAll("span")[line].firstChild : source.children[line].firstChild;
        return node.nodeName === "BR" ? [node.parentNode, 0] : [node, column];
      }
      const range = document.createRange(); range.setStart(...point(start)); range.setEnd(...point(end));
      source.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
      source.dispatchEvent(new Event("focus")); window.__rowBefore = __markdownChanges.length;
    }, { text, start, end, shape });
    const quote = "> - " + header.replace("\n", "\n>   ") + "\n>   " + one;
    const tabbed = ">\t" + header.replace("\n", "\n> ") + "\n> " + one;
    const task = "- [X] first\n  \n  " + header.replace("\n", "\n  ") + "\n  " + one;
    const adjacent = header + "\n" + one + "\n\n" + header + "\n" + two;
    const lazy = "- first\nA | B\n  --- | ---\n  one | two";
    const addCases = [
      [header, 2, 3, header + "\n" + empty],
      [header, header.indexOf("---") + 1, undefined, header + "\n" + empty],
      [header + "\n" + one, 0, 9, header + "\n" + empty + "\n" + one],
      [header + "\n" + one + "\n" + two, header.length + 3, header.length + 6, header + "\n" + one + "\n" + empty + "\n" + two],
      [header + "\n" + one, header.length + one.length + 1, undefined, header + "\n" + one + "\n" + empty],
      [header + "\nonly", header.length + 2, undefined, header + "\nonly\n" + empty],
      ["A |\n---|\nx", 9, undefined, "A |\n---|\nx\n|  |"],
      ["A | B | C\n:--- | :---: | ---:\none | two | three", 0, undefined, "A | B | C\n:--- | :---: | ---:\n|  |  |  |\none | two | three"],
      [quote, quote.indexOf("one"), undefined, quote + "\n>   " + empty],
      [tabbed, tabbed.indexOf("one"), undefined, tabbed + "\n> " + empty],
      [task + "\n- next", task.indexOf("one"), undefined, task + "\n  " + empty + "\n- next"],
      [lazy, lazy.indexOf("one"), undefined, lazy + "\n  " + empty],
      [adjacent, header.length + 3, undefined, header + "\n" + one + "\n" + empty + "\n\n" + header + "\n" + two],
      ["1. " + header.replace("\n", "\n   ") + "\n   " + one, 3, undefined, "1. " + header.replace("\n", "\n   ") + "\n   " + empty + "\n   " + one],
      [header + "\n| ![alt](photo.png) | 🦊 \\| `code` |\n\nuntouched", header.length + 12, undefined,
        header + "\n| ![alt](photo.png) | 🦊 \\| `code` |\n" + empty + "\n\nuntouched"]
    ];
    const deleteCases = [
      [header + "\n" + one, header.length + 3, undefined, header, "A"],
      [header + "\n" + one + "\n" + two, header.length + 3, header.length + 6, header + "\n" + two, "three"],
      [header + "\n" + one + "\n" + two, header.length + one.length + 4, undefined, header + "\n" + one, "one"],
      [header + "\n" + one + "\n\nuntouched", header.length + 3, undefined, header + "\n\nuntouched", "A"],
      [header + "\n" + one + "\n## after", header.length + 3, undefined, header + "\n## after", "A"],
      [quote, quote.indexOf("one"), undefined, quote.slice(0, quote.lastIndexOf("\n")), "A"],
      [tabbed, tabbed.indexOf("one"), undefined, tabbed.slice(0, tabbed.lastIndexOf("\n")), "A"],
      [task + "\n- next", task.indexOf("one"), undefined, task.slice(0, task.lastIndexOf("\n")) + "\n- next", "A"],
      [lazy, lazy.indexOf("one"), undefined, lazy.slice(0, lazy.lastIndexOf("\n")), "A"],
      [adjacent, header.length + 3, undefined, header + "\n\n" + header + "\n" + two, "A"],
      [header + "\nonly", header.length + 1, undefined, header, "A"],
      ["A |\n---|\nx", 9, undefined, "A |\n---|", "A"],
      [header + "\n| x | y | extra |\n\nend", header.length + 3, undefined, header + "\n\nend", "A"]
    ];
    for (const shape of ["blocks", "lf", "br"]) for (const [title, cases] of [["Add Row After", addCases], ["Delete Row", deleteCases]]) {
      for (const [text, start, end = start, expected, cell] of cases) {
        const label = `${name}/${shape}/${title}: ${JSON.stringify(text)} at ${start}:${end}`;
        await prepare(text, start, end, shape); assert.equal(await button(title).isEnabled(), true, label);
        await button(title).click(); assert.equal(await get(), expected, label); assert.equal(await count(), 1);
        assert.equal(await button(title).getAttribute("aria-pressed"), null);
        assert.equal(await button("Delete Row").isEnabled(), title === "Add Row After" || cell !== "A", "current body/header state");
        assert.equal(await page.evaluate(() => getSelection().isCollapsed && __markdownEditor.content === document.activeElement), true);
        const caret = title === "Add Row After" ? expected.indexOf("|  |") + 2 : expected.indexOf(cell);
        await page.keyboard.insertText("NEW"); assert.equal(await get(), expected.slice(0, caret) + "NEW" + expected.slice(caret), label + ": caret"); assert.equal(await count(), 2);
        await page.keyboard.press("Control+z"); assert.equal(await get(), expected);
        await page.keyboard.press("Control+z"); assert.equal(await get(), text);
        await page.keyboard.press("Control+Shift+z"); assert.equal(await get(), expected);
      }
    }
    for (const [text, start, end = start] of [["plain", 1], ["", 0], ["```\n" + header + "\n```", 6], ["<div>\n" + header, 8],
      [header, 0, 10], [header + "\n" + one, header.length, header.length + 3], [quote, 1],
      [header + "\n\n", header.length + 1], [header + "\n    literal", header.length + 5]]) {
      await prepare(text, start, end); const history = await source.evaluate(() => [document.queryCommandEnabled("undo"), document.queryCommandEnabled("redo")]);
      for (const title of ["Add Row After", "Delete Row"]) {
        assert.equal(await button(title).isDisabled(), true, `${name}: protected ${JSON.stringify([text, start, end])}`);
        await button(title).evaluate(node => node.click());
      }
      await page.keyboard.press("Alt+Shift+r"); await page.keyboard.press("Alt+Shift+d");
      assert.equal(await get(), text); assert.equal(await count(), 0);
      assert.deepEqual(await source.evaluate(() => [document.queryCommandEnabled("undo"), document.queryCommandEnabled("redo")]), history);
    }
    for (const start of [2, header.indexOf("---") + 1]) {
      await prepare(header, start); assert.equal(await button("Delete Row").isDisabled(), true);
      await button("Delete Row").evaluate(node => node.click()); await page.keyboard.press("Alt+Shift+d"); assert.equal(await get(), header); assert.equal(await count(), 0);
    }
    await prepare(header + "\n" + one, header.length + 3);
    await source.dispatchEvent("compositionstart");
    for (const title of ["Add Row After", "Delete Row"]) assert.equal(await button(title).isDisabled(), true);
    await page.keyboard.press("Alt+Shift+r"); await page.keyboard.press("Alt+Shift+d"); assert.equal(await count(), 0);
    await source.dispatchEvent("compositionend");
    await prepare(header + "\n" + one + "\n\nuntouched", header.length + 3);
    await page.evaluate(() => { window.__rowTail = __markdownEditor.content.lastChild; });
    await button("Add Row After").focus(); await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => __rowTail === __markdownEditor.content.lastChild), true);
    await button("Delete Row").click(); assert.equal(await get(), header + "\n" + one + "\n\nuntouched"); assert.equal(await count(), 2);
    assert.equal(await page.evaluate(() => __rowTail === __markdownEditor.content.lastChild), true, "deletion preserves the next paragraph node");
    await mount({ actions: [] }); await prepare(header + "\n" + one, header.length + 3);
    assert.equal(await page.locator('#editor [aria-label="Markdown formatting"]').evaluate(node => node.hidden), true);
    await page.keyboard.press("Alt+Shift+r"); await page.keyboard.press("Alt+Shift+r");
    assert.equal(await get(), header + "\n" + one + "\n" + empty + "\n" + empty); assert.equal(await count(), 2);
    await page.keyboard.press("Control+z"); assert.equal(await get(), header + "\n" + one + "\n" + empty);
    await page.keyboard.press("Control+z"); assert.equal(await get(), header + "\n" + one);
    await page.keyboard.press("Control+Shift+z"); await page.keyboard.press("Alt+Shift+d");
    assert.equal(await get(), header + "\n" + one);
    await page.evaluate(() => {
      __markdownEditor.destroy(); window.__customRows = 0;
      window.__markdownEditor = __initMarkdown({ element: document.getElementById("editor"),
        actions: ["table-row-after", "table-row-delete"].map(name => ({ name, result: () => __customRows++, state: () => true })),
        shortcuts: { "table-row-after": "Alt+Shift+r" }, onChange: value => __markdownChanges.push(value) });
    });
    await prepare("plain", 1);
    for (const title of ["Add Row After", "Delete Row"]) {
      assert.equal(await button(title).isEnabled(), true); await button(title).click(); assert.equal(await button(title).getAttribute("aria-pressed"), "true");
    }
    assert.equal(await page.evaluate(() => __customRows), 2); assert.equal(await count(), 0);
    await page.evaluate(() => { window.__deadRows = __markdownEditor.content; __markdownEditor.destroy(); });
    assert.equal(await page.evaluate(() => !__deadRows.dispatchEvent(new KeyboardEvent("keydown", { key: "R", altKey: true, shiftKey: true, bubbles: true, cancelable: true }))), false);
    monitor = false;
    for (const mode of ["whole", "surface"]) {
      await page.goto(base + (mode === "whole" ? "/examples/markdown-iframe.html" : "/examples/markdown.html?mode=isolated"));
      if (mode === "whole") {
        await page.waitForFunction(() => !document.getElementById("read-markdown").disabled);
        await page.frameLocator("#isolated-editor").locator(".lightmarkdown-input").evaluate((node, text) => {
          const win = node.ownerDocument.defaultView, host = node.closest(".lightmarkdown"); win.__markdownEditor.destroy(); win.__rowChanges = 0;
          win.__markdownEditor = win.maiden.init({ element: host, actions: ["table-row-after", "table-row-delete", "undo", "redo"], onChange: () => win.__rowChanges++ });
          win.__markdownEditor.setMarkdown(text); win.__rowChanges = 0;
        }, header + "\n" + one);
      } else {
        await page.waitForFunction(() => window.__markdownEditor && __markdownMode === "isolated");
        await page.evaluate(async text => {
          __markdownEditor.destroy(); window.__rowChanges = 0;
          window.__markdownEditor = await __initMarkdownSurface({ element: document.getElementById("markdown-editor"), actions: ["table-row-after", "table-row-delete", "undo", "redo"], onChange: () => __rowChanges++ });
          __markdownEditor.setMarkdown(text); window.__rowChanges = 0;
        }, header + "\n" + one);
      }
      const view = page.frameLocator(mode === "whole" ? "#isolated-editor" : ".lightmarkdown-surface-frame");
      const input = view.locator(".lightmarkdown-input"), bar = (mode === "whole" ? view : page).getByRole("group", { name: "Markdown formatting" });
      const read = () => mode === "whole" ? input.evaluate(node => node.ownerDocument.defaultView.__markdownEditor.getMarkdown()) : page.evaluate(() => __markdownEditor.getMarkdown());
      await input.evaluate(node => {
        const doc = node.ownerDocument, range = doc.createRange(); range.setStart(node.children[2].firstChild, 2); range.collapse(true);
        node.focus(); doc.getSelection().removeAllRanges(); doc.getSelection().addRange(range); node.dispatchEvent(new Event("focus"));
      });
      monitor = true; await bar.getByRole("button", { name: "Add Row After", exact: true }).click();
      assert.equal(await read(), header + "\n" + one + "\n" + empty);
      await bar.getByRole("button", { name: "Delete Row", exact: true }).click(); assert.equal(await read(), header + "\n" + one);
      assert.equal(mode === "whole" ? await input.evaluate(node => node.ownerDocument.defaultView.__rowChanges) : await page.evaluate(() => __rowChanges), 2);
      await page.keyboard.press("Control+z"); assert.equal(await read(), header + "\n" + one + "\n" + empty);
      await page.keyboard.press("Control+z"); assert.equal(await read(), header + "\n" + one); monitor = false;
    }
    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    console.log(`${name}: table add/delete body rows, headers/delimiters, source/caret/containers, callbacks/native history, guards, custom/keyboard-only and both iframe paths: ok`);
  } finally { await page.close(); }
}
module.exports = { tableRowChecks };
if (require.main === module) (async () => {
  const { chromium, firefox } = require("playwright"), { pathToFileURL } = require("node:url"), path = require("node:path");
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch();
    try { await tableRowChecks(browser, pathToFileURL(path.resolve(__dirname, "..")).href, name); }
    finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
