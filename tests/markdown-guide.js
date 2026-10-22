const assert = require("node:assert/strict");
async function guideChecks(browser, base, name) {
  const page = await browser.newPage();
  try {
    await page.goto(base + "/tests/fixtures/markdown.html");
    await page.waitForFunction(() => window.__markdownEditor);
    await page.evaluate(() => {
      __markdownEditor.setMarkdown("hello"); const source = __markdownEditor.content;
      source.focus(); getSelection().collapse(source.firstChild.firstChild, 2);
      window.__guideChanges = __markdownChanges.length;
      window.__guideNode = source.firstChild;
      window.__guideHistory = [document.queryCommandEnabled("undo"), document.queryCommandEnabled("redo")];
    });
    const help = page.getByRole("button", { name: "Help", exact: true });
    const dialog = page.getByRole("dialog", { name: "Markdown quick start" });
    await help.click(); assert.equal(await dialog.isVisible(), true);
    assert.equal(await dialog.getByRole("link").getAttribute("href"), "https://spec.commonmark.org/");
    assert.equal(await dialog.getByRole("heading", { name: "Markdown quick start", exact: true }).evaluate(node => node === node.ownerDocument.activeElement), true);
    assert.deepEqual(await dialog.locator("h3").allTextContents(), ["TLDR", "Emphasis", "Headings", "Lists and tasks", "Links", "Quotes", "Images", "Tables", "Code", "Paragraphs and rules", "Literal markers"]);
    const examples = await dialog.locator("pre").allTextContents();
    assert.ok(examples.includes("**bold**\n*italic*\n~~strikethrough~~"));
    assert.ok(examples.some(text => text.includes("###### Heading 6")));
    assert.ok(examples.includes("\\*literal asterisks\\*"));
    assert.equal(await dialog.evaluate(node => node.scrollTop), 0);
    assert.equal(await dialog.getByRole("link").count(), 1);
    await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => document.activeElement === __markdownEditor.content && getSelection().focusOffset === 2), true);
    assert.equal(await page.evaluate(() => __markdownChanges.length === __guideChanges && __markdownEditor.content.firstChild === __guideNode), true);
    assert.deepEqual(await page.evaluate(() => [document.queryCommandEnabled("undo"), document.queryCommandEnabled("redo")]), await page.evaluate(() => __guideHistory));
    await help.click(); await dialog.getByRole("button", { name: "Close" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.setViewportSize({ width: 390, height: 600 }); await help.click();
    assert.equal(await dialog.evaluate(node => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.height <= innerHeight; }), true);
    await page.evaluate(() => __markdownEditor.destroy()); assert.equal(await dialog.count(), 0);
    console.log(name + ": local guide content/link, Escape/Close/focus, source/history invariants, narrow layout and teardown: ok");
  } finally { await page.close(); }
}
module.exports = { guideChecks };
