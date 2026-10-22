/* Source code-block decoration must follow layout, not inline glyph widths. */
const assert = require('node:assert/strict');
async function codeBackgroundChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base + '/tests/fixtures/markdown.html');
    await page.waitForFunction(() => window.__markdownEditor);
    await page.addStyleTag({ content: '#editor { width: 810px; max-width: 100%; }' });
    const prepare = (text, shape = 'blocks') => page.evaluate(({ text, shape }) => {
      __markdownEditor.setMarkdown(text);
      const source = __markdownEditor.content;
      if (shape !== 'blocks') {
        const block = document.createElement('div');
        if (shape === 'lf') block.append(document.createTextNode(text));
        else text.split('\n').forEach((line, i) => {
          if (i) block.append(document.createElement('br'));
          const span = document.createElement('span'); span.textContent = line; block.append(span);
        });
        block.append(document.createElement('br')); source.replaceChildren(block);
        source.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }
      window.__backgroundNodes = Array.from(source.childNodes);
      window.__backgroundChanges = __markdownChanges.length;
    }, { text, shape });
    const geometry = () => page.evaluate(() => {
      const paint = __markdownEditor.content.previousElementSibling, style = getComputedStyle(paint), origin = paint.getBoundingClientRect();
      const positions = style.backgroundPosition.split(/,\s*/).map(value => value.split(' ').map(parseFloat));
      const sizes = style.backgroundSize.split(/,\s*/).map(value => parseFloat(value.slice(value.lastIndexOf(' ') + 1)));
      return {
        image: style.backgroundImage, size: style.backgroundSize, width: paint.clientWidth,
        left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight),
        positions, sizes,
        fenced: Array.from(paint.querySelectorAll('.lightmarkdown-fenced-code')).filter(node => node.getClientRects().length).map(node => {
          const r = node.getBoundingClientRect(); return { top: r.top - origin.top, bottom: r.bottom - origin.top, height: r.height, background: getComputedStyle(node).backgroundColor };
        }),
        inline: Array.from(paint.querySelectorAll('.lightmarkdown-code:not(.lightmarkdown-fenced-code)')).filter(node => node.getClientRects().length).map(node => getComputedStyle(node).backgroundColor)
      };
    });
    for (const language of ['js', 'python', 'html']) for (const shape of ['blocks', 'lf', 'br']) {
      await prepare('Before `inline`.\n\n```' + language + '\nshort\n\n' + 'x'.repeat(53) + '\n```\n\nAfter.', shape);
      const g = await geometry();
      assert.equal((g.image.match(/linear-gradient/g) || []).length, 1);
      assert.ok(g.width > 780, 'paint surface fills the approximately 810px pane');
      assert.match(g.size, /calc\(100% - /);
      assert.ok(g.sizes[0] > 120, 'one band covers all five lines, including the blank');
      for (const line of g.fenced) {
        assert.equal(line.background, 'rgba(0, 0, 0, 0)');
        assert.ok(line.top >= g.positions[0][1] - 1 && line.bottom <= g.positions[0][1] + g.sizes[0] + 1);
      }
      assert.ok(g.inline.some(color => color !== 'rgba(0, 0, 0, 0)'), 'inline code keeps its own background');
      assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), 'Before `inline`.\n\n```' + language + '\nshort\n\n' + 'x'.repeat(53) + '\n```\n\nAfter.');
    }
    // Wrapping changes fence height without changing text. Resize must remeasure.
    await prepare('```js\n' + 'word '.repeat(100) + '\n\n```');
    const wide = await geometry();
    await page.locator('#editor').evaluate(node => { node.style.width = '350px'; });
    await page.waitForFunction(height => parseFloat(__markdownEditor.content.previousElementSibling.style.backgroundSize.split(' ').at(-1)) > height + 20, wide.sizes[0]);
    assert.equal(await page.evaluate(() => __backgroundChanges === __markdownChanges.length && __backgroundNodes.every((node, i) => node === __markdownEditor.content.childNodes[i])), true);
    // Existing theme variables supply the band in each shipped skin/mode.
    for (const skin of ['', 'bootstrap', 'material-classic', 'material-outline', 'frost', 'patina', 'sterling']) {
      if (skin) await page.addStyleTag({ url: base + '/dist/skins/' + skin + '.css' });
      for (const mode of ['light', 'dark']) {
        await page.locator('#editor').evaluate((node, { skin, mode }) => { node.className = 'lightmetal lightmarkdown lightmetal-' + mode + (skin ? ' lightmetal-' + skin : ''); }, { skin, mode });
        await prepare('```\nshort\n\n```');
        const g = await geometry(); assert.equal((g.image.match(/linear-gradient/g) || []).length, 1);
        assert.ok(g.sizes[0] > 90);
      }
    }
    await prepare('> - ```js\n>   nested\n>   \n>   ```\n\n~~~python\nopen\n');
    assert.equal(((await geometry()).image.match(/linear-gradient/g) || []).length, 2);
    await prepare('```js\n\n```');
    await page.evaluate(() => {
      const source = __markdownEditor.content; source.focus();
      getSelection().collapse(source.children[1], 0);
    });
    await page.keyboard.type('hello world');
    assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), '```js\nhello world\n```');
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), '```js\n\n```');
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), '```js\nhello world\n```');
    await prepare('no fence `inline`'); assert.equal((await geometry()).image, 'none');
    assert.deepEqual(errors, []);
    console.log(name + ': contiguous full-width fenced-code paint bands, js/python/html, blocks/LF/BR, blank/wrapped/nested/open fences, resize, inline code and all skins/light-dark: ok');
  } finally { await page.close(); }
}
module.exports = { codeBackgroundChecks };
