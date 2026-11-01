/* Retained token repainting must not rewrite unchanged DOM values. */
const assert = require('node:assert/strict');
async function painterChecks(browser, base, name) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base + '/tests/fixtures/markdown.html');
    await page.waitForFunction(() => window.__markdownEditor);
    const result = await page.evaluate(() => {
      const editor = __markdownEditor;
      const text = 'Before **bold** and `inline`.\n\n```js\nconst answer = 42;\n```\n\nAfter.';
      editor.setMarkdown(text);
      const paint = editor.content.previousElementSibling;
      const tokens = Array.from(paint.querySelectorAll('span')).filter(node => node.firstChild?.nodeType === Node.TEXT_NODE);
      const texts = tokens.map(node => node.firstChild);
      const tokenSet = new Set(tokens), textSet = new Set(texts);
      const observer = new MutationObserver(() => {});
      observer.observe(paint, { subtree: true, attributes: true, characterData: true, childList: true });
      const changes = () => observer.takeRecords().filter(record =>
        tokenSet.has(record.target) || textSet.has(record.target)).length;
      editor.setMarkdown(text);
      const unchanged = changes();
      const same = tokens.every((node, i) => node.isConnected && node.firstChild === texts[i]);
      // Collapse an LF-shaped run so paintTokens has spare token slots to hide.
      const block = document.createElement('div'); block.textContent = text;
      editor.content.replaceChildren(block);
      editor.content.dispatchEvent(new InputEvent('input', { bubbles: true }));
      observer.takeRecords();
      const flatTokens = Array.from(paint.querySelectorAll('span')).filter(node => node.firstChild?.nodeType === Node.TEXT_NODE);
      flatTokens.forEach(node => { tokenSet.add(node); textSet.add(node.firstChild); });
      block.firstChild.data = 'Small';
      editor.content.dispatchEvent(new InputEvent('input', { bubbles: true }));
      observer.takeRecords();
      const spareCount = flatTokens.filter(node => node.hidden).length;
      editor.content.dispatchEvent(new InputEvent('input', { bubbles: true }));
      const spareUnchanged = changes();
      block.firstChild.data = text;
      editor.content.dispatchEvent(new InputEvent('input', { bubbles: true }));
      observer.disconnect();
      return { unchanged, same, spareCount, spareUnchanged, revived: editor.getMarkdown() === text,
        visibleText: Array.from(paint.querySelectorAll('span')).filter(node => !node.hidden && node.firstChild?.nodeType === Node.TEXT_NODE).map(node => node.firstChild.data).join('') };
    });
    assert.equal(result.unchanged, 0, 'unchanged tokens produce no mutations');
    assert.equal(result.same, true, 'token and Text identities survive repaint');
    assert.ok(result.spareCount > 0, 'fixture exercises hidden spare token slots');
    assert.equal(result.spareUnchanged, 0, 'already-cleared spare tokens produce no mutations');
    assert.equal(result.revived, true);
    assert.match(result.visibleText, /const answer = 42;/);
    await page.evaluate(() => { __markdownEditor.setMarkdown('Typing '); __markdownEditor.content.focus(); });
    await page.keyboard.press('Control+End');
    await page.keyboard.type('native history');
    assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), 'Typing native history');
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), 'Typing ');
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), 'Typing native history');
    assert.deepEqual(errors, []);
    console.log(name + ': unchanged/spare token mutations, retained identities, revival and native grouped undo/redo: ok');
  } finally { await page.close(); }
}
module.exports = { painterChecks };
