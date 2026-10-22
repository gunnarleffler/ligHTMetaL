const assert = require("node:assert/strict");
async function fullscreenChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(base + "/tests/fixtures/markdown.html");
    await page.waitForFunction(() => window.__markdownEditor);
    await page.evaluate(() => {
      __markdownEditor.setMarkdown('hello\n' + 'line\n'.repeat(80));
      const source = __markdownEditor.content; source.focus(); getSelection().collapse(source.firstChild.firstChild, 2);
      source.parentElement.parentElement.scrollTop = 30;
      window.__fullNodes = Array.from(source.childNodes); window.__fullChanges = __markdownChanges.length;
      window.__fullHistory = [document.queryCommandEnabled('undo'), document.queryCommandEnabled('redo')];
    });
    const button = page.getByRole('button', { name: 'Fullscreen', exact: true });
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#editor').evaluate(node => { const r = node.getBoundingClientRect(); return r.x === 0 && r.y === 0 && r.width === innerWidth && r.height === innerHeight; }), true);
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), 'hidden');
    await page.keyboard.press('Escape');
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => !document.documentElement.classList.contains('lightmarkdown-page-fullscreen') && __markdownChanges.length === __fullChanges && __fullNodes.every((node, i) => node === __markdownEditor.content.childNodes[i]) && document.activeElement === __markdownEditor.content && getSelection().focusOffset === 2), true);
    assert.deepEqual(await page.evaluate(() => [document.queryCommandEnabled('undo'), document.queryCommandEnabled('redo')]), await page.evaluate(() => __fullHistory));
    assert.equal(await page.locator('.lightmarkdown-scroll').evaluate(node => node.scrollTop), 30);
    await button.click(); await page.getByRole('button', { name: 'Help', exact: true }).click();
    await page.keyboard.press('Escape');
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('Escape'); assert.equal(await button.getAttribute('aria-pressed'), 'false');
    await page.setViewportSize({ width: 390, height: 600 }); await button.click();
    assert.equal(await page.locator('#editor').evaluate(node => node.getBoundingClientRect().width === innerWidth), true);
    await page.evaluate(() => __markdownEditor.destroy());
    assert.equal(await page.locator('.lightmarkdown-fullscreen,html.lightmarkdown-page-fullscreen').count(), 0);
    // Preview stays selected and usable through fullscreen enter/exit.
    await page.goto(base + '/examples/markdown.html'); await page.waitForFunction(() => window.__markdownEditor);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await page.getByRole('region', { name: 'Markdown preview' }).locator('h1').waitFor();
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Fullscreen', exact: true }).isDisabled(), false);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button', { name: 'Preview', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByRole('region', { name: 'Markdown preview' }).isVisible(), true);
    // Optional iframe layout fills its own viewport, not the embedding page.
    await page.goto(base + '/examples/markdown.html?mode=isolated');
    await page.waitForFunction(() => window.__markdownMode === 'isolated' && window.__markdownEditor);
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
    assert.equal(await page.frameLocator('iframe').locator('.lightmarkdown-fullscreen').evaluate(node => node.getBoundingClientRect().height === node.ownerDocument.defaultView.innerHeight), true);
    await page.frameLocator('iframe').getByRole('textbox', { name: 'Markdown source' }).press('Escape');
    assert.equal(await page.getByRole('button', { name: 'Fullscreen', exact: true }).getAttribute('aria-pressed'), 'false');
    // Keyboard-only use and application-owned classes/styles survive teardown.
    await page.goto(base + '/tests/fixtures/markdown.html'); await page.waitForFunction(() => window.__markdownEditor);
    await page.evaluate(() => {
      __markdownEditor.destroy();
      document.documentElement.classList.add('lightmarkdown-page-fullscreen');
      document.documentElement.style.overflow = 'scroll';
      window.__markdownEditor = __initMarkdown({ element: document.getElementById('editor'), actions: [], shortcuts: { fullscreen: 'Alt+f' } });
      __markdownEditor.content.focus();
    });
    await page.keyboard.press('Alt+f');
    assert.equal(await page.locator('.lightmarkdown-fullscreen').count(), 1);
    await page.evaluate(() => __markdownEditor.destroy());
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('lightmarkdown-page-fullscreen') && document.documentElement.style.overflow === 'scroll'), true);
    assert.deepEqual(errors, []);
    console.log(name + ': page fullscreen geometry, Escape/help priority, source/selection/history invariants, narrow layout, preview and destroy: ok');
  } finally { await page.close(); }
}
module.exports = { fullscreenChecks };
