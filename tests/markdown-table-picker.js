/* A size picker outside source, with a saved and invalidatable insertion point. */
const assert = require("node:assert/strict");
const template = (rows, columns) => ["| " + Array.from({ length: columns }, (_,i) => "Column " + (i + 1)).join(" | ") + " |",
  "| " + Array(columns).fill("---").join(" | ") + " |", ...Array(rows - 1).fill("|" + "  |".repeat(columns))].join("\n");
async function tablePickerChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [], requests = []; let monitor = false;
  page.on("pageerror", error => errors.push(error.message)); page.on("request", request => { if (monitor) requests.push(request.url()); });
  try {
    await page.goto(base + "/tests/fixtures/markdown.html"); await page.waitForFunction(() => window.__markdownEditor);
    await page.evaluate(() => { const outside = document.createElement("button"); outside.id = "picker-outside"; outside.textContent = "Outside"; document.body.append(outside); });
    const bar = page.getByRole("group", { name: "Markdown formatting" }), button = bar.getByRole("button", { name: "Table", exact: true });
    const popup = page.getByRole("dialog", { name: "Insert table", exact: true });
    const get = () => page.evaluate(() => __markdownEditor.getMarkdown()), count = () => page.evaluate(() => __markdownChanges.length - __pickerBefore);
    const prepare = (text = "", line = 0, column = 0) => page.evaluate(({ text, line, column }) => {
      __markdownEditor.setMarkdown(text); const source = __markdownEditor.content, node = source.children[line].firstChild, range = document.createRange();
      if (node.nodeName === "BR") range.setStart(node.parentNode, 0); else range.setStart(node, column);
      range.collapse(true); source.focus(); getSelection().removeAllRanges(); getSelection().addRange(range); source.dispatchEvent(new Event("focus"));
      window.__pickerBefore = __markdownChanges.length;
    }, { text, line, column });
    const manual = async (rows, columns) => {
      await popup.getByRole("spinbutton", { name: "Columns", exact: true }).fill(String(columns));
      await popup.getByRole("spinbutton", { name: "Rows", exact: true }).fill(String(rows));
      await popup.getByRole("button", { name: "Insert", exact: true }).click();
    };
    monitor = true; await prepare(); const flags = await page.evaluate(() => [document.queryCommandEnabled("undo"), document.queryCommandEnabled("redo")]);
    await page.evaluate(() => { window.__pickerSourceNodes = Array.from(__markdownEditor.content.querySelectorAll("*")); });
    await button.click(); assert.equal(await popup.isVisible(), true); assert.equal(await get(), ""); assert.equal(await count(), 0);
    assert.equal(await button.getAttribute("aria-expanded"), "true"); assert.equal(await button.getAttribute("aria-haspopup"), "dialog");
    assert.equal(await popup.getByRole("spinbutton", { name: "Columns" }).inputValue(), "3"); assert.equal(await popup.getByRole("spinbutton", { name: "Rows" }).inputValue(), "3");
    assert.equal(await popup.getByRole("button").count(), 81);
    await popup.getByRole("button", { name: "3 columns, 3 rows", exact: true }).focus();
    await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowDown");
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "4 columns, 4 rows");
    assert.equal(await popup.locator(".lightmetal-grid-selected").count(), 16);
    await page.keyboard.press("Escape"); assert.equal(await popup.count(), 0); assert.equal(await button.evaluate(node => node === node.ownerDocument.activeElement), true);
    assert.equal(await count(), 0); assert.equal(await get(), "");
    assert.equal(await page.evaluate(() => __pickerSourceNodes.every((node, index) => node === __markdownEditor.content.querySelectorAll("*")[index])), true);
    assert.deepEqual(await page.evaluate(() => [document.queryCommandEnabled("undo"), document.queryCommandEnabled("redo")]), flags);
    await button.click(); await button.click(); assert.equal(await popup.count(), 0); assert.equal(await count(), 0);
    await button.click(); assert.equal(await popup.getByText("Rows include the header.", { exact: true }).isVisible(), true);
    await popup.getByRole("button", { name: "Insert", exact: true }).click();
    assert.equal(await get(), template(3, 3)); assert.equal(await count(), 1); assert.equal(await page.evaluate(() => getSelection().toString()), "Column 1");
    await page.keyboard.press("Control+z"); assert.equal(await get(), ""); await page.keyboard.press("Control+Shift+z"); assert.equal(await get(), template(3, 3));
    for (const [rows, columns] of [[1,1], [1,4], [4,1], [2,7], [12,12], [1000,1], [100,100]]) {
      await prepare(); await button.click(); await manual(rows, columns); assert.equal(await get(), template(rows, columns)); assert.equal(await count(), 1);
      assert.equal(await page.evaluate(() => getSelection().toString()), "Column 1"); await page.keyboard.press("Control+z"); assert.equal(await get(), "");
    }
    for (const [rows, columns] of [[0,3], [3,0], [-1,2], [1.5,3], [3,2.5], [1001,1], [1,101], [101,100], ["",3]]) {
      await prepare(); await button.click(); await manual(rows, columns); assert.equal(await popup.isVisible(), true);
      assert.equal(await get(), ""); assert.equal(await count(), 0); assert.match(await popup.getByRole("status").textContent(), /10,000 cells/);
      await page.keyboard.press("Escape");
    }
    await prepare("before\n\nafter", 1); await button.click();
    await page.locator("#picker-outside").click(); assert.equal(await popup.count(), 0); assert.equal(await get(), "before\n\nafter"); assert.equal(await count(), 0);
    await prepare("before\n\nafter", 1); await button.click();
    await page.evaluate(() => __markdownEditor.setMarkdown("replacement")); assert.equal(await popup.count(), 0); assert.equal(await get(), "replacement");
    await prepare(); await button.click();
    await page.evaluate(() => { __markdownEditor.content.firstChild.textContent = "stale"; });
    await manual(3,3); assert.equal(await get(), "stale"); assert.equal(await count(), 0); assert.match(await popup.getByRole("status").textContent(), /no longer available/);
    await page.keyboard.press("Escape");
    await prepare(" ", 0, 0); await button.click();
    await page.evaluate(() => {
      const text = __markdownEditor.content.firstChild.firstChild; text.data = "  "; text.data = " ";
      document.querySelector(".lightmarkdown-table-picker form").requestSubmit();
    });
    assert.equal(await get(), " "); assert.equal(await count(), 0); assert.match(await popup.getByRole("status").textContent(), /no longer available/);
    await page.keyboard.press("Escape");
    await prepare(); await button.click(); await page.locator(".lightmarkdown-input").dispatchEvent("compositionstart");
    assert.equal(await popup.count(), 0); assert.equal(await count(), 0); await page.locator(".lightmarkdown-input").dispatchEvent("compositionend");
    await prepare("before\n\nafter", 1); await button.click();
    await page.evaluate(() => {
      const range = document.createRange(); range.setStart(document.getElementById("picker-outside").firstChild, 2); range.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(range);
    });
    await manual(2,2); assert.equal(await get(), "before\n" + template(2,2) + "\n\nafter");
    for (const width of [390, 1200]) {
      await page.setViewportSize({ width, height: 740 }); await prepare(); await button.click();
      const rect = await popup.boundingBox(); assert.ok(rect.x >= 0 && rect.x + rect.width <= width + 1 && rect.y >= 0 && rect.y + rect.height <= 741);
      await popup.getByRole("button", { name: "2 columns, 2 rows", exact: true }).focus(); await page.keyboard.press("Space"); assert.equal(await get(), template(2,2));
    }
    await prepare(); await button.click();
    await page.evaluate(() => { window.__pickerDead = document.querySelector(".lightmarkdown-table-picker"); __markdownEditor.destroy(); });
    assert.equal(await page.evaluate(() => __pickerDead.isConnected), false);
    assert.equal(await page.evaluate(() => __pickerDead.querySelector('[data-row="1"]').dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }))), true);
    await page.evaluate(() => {
      window.__nativePopover = HTMLElement.prototype.showPopover; HTMLElement.prototype.showPopover = undefined;
      window.__markdownEditor = __initMarkdown({ element: document.getElementById("editor"), onChange: value => __markdownChanges.push(value) });
    });
    await prepare(); await button.click(); assert.equal(await popup.isVisible(), true);
    assert.equal(await popup.evaluate(node => node.hasAttribute("popover")), false);
    await manual(1,2); assert.equal(await get(), template(1,2)); assert.equal(await count(), 1);
    await page.evaluate(() => {
      HTMLElement.prototype.showPopover = __nativePopover; __markdownEditor.destroy(); window.__confirmTrap = false; window.__pickerStates = 0;
      window.__markdownEditor = __initMarkdown({ element: document.getElementById("editor"), actions: ["table", { name: "bold", state: api => {
        __pickerStates++;
        if (__confirmTrap && document.activeElement === api.content && api.getMarkdown() === "") { window.__confirmTrap = false; api.setMarkdown("unexpected focus callback"); }
        return false;
      } }], onChange: value => __markdownChanges.push(value) });
    });
    await prepare(); await button.click(); await page.evaluate(() => { window.__confirmTrap = true; }); await manual(3,3);
    assert.equal(await get(), template(3,3), "native popover focus restoration must not run state callbacks on the stale pre-insert document"); assert.equal(await count(), 1);
    await page.evaluate(() => { window.__confirmTrap = false; }); await prepare(); await button.click();
    const statesBeforeDestroy = await page.evaluate(() => __pickerStates); await page.evaluate(() => __markdownEditor.destroy());
    assert.equal(await page.evaluate(() => __pickerStates), statesBeforeDestroy, "destroy must not run custom state callbacks when hiding a native popover");
    assert.deepEqual(errors, []); assert.deepEqual(requests, []); monitor = false;
    console.log(`${name}: Markdown table size picker, grid/manual/default/header-only/limits, native history, cancel/stale position, geometry and teardown: ok`);
  } finally { await page.close(); }
}
module.exports = { tablePickerChecks, tableTemplate: template };
if (require.main === module) (async () => {
  const { chromium, firefox } = require("playwright"), { pathToFileURL } = require("node:url"), path = require("node:path");
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch(); try { await tablePickerChecks(browser, pathToFileURL(path.resolve(__dirname,"..")).href,name); } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
