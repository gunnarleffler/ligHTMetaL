const assert = require('node:assert/strict');
async function substantialChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  try {
    await page.goto(base + '/examples/markdown.html'); await page.waitForFunction(() => window.__markdownEditor);
    const host = page.locator('#markdown-editor');
    await page.selectOption('#skin', 'substantial');
    const toolbar = host.locator('.lightmetal-actionbar');
    const button = toolbar.getByRole('button', { name: 'Bold', exact: true });
    assert.equal(await toolbar.evaluate(node => node.getBoundingClientRect().height), 47);
    assert.equal(await button.evaluate(node => node.getBoundingClientRect().height), 32);
    assert.equal(await button.locator('svg').evaluate(node => node.getBoundingClientRect().width), 20);
    const footerHeight = await host.locator('.lightmarkdown-footer').evaluate(node => node.getBoundingClientRect().height);
    assert.ok(footerHeight >= 28 && footerHeight <= 31);
    assert.equal(await host.getByRole('separator').first().evaluate(node => node.getBoundingClientRect().height), 20);
    for (const color of ['light', 'dark']) {
      await page.selectOption('#palette', color);
      const border = await host.evaluate(node => getComputedStyle(node).borderTopColor);
      assert.equal(border, color === 'light' ? 'rgb(197, 204, 214)' : 'rgb(66, 74, 86)');
      for (const mode of ['Preview', 'Side-by-side']) {
        await toolbar.getByRole('button', { name: mode, exact: true }).click();
        await host.getByRole('region', { name: 'Markdown preview' }).getByRole('heading').first().waitFor();
        await toolbar.getByRole('button', { name: 'Fullscreen', exact: true }).click();
        assert.equal(await host.evaluate(node => node.getBoundingClientRect().height === innerHeight), true);
        await page.keyboard.press('Escape');
        await toolbar.getByRole('button', { name: mode, exact: true }).click();
      }
    }
    await page.setViewportSize({ width: 390, height: 700 });
    assert.equal(await toolbar.evaluate(node => getComputedStyle(node).flexWrap), 'nowrap');
    assert.ok(await toolbar.evaluate(node => node.scrollWidth > node.clientWidth));
    await toolbar.getByRole('button', { name: 'Help', exact: true }).click();
    await page.getByRole('dialog', { name: 'Markdown quick start' }).waitFor(); await page.keyboard.press('Escape');
    // Loading the skin without its class does not change default proportions.
    await page.setViewportSize({ width: 1200, height: 900 }); await page.selectOption('#skin', '');
    assert.equal(await button.evaluate(node => node.getBoundingClientRect().height), 30);
    assert.equal(await button.locator('svg').evaluate(node => node.getBoundingClientRect().width), 18);
    console.log(name + ': Substantial proportions, default isolation, light/dark, source/preview/split/fullscreen, narrow scrolling and Help: ok');
  } finally { await page.close(); }
}
module.exports = { substantialChecks };
