// HTML Table menu: reuse the native insertion and contextual editing commands.
module.exports = async function tableMenuChecks(page, check) {
  await page.evaluate(() => {
    const host = document.createElement('div'); host.className = 'lightmetal'; host.dataset.tableMenuTest = ''; document.body.append(host);
    window.__htmlMenuChanges = [];
    window.__htmlMenu = lightmetal.init({ element: host, actions: ['bold', 'table', 'source'], onChange: html => __htmlMenuChanges.push(html) });
    const outside = document.createElement('button'); outside.id = 'html-menu-outside'; outside.textContent = 'Outside'; document.body.append(outside);
  });
  const host = page.locator('[data-table-menu-test]'), trigger = host.getByRole('button', { name: 'Table', exact: true });
  const menu = host.getByRole('menu', { name: 'Table', exact: true }), item = title => menu.getByRole('menuitem', { name: title, exact: true });
  const fixture = '<p>Before</p><table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table><p>After</p>';
  const prepare = (html = fixture, inside = true) => page.evaluate(({ html, inside }) => {
    __htmlMenu.setHTML(html); __htmlMenu.content.focus();
    const target = inside ? __htmlMenu.content.querySelector('td,th') : __htmlMenu.content.querySelector('p');
    const range = document.createRange(); range.selectNodeContents(target); range.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(range); window.__htmlMenuChanges = [];
  }, { html, inside });
  const html = () => page.evaluate(() => __htmlMenu.getHTML());
  const count = () => page.evaluate(() => __htmlMenuChanges.length);
  await prepare(fixture, false); const before = await html();
  await trigger.focus(); await page.keyboard.press('ArrowDown');
  check('HTML Table button exposes a menu with all existing commands', await trigger.getAttribute('aria-haspopup') === 'menu' &&
    await trigger.getAttribute('aria-expanded') === 'true' && JSON.stringify(await menu.locator('button').allTextContents()) === JSON.stringify([
      'Insert Table…', 'Insert row above', 'Insert row below', 'Insert column left', 'Insert column right', 'Delete row', 'Delete column', 'Delete table']));
  check('outside a table only insertion is enabled', await item('Insert Table…').isEnabled() && await menu.locator('button:disabled').count() === 7);
  await page.keyboard.press('End');
  check('menu keyboard navigation skips unavailable commands', await item('Insert Table…').evaluate(node => node === document.activeElement));
  await page.keyboard.press('Escape');
  check('opening and cancelling the HTML menu preserves content, callback count and focus', await html() === before && await count() === 0 &&
    await menu.count() === 0 && await trigger.evaluate(node => node === document.activeElement));
  await prepare(); await trigger.click();
  check('inside a table insertion disables and editing commands enable', await item('Insert Table…').isDisabled() && await menu.locator('button:enabled').count() === 7);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  check('keyboard menu actions edit the table and restore cell focus', await host.locator('.lightmetal-content tr').count() === 3 && await count() === 1 &&
    await host.locator('.lightmetal-content').evaluate(node => node === document.activeElement) && await menu.count() === 0);
  await page.keyboard.press('Control+z'); check('menu keyboard action uses one native undo step', await html() === fixture);

  for (const [title, rows, columns] of [['Insert row above', 3, 2], ['Insert row below', 3, 2], ['Insert column left', 2, 3], ['Insert column right', 2, 3],
    ['Delete row', 1, 2], ['Delete column', 2, 1], ['Delete table', 0, 0]]) {
    await prepare(); const original = await html(); await trigger.click(); await item(title).click(); const edited = await html();
    const state = await host.locator('.lightmetal-content').evaluate(node => {
      const table = node.querySelector('table'); return { rows: table?.rows.length || 0, columns: table?.rows[0].cells.length || 0, focused: node === document.activeElement };
    });
    check('HTML menu ' + title + ' uses existing table editing semantics', state.rows === rows && state.columns === columns && state.focused && await count() === 1 &&
      edited.startsWith('<p>Before</p>') && edited.endsWith('<p>After</p>'));
    await page.keyboard.press('Control+z'); check('HTML menu ' + title + ' undoes natively', await html() === original);
    await page.keyboard.press('Control+y'); check('HTML menu ' + title + ' redoes natively', await html() === edited);
  }
  for (const markup of ['<table><tbody><tr><td rowspan="2">Merged</td><td>A</td></tr><tr><td>B</td></tr></tbody></table>',
    '<table><colgroup span="2"></colgroup><tbody><tr><td>A</td><td>B</td></tr></tbody></table>']) {
    await prepare(markup); const original = await html(); await trigger.click();
    check('HTML menu retains merged/column-group guards and whole-table deletion', await item('Delete column').isDisabled() && await item('Delete table').isEnabled());
    await item('Delete column').evaluate(node => node.click()); check('unavailable menu commands do not mutate HTML', await html() === original && await count() === 0);
    await page.keyboard.press('Escape');
  }
  await prepare(); await trigger.click(); await page.keyboard.press('Tab'); check('Tab closes the HTML menu', await menu.count() === 0);
  await trigger.click(); await page.locator('#html-menu-outside').click(); check('outside pointer closes the HTML menu', await menu.count() === 0);
  await trigger.click(); await page.evaluate(() => __htmlMenu.setHTML('<p>Replacement</p>')); check('setHTML closes the menu', await menu.count() === 0);
  await prepare(); await trigger.click(); await host.getByRole('button', { name: 'Source', exact: true }).click();
  check('Source mode closes the menu and keeps table commands inert', await menu.count() === 0);
  const source = await html(); await trigger.click(); check('Source cannot reopen the HTML menu', await menu.count() === 0 && await html() === source);
  await host.getByRole('button', { name: 'Source', exact: true }).click();
  await prepare(); await page.setViewportSize({ width: 390, height: 480 }); await trigger.click();
  const bounds = await menu.boundingBox(); check('HTML menu fits a narrow viewport', bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 391 && bounds.y + bounds.height <= 481);
  await page.keyboard.press('Escape'); await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    __htmlMenu.destroy(); window.__menuNativePopover = HTMLElement.prototype.showPopover; HTMLElement.prototype.showPopover = undefined;
    window.__htmlMenu = lightmetal.init({ element: document.querySelector('[data-table-menu-test]'), actions: ['table'], onChange: html => __htmlMenuChanges.push(html) });
  });
  try {
    await prepare(); await trigger.click(); check('HTML menu has a fixed-position fallback', !await menu.evaluate(node => node.hasAttribute('popover')));
    await item('Insert row below').click(); check('HTML menu fallback edits natively', await host.locator('.lightmetal-content tr').count() === 3 && await count() === 1);
  } finally { await page.evaluate(() => { HTMLElement.prototype.showPopover = __menuNativePopover; }); }
  const clean = await page.evaluate(() => {
    const old = __htmlMenu.element.querySelector('.lightmetal-table-menu button'); __htmlMenu.destroy(); old.click();
    const clean = __htmlMenu.element.childNodes.length === 0; __htmlMenu.element.remove(); document.getElementById('html-menu-outside').remove(); return clean;
  });
  check('HTML menu teardown removes its UI and listeners', clean);
};

if (require.main === module) (async () => {
  const { chromium, firefox } = require('playwright'), assert = require('node:assert/strict'), { pathToFileURL } = require('node:url'), path = require('node:path');
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage(); await page.goto(pathToFileURL(path.resolve(__dirname, '../examples/html.html')).href);
      await page.waitForFunction(() => window.lightmetal);
      await module.exports(page, (message, result) => assert.ok(result, name + ': ' + message));
      console.log(name + ': HTML Table menu, native commands/history, keyboard, guards, source mode, narrow layout, fallback and teardown: ok');
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
