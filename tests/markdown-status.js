/* Source statistics must not interfere with native editing or history. */
const assert = require("node:assert/strict");
async function statusChecks(browser, base, name) {
  const page = await browser.newPage();
  try {
    await page.goto(base + "/tests/fixtures/markdown.html");
    await page.waitForFunction(() => window.__markdownEditor);
    const status = page.getByRole("group", { name: "Markdown statistics" });
    const expect = text => page.waitForFunction(text => document.querySelector(".lightmarkdown-status").textContent === text, text);
    await expect("lines: 1   words: 0   1:1");
    await page.evaluate(() => __markdownEditor.setMarkdown("# hello\n**raw** world\n"));
    await expect("lines: 3   words: 4   1:1");
    await page.evaluate(() => {
      const source = __markdownEditor.content;
      source.focus(); getSelection().setBaseAndExtent(source.children[1].firstChild, 7, source.children[1].firstChild, 2);
      window.__statusNodes = Array.from(source.childNodes);
      window.__statusChanges = __markdownChanges.length;
    });
    await expect("lines: 3   words: 4   2:3");
    assert.equal(await page.evaluate(() => __markdownChanges.length === __statusChanges && __statusNodes.every((node, i) => node === __markdownEditor.content.childNodes[i])), true);
    await page.evaluate(() => getSelection().collapse(__markdownEditor.content.children[1].firstChild, 13));
    await expect("lines: 3   words: 4   2:14");
    await page.keyboard.type(" extra");
    await expect("lines: 3   words: 5   2:20");
    await page.keyboard.press("Control+z");
    await page.waitForFunction(() => __markdownEditor.getMarkdown() === "# hello\n**raw** world\n");
    await page.evaluate(() => __markdownEditor.setMarkdown("\t \n"));
    await expect("lines: 2   words: 0   1:1");
    assert.equal(await status.getAttribute("aria-live"), null);
    await page.evaluate(() => __markdownEditor.destroy());
    assert.equal(await status.count(), 0);
    console.log(name + ": raw-source lines/words, active selection position, callbacks, native undo and status teardown: ok");
  } finally { await page.close(); }
}
module.exports = { statusChecks };
