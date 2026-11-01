/* Table menu and explicit monospace source padding, with native history. */
const assert = require('node:assert/strict');
const compact = '| Name | Role |\n| --- | --- |\n| Alice | Developer |\n| Bob | Designer |';
const padded = '| Name  | Role      |\n| ----- | --------- |\n| Alice | Developer |\n| Bob   | Designer  |';

async function tableFormatChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [], requests = []; let monitor = false;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (monitor) requests.push(request.url()); });
  try {
    await page.goto(base + '/tests/fixtures/markdown.html'); await page.waitForFunction(() => window.__markdownEditor);
    await page.evaluate(() => { const outside = document.createElement('button'); outside.id = 'format-outside'; outside.textContent = 'Outside'; document.body.append(outside); });
    const source = page.locator('#editor .lightmarkdown-input');
    const trigger = page.getByRole('button', { name: 'Table', exact: true });
    const menu = page.getByRole('menu', { name: 'Table', exact: true });
    const item = title => menu.getByRole('menuitem', { name: title, exact: true });
    const get = () => page.evaluate(() => __markdownEditor.getMarkdown());
    const count = () => page.evaluate(() => __markdownChanges.length - __formatBefore);
    const history = () => page.evaluate(() => ['undo', 'redo'].map(command => document.queryCommandEnabled(command)));
    const prepare = (text, start = 0, end = start, shape = 'blocks') => page.evaluate(({ text, start, end, shape }) => {
      const api = __markdownEditor; api.setMarkdown(text); const source = api.content;
      if (shape !== 'blocks') {
        const block = document.createElement('div');
        if (shape === 'lf') block.append(document.createTextNode(text));
        else text.split('\n').forEach((line, index) => {
          if (index) block.append(document.createElement('br'));
          const span = document.createElement('span'); span.append(document.createTextNode(line)); block.append(span);
        });
        block.append(document.createElement('br')); source.replaceChildren(block); source.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const point = at => {
        if (shape === 'lf') return [source.firstChild.firstChild, at];
        const before = text.slice(0, at).split('\n'), index = before.length - 1;
        const node = shape === 'br' ? source.querySelectorAll('span')[index].firstChild : source.children[index].firstChild;
        return node.nodeName === 'BR' ? [node.parentNode, 0] : [node, before[index].length];
      };
      const range = document.createRange(); range.setStart(...point(start)); range.setEnd(...point(end));
      source.focus(); getSelection().removeAllRanges(); getSelection().addRange(range); source.dispatchEvent(new Event('focus'));
      window.__formatBefore = __markdownChanges.length;
    }, { text, start, end, shape });
    const remember = () => source.evaluate(node => {
      const walk = document.createTreeWalker(node, NodeFilter.SHOW_ALL); window.__formatNodes = [];
      while (walk.nextNode()) __formatNodes.push(walk.currentNode);
      window.__formatHTML = node.innerHTML;
    });
    const sameNodes = () => source.evaluate(node => {
      const walk = document.createTreeWalker(node, NodeFilter.SHOW_ALL), nodes = [];
      while (walk.nextNode()) nodes.push(walk.currentNode);
      return node.innerHTML === __formatHTML && nodes.length === __formatNodes.length && nodes.every((item, index) => item === __formatNodes[index]);
    });
    monitor = true;
    assert.equal(await trigger.getAttribute('aria-haspopup'), 'menu');
    assert.equal(await page.getByRole('button', { name: 'Format Table', exact: true }).count(), 0, 'no extra default toolbar icon');
    await prepare(''); await remember(); const flags = await history();
    await trigger.focus(); await page.keyboard.press('ArrowDown');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(await menu.locator('button').allTextContents(), ['Insert Table…', 'Format Table', 'Add Row After', 'Delete Row', 'Add Column After', 'Delete Column',
      'Align Column Left', 'Center Column', 'Align Column Right', 'Clear Column Alignment']);
    assert.deepEqual(await menu.locator('button').evaluateAll(nodes => nodes.map(node => node.disabled)), [false, true, true, true, true, true, true, true, true, true]);
    await page.keyboard.press('End'); assert.equal(await item('Insert Table…').evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Escape'); assert.equal(await menu.count(), 0); assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
    assert.equal(await sameNodes(), true); assert.deepEqual(await history(), flags); assert.equal(await count(), 0);
    await trigger.click(); await item('Insert Table…').click();
    await page.getByRole('dialog', { name: 'Insert table' }).getByRole('button', { name: '2 columns, 2 rows', exact: true }).click();
    assert.equal(await get(), '| Column 1 | Column 2 |\n| -------- | -------- |\n|          |          |'); assert.equal(await count(), 1);
    await trigger.click(); await item('Format Table').click(); assert.equal(await count(), 1, 'inserted tables are already formatted');
    await page.keyboard.press('Control+z'); assert.equal(await get(), '');

    const cases = [
      [compact, padded, 'Alice'],
      ['Name|Role\n---|---\nAlice|Developer\nBob|Designer', padded, 'Bob'],
      ['| L | C | R |\n| :--- | :---: | ---: |\n| x | y | z |', '| L    | C     | R    |\n| :--- | :---: | ---: |\n| x    | y     | z    |', 'y'],
      ['| A |\n| - |', '| A   |\n| --- |', 'A'],
      ['|  | B |\n| --- | --- |\n|  | y |', '|     | B   |\n| --- | --- |\n|     | y   |', 'y'],
      ['| A | B |\n| --- | --- |\n| a\\|b | `x` |', '| A    | B   |\n| ---- | --- |\n| a\\|b | `x` |', 'a\\|b'],
      ['| A | B |\n| --- | --- |\n| a\tb | y |', '| A   | B   |\n| --- | --- |\n| a\tb | y   |', 'a\tb'],
      ['| A | B |\n| --- | --- |\n| \u00a0 | \ufeff |', '| A   | B   |\n| --- | --- |\n| \u00a0   | \ufeff   |', '\u00a0'],
      ['| A | B |\n| --- | --- |\n| ![x](photo.png) | **bold** |', '| A               | B        |\n| --------------- | -------- |\n| ![x](photo.png) | **bold** |', 'photo.png'],
    ];
    for (const [first, rest] of [['> ', '> '], ['> - ', '>   '], ['12. ', '    ']]) {
      const wrap = text => first + text.replaceAll('\n', '\n' + rest);
      cases.push([wrap(compact), wrap(padded), 'Alice']);
    }
    cases.push(['before\n\n' + compact + '\n\nuntouched', 'before\n\n' + padded + '\n\nuntouched', 'Bob']);
    cases.push([compact + '\n\n' + compact, padded + '\n\n' + compact, 'Alice']);
    for (const shape of ['blocks', 'lf', 'br']) for (const [text, expected, selected] of cases) {
      const start = text.indexOf(selected), label = `${name}/${shape}: ${JSON.stringify(text)}`;
      await prepare(text, start, start + selected.length, shape);
      await trigger.click(); assert.equal(await item('Format Table').isEnabled(), true, label); await item('Format Table').click();
      assert.equal(await get(), expected, label); assert.equal(await count(), text === expected ? 0 : 1, label);
      assert.equal(await page.evaluate(() => getSelection().getRangeAt(0).cloneContents().textContent), selected, label + ': selected source bytes');
      assert.equal(await source.evaluate(node => node === document.activeElement), true);
      await remember(); const native = await history(), changes = await count();
      await trigger.click(); await item('Format Table').click();
      assert.equal(await get(), expected); assert.equal(await count(), changes); assert.equal(await sameNodes(), true, label + ': no-op source nodes'); assert.deepEqual(await history(), native);
      await page.keyboard.insertText('NEW'); assert.equal(await get(), expected.replace(selected, 'NEW'), label + ': mapped selection');
      await page.keyboard.press('Control+z'); assert.equal(await get(), expected);
      if (text !== expected) { await page.keyboard.press('Control+z'); assert.equal(await get(), text); await page.keyboard.press('Control+Shift+z'); assert.equal(await get(), expected); }
    }
    await prepare(compact, 0, compact.length); await trigger.click(); await item('Format Table').click(); assert.equal(await get(), padded);
    for (const [text, start, end = start] of [['plain', 2], ['```\n' + compact + '\n```', 6], ['<div>\n' + compact, 8],
      [compact + '\nshort', 2], [compact + '\n| a | b | c |', 2], [compact + '\n\n' + compact, 0, compact.length + 3], ['> ' + compact.replaceAll('\n', '\n> '), 1]]) {
      await prepare(text, start, end); await remember(); const native = await history(); await trigger.click();
      assert.equal(await item('Format Table').isDisabled(), true); await item('Format Table').evaluate(node => node.click());
      await page.keyboard.press('Escape'); assert.equal(await get(), text); assert.equal(await count(), 0); assert.equal(await sameNodes(), true); assert.deepEqual(await history(), native);
    }
    await prepare(compact, compact.indexOf('Alice')); await trigger.click();
    await page.keyboard.press('ArrowDown'); assert.equal(await item('Add Row After').evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('End'); assert.equal(await menu.getByRole('menuitemradio', { name: 'Clear Column Alignment', exact: true }).evaluate(node => node === document.activeElement), true);
    await menu.getByRole('menuitemradio', { name: 'Center Column', exact: true }).click(); assert.equal(await get(), compact.replace('| --- |', '| :---: |'));
    await trigger.click(); assert.equal(await menu.getByRole('menuitemradio', { name: 'Center Column', exact: true }).getAttribute('aria-checked'), 'true');
    await page.keyboard.press('Escape'); await page.keyboard.press('Control+z'); assert.equal(await get(), compact);
    for (const [title, expected] of [['Add Row After', compact.replace('| Bob', '|  |  |\n| Bob')], ['Delete Row', compact.replace('\n| Alice | Developer |', '')],
      ['Add Column After', compact.replaceAll('| Role', '| Column | Role').replace('| --- | --- |', '| --- | --- | --- |').replace('| Developer', '|  | Developer').replace('| Designer', '|  | Designer')],
      ['Delete Column', '| Role |\n| --- |\n| Developer |\n| Designer |']]) {
      await prepare(compact, compact.indexOf('Alice')); await trigger.click(); await item(title).click(); assert.equal(await get(), expected, title);
      await page.keyboard.press('Control+z'); assert.equal(await get(), compact);
    }
    await prepare(compact, compact.indexOf('Alice')); await trigger.click();
    await page.evaluate(() => __markdownEditor.setMarkdown('replacement')); assert.equal(await menu.count(), 0);
    await prepare(compact, compact.indexOf('Alice')); await trigger.click();
    await source.dispatchEvent('compositionstart'); assert.equal(await menu.count(), 0); assert.equal(await trigger.isDisabled(), true); await source.dispatchEvent('compositionend');
    await prepare(compact, compact.indexOf('Alice')); await trigger.click();
    await page.locator('#format-outside').click(); assert.equal(await menu.count(), 0); assert.equal(await get(), compact); assert.equal(await count(), 0);
    await page.setViewportSize({ width: 390, height: 480 }); await trigger.click();
    const rect = await menu.boundingBox(); assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 391 && rect.y + rect.height <= 481);
    await page.keyboard.press('Escape');
    await prepare(compact, compact.indexOf('Name')); await trigger.click(); assert.equal(await item('Delete Row').isDisabled(), true);
    await page.keyboard.press('Tab'); assert.equal(await menu.count(), 0);
    await prepare('| A |\n| --- |\n| b |', 2); await trigger.click(); assert.equal(await item('Delete Column').isDisabled(), true); await page.keyboard.press('Escape');
    await prepare(compact, compact.indexOf('Alice'));
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click(); await trigger.click(); await page.keyboard.press('Escape');
    assert.equal(await page.locator('.lightmarkdown-fullscreen').count(), 1, 'Escape closes menu before fullscreen');
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.lightmarkdown-fullscreen').count(), 0);
    await page.evaluate(() => {
      __markdownEditor.destroy(); window.__nativeMenuPopover = HTMLElement.prototype.showPopover; HTMLElement.prototype.showPopover = undefined;
      window.__markdownEditor = __initMarkdown({ element: document.getElementById('editor'), onChange: value => __markdownChanges.push(value) });
    });
    await prepare(compact, compact.indexOf('Alice')); await trigger.click();
    assert.equal(await menu.evaluate(node => node.hasAttribute('popover')), false); await item('Format Table').click(); assert.equal(await get(), padded); assert.equal(await count(), 1);
    await page.keyboard.press('Control+z'); assert.equal(await get(), compact);
    await page.evaluate(() => { HTMLElement.prototype.showPopover = __nativeMenuPopover; });
    await page.evaluate(() => {
      __markdownEditor.destroy(); window.__markdownEditor = __initMarkdown({ element: document.getElementById('editor'), actions: ['table-format'],
        shortcuts: { 'table-format': 'Alt+Shift+f' }, onChange: value => __markdownChanges.push(value) });
    });
    await prepare(compact, compact.indexOf('Bob')); await page.keyboard.press('Alt+Shift+f'); assert.equal(await get(), padded); assert.equal(await count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Format Table', exact: true }).getAttribute('aria-pressed'), null);
    await page.keyboard.press('Control+z'); assert.equal(await get(), compact);
    await page.evaluate(() => {
      __markdownEditor.destroy(); window.__customFormat = 0;
      window.__markdownEditor = __initMarkdown({ element: document.getElementById('editor'), actions: [{ name: 'table-format', result: () => __customFormat++, state: () => true }],
        onChange: value => __markdownChanges.push(value) });
    });
    await prepare('plain', 2); await page.getByRole('button', { name: 'Format Table', exact: true }).click();
    assert.equal(await page.evaluate(() => __customFormat), 1); assert.equal(await get(), 'plain'); assert.equal(await count(), 0);
    await page.evaluate(() => __markdownEditor.destroy()); assert.equal(await page.locator('.lightmarkdown-table-menu').count(), 0);
    monitor = false;
    await page.goto(base + '/examples/markdown-iframe.html'); await page.waitForFunction(() => !document.getElementById('read-markdown').disabled);
    const view = page.frameLocator('#isolated-editor'), input = view.locator('.lightmarkdown-input');
    await input.evaluate((node, text) => {
      const win = node.ownerDocument.defaultView; win.__markdownEditor.setMarkdown(text);
      const range = node.ownerDocument.createRange(); range.setStart(node.children[2].firstChild, 2); range.setEnd(node.children[2].firstChild, 7);
      node.focus(); node.ownerDocument.getSelection().removeAllRanges(); node.ownerDocument.getSelection().addRange(range);
    }, compact);
    await view.getByRole('button', { name: 'Side-by-side', exact: true }).click();
    await view.getByRole('button', { name: 'Table', exact: true }).click(); await view.getByRole('menuitem', { name: 'Format Table', exact: true }).click();
    assert.equal(await input.evaluate(node => node.ownerDocument.defaultView.__markdownEditor.getMarkdown()), padded);
    assert.equal(await input.evaluate(node => node.ownerDocument.getSelection().toString()), 'Alice');
    await page.keyboard.press('Control+z'); assert.equal(await input.evaluate(node => node.ownerDocument.defaultView.__markdownEditor.getMarkdown()), compact);
    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    console.log(name + ': default Table menu, insertion/row/column/alignment commands, monospace padding, no-ops, selection, native undo/redo, source shapes/guards, keyboard, narrow layout, teardown and iframe split: ok');
  } finally { await page.close(); }
}
module.exports = { tableFormatChecks };
if (require.main === module) (async () => {
  const { chromium, firefox } = require('playwright'), { pathToFileURL } = require('node:url'), path = require('node:path');
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch(); try { await tableFormatChecks(browser, pathToFileURL(path.resolve(__dirname, '..')).href, name); } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
