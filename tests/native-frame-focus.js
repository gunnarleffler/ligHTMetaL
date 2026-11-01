/* No-library diagnostic for iframe focus/input regressions in the browser runtime.
 * NODE_PATH=$(npm root -g) node tests/native-frame-focus.js [--chromium]
 * Use --firefox-executable=/path/to/firefox for an explicit local comparison.
 * This never selects an older browser automatically or weakens the expectations.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function nativeFrameFocusChecks(browser, base) {
  const page = await browser.newPage();
  const results = [];
  try {
    const load = () => page.goto(base + '/tests/fixtures/native-frame-focus.html');
    const child = page.frameLocator('iframe');
    const source = child.locator('#source');
    const fields = async () => ({ child: await source.textContent(), parent: await page.locator('#note').inputValue() });
    const focus = () => page.evaluate(() => {
      const doc = document.querySelector('iframe').contentDocument;
      return { parent: document.activeElement.id || document.activeElement.tagName,
        child: doc.activeElement.id || doc.activeElement.tagName, childHasFocus: doc.hasFocus() };
    });
    const waitForParent = async id => {
      try { await page.waitForFunction(id => document.activeElement.id === id, id, { timeout: 3000 }); }
      catch (error) { if (error.name !== 'TimeoutError') throw error; }
    };
    await load(); await source.click(); await page.keyboard.press('Tab'); await waitForParent('after');
    results.push({ case: 'forward Tab leaves iframe', actual: (await focus()).parent, expected: 'after', focus: await focus() });

    await load(); await child.locator('#undo').focus(); await page.keyboard.press('Shift+Tab'); await waitForParent('note');
    results.push({ case: 'backward Tab leaves iframe', actual: (await focus()).parent, expected: 'note', focus: await focus() });

    await load();
    await source.evaluate(node => {
      node.textContent = 'metal'; node.focus();
      const selection = node.ownerDocument.getSelection(); selection.selectAllChildren(node); selection.collapseToEnd();
    });
    await page.keyboard.type('X');
    await child.locator('#undo').focus(); await page.keyboard.press('Enter');
    results.push({ case: 'native child Undo', actual: await source.textContent(), expected: 'metal' });
    await child.locator('#redo').focus(); await page.keyboard.press('Space');
    results.push({ case: 'native child Redo', actual: await source.textContent(), expected: 'metalX' });
    const note = page.locator('#note');
    await note.fill('outside'); await note.press('End'); await page.keyboard.type('!');
    results.push({ case: 'parent input after child Undo/Redo', actual: await fields(),
      expected: { child: 'metalX', parent: 'outside!' }, focus: await focus() });
    await source.focus(); await page.keyboard.press('Control+z');
    results.push({ case: 'child history after parent input', actual: await fields(),
      expected: { child: 'metal', parent: 'outside!' }, focus: await focus() });
    console.log(JSON.stringify({ version: browser.version(), results }, null, 2));
    for (const result of results) assert.deepEqual(result.actual, result.expected, result.case);
  } finally { await page.close(); }
}

module.exports = { nativeFrameFocusChecks };
if (require.main === module) (async () => {
  const { chromium, firefox } = require('playwright');
  const executablePath = process.argv.find(arg => arg.startsWith('--firefox-executable='))?.split('=').slice(1).join('=');
  const engine = process.argv.includes('--chromium') ? chromium : firefox;
  const browser = await engine.launch(executablePath ? { executablePath } : {});
  try { await nativeFrameFocusChecks(browser, pathToFileURL(path.resolve(__dirname, '..')).href); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
