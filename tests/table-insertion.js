// Insertion-only browser checks, run by smoke.js in Chromium and Firefox.
module.exports = async function tableInsertionChecks(page, check) {
  const host = page.locator('[data-table-insertion-test]');
  const trigger = host.getByRole('button', { name: 'Table', exact: true });
  const popup = host.locator('.lightmetal-table-dropdown[role="dialog"]');
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'lightmetal lightmetal-light';
    host.setAttribute('data-table-insertion-test', '');
    document.body.appendChild(host);
    window.__insertionChanges = [];
    window.__insertion = lightmetal.init({
      element: host, actions: ['bold', 'table', 'source'],
      onChange: (html) => window.__insertionChanges.push(html)
    });
  });
  const reset = async (html = '<p>LeftRight</p>', offset = 4, end = offset) => {
    await page.evaluate(({ html, offset, end }) => {
      const editor = window.__insertion;
      editor.setHTML(html);
      editor.content.focus();
      const range = document.createRange();
      const node = editor.content.querySelector('p')?.firstChild || editor.content;
      range.setStart(node, offset);
      range.setEnd(node, end);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      window.__insertionChanges = [];
    }, { html, offset, end });
  };
  const open = async () => {
    await trigger.click();
    await host.getByRole('menuitem', { name: 'Insert Table…', exact: true }).click();
    await popup.waitFor({ state: 'visible' });
  };
  const html = () => page.evaluate(() => window.__insertion.getHTML());
  const inspect = () => page.evaluate(() => {
    const editor = window.__insertion;
    const table = editor.content.querySelector('table');
    const selection = window.getSelection();
    const node = selection.anchorNode;
    const cell = (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest('td');
    return {
      rows: table?.rows.length, columns: table?.rows[0].cells.length,
      firstCell: cell === table?.rows[0].cells[0] && selection.isCollapsed,
      focused: document.activeElement === editor.content,
      changes: window.__insertionChanges.length,
      text: editor.content.textContent,
      clean: !!table && !table.querySelector('[style], [class], [border], [width], [cellpadding], [cellspacing]') &&
        table.attributes.length === 0 && table.tBodies.length === 1 &&
        Array.from(table.rows).every((row) => row.attributes.length === 0 &&
          Array.from(row.cells).every((cell) => cell.attributes.length === 0 && cell.innerHTML === '<br>'))
    };
  });

  await reset();
  const before = await html();
  await open();
  check('Table menu opens its insertion dialog', await trigger.getAttribute('aria-haspopup') === 'menu' &&
    await host.locator('.lightmetal-table-menu [aria-haspopup="dialog"]').getAttribute('aria-expanded') === 'true' &&
    await popup.getAttribute('role') === 'dialog' && await popup.locator('.lightmetal-table-grid button').count() === 80);
  check('manual inputs default to 3×3 and retain the existing maxima',
    await popup.getByLabel('Columns', { exact: true }).inputValue() === '3' && await popup.getByLabel('Rows', { exact: true }).inputValue() === '3' &&
    await popup.getByLabel('Columns', { exact: true }).getAttribute('max') === '100' && await popup.getByLabel('Rows', { exact: true }).getAttribute('max') === '1000');
  const cell = popup.locator('[data-column="4"][data-row="3"]');
  await cell.hover();
  check('grid hover highlights the selected rectangle and reports dimensions',
    await popup.locator('.lightmetal-grid-selected').count() === 12 &&
    await popup.locator('.lightmetal-table-dimensions').textContent() === '4 × 3');
  await cell.click();
  const inserted = await inspect();
  check('grid inserts clean 3-row/4-column HTML at the saved cursor',
    inserted.rows === 3 && inserted.columns === 4 && inserted.clean && inserted.text === 'LeftRight');
  check('insertion preserves text on both sides of the table', await page.evaluate(() => {
    const content = window.__insertion.content;
    const table = content.querySelector('table');
    const range = document.createRange();
    range.selectNodeContents(content);
    range.setEndBefore(table);
    const left = range.toString();
    range.selectNodeContents(content);
    range.setStartAfter(table);
    return left === 'Left' && range.toString() === 'Right';
  }));
  check('insertion focuses the first cell, emits one change and closes the dialog',
    inserted.firstCell && inserted.focused && inserted.changes === 1 && await popup.isHidden() &&
    await trigger.getAttribute('aria-expanded') === 'false');
  const after = await html();
  await page.keyboard.press('Control+z');
  check('dropdown insertion uses native undo', await html() === before);
  await page.keyboard.press('Control+y');
  check('dropdown insertion uses native redo', await html() === after);

  await reset();
  await page.evaluate(() => window.__insertion.insertTable());
  check('insertTable() defaults to 3×3 and focuses its first cell',
    (await inspect()).rows === 3 && (await inspect()).columns === 3 && (await inspect()).firstCell);
  await page.keyboard.type('First cell');
  check('typing after insertion starts in the first cell', await page.evaluate(() =>
    window.__insertion.content.querySelector('td').textContent === 'First cell'));

  await reset();
  await open();
  await popup.getByLabel('Columns', { exact: true }).fill('12');
  await popup.getByLabel('Rows', { exact: true }).fill('9');
  await popup.getByRole('button', { name: 'Insert', exact: true }).click();
  check('manual inputs insert tables larger than the grid',
    (await inspect()).columns === 12 && (await inspect()).rows === 9 && (await inspect()).firstCell);
  for (const input of ['Columns', 'Rows']) {
    await reset();
    await open();
    await popup.getByLabel(input, { exact: true }).press('Enter');
    check('Enter in ' + input + ' inserts the table', (await inspect()).rows === 3 && (await inspect()).columns === 3 && await popup.isHidden());
  }

  await reset();
  await open();
  const unchanged = await html();
  for (const [columns, rows] of [['', '3'], ['0', '3'], ['-1', '3'], ['1.5', '3'], ['101', '3'], ['3', '1001'], ['100', '101']]) {
    await popup.getByLabel('Columns', { exact: true }).fill(columns);
    await popup.getByLabel('Rows', { exact: true }).fill(rows);
    await popup.getByRole('button', { name: 'Insert', exact: true }).click();
    check('invalid manual dimensions are rejected without closing the dialog',
      await html() === unchanged && await popup.isVisible() &&
      (await popup.getByRole('status').textContent()).includes('Use 1–1000 rows'));
  }
  await popup.getByLabel('Columns', { exact: true }).fill('3');
  await popup.getByLabel('Rows', { exact: true }).fill('3');
  await page.keyboard.press('Escape');
  check('Escape closes the popup and returns focus to its trigger', await popup.isHidden() &&
    await trigger.evaluate((button) => button === document.activeElement) && await html() === unchanged);
  await open();
  await host.locator('.lightmetal-content').click();
  check('outside click closes the popup', await popup.isHidden());
  await open();
  await trigger.click();
  check('clicking the trigger again closes the popup', await popup.isHidden());

  // Keyboard grid selection uses a single Tab stop and arrow keys.
  await reset();
  await trigger.focus();
  await trigger.press('Enter');
  await page.keyboard.press('Enter');
  await popup.waitFor({ state: 'visible' });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  check('keyboard grid navigation highlights 4×4', await popup.locator('.lightmetal-table-dimensions').textContent() === '4 × 4');
  await page.keyboard.press('Enter');
  check('keyboard grid activation inserts the highlighted table', (await inspect()).rows === 4 && (await inspect()).columns === 4);

  // API and UI both refuse to insert into existing cells.
  const nestedBefore = await html();
  check('API refuses nested table insertion', await page.evaluate(() => window.__insertion.insertTable()) === false && await html() === nestedBefore);
  await trigger.click();
  check('Table menu disables nested insertion', await html() === nestedBefore &&
    await host.getByRole('menuitem', { name: 'Insert Table…', exact: true }).isDisabled());
  await page.keyboard.press('Escape');

  await reset('<p>LeftDELETERight</p>', 4, 10);
  await open();
  await popup.locator('[data-column="1"][data-row="1"]').click();
  check('saved selections are replaced without losing surrounding content', (await inspect()).text === 'LeftRight');
  await host.getByRole('button', { name: 'Source', exact: true }).click();
  check('source mode displays clean inserted table markup', await host.locator('textarea').inputValue() === await html() &&
    (await html()).includes('<table><tbody><tr><td><br></td></tr></tbody></table>'));
  check('table is disabled in Source mode',await trigger.isDisabled());
  await trigger.evaluate(button=>button.click());
  check('source mode cannot open the table popup', await popup.isHidden());
  await host.getByRole('button', { name: 'Source', exact: true }).click();

  // Resize/scroll keep the dropdown inside the viewport, including narrow screens.
  await reset();
  await open();
  await page.setViewportSize({ width: 260, height: 280 });
  await page.waitForFunction(() => {
    const rect = window.__insertion.element.querySelector('.lightmetal-table-dropdown[role="dialog"]').getBoundingClientRect();
    return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
  });
  const bounded = await popup.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
  });
  check('insertion popup stays within a narrow viewport', bounded);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1280, height: 900 });

  // The fixed-position fallback also works without top-layer popovers.
  await reset();
  await popup.evaluate((node) => node.removeAttribute('popover'));
  await open();
  await popup.locator('[data-column="3"][data-row="2"]').click();
  check('insertion works with the non-popover dropdown fallback',
    (await inspect()).rows === 2 && (await inspect()).columns === 3 && (await inspect()).firstCell);

  // A second instance has independent options, cursor, limits, and dropdown.
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'lightmetal lightmetal-dark';
    host.setAttribute('data-table-insertion-second', '');
    document.body.appendChild(host);
    window.__insertionSecond = lightmetal.init({
      element: host, actions: ['table'], tables: { gridColumns: 5, gridRows: 4, maxColumns: 6, maxRows: 7, maxCells: 30 }
    });
    window.__insertionSecond.setHTML('<p>Second editor</p>');
  });
  const second = page.locator('[data-table-insertion-second]');
  await reset();
  await open();
  const firstUnchanged = await html();
  await second.getByRole('button', { name: 'Table', exact: true }).click();
  await second.getByRole('menuitem', { name: 'Insert Table…', exact: true }).click();
  const secondPopup = second.locator('.lightmetal-table-dropdown[role="dialog"]');
  check('independent instances have their own grid and close the other popup on outside click',
    await popup.isHidden() && await secondPopup.locator('.lightmetal-table-grid button').count() === 20 &&
    await secondPopup.getByLabel('Columns', { exact: true }).getAttribute('max') === '6');
  await secondPopup.locator('[data-column="5"][data-row="4"]').click();
  check('inserting in the second editor leaves the first untouched', await html() === firstUnchanged &&
    await second.locator('.lightmetal-content td').count() === 20);
  check('configured limits apply to the insertion API', await page.evaluate(() =>
    !window.__insertionSecond.insertTable(8, 1) && !window.__insertionSecond.insertTable(1, 7) &&
    !window.__insertionSecond.insertTable(6, 6)));

  await reset();
  await open();
  await page.evaluate(() => window.__insertion.setHTML('<p>Replaced</p>'));
  check('setHTML closes the popup and clears its saved selection', await popup.isHidden());
  await open();
  const destroyedCleanly = await page.evaluate(() => {
    const retainedGridCell = window.__insertion.element.querySelector('[data-column="1"][data-row="1"]');
    window.__insertion.destroy();
    const empty = window.__insertion.element.childNodes.length === 0;
    retainedGridCell.click();
    const inert = !window.__insertion.insertTable();
    window.__insertion.element.remove();
    window.__insertionSecond.destroy();
    window.__insertionSecond.element.remove();
    return empty && inert;
  });
  check('destroy removes insertion dropdowns and their handlers', destroyedCleanly &&
    await page.locator('[data-table-insertion-test], [data-table-insertion-second], .lightmetal-table-dropdown:popover-open').count() === 0);
};
