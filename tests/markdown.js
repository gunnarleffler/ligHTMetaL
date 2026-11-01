/* Real-browser checks for the Markdown companion. No Flask process needed.
 * Run after building: NODE_PATH=$(npm root -g) node tests/markdown.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium, firefox, webkit } = require("playwright");
const { runSyntaxFixtures } = require("./markdown-syntax");
const { reviewChecks } = require("./markdown-review");
const { headingChecks } = require("./markdown-headings");
const { formattingChecks } = require("./markdown-formatting");
const { codeChecks } = require("./markdown-code");
const { codeBackgroundChecks } = require("./markdown-code-background");
const { painterChecks } = require("./markdown-painter");
const { toolbarGroupChecks } = require("./toolbar-groups");
const { substantialChecks } = require("./substantial");
const { writingChecks } = require("./markdown-writing");
const { indentationChecks } = require("./markdown-indentation");
const { ruleChecks } = require("./markdown-rules");
const { shortcutChecks } = require("./markdown-shortcuts");
const { stateChecks } = require("./markdown-state");
const { imageChecks } = require("./markdown-images");
const { tableChecks } = require("./markdown-tables");
const { tableRowChecks } = require("./markdown-table-rows");
const { tableColumnChecks } = require("./markdown-table-columns");
const { tableAlignmentChecks } = require("./markdown-table-alignment");
const { tableFormatChecks } = require("./markdown-table-format");
const { tablePickerChecks } = require("./markdown-table-picker");
const { statusChecks } = require("./markdown-status");
const { guideChecks } = require("./markdown-guide");
const { previewChecks } = require("./markdown-preview");
const { meltdownChecks } = require("./markdown-meltdown");
const { polishChecks } = require('./markdown-polish');
const { fullscreenChecks } = require("./markdown-fullscreen");
const { splitChecks } = require("./markdown-split");
const ROOT = path.resolve(__dirname, "..");

async function runMarkdownSmoke(page) {
  const toolbar = page.getByRole("group", { name: "Markdown formatting" });
  await page.waitForFunction(() => window.__markdownEditor);
  assert.equal(await toolbar.getByRole("button", { name: "Bold", exact: true }).getAttribute("title"), "Bold (Ctrl/Cmd+B)");
  assert.equal(await toolbar.getByRole("button", { name: "Bold", exact: true }).getAttribute("aria-keyshortcuts"), "Control+b Meta+b");
  assert.equal(await page.evaluate(() => {
    __markdownEditor.setMarkdown("## Package\n\nHello **Markdown**.\n");
    return __markdownEditor.getMarkdown();
  }), "## Package\n\nHello **Markdown**.\n");
  assert.match(await page.locator(".lightmarkdown-input").evaluate(node => getComputedStyle(node).fontFamily), /monospace/);
  assert.equal(await page.locator(".lightmarkdown-bold:visible").textContent(), "Markdown");
  await page.evaluate(() => {
    const node = __markdownEditor.content.children[2].firstChild;
    const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 5);
    __markdownEditor.content.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  await page.getByRole("group", { name: "Markdown formatting" }).getByRole("button", { name: "Italic", exact: true }).click();
  assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), "## Package\n\n*Hello* **Markdown**.\n");
  const boundaries = "``` bad`info\n## After ###\n`a``b`\n````\n## literal\n````\n\nSetext\n---\n\n`first\nlast`\n\n> - ```\n>   **literal**\n>   ```\n>   Nested\n>   ===\n\n***Package emphasis***\n**`package code`**\nword__plain__word\n[**package label**](path(one) \"title\")\n![*alt*](<image path>)";
  await page.evaluate(text => __markdownEditor.setMarkdown(text), boundaries);
  assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), boundaries);
  assert.deepEqual(await page.locator(".lightmarkdown-input").evaluate(node => [...node.children].filter(child => child.dataset.mdHeading).map(child => child.dataset.mdHeading)), ["2", "2", "1"]);
  assert.deepEqual(await page.locator(".lightmarkdown-code:visible").allTextContents(), ["a``b", "## literal", "first", "last", "**literal**", "package code"]);
  assert.deepEqual(await page.locator(".lightmarkdown-bold:visible").allTextContents(), ["Package emphasis", "package code", "package label"]);
  assert.deepEqual(await page.locator(".lightmarkdown-italic:visible").allTextContents(), ["Package emphasis", "alt"]);
  assert.deepEqual(await page.locator(".lightmarkdown-link:visible").allTextContents(), ["package label", "alt"]);
  assert.deepEqual(await page.locator(".lightmarkdown-url:visible").allTextContents(), ["path(one)", "title", "image path"]);
  // Exercise resolved-pair toggles and literal guards in every shipped build.
  for (const text of ["***Package***", "`**literal**`", "~strike~"]) {
    await page.evaluate(text => {
      const api = __markdownEditor; api.setMarkdown(text);
      const range = document.createRange(); range.setStart(api.content.firstChild.firstChild, 5); range.collapse(true);
      api.content.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
      api.content.dispatchEvent(new Event("focus"));
    }, text);
    if (text.startsWith("`")) {
      assert.equal(await toolbar.getByRole("button", { name: "Bold", exact: true }).isDisabled(), true);
      await page.keyboard.press("Control+b");
      assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), text);
    } else {
      const title = text.startsWith("~") ? "Strike-through" : "Italic";
      await toolbar.getByRole("button", { name: title, exact: true }).click();
      assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), title === "Italic" ? "**Package**" : "strike");
    }
  }
  // Code metadata and template insertion must work in all package entry points.
  for (const [text, title, expected] of [
    ["``metal``", "Inline Code", "metal"],
    ["metal", "Code Block", "```\nmetal\n```"],
    ["", "Link", "[link](https://www.example.com)"],
    ["", "Image", "![image](https://www.example.com/image.png)"],
    ["", "Table", "| Column 1 | Column 2 |\n| -------- | -------- |\n|          |          |"],
    ["- metal", "Link", "- metal[link](https://www.example.com)"],
    ["1.", "Link", "1. [link](https://www.example.com)"]
  ]) {
    await page.evaluate(({ text, title }) => {
      const api = __markdownEditor; api.setMarkdown(text);
      const range = document.createRange(); range.selectNodeContents(api.content); range.collapse(false);
      api.content.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
      if (text.startsWith("``")) { range.setStart(api.content.firstChild.firstChild, 4); range.collapse(true); }
      if (title === "Link" && text) { range.setStart(api.content.firstChild.firstChild, text.length); range.collapse(true); }
      api.content.dispatchEvent(new Event("focus"));
    }, { text, title });
    await toolbar.getByRole("button", { name: title, exact: true }).click();
    if (title === "Table") {
      await page.getByRole("menuitem", { name: "Insert Table…", exact: true }).click();
      await page.locator(".lightmarkdown-table-picker").getByRole("button", { name: "2 columns, 2 rows", exact: true }).click();
    }
    assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), expected);
    if (title === "Code Block") {
      assert.equal(await toolbar.getByRole("button", { name: title, exact: true }).getAttribute("aria-pressed"), "true");
      await toolbar.getByRole("button", { name: title, exact: true }).click();
      assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), text);
    }
    if (title === "Table") assert.equal(await page.evaluate(() => getSelection().toString()), "Column 1");
    if (title === "Link" || title === "Image") assert.equal(await page.evaluate(() => getSelection().toString()),
      title === "Image" ? "https://www.example.com/image.png" : "https://www.example.com");
  }
  await page.evaluate(() => {
    const api = __markdownEditor; api.setMarkdown('A|B\n---|---\none|two');
    const range = document.createRange(); range.setStart(api.content.children[2].firstChild, 0); range.setEnd(api.content.children[2].firstChild, 3);
    api.content.focus(); getSelection().removeAllRanges(); getSelection().addRange(range); api.content.dispatchEvent(new Event('focus'));
  });
  await toolbar.getByRole('button', { name: 'Table', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Format Table', exact: true }).click();
  assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), '| A   | B   |\n| --- | --- |\n| one | two |');
  assert.equal(await page.evaluate(() => getSelection().toString()), 'one');
  await page.keyboard.press('Control+z'); assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), 'A|B\n---|---\none|two');
  await page.evaluate(() => {
    const api = __markdownEditor; api.setMarkdown('> - ![alt](<package image.png> "title")');
    const range = document.createRange(); range.setStart(api.content.firstChild.firstChild, 7); range.collapse(true);
    api.content.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
    api.content.dispatchEvent(new Event('focus'));
  });
  await toolbar.getByRole('button', { name: 'Image', exact: true }).click();
  assert.equal(await page.evaluate(() => getSelection().toString()), 'package image.png');
  assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), '> - ![alt](<package image.png> "title")');
  await page.keyboard.type('new.png');
  assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), '> - ![alt](<new.png> "title")');
  await page.keyboard.press('Control+z');
  assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), '> - ![alt](<package image.png> "title")');
  await page.evaluate(() => {
    const api = __markdownEditor; api.setMarkdown("> - [X] package");
    const range = document.createRange(); range.selectNodeContents(api.content); range.collapse(false);
    api.content.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), "> - [X] package\n> - [ ] ");
  await page.keyboard.press("Control+z");
  assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), "> - [X] package");
  await toolbar.getByRole("button", { name: "Ordered List", exact: true }).click();
  assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), "> 1. [X] package");
  assert.deepEqual(await page.evaluate(() => {
    const host = document.createElement("div"); document.body.append(host);
    const api = __initMarkdown({ element: host, actions: ["|", "checklist", "|", "|", "task-toggle", "|"],
      shortcuts: { checklist: "Alt+Shift+t", codeblock: "Alt+Shift+c", image: "Alt+Shift+m",
        "table-row-after": "Alt+Shift+r", "table-row-delete": "Alt+Shift+d",
        "table-column-after": "Alt+Shift+a", "table-column-delete": "Alt+Shift+x",
        "table-align-center": "Alt+Shift+g", "table-align-none": "Alt+Shift+n" } });
    api.setMarkdown("metal"); api.content.focus();
    const range = document.createRange(); range.selectNodeContents(api.content); range.collapse(false);
    getSelection().removeAllRanges(); getSelection().addRange(range);
    api.content.dispatchEvent(new KeyboardEvent("keydown", { key: "T", altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    const task = api.getMarkdown();
    host.querySelector('button[title="Toggle Task"]').click();
    const checked = api.getMarkdown(), separators = host.querySelectorAll('[role="separator"]');
    const divider = separators[0], box = divider.getBoundingClientRect();
    const separated = separators.length === 1 && divider.getAttribute("aria-orientation") === "vertical" && box.width > 0 && box.height > 0;
    const hinted = host.querySelector('button[aria-label="Task List"]').getAttribute("aria-keyshortcuts") === "Alt+Shift+t";
    api.setMarkdown("metal"); api.content.focus(); range.selectNodeContents(api.content); range.collapse(false);
    getSelection().removeAllRanges(); getSelection().addRange(range);
    api.content.dispatchEvent(new KeyboardEvent("keydown", { key: "C", altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    const keyboardCode = api.getMarkdown();
    api.setMarkdown("https://example.com/package.png"); api.content.focus(); range.selectNodeContents(api.content.firstChild);
    getSelection().removeAllRanges(); getSelection().addRange(range);
    api.content.dispatchEvent(new KeyboardEvent("keydown", { key: "M", altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    const keyboardImage = api.getMarkdown(), imageURL = getSelection().toString();
    range.setStart(api.content.firstChild.firstChild, 3); range.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(range);
    api.content.dispatchEvent(new KeyboardEvent('keydown', { key: 'M', altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    const existingImageURL = getSelection().toString(), unchangedImage = api.getMarkdown() === keyboardImage;
    const rowTable = "| A | B |\n| --- | --- |\n| one | two |";
    api.setMarkdown(rowTable); api.content.focus(); range.setStart(api.content.children[2].firstChild, 2); range.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(range);
    api.content.dispatchEvent(new KeyboardEvent("keydown", { key: "R", altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    const keyboardRow = api.getMarkdown();
    api.content.dispatchEvent(new KeyboardEvent("keydown", { key: "D", altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    const keyboardRowRestored = api.getMarkdown() === rowTable;
    api.content.dispatchEvent(new KeyboardEvent("keydown", { key: "A", altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    const keyboardColumn = api.getMarkdown(), columnSelected = getSelection().toString();
    api.content.dispatchEvent(new KeyboardEvent("keydown", { key: "X", altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    const keyboardColumnRestored = api.getMarkdown() === rowTable;
    api.content.dispatchEvent(new KeyboardEvent("keydown", { key: "G", altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    const keyboardAlignment = api.getMarkdown();
    api.content.dispatchEvent(new KeyboardEvent("keydown", { key: "N", altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    const keyboardAlignmentRestored = api.getMarkdown() === rowTable;
    api.destroy(); host.remove();
    return { task, checked, separated, hinted, keyboardCode, keyboardImage, imageURL, existingImageURL, unchangedImage, keyboardRow, keyboardRowRestored,
      keyboardColumn, columnSelected, keyboardColumnRestored, keyboardAlignment, keyboardAlignmentRestored };
  }), { task: "- [ ] metal", checked: "- [x] metal", separated: true, hinted: true, keyboardCode: "```\nmetal\n```",
    keyboardImage: "![image](https://example.com/package.png)", imageURL: "https://example.com/package.png",
    existingImageURL: 'https://example.com/package.png', unchangedImage: true,
    keyboardRow: "| A | B |\n| --- | --- |\n| one | two |\n|  |  |", keyboardRowRestored: true,
    keyboardColumn: "| A | Column | B |\n| --- | --- | --- |\n| one |  | two |", columnSelected: "Column", keyboardColumnRestored: true,
    keyboardAlignment: "| A | B |\n| --- | :---: |\n| one | two |", keyboardAlignmentRestored: true });
  assert.deepEqual(await page.evaluate(() => {
    const host = document.createElement("div"); document.body.append(host); let changes = 0;
    const api = __initMarkdown({ element: host, actions: ["table", "table-row-after", "table-row-delete", "table-column-after", "table-column-delete",
      "table-align-left", "table-align-center", "table-align-right", "table-align-none"], onChange: () => changes++ });
    const range = document.createRange(); range.selectNodeContents(api.content); range.collapse(false);
    api.content.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
    const button = host.querySelector('button[aria-label="Table"]'); button.click();
    host.querySelector('.lightmarkdown-table-menu [role="menuitem"]').click();
    const pickerNoEdit = api.getMarkdown() === "" && changes === 0 && !host.querySelector(".lightmarkdown-table-picker").hidden;
    host.querySelector('.lightmarkdown-table-picker [data-row="2"][data-column="2"]').click();
    const result = { text: api.getMarkdown(), selected: getSelection().toString(), changes, pickerNoEdit,
      pressed: button.getAttribute("aria-pressed"), shortcut: button.getAttribute("aria-keyshortcuts"), noGrid: !host.querySelector("table") };
    const add = host.querySelector('button[aria-label="Add Row After"]'), remove = host.querySelector('button[aria-label="Delete Row"]');
    add.click(); result.rowsAdded = api.getMarkdown(); remove.click(); result.rowRestored = api.getMarkdown() === result.text;
    remove.click(); result.headerOnly = api.getMarkdown(); add.click(); result.rebuilt = api.getMarkdown();
    result.rowChanges = changes - result.changes;
    result.rowPressed = [add, remove].map(button => button.getAttribute("aria-pressed"));
    const columnAdd = host.querySelector('button[aria-label="Add Column After"]'), columnDelete = host.querySelector('button[aria-label="Delete Column"]');
    columnAdd.click(); result.columnAdded = api.getMarkdown(); columnDelete.click(); result.columnRestored = api.getMarkdown() === result.rebuilt;
    result.columnChanges = changes - result.changes - result.rowChanges;
    result.columnPressed = [columnAdd, columnDelete].map(button => button.getAttribute("aria-pressed"));
    const align = ["Align Column Left", "Center Column", "Align Column Right", "Clear Column Alignment"].map(title => host.querySelector(`button[aria-label="${title}"]`));
    align[0].click(); align[2].click(); align[1].click(); result.aligned = api.getMarkdown();
    result.alignmentPressed = align.map(button => button.getAttribute("aria-pressed"));
    const beforeNoop = changes; align[1].click(); result.alignmentNoop = changes === beforeNoop;
    align[3].click(); result.alignmentRestored = api.getMarkdown() === result.rebuilt;
    result.alignmentChanges = changes - result.changes - result.rowChanges - result.columnChanges;
    result.clearedPressed = align[3].getAttribute("aria-pressed");
    api.setMarkdown(""); const beforeSized = changes; button.click();
    host.querySelector('.lightmarkdown-table-menu [role="menuitem"]').click();
    const picker = host.querySelector(".lightmarkdown-table-picker"), fields = picker.querySelectorAll('input[type="number"]');
    fields[0].value = "4"; fields[1].value = "1"; picker.querySelector("form").requestSubmit();
    result.sized = api.getMarkdown(); result.sizedChanges = changes - beforeSized; result.sizedSelected = getSelection().toString();
    api.setMarkdown(result.text); result.reloaded = api.getMarkdown() === result.text;
    api.destroy(); host.remove(); return result;
  }), { text: "| Column 1 | Column 2 |\n| -------- | -------- |\n|          |          |", selected: "Column 1", changes: 1, pickerNoEdit: true,
    pressed: null, shortcut: null, noGrid: true, reloaded: true,
    rowsAdded: "| Column 1 | Column 2 |\n| -------- | -------- |\n|  |  |\n|          |          |", rowRestored: true,
    headerOnly: "| Column 1 | Column 2 |\n| -------- | -------- |", rebuilt: "| Column 1 | Column 2 |\n| -------- | -------- |\n|  |  |", rowChanges: 4, rowPressed: [null, null],
    columnAdded: "| Column 1 | Column | Column 2 |\n| -------- | --- | -------- |\n|  |  |  |", columnRestored: true,
    columnChanges: 2, columnPressed: [null, null],
    aligned: "| Column 1 | Column 2 |\n| -------- | :--------: |\n|  |  |", alignmentPressed: ["false", "true", "false", "false"],
    alignmentNoop: true, alignmentRestored: true, alignmentChanges: 4, clearedPressed: "true",
    sized: "| Column 1 | Column 2 | Column 3 | Column 4 |\n| -------- | -------- | -------- | -------- |", sizedChanges: 1, sizedSelected: "Column 1" });
  await page.evaluate(() => {
    const api = __markdownEditor; api.setMarkdown("package");
    const range = document.createRange(); range.selectNodeContents(api.content); range.collapse(false);
    api.content.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), "    package");
  assert.equal(await page.evaluate(() => {
    const content = __markdownEditor.content;
    return content.ownerDocument.getElementById(content.getAttribute("aria-describedby"))?.className;
  }), "lightmarkdown-keyboard-hint");
  await page.keyboard.press("Control+z");
  assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), "package");
  await page.evaluate(() => {
    const api = __markdownEditor; api.setMarkdown("> - metal");
    const range = document.createRange(); range.setStart(api.content.firstChild.firstChild, 6); range.collapse(true);
    api.content.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
    api.content.dispatchEvent(new Event("focus"));
  });
  await toolbar.getByRole("button", { name: "Horizontal Line", exact: true }).click();
  assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), "> - me\n>   \n>   ---\n>   \n>   tal");
  await page.keyboard.press("Control+z");
  assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), "> - metal");
  await page.evaluate(() => {
    const api = __markdownEditor; api.setMarkdown("```\nliteral\n```");
    const range = document.createRange(); range.setStart(api.content.children[1].firstChild, 3); range.collapse(true);
    api.content.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
    api.content.dispatchEvent(new Event("focus"));
  });
  assert.equal(await toolbar.getByRole("button", { name: "Horizontal Line", exact: true }).isDisabled(), true);
  assert.equal(await toolbar.getByRole("button", { name: "Link", exact: true }).isDisabled(), true);
  await page.evaluate(() => {
    const api = __markdownEditor; api.setMarkdown("`metal`");
    const range = document.createRange(); range.selectNodeContents(api.content.firstChild);
    api.content.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
    api.content.dispatchEvent(new Event("focus"));
  });
  await toolbar.getByRole("button", { name: "Link", exact: true }).click();
  assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), "[`metal`](https://www.example.com)");
  await page.keyboard.press("Control+z");
  assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), "`metal`");
  assert.equal(await page.evaluate(() => ["undo", "redo"].every(command =>
    __markdownEditor.element.querySelector(`button[aria-label="${command === "undo" ? "Undo" : "Redo"}"]`).disabled === !document.queryCommandEnabled(command))), true);
  await page.evaluate(() => {
    const api = __markdownEditor; api.setMarkdown("[metal](local)");
    const range = document.createRange(); range.setStart(api.content.firstChild.firstChild, 3); range.collapse(true);
    api.content.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
    api.content.dispatchEvent(new Event("focus"));
  });
  assert.equal(await toolbar.getByRole("button", { name: "Link", exact: true }).isDisabled(), true);
}

async function checks(browser, base, name, options = {}) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [], remote = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(base).origin) remote.push(request.url());
  });
  await page.goto(base + "/tests/fixtures/markdown.html");
  await page.waitForFunction(() => window.__markdownEditor);
  const source = page.locator(".lightmarkdown-input");
  const get = () => page.evaluate(() => __markdownEditor.getMarkdown());
  const set = text => page.evaluate(text => __markdownEditor.setMarkdown(text), text);
  const select = async (a, b = a, line = 0) => {
    await page.evaluate(({ a, b, line }) => {
      const node = __markdownEditor.content.children[line].firstChild;
      const range = document.createRange(); range.setStart(node, a); range.setEnd(node, b);
      __markdownEditor.content.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
    }, { a, b, line });
  };
  const click = title => page.getByRole("button", { name: title, exact: true }).click();
  assert.equal(await get(), "");
  assert.equal(await page.evaluate(() => __markdownChanges.length), 0, "init must not emit a content change");
  assert.equal(await page.evaluate(() => typeof window.lightmetal), "undefined", "Markdown must not load the HTML editor");
  const sample = "## Heading\r\n\r\n**bold** and *italic*; <img src=x onerror=alert(1)>\r\n\t  café 日本語 🦊\r\n";
  await set(sample);
  assert.equal(await get(), sample.replace(/\r\n/g, "\n"));
  assert.equal(await page.locator(".lightmarkdown-paint img, .lightmarkdown-input img").count(), 0);
  assert.equal(await page.evaluate(() => __markdownChanges.length), 1);
  await set(sample);
  assert.equal(await page.evaluate(() => __markdownChanges.length), 2, "setMarkdown notifies even for the same value");
  await runMarkdownSmoke(page);
  await runSyntaxFixtures(page, name, options);

  await set("Alpha beta 🦊");
  await select(0, 5);
  const before = await page.evaluate(() => __markdownChanges.length);
  await click("Bold");
  assert.equal(await get(), "**Alpha** beta 🦊");
  assert.equal(await page.evaluate(() => getSelection().toString()), "Alpha");
  assert.equal(await page.getByRole("button", { name: "Bold", exact: true }).getAttribute("aria-pressed"), "true");
  assert.equal(await page.evaluate(() => __markdownChanges.length), before + 1);
  await page.keyboard.press("Control+z");
  assert.equal(await get(), "Alpha beta 🦊");
  await page.keyboard.press("Control+Shift+z");
  assert.equal(await get(), "**Alpha** beta 🦊");
  await select(2, 7); await click("Bold");
  assert.equal(await get(), "Alpha beta 🦊");
  await select(6, 10); await page.keyboard.press("Control+i");
  assert.equal(await get(), "Alpha *beta* 🦊");
  await select(6, 12); await click("Italic");
  assert.equal(await get(), "Alpha beta 🦊");
  await select(11, 13); await click("Bold");
  assert.equal(await get(), "Alpha beta **🦊**", "DOM offsets must handle UTF-16 emoji");

  await set("a\nbeta\nc"); await select(0, 4, 1); await click("Heading 2");
  assert.equal(await get(), "a\n## beta\nc");
  assert.equal(await page.evaluate(() => getSelection().toString()), "beta");
  await source.focus(); await page.keyboard.press("Control+a"); await click("Unordered List");
  assert.equal(await get(), "- a\n- ## beta\n- c");
  await source.focus(); await page.keyboard.press("Control+a"); await click("Unordered List");
  assert.equal(await get(), "a\n## beta\nc");
  await source.focus(); await page.keyboard.press("Control+a"); await click("Ordered List");
  assert.equal(await get(), "1. a\n2. ## beta\n3. c");
  await source.focus(); await page.keyboard.press("Control+a"); await click("Quote");
  assert.equal(await get(), "> 1. a\n> 2. ## beta\n> 3. c");

  const emptyHeadings = "#\n  ##\n###\n####\n#####\n######\n## \n###\t\n#######\n#not-heading\n    ## code";
  await set(emptyHeadings);
  assert.equal(await get(), emptyHeadings, "Styling must preserve empty ATX heading markers and whitespace");
  assert.deepEqual(await source.evaluate(node => [...node.children].map(child => child.getAttribute("data-md-heading"))),
    ["1", "2", "3", "4", "5", "6", "2", "3", null, null, null]);
  await paintGeometry();
  await select(0, 1);
  await page.waitForFunction(() => document.querySelector('button[title="Heading 1"]').getAttribute("aria-pressed") === "true");
  await click("Paragraph"); assert.equal(await get(), emptyHeadings.slice(1));
  await page.keyboard.press("Control+z"); assert.equal(await get(), emptyHeadings);
  await select(0, 1); await click("Heading 2");
  assert.equal(await get(), "## " + emptyHeadings.slice(1), "Changing an empty heading must not duplicate its markers");
  await page.keyboard.press("Control+z"); assert.equal(await get(), emptyHeadings);

  await set("some `code`"); await select(0, 11); await click("Inline Code");
  assert.equal(await get(), "`` some `code` ``");
  await click("Inline Code"); assert.equal(await get(), "some `code`");
  await set("");
  await source.focus(); await click("Inline Code"); assert.equal(await get(), "``");
  await click("Inline Code"); assert.equal(await get(), "");
  await set("some `code`"); await select(0, 11); await click("Code Block");
  assert.equal(await get(), "```\nsome `code`\n```");
  assert.equal(await page.evaluate(() => getSelection().toString()), "some `code`");

  await set("label"); await select(0, 5);
  await click("Link");
  assert.equal(await get(), "[label](https://www.example.com)");
  assert.equal(await page.evaluate(() => getSelection().toString()), "https://www.example.com");
  assert.equal(await page.locator(".lightmarkdown-paint a").count(), 0);
  await page.keyboard.type("/local"); assert.equal(await get(), "[label](/local)");

  // A continuous edit keeps native typing groups and the original text node.
  await set("body text"); await select(0);
  await page.evaluate(() => { window.__textNode = __markdownEditor.content.firstChild.firstChild; });
  await page.keyboard.type("A small edit. ");
  assert.equal(await get(), "A small edit. body text");
  assert.equal(await page.evaluate(() => __textNode === __markdownEditor.content.firstChild.firstChild), true);
  await click("Undo"); assert.equal(await get(), "body text");
  await click("Redo"); assert.equal(await get(), "A small edit. body text");
  await set("replacement"); await page.keyboard.press("Control+z");
  assert.equal(await get(), "replacement", "Old document undo must not overwrite setMarkdown");

  await source.focus(); await page.keyboard.press("Control+a");
  const pasted = "## Pasted\ntext **bold**\n\nliteral <img src=x onerror=alert(1)>\n";
  await source.evaluate((node, text) => {
    const data = new DataTransfer(); data.setData("text/plain", text); data.setData("text/html", "<img src=x onerror=alert(1)>");
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data }); node.dispatchEvent(event);
  }, pasted);
  assert.equal(await get(), pasted);
  assert.equal(await page.locator(".lightmarkdown-input img, .lightmarkdown-paint img").count(), 0);
  async function paintGeometry() {
    const deltas = await source.evaluate(node => {
      const blocks = [...node.previousElementSibling.children].filter(child => !child.hidden).map(child => child.firstElementChild);
      return [...node.children].map((child, index) => {
        const a = child.getBoundingClientRect(), b = blocks[index].getBoundingClientRect();
        return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height));
      });
    });
    assert.ok(deltas.length && deltas.every(value => value < 1), `Pasted source/paint geometry diverged: ${deltas}`);
  }
  await paintGeometry();
  // Native BR placeholders and plaintext-only LF shapes must reserve the same
  // final line in paint. Also clear the marker when a cached run stops needing it.
  for (const [html, expected] of [
    ["one<br><br>", "one\n"], ["one<br><br><br>", "one\n\n"],
    ["one\n\n<br>", "one\n\n"], ["<span>one<br><br></span>", "one\n"],
    ["one\n", "one\n"], ["<br>", ""], ["<br><br>", "\n"], ["one<br>two", "one\ntwo"]
  ]) {
    await source.evaluate((node, html) => {
      const block = document.createElement("div"); block.innerHTML = html;
      node.replaceChildren(block); node.dispatchEvent(new Event("input", { bubbles: true }));
    }, html);
    assert.equal(await get(), expected);
    await paintGeometry();
  }
  await source.evaluate(node => {
    node.innerHTML = "<div>one<br><br></div>";
    node.dispatchEvent(new Event("input", { bubbles: true }));
    const range = document.createRange(); range.setStart(node.firstChild, 2); range.collapse(true);
    node.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  await page.keyboard.type("tail"); assert.equal(await get(), "one\ntail");
  await click("Undo"); assert.equal(await get(), "one\n", "Toggling the paint placeholder must keep typing grouped");
  await click("Redo"); assert.equal(await get(), "one\ntail");
  await paintGeometry();
  await set(pasted);
  await source.focus(); await page.keyboard.press("Control+a");
  await source.evaluate(node => {
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: new DataTransfer() });
    node.dispatchEvent(event);
    node.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
  });
  assert.equal(await get(), pasted, "Empty/file-only paste and drops must not erase the selection");
  await source.dispatchEvent("compositionstart");
  assert.equal(await page.evaluate(() => __markdownEditor.setMarkdown("no")), false);
  assert.equal(await page.evaluate(() => __markdownEditor.insertText("no")), false);
  assert.equal(await page.getByRole("button", { name: "Bold", exact: true }).isDisabled(), true);
  await source.dispatchEvent("compositionend");
  assert.equal(await get(), pasted);

  // Mixed native runs and nested inline nodes retain their parent boundary
  // offsets. Large block collections must also map their final source position.
  await source.evaluate(node => {
    // A separator permits strong emphasis on the emoji under CommonMark
    // flanking rules; touching a letter would leave the added stars literal.
    node.innerHTML = "alpha<div>bravo <span>🦊</span></div>charlie<p>delta<br>echo<br></p>omega";
    node.dispatchEvent(new Event("input", { bubbles: true }));
    const range = document.createRange(); range.selectNodeContents(node.querySelector("span"));
    node.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  const mixed = "alpha\nbravo 🦊\ncharlie\ndelta\necho\nomega";
  assert.equal(await get(), mixed);
  await click("Bold"); assert.equal(await get(), mixed.replace("🦊", "**🦊**"));
  await page.keyboard.press("Control+z"); assert.equal(await get(), mixed);
  const bulk = Array.from({ length: 1024 }, (_, index) => `line ${index} 🦊`).join("\n");
  await set(bulk);
  await source.evaluate(node => {
    const range = document.createRange(); range.selectNodeContents(node); range.collapse(false);
    node.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  await page.evaluate(() => __markdownEditor.insertText("!"));
  assert.equal(await get(), bulk + "!");
  await page.keyboard.press("Control+z"); assert.equal(await get(), bulk);
  await set(pasted);

  const lifecycle = await page.evaluate(() => {
    const host = document.createElement("div");
    host.className = "lightmetal app";
    const owned = document.createElement("span"); owned.textContent = "Application content";
    host.append(owned); document.body.append(host);
    let invalid = false;
    try { maiden.init({ element: host, actions: ["not-real"] }); } catch (error) { invalid = error instanceof TypeError; }
    const untouched = host.childNodes.length === 1;
    let changes = 0;
    const second = maiden.init({ element: host, actions: [
      { name: "bold", result: null },
      { icon: "!", title: "Insert bang", result: editor => editor.insertText("!"), state: () => true }
    ], classes: { selected: "custom-selected" }, onChange: () => changes++ });
    second.setMarkdown("second");
    second.content.focus();
    const range = document.createRange(); range.selectNodeContents(second.content); range.collapse(false);
    getSelection().removeAllRanges(); getSelection().addRange(range);
    host.querySelector('button[title="Insert bang"]').click();
    const custom = second.getMarkdown() === "second!" && !!host.querySelector(".custom-selected");
    const detached = second.content;
    second.destroy(); second.destroy();
    const count = changes;
    detached.dispatchEvent(new Event("input"));
    const guarded = second.setMarkdown("late") === false && second.insertText("late") === false && changes === count;
    const third = maiden.init({ element: host, actions: [] });
    const hidden = host.querySelector('[role="group"]').hidden;
    let duplicate = false;
    try { maiden.init({ element: host }); } catch (error) { duplicate = error instanceof TypeError; }
    third.destroy();
    return { invalid, untouched, custom, guarded, hidden, duplicate, text: second.getMarkdown(), preserved: host.childNodes.length === 1 && host.firstChild === owned && host.className === "lightmetal app" };
  });
  assert.deepEqual(lifecycle, { invalid: true, untouched: true, custom: true, guarded: true, hidden: true, duplicate: true, text: "second!", preserved: true });
  assert.equal(await get(), pasted, "The second instance must not affect the first");
  assert.deepEqual(errors, []); assert.deepEqual(remote, []);
  await page.close();
  console.log(`${name}: Markdown API, callbacks, formatting/selection, code fences, safe links/paste, native history, composition guards and teardown: ok`);
}

async function demoChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(base + "/markdown.html");
  await page.waitForFunction(() => window.__markdownEditor);
  const initial = await page.evaluate(() => initialMarkdown);
  assert.equal(await page.locator("#raw").textContent(), initial);
  async function geometry() {
    const delta = await page.evaluate(() => {
      const input = __markdownEditor.content;
      const paint = document.querySelector(".lightmarkdown-paint");
      const blocks = [...paint.children].filter(node => !node.hidden).map(node => node.firstElementChild);
      return [...input.children].map((node, index) => {
        const a = node.getBoundingClientRect(), b = blocks[index].getBoundingClientRect();
        return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.height - b.height), Math.abs(a.width - b.width));
      });
    });
    assert.ok(delta.every(value => value < 1), `Source/paint geometry diverged: ${delta}`);
  }
  await geometry();
  await page.selectOption("#skin", "frost"); await page.selectOption("#palette", "dark");
  await page.setViewportSize({ width: 390, height: 900 }); await geometry();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.check("#native");
  assert.equal(await page.locator(".lightmarkdown-paint").evaluate(node => getComputedStyle(node).visibility), "hidden");
  for (const url of [base + "/examples/markdown.html", pathToFileURL(path.join(ROOT, "examples/markdown.html")).href]) {
    await page.goto(url); await page.waitForFunction(() => window.__markdownEditor);
    assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), initial);
    assert.equal(await page.locator('iframe, #editing-mode').count(), 0);
    assert.equal(await page.evaluate(() => __markdownEditor.content.ownerDocument === document &&
      __markdownEditor.element.contains(__markdownEditor.content)), true);
  }
  assert.deepEqual(errors, []); await page.close();
  console.log(`${name}: Markdown demo, shared skin, desktop/mobile geometry, plain output and HTTP/file routes: ok`);
}

async function iframeExampleChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [], remote = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(base).origin) remote.push(request.url());
  });
  const get = () => page.evaluate(() => document.getElementById("isolated-editor").contentWindow.__markdownEditor.getMarkdown());
  for (const url of [base + "/markdown-iframe.html", base + "/examples/markdown-iframe.html", pathToFileURL(path.join(ROOT, "examples/markdown-iframe.html")).href]) {
    await page.goto(url);
    await page.waitForFunction(() => !document.getElementById("read-markdown").disabled);
    assert.equal(await page.evaluate(() => typeof window.maiden), "undefined", "Only the frame loads the editor library");
    assert.equal(await page.evaluate(() => {
      const frame = document.getElementById("isolated-editor"), api = frame.contentWindow.__markdownEditor;
      return api.element.ownerDocument === frame.contentDocument && api.content.ownerDocument === frame.contentDocument;
    }), true, "Use the normal frame-owned API, not a facade");
    const sample = await get();
    assert.equal(await page.locator("#frame-output").textContent(), sample);
    const view = page.frameLocator("#isolated-editor");
    await view.locator('body').evaluate(() => {
      const before = document.createElement('button'); before.id = 'frame-entry-before'; before.textContent = 'Before editor';
      __markdownEditor.element.before(before);
    });
    await view.locator('#frame-entry-before').focus(); await page.keyboard.press('Tab');
    assert.deepEqual(await view.locator('.lightmarkdown-input').evaluate(node => ({ source: node === document.activeElement, tag: document.activeElement.tagName, label: document.activeElement.getAttribute('aria-label') })), { source: true, tag: 'DIV', label: 'Markdown source' }, 'Frame-owned Tab entry starts in source');
    await page.keyboard.press('Escape'); await page.keyboard.press('Shift+Tab');
    assert.equal(await view.getByRole('group', { name: 'Markdown formatting' }).locator('button:enabled').last().evaluate(node => node === document.activeElement), true);
    await view.locator(".lightmarkdown-input").evaluate(node => {
      const text = node.lastElementChild.firstChild, doc = node.ownerDocument, range = doc.createRange();
      range.setStart(text, text.length); range.collapse(true); node.focus();
      doc.getSelection().removeAllRanges(); doc.getSelection().addRange(range);
    });
    await page.keyboard.type(" edit");
    await page.locator("#application-note").focus(); await page.keyboard.press("End"); await page.keyboard.type(" note");
    await view.getByRole("button", { name: "Undo", exact: true }).click();
    assert.equal(await get(), sample);
    assert.equal(await page.locator("#application-note").inputValue(), "Outside the editor. note");
    await page.locator("#read-markdown").click(); assert.equal(await page.locator("#frame-output").textContent(), sample);
    await view.getByRole("button", { name: "Redo", exact: true }).click(); assert.equal(await get(), sample + " edit");
    await page.locator("#load-markdown").click();
    assert.equal(await get(), "## Loaded by the parent\n\nStill plain **Markdown**. 🦊\n");
    assert.equal(await page.locator("#frame-output").textContent(), await get());

    const source = view.getByRole("textbox", { name: "Markdown source" });
    const guide = view.getByRole("dialog", { name: "Markdown quick start" });
    await source.focus();
    await view.getByRole("button", { name: "Help", exact: true }).click();
    assert.equal(await guide.evaluate(node => node.ownerDocument === document &&
      node.contains(document.activeElement)), true, "Help stays in the editing document");
    await page.keyboard.press("Escape"); await guide.waitFor({ state: "hidden" });
    assert.equal(await source.evaluate(node => node === document.activeElement), true);
    assert.equal(await get(), "## Loaded by the parent\n\nStill plain **Markdown**. 🦊\n");

    await view.locator("body").evaluate(() => {
      __markdownEditor.setMarkdown(""); __markdownEditor.content.focus();
      const range = document.createRange(); range.selectNodeContents(__markdownEditor.content); range.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(range);
      const outside = document.createElement("button"); outside.id = "frame-picker-outside"; outside.textContent = "Outside picker";
      document.body.append(outside);
    });
    const table = view.getByRole("button", { name: "Table", exact: true });
    const picker = view.getByRole("dialog", { name: "Insert table", exact: true });
    const openPicker = async () => {
      await table.click();
      await view.getByRole("menuitem", { name: "Insert Table…", exact: true }).click();
      assert.equal(await picker.isVisible(), true);
      assert.equal(await picker.evaluate(node => node.ownerDocument === document &&
        node.contains(document.activeElement)), true, "Picker stays in the editing document");
    };
    await openPicker(); await page.keyboard.press("Escape");
    assert.equal(await picker.count(), 0);
    assert.equal(await table.evaluate(node => node === document.activeElement), true);
    await openPicker(); await view.locator("#frame-picker-outside").click();
    assert.equal(await picker.count(), 0, "Frame-owned outside clicks close the picker");
    assert.equal(await get(), "");
    await openPicker();
    await picker.getByRole("button", { name: "2 columns, 1 rows", exact: true }).click();
    assert.equal(await get(), "| Column 1 | Column 2 |\n| -------- | -------- |");
    await page.keyboard.press("Control+z"); assert.equal(await get(), "");
    await openPicker();
    assert.equal(await picker.evaluate(node => {
      node.style.left = "-123px";
      __markdownEditor.content.dispatchEvent(new Event("scroll", { bubbles: false }));
      return node.style.left !== "-123px";
    }), true, "The document capture listener repositions the picker on non-bubbling host scroll");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => {
      const frame = document.getElementById("isolated-editor").contentWindow;
      return frame.document.querySelector(".lightmarkdown-table-picker").style.maxWidth === Math.max(0, frame.innerWidth - 16) + "px";
    });
    assert.equal(await picker.evaluate(node => {
      const rect = node.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1;
    }), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await view.locator("body").evaluate(node => node.ownerDocument.documentElement.scrollWidth <= innerWidth), true);
    await page.keyboard.press("Escape");
    await view.getByRole("button", { name: "Help", exact: true }).click();
    await view.locator("body").evaluate(() => __markdownEditor.destroy());
    assert.equal(await guide.count(), 0); assert.equal(await picker.count(), 0);
    await view.locator("body").evaluate(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      document.body.dispatchEvent(new Event("scroll")); window.dispatchEvent(new Event("resize"));
      document.getElementById("frame-picker-outside").click();
    });
  }
  assert.deepEqual(errors, []); assert.deepEqual(remote, []);
  await page.close();
  console.log(`${name}: whole-editor iframe, frame-owned API/dialogs/events, independent undo, picker cancel/resize/teardown, narrow layout and HTTP/nested/file routes: ok`);
}

async function main() {
  const started = performance.now();
  const options = { exhaustive: process.argv.includes("--exhaustive") };
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = path.resolve(ROOT, "." + (["/markdown.html", "/markdown-iframe.html"].includes(pathname) ? "/examples" + pathname : pathname));
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.setHeader("Content-Type", file.endsWith(".css") ? "text/css" : file.endsWith(".html") ? "text/html" : "text/javascript");
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const failures = [];
  try {
    const engines = process.argv.includes("--webkit") ? { webkit } : { chromium, firefox };
    for (const [name, engine] of Object.entries(engines)) {
      const browser = await engine.launch();
      try {
        for (const check of [checks, headingChecks, formattingChecks, codeChecks, codeBackgroundChecks, painterChecks, toolbarGroupChecks, substantialChecks, writingChecks, indentationChecks, ruleChecks, shortcutChecks, stateChecks, imageChecks, tableChecks, tableRowChecks, tableColumnChecks, tableAlignmentChecks, tableFormatChecks, tablePickerChecks, statusChecks, guideChecks, previewChecks, meltdownChecks, polishChecks, fullscreenChecks, splitChecks, reviewChecks, demoChecks, iframeExampleChecks]) {
          const checkStarted = performance.now();
          try { await check(browser, base, name, options); }
          catch (error) { console.error(`${name}/${check.name}: ${error.message}`); failures.push(error); }
          finally { console.log(`${name}/${check.name}: ${((performance.now() - checkStarted) / 1000).toFixed(1)}s`); }
        }
      } finally { await browser.close(); }
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log(`Markdown checks: ${failures.length ? "FAILED" : "ok"} (${((performance.now() - started) / 1000).toFixed(1)}s total)`);
  if (failures.length) throw new AggregateError(failures, `${failures.length} Markdown check groups failed`);
}

module.exports = { runMarkdownSmoke, demoChecks, iframeExampleChecks };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
