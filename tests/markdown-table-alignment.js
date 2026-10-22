/* Delimiter-only alignment, source selections, native history and state. */
const assert = require("node:assert/strict");
const modes = ["left", "center", "right", "none"], titles = ["Align Column Left", "Center Column", "Align Column Right", "Clear Column Alignment"];
const marker = (mode, dashes = "---") => (mode === "left" || mode === "center" ? ":" : "") + dashes + (mode === "right" || mode === "center" ? ":" : "");
const table = "| H | Other |\n| --- | ---: |\n| one | two |";

async function tableAlignmentChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [], requests = []; let monitor = false;
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (monitor) requests.push(request.url()); });
  try {
    await page.goto(base + "/tests/fixtures/markdown.html"); await page.waitForFunction(() => window.__markdownEditor);
    const bar = page.getByRole("group", { name: "Markdown formatting" }), button = mode => bar.getByRole("button", { name: titles[modes.indexOf(mode)], exact: true });
    for (const mode of modes) assert.equal(await button(mode).count(), 0);
    const mount = options => page.evaluate(options => {
      __markdownEditor.destroy(); window.__markdownChanges = [];
      window.__markdownEditor = __initMarkdown({ element: document.getElementById("editor"),
        actions: ["table-align-left", "table-align-center", "table-align-right", "table-align-none", "undo", "redo"],
        shortcuts: { "table-align-left": "Alt+Shift+l", "table-align-center": "Alt+Shift+c", "table-align-right": "Alt+Shift+r", "table-align-none": "Alt+Shift+n" }, ...options,
        onChange: value => __markdownChanges.push(value) });
      window.prompt = () => { throw new Error("Unexpected alignment prompt"); };
    }, options);
    await mount({ shortcuts: false });
    for (const mode of modes) assert.equal(await button(mode).getAttribute("aria-keyshortcuts"), null);
    await mount({}); monitor = true;
    const source = page.locator("#editor .lightmarkdown-input"), get = () => page.evaluate(() => __markdownEditor.getMarkdown());
    const count = () => page.evaluate(() => __markdownChanges.length - __alignBefore);
    const history = () => source.evaluate(() => [document.queryCommandEnabled("undo"), document.queryCommandEnabled("redo")]);
    const prepare = (text, start, end = start, shape = "blocks") => page.evaluate(({ text, start, end, shape }) => {
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
      window.__alignBefore = __markdownChanges.length;
    }, { text, start, end, shape });
    const state = async mode => {
      for (const value of modes) {
        assert.equal(await button(value).isEnabled(), true);
        assert.equal(await button(value).getAttribute("aria-pressed"), String(value === mode));
      }
    };
    const rememberNodes = () => source.evaluate(node => {
      const walk = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_ALL), nodes = [];
      while (walk.nextNode()) nodes.push(walk.currentNode);
      window.__alignNodes = nodes; window.__alignHTML = node.innerHTML;
    });
    const sameNodes = () => source.evaluate(node => {
      const walk = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_ALL), nodes = [];
      while (walk.nextNode()) nodes.push(walk.currentNode);
      return node.innerHTML === __alignHTML && nodes.length === __alignNodes.length && nodes.every((item, index) => item === __alignNodes[index]);
    });
    const check = async (text, start, end, mode, expected, shape, initial) => {
      const label = `${name}/${shape}/${initial}->${mode}: ${JSON.stringify(text)} at ${start}:${end}`;
      await prepare(text, start, end, shape); await state(initial);
      const flags = await history(); await rememberNodes(); await button(mode).click();
      assert.equal(await get(), expected, label); assert.equal(await count(), text === expected ? 0 : 1); await state(mode);
      if (text === expected) { assert.equal(await sameNodes(), true); assert.deepEqual(await history(), flags); }
      assert.equal(await page.evaluate(() => getSelection().toString()), text.slice(start, end), label + ": selected source");
      assert.equal(await source.evaluate(node => node === node.ownerDocument.activeElement), true);
      const before = await count(), native = await history(); await rememberNodes();
      await button(mode).click(); assert.equal(await get(), expected); assert.equal(await count(), before);
      assert.equal(await sameNodes(), true, "already-aligned invocation never rewrites source nodes"); assert.deepEqual(await history(), native);
      let difference = 0;
      while (difference < text.length && text[difference] === expected[difference]) difference++;
      const delta = start > difference ? expected.length - text.length : 0;
      await page.keyboard.insertText("NEW");
      assert.equal(await get(), expected.slice(0, start + delta) + "NEW" + expected.slice(end + delta), label + ": mapped caret/range");
      assert.equal(await count(), before + 1); await page.keyboard.press("Control+z"); assert.equal(await get(), expected);
      if (text !== expected) {
        await page.keyboard.press("Control+z"); assert.equal(await get(), text, label + ": one alignment undo");
        await page.keyboard.press("Control+Shift+z"); assert.equal(await get(), expected);
      }
    };
    for (const shape of ["blocks", "lf", "br"]) {
      for (const initial of modes) for (const mode of modes) {
        const text = table.replace("| --- |", "| " + marker(initial) + " |"), expected = table.replace("| --- |", "| " + marker(mode) + " |");
        const start = mode === "left" || mode === "right" ? 2 : text.indexOf("one");
        await check(text, start, start + (mode === "right" ? 0 : start === 2 ? 1 : 3), mode, expected, shape, initial);
      }
      const cases = [
        [table, 8, 10, "center", table.replace("---:", ":---:"), "right"],
        ["H|B\n-----|:--:\nx|y", 0, 1, "right", "H|B\n-----:|:--:\nx|y", "none"],
        ["H|\n-|", 0, 1, "center", "H|\n:-:|", "none"],
        ["| H | B |\n| \t:-----\t |\t--:\t|\n| x | y |", 6, 7, "none", "| H | B |\n| \t:-----\t |\t--\t|\n| x | y |", "right"],
        ["| H |\n| :---: |", 2, 3, "none", "| H |\n| --- |", "center"],
        ["|  | B |\n| --- | --- |\n|  | y |", 3, 3, "left", "|  | B |\n| :--- | --- |\n|  | y |", "none"],
        [table + "\n\n" + table, 2, 3, "center", table.replace("| --- |", "| :---: |") + "\n\n" + table, "none"]
      ];
      const rich = table.replace("one", "![alt](photo.png)").replace("two", "🦊 \\| `code`");
      cases.push([rich, rich.indexOf("photo"), rich.indexOf("photo") + 5, "center", rich.replace("| --- |", "| :---: |"), "none"]);
      cases.push([rich, rich.indexOf("code"), rich.indexOf("code") + 4, "center", rich.replace("---:", ":---:"), "right"]);
      cases.push([rich, rich.indexOf("🦊"), rich.indexOf("🦊") + 2, "none", rich.replace("---:", "---"), "right"]);
      for (const [first, rest] of [["> - ", ">   "], [">\t", "> "], ["12. ", "    "]]) {
        const wrap = value => first + value.replaceAll("\n", "\n" + rest), text = wrap(table);
        cases.push([text, text.indexOf("one") + 1, text.indexOf("one") + 1, "left", wrap(table.replace("| --- |", "| :--- |")), "none"]);
      }
      const task = "- [X] first\n  \n  " + table.replaceAll("\n", "\n  ") + "\n- next";
      cases.push([task, task.indexOf("one"), task.indexOf("one") + 3, "right", task.replace("| --- |", "| ---: |"), "none"]);
      const lazy = "- first\nH|B\n  ---|---\n  x|y";
      cases.push([lazy, lazy.indexOf("H"), lazy.indexOf("H") + 1, "center", lazy.replace("---|---", ":---:|---"), "none"]);
      for (const [text, start, end, mode, expected, initial] of cases) await check(text, start, end, mode, expected, shape, initial);
    }
    for (const [text, start, end = start] of [["plain", 1], ["", 0], [table, 0], [table, 13], [table, 2, 10], [table, 2, table.indexOf("one")],
      [table, table.indexOf("---")], [table + "\nshort", 2], [table + "\n| x | y | z |", 2], ["```\n" + table + "\n```", 6], ["<div>\n" + table, 8], ["> " + table.replaceAll("\n", "\n> "), 1]]) {
      await prepare(text, start, end); const flags = await history();
      for (const mode of modes) {
        assert.equal(await button(mode).isDisabled(), true, `${name}: refused ${JSON.stringify([text, start, end])}`);
        assert.equal(await button(mode).getAttribute("aria-pressed"), "false"); await button(mode).evaluate(node => node.click());
      }
      await page.keyboard.press("Alt+Shift+c"); assert.equal(await get(), text); assert.equal(await count(), 0); assert.deepEqual(await history(), flags);
    }
    await prepare(table, table.indexOf("Other")); await state("right"); const stateFlags = await history(); await rememberNodes();
    await page.keyboard.press("Home"); await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector('button[aria-label="Clear Column Alignment"]').getAttribute("aria-pressed") === "true");
    await state("none"); assert.equal(await get(), table); assert.equal(await count(), 0); assert.equal(await sameNodes(), true); assert.deepEqual(await history(), stateFlags);
    const unsafe = "H|B\n:- |---\nx|y";
    await prepare(unsafe, 0); await state("left"); const flags = await history();
    await button("none").click(); assert.equal(await get(), unsafe); assert.equal(await count(), 0); assert.deepEqual(await history(), flags);
    assert.equal(await page.getByText("This column cannot be aligned without changing surrounding Markdown.", { exact: true }).isVisible(), true);
    await prepare(table, 2); await source.dispatchEvent("compositionstart");
    for (const mode of modes) { assert.equal(await button(mode).isDisabled(), true); assert.equal(await button(mode).getAttribute("aria-pressed"), "false"); }
    await page.keyboard.press("Alt+Shift+c"); assert.equal(await count(), 0); await source.dispatchEvent("compositionend");
    await prepare("before\n\n" + table + "\n\nuntouched", 10, 11);
    await page.evaluate(() => { window.__alignHead = __markdownEditor.content.firstChild; window.__alignTail = __markdownEditor.content.lastChild; });
    await button("center").focus(); await page.keyboard.press("Enter");
    assert.equal(await get(), "before\n\n" + table.replace("| --- |", "| :---: |") + "\n\nuntouched");
    assert.equal(await page.evaluate(() => __alignHead === __markdownEditor.content.firstChild && __alignTail === __markdownEditor.content.lastChild), true);
    await mount({ actions: [] }); await prepare(table, table.indexOf("one"), table.indexOf("one") + 3);
    await page.keyboard.press("Alt+Shift+c"); await page.keyboard.press("Alt+Shift+c"); assert.equal(await count(), 1);
    assert.equal(await get(), table.replace("| --- |", "| :---: |")); assert.equal(await page.evaluate(() => getSelection().toString()), "one");
    await page.keyboard.press("Alt+Shift+n"); assert.equal(await get(), table); assert.equal(await count(), 2);
    await page.keyboard.press("Control+z"); assert.equal(await get(), table.replace("| --- |", "| :---: |"));
    await page.keyboard.press("Control+z"); assert.equal(await get(), table);
    assert.equal(await page.locator('#editor [aria-label="Markdown formatting"]').evaluate(node => node.hidden), true);
    await page.evaluate(() => {
      __markdownEditor.destroy(); window.__customAlign = 0;
      window.__markdownEditor = __initMarkdown({ element: document.getElementById("editor"),
        actions: ["table-align-left", "table-align-center", "table-align-right", "table-align-none"].map(name => ({ name, result: () => __customAlign++, state: () => true })),
        shortcuts: { "table-align-center": "Alt+Shift+c" }, onChange: value => __markdownChanges.push(value) });
    });
    await prepare("plain", 1);
    for (const mode of modes) { await button(mode).click(); assert.equal(await button(mode).getAttribute("aria-pressed"), "true"); }
    await page.keyboard.press("Alt+Shift+c"); assert.equal(await page.evaluate(() => __customAlign), 5); assert.equal(await count(), 0);
    await page.evaluate(() => { window.__deadAlign = __markdownEditor.content; __markdownEditor.destroy(); });
    assert.equal(await page.evaluate(() => __deadAlign.dispatchEvent(new KeyboardEvent("keydown", { key: "C", altKey: true, shiftKey: true, bubbles: true, cancelable: true }))), true);
    monitor = false;
    for (const mode of ["whole", "surface"]) {
      await page.goto(base + (mode === "whole" ? "/examples/markdown-iframe.html" : "/examples/markdown.html?mode=isolated"));
      if (mode === "whole") {
        await page.waitForFunction(() => !document.getElementById("read-markdown").disabled);
        await page.frameLocator("#isolated-editor").locator(".lightmarkdown-input").evaluate((node, text) => {
          const win = node.ownerDocument.defaultView, host = node.closest(".lightmarkdown"); win.__markdownEditor.destroy(); win.__alignmentChanges = 0;
          win.__markdownEditor = win.maiden.init({ element: host,
            actions: ["table-align-left", "table-align-center", "table-align-right", "table-align-none", "undo", "redo"], onChange: () => win.__alignmentChanges++ });
          win.__markdownEditor.setMarkdown(text); win.__alignmentChanges = 0;
        }, table);
      } else {
        await page.waitForFunction(() => window.__markdownEditor && __markdownMode === "isolated");
        await page.evaluate(async text => {
          __markdownEditor.destroy(); window.__alignmentChanges = 0;
          window.__markdownEditor = await __initMarkdownSurface({ element: document.getElementById("markdown-editor"),
            actions: ["table-align-left", "table-align-center", "table-align-right", "table-align-none", "undo", "redo"], onChange: () => __alignmentChanges++ });
          __markdownEditor.setMarkdown(text); window.__alignmentChanges = 0;
        }, table);
      }
      const view = page.frameLocator(mode === "whole" ? "#isolated-editor" : ".lightmarkdown-surface-frame");
      const input = view.locator(".lightmarkdown-input"), toolbar = (mode === "whole" ? view : page).getByRole("group", { name: "Markdown formatting" });
      const read = () => mode === "whole" ? input.evaluate(node => node.ownerDocument.defaultView.__markdownEditor.getMarkdown()) : page.evaluate(() => __markdownEditor.getMarkdown());
      await input.evaluate(node => {
        const doc = node.ownerDocument, range = doc.createRange(); range.setStart(node.children[2].firstChild, 2); range.setEnd(node.children[2].firstChild, 5);
        node.focus(); doc.getSelection().removeAllRanges(); doc.getSelection().addRange(range); node.dispatchEvent(new Event("focus"));
      });
      monitor = true; const center = toolbar.getByRole("button", { name: "Center Column", exact: true });
      await center.click(); await center.click(); assert.equal(await read(), table.replace("| --- |", "| :---: |"));
      assert.equal(await center.getAttribute("aria-pressed"), "true");
      await toolbar.getByRole("button", { name: "Align Column Right", exact: true }).click(); assert.equal(await read(), table.replace("| --- |", "| ---: |"));
      assert.equal(await input.evaluate(node => node.ownerDocument.getSelection().toString()), "one");
      assert.equal(mode === "whole" ? await input.evaluate(node => node.ownerDocument.defaultView.__alignmentChanges) : await page.evaluate(() => __alignmentChanges), 2);
      await page.keyboard.press("Control+z"); assert.equal(await read(), table.replace("| --- |", "| :---: |"));
      await page.keyboard.press("Control+z"); assert.equal(await read(), table); monitor = false;
    }
    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    console.log(`${name}: table alignment transitions/pressed state, no-ops, exact markers/padding, mapped selection, native history, containers/guards, custom/keyboard-only/teardown and both iframe layouts: ok`);
  } finally { await page.close(); }
}
module.exports = { tableAlignmentChecks };
if (require.main === module) (async () => {
  const { chromium, firefox } = require("playwright"), { pathToFileURL } = require("node:url"), path = require("node:path");
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch();
    try { await tableAlignmentChecks(browser, pathToFileURL(path.resolve(__dirname, "..")).href, name); }
    finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
