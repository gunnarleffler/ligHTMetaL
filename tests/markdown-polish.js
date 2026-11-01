const assert = require('node:assert/strict');

async function polishChecks(browser, base, name) {
  const page = await browser.newPage();
  const errors = [], remote = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(base + '/')) remote.push(request.url()); });
  try {
    for (const mode of ['inline', 'iframe']) {
      await page.goto(base + (mode === 'iframe' ? '/examples/markdown-iframe.html' : '/examples/markdown.html'));
      if (mode === 'iframe') await page.waitForFunction(() => !document.getElementById('read-markdown').disabled);
      else await page.waitForFunction(() => window.__markdownEditor);
      const view = mode === 'iframe' ? page.frames().find(frame => frame.parentFrame() === page.mainFrame()) : page;
      const preview = view.getByRole('region', { name: 'Markdown preview' });
      await view.evaluate(() => {
        __markdownEditor.setMarkdown('```js\nconst value = 42;\n```\n\n```unknown\n<img src=https://example.invalid/nope>\n```\n\n```ansi\n\x1b[31mred\x1b[0m\n```');
        window.__polishSourceNodes = [...__markdownEditor.content.childNodes];
        window.__polishBefore = __markdownEditor.getMarkdown();
      });
      await view.getByRole('button', { name: 'Preview', exact: true }).click();
      await preview.locator('.token.keyword').waitFor();
      assert.equal(await preview.locator('.token.keyword').textContent(), 'const');
      assert.equal(await preview.locator('.language-unknown').textContent(), '<img src=https://example.invalid/nope>');
      assert.equal(await preview.locator('img,script,[style]').count(), 0);
      assert.equal(await preview.locator('.language-ansi').textContent(), 'red');
      for (const [palette, color] of [['dark', 'rgb(255, 123, 114)'], ['light', 'rgb(207, 34, 46)']]) {
        if (mode === 'inline') await page.locator('#palette').selectOption(palette);
        else await view.evaluate(palette => {
          __markdownEditor.element.dataset.lightmetalTheme = palette;
        }, palette);
        await view.waitForFunction(color => getComputedStyle(document.querySelector('.token.keyword')).color === color, color);
      }
      await view.getByRole('button', { name: 'Preview', exact: true }).click();
      assert.equal(await view.evaluate(() => __markdownEditor.getMarkdown() === __polishBefore && __polishSourceNodes.every((node, i) => node === __markdownEditor.content.childNodes[i])), true);
      await view.getByRole('button', { name: 'Side-by-side', exact: true }).click();
      await view.evaluate(() => {
        __markdownEditor.setMarkdown('```js\nconst value = 42;\n```\n\n');
        const source = __markdownEditor.content;
        source.focus(); source.ownerDocument.getSelection().selectAllChildren(source);
        source.ownerDocument.getSelection().collapseToEnd();
      });
      const before = await view.evaluate(() => __markdownEditor.getMarkdown());
      await page.keyboard.type('grouped typing');
      await page.keyboard.press('Control+z');
      assert.equal(await view.evaluate(() => __markdownEditor.getMarkdown()), before, 'Highlighted split view must preserve grouped native undo');
      await page.keyboard.press('Control+Shift+z');
      assert.match(await view.evaluate(() => __markdownEditor.getMarkdown()), /grouped typing/);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(remote, []);
    console.log(name + ': poliSH preview/split colors, light/dark, inline/whole-editor iframe, escaped source, filtered ANSI styles, native typing undo/redo and no requests: ok');
  } finally { await page.close(); }
}
module.exports = { polishChecks };
