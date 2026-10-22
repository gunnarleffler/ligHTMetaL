const assert = require('node:assert/strict');
async function toolbarGroupChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  try {
    await page.goto(base + '/tests/fixtures/markdown.html');
    await page.waitForFunction(() => window.__markdownEditor);
    await page.addScriptTag({ url: base + '/dist/lightmetal.js' });
    await page.evaluate(() => {
      const host = document.createElement('div'); host.id = 'html-groups'; host.className = 'lightmetal'; document.body.append(host);
      window.__htmlGroups = lightmetal.init({ element: host });
    });
    const markdown = page.locator('#editor .lightmetal-actionbar');
    const html = page.locator('#html-groups .lightmetal-actionbar');
    assert.equal(await markdown.getByRole('separator').count(), 6);
    assert.equal(await html.getByRole('separator').count(), 5);
    const order = bar => bar.locator(':scope > *').evaluateAll(nodes => nodes.filter(node => node.tagName === 'BUTTON' || node.getAttribute('role') === 'separator').map(node => node.getAttribute('role') === 'separator' ? '|' : node.getAttribute('aria-label')));
    assert.deepEqual(await order(markdown), ['Bold','Italic','Strike-through','|','Heading 1','Heading 2','Paragraph','|','Quote','Unordered List','Ordered List','|','Inline Code','Code Block','|','Horizontal Line','Link','Image','Table','|','Undo','Redo','|','Fullscreen','Help']);
    assert.deepEqual(await order(html), ['Bold','Italic','Underline','Strike-through','|','Heading 1','Heading 2','Paragraph','|','Quote','Ordered List','Unordered List','|','Code','|','Horizontal Line','Link','Insert table','Image','|','Source']);
    for (const bar of [markdown, html]) {
      for (const separator of await bar.getByRole('separator').all()) {
        assert.equal(await separator.getAttribute('aria-orientation'), 'vertical');
        assert.equal(await separator.evaluate(node => { const s = getComputedStyle(node); return s.width === '1px' && s.height === '18px' && Number(s.opacity) < 1 && node.tabIndex < 0; }), true);
      }
    }
    await markdown.getByRole('button', { name: 'Bold', exact: true }).evaluate(node => { node.disabled = true; });
    assert.equal(await markdown.getByRole('separator').count(), 6, 'disabled controls retain their group');
    await markdown.evaluate(bar => { for (const title of ['Bold','Italic','Strike-through','Heading 1','Heading 2','Paragraph']) bar.querySelector(`button[aria-label="${title}"]`).hidden = true; });
    await page.waitForFunction(() => document.querySelectorAll('#editor .lightmetal-toolbar-separator:not([hidden])').length === 4);
    await markdown.evaluate(bar => { for (const button of bar.querySelectorAll('button')) button.hidden = false; });
    await page.waitForFunction(() => document.querySelectorAll('#editor .lightmetal-toolbar-separator:not([hidden])').length === 6);
    for (const skin of ['', 'bootstrap', 'material-classic', 'material-outline', 'frost', 'patina', 'sterling', 'substantial']) {
      if (skin) await page.addStyleTag({ url: base + '/dist/skins/' + skin + '.css' });
      await page.evaluate(skin => { for (const id of ['editor', 'html-groups']) { const host = document.getElementById(id); for (const name of ['bootstrap','material-classic','material-outline','frost','patina','sterling','substantial']) host.classList.toggle('lightmetal-' + name, name === skin); } }, skin);
      await page.setViewportSize({ width: 390, height: 700 });
      for (const bar of [markdown, html]) {
        assert.equal(await bar.evaluate(node => getComputedStyle(node).flexWrap), 'nowrap');
        assert.equal(await bar.evaluate(node => getComputedStyle(node).overflowX), 'auto');
        assert.ok(await bar.evaluate(node => node.scrollWidth > node.clientWidth));
        const positions = await bar.locator('button').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
        assert.ok(Math.max(...positions) - Math.min(...positions) < 2, 'controls stay on one scrollable row');
      }
    }
    await page.evaluate(() => {
      __markdownEditor.destroy(); __htmlGroups.destroy();
      window.__markdownEditor = __initMarkdown({ element: document.getElementById('editor'), actions: ['bold','heading1','image'] });
      window.__htmlGroups = lightmetal.init({ element: document.getElementById('html-groups'), actions: ['bold','heading1','image'] });
    });
    assert.equal(await markdown.getByRole('separator').count(), 0, 'explicit action lists stay unchanged');
    assert.equal(await html.getByRole('separator').count(), 0);
    await page.evaluate(() => { __markdownEditor.destroy(); __htmlGroups.destroy(); });
    console.log(name + ': HTML/MaiDEn default grouping, muted accessible separators, hidden/disabled controls, exact custom lists, all skins and narrow horizontal scrolling: ok');
  } finally { await page.close(); }
}
module.exports = { toolbarGroupChecks };
