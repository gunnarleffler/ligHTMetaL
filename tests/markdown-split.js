const assert = require('node:assert/strict');
async function splitChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base + '/examples/markdown.html');
    await page.waitForFunction(() => window.__markdownEditor);
    await page.evaluate(() => {
      __markdownEditor.setMarkdown('# Hello');
      const source = __markdownEditor.content; source.focus(); getSelection().collapse(source.firstChild.firstChild, 7);
      window.__splitNode = source.firstChild;
    });
    const split = page.getByRole('button', { name: 'Side-by-side', exact: true });
    const view = page.getByRole('region', { name: 'Markdown preview' });
    const source = page.getByRole('textbox', { name: 'Markdown source' });
    await split.click(); await view.getByRole('heading', { name: 'Hello', exact: true }).waitFor();
    assert.equal(await split.getAttribute('aria-pressed'), 'true');
    assert.equal(await source.isVisible(), true);
    assert.equal(await page.getByRole('button', { name: 'Bold', exact: true }).isDisabled(), false);
    assert.equal(await page.evaluate(() => __markdownEditor.content.firstChild === __splitNode && getSelection().focusOffset === 7), true);
    const a = await source.boundingBox(), b = await view.boundingBox(); assert.ok(b.x >= a.x + a.width - 2);
    await page.keyboard.type(' world'); await view.getByRole('heading', { name: 'Hello world', exact: true }).waitFor();
    await page.keyboard.press('Control+z'); await view.getByRole('heading', { name: 'Hello', exact: true }).waitFor();
    await page.keyboard.press('Control+Shift+z'); await view.getByRole('heading', { name: 'Hello world', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    assert.equal(await source.isVisible(), false); assert.equal(await split.getAttribute('aria-pressed'), 'false');
    await split.click(); assert.equal(await source.isVisible(), true);
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
    assert.equal(await page.locator('.lightmarkdown-split').evaluate(node => getComputedStyle(node).display), 'grid');
    await page.setViewportSize({ width: 390, height: 700 });
    const narrowA = await page.locator('.lightmarkdown-scroll').boundingBox(), narrowB = await view.boundingBox();
    assert.ok(narrowB.y >= narrowA.y + narrowA.height - 2);
    assert.ok(narrowB.y + narrowB.height <= 701);
    await page.keyboard.press('Escape');
    await split.click(); assert.equal(await view.isVisible(), false);
    assert.equal(await source.isVisible(), true);
    await page.evaluate(() => {
      __markdownEditor.setMarkdown(Array.from({ length: 90 }, (_, i) => `## Section ${i}\n\nParagraph **${i}** with some text.\n`).join('\n'));
      window.__syncSource = __markdownEditor.getMarkdown();
      window.__syncNode = __markdownEditor.content.firstChild;
    });
    await split.click(); await view.locator('h2').first().waitFor();
    const aligned = () => page.waitForFunction(() => {
      const a = document.querySelector('.lightmarkdown-scroll'), b = document.querySelector('.lightmarkdown-preview');
      return Math.abs(a.scrollTop / (a.scrollHeight - a.clientHeight) - b.scrollTop / (b.scrollHeight - b.clientHeight)) < .015;
    });
    await page.locator('.lightmarkdown-scroll').evaluate(node => { node.scrollTop = (node.scrollHeight - node.clientHeight) * .6; });
    await aligned();
    assert.ok(await view.evaluate(node => node.scrollTop > 0));
    await view.evaluate(node => { node.scrollTop = (node.scrollHeight - node.clientHeight) * .2; });
    await aligned();
    assert.ok(await page.locator('.lightmarkdown-scroll').evaluate(node => node.scrollTop / (node.scrollHeight - node.clientHeight) < .25));
    await view.hover(); const beforeWheel = await view.evaluate(node => node.scrollTop);
    await page.mouse.wheel(0, 160);
    await page.waitForFunction(before => document.querySelector('.lightmarkdown-preview').scrollTop > before, beforeWheel);
    await aligned();
    assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown() === __syncSource && __markdownEditor.content.firstChild === __syncNode), true);
    await split.click();
    assert.equal(await view.isVisible(), false);
    await page.evaluate(() => __markdownEditor.destroy()); assert.equal(await page.locator('.lightmarkdown-split').count(), 0);
    await page.goto(base + '/examples/markdown.html?mode=isolated');
    await page.waitForFunction(() => window.__markdownMode === 'isolated' && window.__markdownEditor);
    await page.getByRole('button', { name: 'Side-by-side', exact: true }).click();
    const frame = page.frameLocator('iframe');
    await frame.getByRole('region', { name: 'Markdown preview' }).locator('h1').waitFor();
    assert.equal(await frame.locator('.lightmarkdown-split').evaluate(node => getComputedStyle(node).display), 'grid');
    const panes = await frame.locator('.lightmarkdown-scroll,.lightmarkdown-preview').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { y: r.y, height: r.height, bottom: r.bottom }; }));
    assert.ok(panes[1].y >= panes[0].bottom - 2);
    assert.ok(panes[1].bottom <= 401);
    assert.deepEqual(errors, []);
    console.log(name + ': live split rendering, native typing/undo/redo, source nodes/selection, view transitions, bidirectional proportional/wheel scrolling, fullscreen, narrow stacking and teardown: ok');
  } finally { await page.close(); }
}
module.exports = { splitChecks };
