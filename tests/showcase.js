const assert = require('node:assert/strict');
const path = require('node:path');

async function runShowcaseChecks(browser, base) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    for (const prefix of [base, base + 'examples/', 'file://' + path.join(__dirname, '../examples/')]) {
      await page.goto(prefix + 'index.html');
      await page.locator('#html-editor .lightmetal-content').waitFor();
      assert.match(await page.locator('#html-output').textContent(), /<h2>/);
      assert.equal(await page.locator('.logo').evaluate(img => img.getBoundingClientRect().width), 640);
      for (const theme of ['dark', 'light', 'auto']) {
        await page.locator('#theme-toggle').click();
        assert.equal(await page.locator('#theme-toggle').textContent(), 'Theme: ' + theme);
        assert.equal(await page.locator('.lightmetal-' + (theme === 'auto' ? 'dark' : theme)).count(), theme === 'auto' ? 0 : 2);
      }
      await page.getByRole('tab', { name: 'HTML Editor', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await page.locator('#panel-markdown').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#tab-markdown').getAttribute('aria-selected'), 'true');
      await page.getByRole('button', { name: 'Side-by-side', exact: true }).click();
      await page.getByRole('tab', { name: 'Markdown Parser', exact: true }).click();
      await page.locator('#parser-input').fill('# Changed\n\n[link](https://example.invalid)\n\n![image](https://example.invalid/a.png)');
      assert.match(await page.locator('#parser-output').textContent(), /<h1>Changed<\/h1>/);
      const frame = page.frameLocator('#parser-preview');
      await frame.locator('h1').filter({ hasText: 'Changed' }).waitFor();
      assert.equal(await frame.locator('a').getAttribute('href'), null);
      for (const file of ['html.html', 'markdown.html', 'meltdown.html', 'skins.html', 'markdown-skins.html']) {
        await page.goto(prefix + file);
        await page.locator('h1').waitFor();
        if (file === 'markdown-skins.html') {
          await page.waitForFunction(() => Object.keys(window.__skinEditors || {}).length === 8);
          await page.locator('#palette').selectOption('dark');
          assert.equal(await page.locator('.lightmetal-dark').count(), 8);
        }
        if (file === 'html.html') await page.waitForFunction(() => Boolean(window.editor));
        if (file === 'meltdown.html') assert.match(await page.locator('#parser-output').textContent(), /<table>/);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base);
    await page.getByRole('tab', { name: 'Markdown Editor', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
}
module.exports = { runShowcaseChecks };
