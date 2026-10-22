// Focused browser checks, run by smoke.js in Chromium and Firefox.
module.exports = async function tableControlChecks(page, check) {
  const host = page.locator('[data-table-controls-test]');
  const bar = host.locator('.lightmetal-tablebar');
  const fixture = '<p>Before</p><table><caption>Sales</caption>' +
    '<thead><tr><th scope="col">Region</th><th id="control-sales" scope="col">Sales</th></tr></thead>' +
    '<tbody><tr><th id="control-north" scope="row">North</th><td headers="control-north control-sales">10</td></tr>' +
    '<tr><th id="control-south" scope="row">South</th><td headers="control-south control-sales">20</td></tr></tbody>' +
    '<tfoot><tr><td>Total</td><td headers="control-north control-sales">30</td></tr></tfoot>' +
    '</table><p>After</p>';
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'lightmetal';
    host.setAttribute('data-table-controls-test', '');
    document.body.appendChild(host);
    window.__controlChanges = [];
    window.__controlEditor = window.lightmetal.init({
      element: host,
      actions: ['table', 'source'],
      onChange: (html) => window.__controlChanges.push(html)
    });
  });
  const load = async (html = fixture) => page.evaluate((html) => {
    window.__controlEditor.setHTML(html);
    window.__controlChanges = [];
  }, html);
  const select = async (row = 1, column = 1, tableIndex = 0) => {
    await page.evaluate(({ row, column, tableIndex }) => {
      const editor = window.__controlEditor;
      editor.content.focus();
      const range = document.createRange();
      range.selectNodeContents(editor.content.querySelectorAll('table')[tableIndex].rows[row].cells[column]);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }, { row, column, tableIndex });
    await page.waitForFunction(() => !window.__controlEditor.element.querySelector('.lightmetal-tablebar').hidden);
  };
  const html = () => page.evaluate(() => window.__controlEditor.getHTML());
  const state = () => page.evaluate(() => {
    const editor = window.__controlEditor;
    const table = editor.content.querySelector('table');
    const node = window.getSelection().anchorNode;
    const cell = (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest('td, th');
    return {
      rows: table ? Array.from(table.rows, (row) => Array.from(row.cells, (cell) => cell.textContent)) : [],
      head: table?.tHead?.rows.length,
      body: table?.tBodies[0]?.rows.length,
      foot: table?.tFoot?.rows.length,
      caption: table?.caption?.textContent,
      focused: document.activeElement === editor.content,
      cellText: cell?.textContent,
      changes: window.__controlChanges.length,
      before: editor.content.firstElementChild.textContent,
      after: editor.content.lastElementChild.textContent
    };
  });
  const undoRedo = async (before, after) => {
    await page.keyboard.press('Control+z');
    check('table edit undo restores the original HTML', await html() === before);
    await page.keyboard.press('Control+y');
    check('table edit redo restores the edited HTML', await html() === after);
  };

  await load();
  check('table controls start hidden', await bar.isHidden());
  await select();
  const inspections = await page.evaluate(() => {
    const table = window.__controlEditor.content.querySelector('table');
    const query = table.querySelector;
    const counts = { structure: 0, columns: 0 };
    table.querySelector = function (selector) {
      if (selector === 'table') counts.structure++;
      if (selector === 'colgroup, col') counts.columns++;
      return query.call(this, selector);
    };
    try {
      document.dispatchEvent(new Event('selectionchange'));
      return counts;
    } finally {
      delete table.querySelector;
    }
  });
  check('a contextual toolbar update inspects table structure and column groups once',
    inspections.structure === 1 && inspections.columns === 1);
  await host.locator('tbody td').first().click();
  await page.waitForFunction(() => !window.__controlEditor.element.querySelector('.lightmetal-tablebar').hidden);
  check('clicking a cell shows seven labeled table controls',
    await bar.locator('button[aria-label]').count() === 7 && await bar.isVisible());
  await host.locator('.lightmetal-content p').first().click();
  await page.waitForFunction(() => window.__controlEditor.element.querySelector('.lightmetal-tablebar').hidden);
  check('leaving the table hides its controls', await bar.isHidden());

  for (const label of ['Insert row above', 'Insert row below', 'Insert column left', 'Insert column right',
    'Delete row', 'Delete column', 'Delete table']) {
    await load();
    await select();
    const before = await html();
    await bar.getByRole('button', { name: label, exact: true }).click();
    const after = await html();
    const result = await state();
    check(label + ' emits one change and restores editor focus', result.changes === 1 && result.focused);
    check(label + ' leaves surrounding paragraphs alone', result.before === 'Before' && result.after === 'After');
    if (label.startsWith('Insert row')) {
      const index = label.endsWith('above') ? 1 : 2;
      check(label + ' inserts a blank row in the same section',
        result.rows.length === 5 && result.head === 1 && result.body === 3 && result.foot === 1 &&
        result.rows[index].every((text) => text === '') && result.cellText === '');
      check('new row headers retain scope but do not duplicate IDs', await page.evaluate((index) => {
        const cell = window.__controlEditor.content.querySelector('table').rows[index].cells[0];
        return cell.tagName === 'TH' && cell.getAttribute('scope') === 'row' && !cell.id;
      }, index));
    } else if (label.startsWith('Insert column')) {
      const index = label.endsWith('left') ? 1 : 2;
      check(label + ' inserts blank cells across all sections',
        result.rows.length === 4 && result.rows.every((row) => row.length === 3 && row[index] === '') &&
        result.cellText === '');
      check('new column header retains scope without duplicating its ID', await page.evaluate((index) => {
        const cell = window.__controlEditor.content.querySelector('table').rows[0].cells[index];
        return cell.tagName === 'TH' && cell.getAttribute('scope') === 'col' && !cell.id;
      }, index));
    } else if (label === 'Delete row') {
      check('delete row preserves other sections and chooses a surviving cell',
        result.rows.length === 3 && result.body === 1 && result.head === 1 && result.foot === 1 && result.cellText === '20');
      check('deleting a header removes only its header references', await page.evaluate(() =>
        window.__controlEditor.content.querySelector('tfoot td[headers]').getAttribute('headers') === 'control-sales'));
    } else if (label === 'Delete column') {
      check('delete column removes the column from every section',
        result.rows.length === 4 && result.rows.every((row) => row.length === 1) && result.cellText === 'North');
    } else {
      check('delete table removes the table and hides controls', result.rows.length === 0 && await bar.isHidden());
    }
    if (label !== 'Delete table') check('table edits preserve captions', result.caption === 'Sales');
    check('contextual controls never enter saved HTML', !after.includes('lightmetal-tablebar') && !after.includes('lightmetal-table-button'));
    await undoRedo(before, after);
  }

  // Removing the final row or column removes the table, and remains undoable.
  for (const [markup, label] of [
    ['<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>', 'Delete row'],
    ['<table><tbody><tr><td>A</td></tr><tr><td>B</td></tr></tbody></table>', 'Delete column']
  ]) {
    await load(markup);
    await select(0, 0);
    const before = await html();
    await bar.getByRole('button', { name: label, exact: true }).click();
    const after = await html();
    check('deleting the last row/column removes the table', !(await state()).rows.length && await bar.isHidden());
    await undoRedo(before, after);
  }

  // Empty sections disappear, but other sections keep their identity.
  await load();
  await select(0, 0);
  await bar.getByRole('button', { name: 'Delete row', exact: true }).click();
  check('deleting a section’s final row removes only that section', await page.evaluate(() => {
    const table = window.__controlEditor.content.querySelector('table');
    return !table.tHead && table.tBodies[0].rows.length === 2 && table.tFoot.rows.length === 1 &&
      !table.querySelector('[headers]').getAttribute('headers').includes('control-sales');
  }));

  // Keyboard users can focus and activate contextual buttons without losing the cell.
  await load();
  await select();
  await bar.getByRole('button', { name: 'Insert row above', exact: true }).focus();
  await page.keyboard.press('Tab');
  check('Tab moves through contextual controls', await page.evaluate(() => document.activeElement.title === 'Insert row below'));
  await page.keyboard.press('Enter');
  check('Enter activates the selected control and returns to the new cell',
    (await state()).rows.length === 5 && (await state()).focused && (await state()).cellText === '');

  // Full-width section headings use logical width, not DOM cell count.
  const sectionFixture = require('fs').readFileSync(require('path').join(__dirname, 'fixtures/section-table.html'), 'utf8');
  const sectionRows = () => page.evaluate(() => Array.from(window.__controlEditor.content.querySelector('table').rows,
    (row) => Array.from(row.cells, (cell) => {
      // Chromium's native insertHTML unwraps attribute-free spans; compare
      // meaningful markup while still checking paragraphs, breaks and text.
      const clone = cell.cloneNode(true);
      for (const span of clone.querySelectorAll('span')) {
        if (!span.attributes.length) span.replaceWith(...span.childNodes);
      }
      return { html: clone.innerHTML, span: cell.colSpan };
    })));
  for (const label of ['Insert column left', 'Insert column right', 'Delete column']) {
    for (let column = 0; column < 4; column++) {
      await load(sectionFixture);
      await select(2, column);
      check('ordinary cells enable all controls in section-heading tables', await bar.locator('button:disabled').count() === 0);
      const before = await html();
      const original = await sectionRows();
      await bar.getByRole('button', { name: label, exact: true }).click();
      const after = await html();
      const updated = await sectionRows();
      const deleting = label === 'Delete column';
      const index = column + (label === 'Insert column right' ? 1 : 0);
      const width = deleting ? 3 : 5;
      check(label + ' updates all heading spans and keeps heading markup', [1, 4].every((row) =>
        updated[row].length === 1 && updated[row][0].span === width && updated[row][0].html === original[row][0].html));
      check(label + ' edits the correct logical column and preserves other cell markup', [0, 2, 3, 5].every((row) => {
        const expected = original[row].slice();
        if (deleting) expected.splice(index, 1);
        else expected.splice(index, 0, { html: '<br>', span: 1 });
        return JSON.stringify(updated[row]) === JSON.stringify(expected);
      }));
      check('section-table column edits emit one change and retain editor focus',
        (await state()).changes === 1 && (await state()).focused);
      await undoRedo(before, after);
    }
  }

  for (const heading of [1, 4]) {
    for (const label of ['Insert row above', 'Insert row below', 'Delete row']) {
      await load(sectionFixture);
      await select(heading, 0);
      check('full-width headings allow row edits but disable column edits',
        await bar.locator('button:disabled').count() === 3 &&
        (await bar.locator('.lightmetal-table-note').textContent()).includes('ordinary cell'));
      const before = await html();
      await page.evaluate(() => window.__controlEditor.element.querySelector('button[title="Delete column"]').click());
      check('column controls cannot act on a full-width heading', await html() === before);
      const original = await sectionRows();
      await bar.getByRole('button', { name: label, exact: true }).click();
      const after = await html();
      const updated = await sectionRows();
      const index = heading + (label === 'Insert row below' ? 1 : 0);
      const expected = original.slice();
      if (label === 'Delete row') expected.splice(index, 1);
      else expected.splice(index, 0, Array.from({ length: 4 }, () => ({ html: '<br>', span: 1 })));
      check(label + ' works on a section heading without changing other rows',
        JSON.stringify(updated) === JSON.stringify(expected));
      if (label !== 'Delete row') check('row insertion next to a heading focuses a normal blank cell',
        (await state()).cellText === '' && await bar.locator('button:disabled').count() === 0);
      await undoRedo(before, after);
    }
  }

  await load(sectionFixture);
  await select(3, 2);
  await bar.getByRole('button', { name: 'Delete row', exact: true }).click();
  check('deleting a row can safely focus the following full-width heading',
    (await state()).cellText === 'Queries' && await bar.locator('button:disabled').count() === 3);
  await host.getByRole('button', { name: 'Source', exact: true }).click();
  const sectionSource = await html();
  await host.getByRole('button', { name: 'Source', exact: true }).click();
  check('source mode round-trips section headings', await html() === sectionSource);

  // When only headings remain, row insertion creates a full-width normal row.
  await load('<table><tbody><tr><th colspan="4">First section</th></tr>' +
    '<tr><td colspan="4">Second section</td></tr></tbody></table>');
  await select(0, 0);
  await bar.getByRole('button', { name: 'Insert row below', exact: true }).click();
  check('heading-only tables can gain a normal row with the correct width',
    (await sectionRows())[1].length === 4 && await bar.locator('button:disabled').count() === 0);
  await bar.getByRole('button', { name: 'Insert column right', exact: true }).click();
  check('column edits also resize headings when the first row is merged',
    (await sectionRows())[0][0].span === 5 && (await sectionRows())[2][0].span === 5);

  // Shrinking to one column makes headings unambiguous; deleting it removes the table.
  await load(sectionFixture);
  await select(2, 0);
  for (let count = 0; count < 3; count++) await bar.getByRole('button', { name: 'Delete column', exact: true }).click();
  check('section headings shrink safely to a single column', (await sectionRows()).every((row) => row.length === 1 && row[0].span === 1));
  await select(1, 0);
  check('one-column headings permit column controls', await bar.locator('button:disabled').count() === 0);
  const oneColumn = await html();
  await bar.getByRole('button', { name: 'Delete column', exact: true }).click();
  check('deleting the final logical column removes a section-heading table', !(await state()).rows.length);
  await undoRedo(oneColumn, await html());

  // A merged first row must not undercount the logical size limit.
  for (const [columns, normalRows, label] of [
    [100, 1, 'Insert column right'], [100, 99, 'Insert row above']
  ]) {
    const normal = '<tr>' + '<td><br></td>'.repeat(columns) + '</tr>';
    await load('<table><tbody><tr><td colspan="' + columns + '">Heading</td></tr>' +
      normal.repeat(normalRows) + '</tbody></table>');
    await select(label === 'Insert row above' ? 0 : 1, 0);
    const before = await html();
    await bar.getByRole('button', { name: label, exact: true }).click();
    check('section-heading tables enforce limits using logical width',
      await html() === before && (await state()).changes === 0);
  }

  for (const markup of [
    '<table><tbody><tr><td colspan="2">Partial merge</td><td>C</td></tr><tr><td>A</td><td>B</td><td>C</td></tr></tbody></table>',
    '<table><tbody><tr><td rowspan="0">Merged</td><td>A</td></tr><tr><td>B</td></tr></tbody></table>',
    '<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td></tr></tbody></table>',
    '<table><tbody><tr><td><table><tbody><tr><td>Nested</td></tr></tbody></table></td></tr></tbody></table>'
  ]) {
    await load(markup);
    await select(0, 0);
    const before = await html();
    check('complex tables disable row/column edits but allow deletion',
      await bar.locator('button:disabled').count() === 6 &&
      await bar.getByRole('button', { name: 'Delete table', exact: true }).isEnabled() &&
      (await bar.locator('.lightmetal-table-note').textContent()).includes('Source'));
    await page.evaluate(() => window.__controlEditor.element.querySelector('button[title="Insert row above"]').click());
    check('disabled structural controls leave complex tables unchanged', await html() === before);
  }

  await load('<table><colgroup span="2"></colgroup><tbody><tr><td>A</td><td>B</td></tr></tbody></table>');
  await select(0, 0);
  check('column metadata disables column edits but permits row edits',
    await bar.locator('button:disabled').count() === 3 &&
    await bar.getByRole('button', { name: 'Insert row below', exact: true }).isEnabled());
  await bar.getByRole('button', { name: 'Insert row below', exact: true }).click();
  check('row edits preserve column groups', await page.evaluate(() =>
    !!window.__controlEditor.content.querySelector('colgroup[span="2"]') &&
    window.__controlEditor.content.querySelectorAll('tr').length === 2));

  // A page layout table outside the editor is not a nested content table.
  await load();
  await page.evaluate(() => {
    const layout = document.createElement('table');
    layout.setAttribute('data-table-layout-test', '');
    const cell = layout.insertRow().insertCell();
    document.body.appendChild(layout);
    cell.appendChild(window.__controlEditor.element);
  });
  await select();
  check('table controls still work when the editor is hosted inside a layout table',
    await bar.locator('button:disabled').count() === 0);
  await bar.getByRole('button', { name: 'Insert row below', exact: true }).click();
  check('layout table hosting does not block structural edits', (await state()).rows.length === 5);
  await page.evaluate(() => {
    document.body.appendChild(window.__controlEditor.element);
    document.querySelector('[data-table-layout-test]').remove();
  });

  // Consecutive structural edits each get their own undo entry.
  await load();
  await select();
  const history = [await html()];
  for (const label of ['Insert row below', 'Insert column right', 'Delete row']) {
    await bar.getByRole('button', { name: label, exact: true }).click();
    history.push(await html());
  }
  for (let index = history.length - 2; index >= 0; index--) {
    await page.keyboard.press('Control+z');
    check('consecutive table operations undo individually', await html() === history[index]);
  }
  for (let index = 1; index < history.length; index++) {
    await page.keyboard.press('Control+y');
    check('consecutive table operations redo individually', await html() === history[index]);
  }

  // Tables beyond the old limits can be created and expanded.
  for (const [rows, columns, label] of [
    [60, 4, 'Insert column right'], [100, 5, 'Insert column right'], [1, 50, 'Insert column right']
  ]) {
    await load('');
    const created = await page.evaluate(({ rows, columns }) => {
      const ok = window.__controlEditor.insertTable(rows, columns);
      window.__controlChanges = [];
      return ok;
    }, { rows, columns });
    check('table creation accepts dimensions beyond the old caps', created);
    await select(0, 0);
    const before = await html();
    await bar.getByRole('button', { name: label, exact: true }).click();
    const after = await html();
    check('adding a column beyond the old caps succeeds',
      (await state()).rows.length === rows && (await state()).rows.every((row) => row.length === columns + 1) &&
      (await state()).changes === 1);
    await undoRedo(before, after);
  }

  const extraRows = ('<tr>' + '<td><br></td>'.repeat(4) + '</tr>').repeat(120);
  await load(sectionFixture.replace('</tbody>', extraRows + '</tbody>'));
  await select(2, 2);
  await bar.getByRole('button', { name: 'Insert column right', exact: true }).click();
  check('large section-heading tables can add columns beyond the old caps',
    (await state()).rows.length === 126 && (await sectionRows())[1][0].span === 5 &&
    (await sectionRows())[4][0].span === 5 && (await state()).changes === 1);

  // Exercise each new cap; the cell cap still matters below dimension caps.
  for (const [rows, columns, label] of [
    [1000, 1, 'Insert row below'], [1, 100, 'Insert column right'], [200, 50, 'Insert column right']
  ]) {
    const row = '<tr>' + '<td><br></td>'.repeat(columns) + '</tr>';
    await load('<table><tbody>' + row.repeat(rows) + '</tbody></table>');
    await select(0, 0);
    const before = await html();
    await bar.getByRole('button', { name: label, exact: true }).click();
    check('table edits enforce dimension and cell-count limits without changing content',
      await html() === before && (await state()).changes === 0 &&
      (await host.getByRole('status').textContent()).includes('10,000 cells'));
  }

  await load('<p>Before</p><table><tr><td>First</td></tr></table>' +
    '<blockquote><table><tr><td>Second</td><td>Value</td></tr></table></blockquote><p>After</p>');
  await select(0, 0, 1);
  await bar.getByRole('button', { name: 'Insert row below', exact: true }).click();
  check('controls edit only the selected table, including inside blockquotes', await page.evaluate(() => {
    const tables = window.__controlEditor.content.querySelectorAll('table');
    return tables[0].rows.length === 1 && tables[0].textContent === 'First' &&
      tables[1].rows.length === 2 && tables[1].closest('blockquote');
  }));

  await load();
  await select();
  await page.evaluate(() => {
    const cells = window.__controlEditor.content.querySelector('table').rows[1].cells;
    const range = document.createRange();
    range.setStart(cells[0], 0);
    range.setEnd(cells[1], cells[1].childNodes.length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.waitForFunction(() => window.__controlEditor.element.querySelector('.lightmetal-tablebar').hidden);
  check('cross-cell selections hide structural controls', await bar.isHidden());

  await load();
  await select();
  await host.getByRole('button', { name: 'Source', exact: true }).focus();
  check('using the main toolbar retains table context until the action runs', await bar.isVisible());
  await page.keyboard.press('Enter');
  check('source mode hides contextual controls', await bar.isHidden());
  const sourceBefore = await html();
  await page.evaluate(() => window.__controlEditor.element.querySelector('button[title="Delete table"]').click());
  check('table controls are inert in source mode', await html() === sourceBefore);
  await host.getByRole('button', { name: 'Source', exact: true }).click();
  await select();
  await load('<p>Replacement</p>');
  check('setHTML clears stale table controls', await bar.isHidden());

  await load();
  await select();
  await page.evaluate(() => window.__controlEditor.content.blur());
  check('blurring to a non-focusable area hides table controls', await bar.isHidden());

  // Focus outside this instance must hide controls even if selection stays in it.
  await load();
  await select();
  await page.locator('#editor .lightmetal-actionbar button').first().focus();
  check('another editor’s focus hides this instance’s controls', await bar.isHidden());
  await select();
  const detached = await page.evaluate(() => {
    const editor = window.__controlEditor;
    const button = editor.element.querySelector('button[title="Delete table"]');
    editor.destroy();
    button.click();
    const empty = editor.element.childNodes.length === 0;
    editor.element.remove();
    return empty;
  });
  check('destroy removes contextual UI and its listeners', detached);
};
