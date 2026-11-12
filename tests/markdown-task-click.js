const assert = require('node:assert/strict');

async function taskClickChecks(browser, base, name) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const response = await page.goto(base + '/tests/fixtures/markdown.html');
    assert.equal(response.status(), 200, 'task-click fixture must load: ' + response.url());
    await page.waitForFunction(() => window.__markdownEditor);
    await page.evaluate(() => {
      // Map a test substring to glyph geometry without relying on the painter's
      // token classes or a particular native DIV/BR/text-node shape.
      window.taskPoint = (needle, character = 1) => {
        const content = __markdownEditor.content;
        let offset = content.textContent.indexOf(needle) + character;
        if (offset < character) throw Error('Missing fixture: ' + needle);
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (offset < node.length) break;
          offset -= node.length;
        }
        node.parentElement.scrollIntoView({ block: 'nearest' });
        const range = document.createRange(); range.setStart(node, offset); range.setEnd(node, offset + 1);
        const rect = range.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      };
      window.selectionOffsets = () => {
        const selection = document.getSelection(), range = document.createRange();
        range.selectNodeContents(__markdownEditor.content);
        range.setEnd(selection.anchorNode, selection.anchorOffset);
        const anchor = range.cloneContents().textContent.length;
        range.setEnd(selection.focusNode, selection.focusOffset);
        return { anchor, focus: range.cloneContents().textContent.length, text: selection.getRangeAt(0).cloneContents().textContent };
      };
    });
    const point = (needle, character = 1) => page.evaluate(([needle, character]) => taskPoint(needle, character), [needle, character]);
    const click = async (needle, character = 1) => { const p = await point(needle, character); await page.mouse.click(p.x, p.y); };
    const text = () => page.evaluate(() => __markdownEditor.getMarkdown());
    const source = '- [ ] Parent\n  - [X] Child\n> 1. [ ] Quoted\n\nNot a task: [ ] literal.\n\n```md\n- [ ] Fenced\n```\n\n    - [ ] Indented\n\n- ` [ ] Inline`';
    await page.evaluate(source => { __markdownEditor.setMarkdown(source); __markdownChanges.length = 0;
      window.untouched = __markdownEditor.content.children[4]; }, source);
    await click('[ ] Parent');
    assert.equal(await text(), source.replace('[ ] Parent', '[x] Parent'));
    assert.equal(await page.evaluate(() => __markdownChanges.length), 1, 'one change callback per toggle');
    assert.equal(await page.evaluate(() => __markdownEditor.content.children[4] === untouched), true, 'unrelated source nodes stay retained');
    await click('[X] Child', 0);
    assert.equal(await text(), source.replace('[ ] Parent', '[x] Parent').replace('[X] Child', '[ ] Child'));
    await page.keyboard.press('Control+z');
    assert.equal(await text(), source.replace('[ ] Parent', '[x] Parent'), 'one Undo restores one marker, including uppercase X');
    await page.keyboard.press('Control+z');
    assert.equal(await text(), source, 'second Undo restores the previous task');
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await text(), source.replace('[ ] Parent', '[x] Parent'));
    await click('[ ] Quoted', 2);
    assert.match(await text(), /> 1\. \[x\] Quoted/);

    for (const needle of ['[ ] literal', '[ ] Fenced', '[ ] Indented', '[ ] Inline']) {
      const before = await text();
      await click(needle);
      assert.equal(await text(), before, needle + ' remains ordinary source');
    }
    // Text and whitespace next to a real checkbox must still place the caret.
    await page.evaluate(() => __markdownEditor.setMarkdown('-   [ ] Nearby text'));
    for (const [needle, character] of [['Nearby', 2], ['-   [ ]', 2]]) {
      const before = await text(); await click(needle, character); assert.equal(await text(), before);
    }

    for (const shape of ['lf', 'br', 'div', 'inline-dom']) {
      const shapeSource = '- [\t] Tab\n- [ ] Second';
      await page.evaluate(({ shape, shapeSource }) => {
        const content = __markdownEditor.content;
        __markdownEditor.setMarkdown(shapeSource);
        if (shape === 'lf') content.textContent = shapeSource;
        if (shape === 'br') { content.replaceChildren(document.createTextNode('- [\t] Tab'), document.createElement('br'), document.createTextNode('- [ ] Second')); }
        if (shape === 'inline-dom') {
          const line = content.firstChild;
          line.replaceChildren(document.createTextNode('- ['), document.createElement('span'), document.createTextNode('] Tab'));
          line.children[0].textContent = '\t';
        }
        content.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }, { shape, shapeSource });
      await click('[\t] Tab');
      assert.equal(await text(), shapeSource.replace('[\t]', '[x]'), shape);
      await page.keyboard.press('Control+z');
      assert.equal(await text(), shapeSource, shape + ' Undo preserves tabs');
    }

    // Restore caret, range and backward range after clicking another task.
    for (const [anchor, focus] of [[22, 22], [22, 31], [31, 22], [0, 12], [12, 0], [3, 3]]) {
      const before = await page.evaluate(([anchor, focus]) => {
        const content = __markdownEditor.content;
        content.textContent = '- [ ] Click me\n\nKeep this selection.';
        content.dispatchEvent(new InputEvent('input', { bubbles: true }));
        content.focus();
        document.getSelection().setBaseAndExtent(content.firstChild, anchor, content.firstChild, focus);
        return selectionOffsets();
      }, [anchor, focus]);
      await click('[ ] Click me');
      assert.match(await text(), /^- \[x\]/);
      const after = await text();
      assert.deepEqual(await page.evaluate(() => selectionOffsets()), { ...before, text: after.slice(Math.min(anchor, focus), Math.max(anchor, focus)) }, 'owned selection and direction restored');
    }

    await page.evaluate(() => __markdownEditor.setMarkdown('- [ ] Drag or modify me'));
    let p = await point('[ ] Drag');
    const end = await point('modify', 5);
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 6 }); await page.mouse.up();
    assert.equal(await text(), '- [ ] Drag or modify me', 'dragging from marker selects without toggling');
    // Native drag selection varies in headless Chromium, even in a bare
    // contenteditable. The editor must not turn the gesture into an edit.
    for (const modifier of ['Shift', 'Control', 'Alt', 'Meta']) {
      await page.keyboard.down(modifier); await page.mouse.click(p.x, p.y); await page.keyboard.up(modifier);
      assert.equal(await text(), '- [ ] Drag or modify me', modifier + ' click does not toggle');
    }
    await page.mouse.click(p.x, p.y, { button: 'right' }); await page.keyboard.press('Escape');
    assert.equal(await text(), '- [ ] Drag or modify me');

    // Native IME state and edits/replacements between down and up invalidate clicks.
    await page.evaluate(() => __markdownEditor.content.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
    await page.mouse.click(p.x, p.y);
    assert.equal(await text(), '- [ ] Drag or modify me');
    await page.evaluate(() => __markdownEditor.content.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
    for (const change of ['replace', 'same-input']) {
      p = await point('[ ] Drag'); await page.mouse.move(p.x, p.y); await page.mouse.down();
      await page.evaluate(change => {
        if (change === 'replace') __markdownEditor.setMarkdown(__markdownEditor.getMarkdown());
        else __markdownEditor.content.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }, change);
      await page.mouse.up();
      assert.equal(await text(), '- [ ] Drag or modify me', change + ' invalidates pending click');
    }

    for (const skin of ['bootstrap', 'material-classic', 'material-outline', 'frost', 'patina', 'sterling', 'substantial']) {
      for (const mode of ['light', 'dark']) {
        await page.evaluate(({ skin, mode }) => {
          const host = __markdownEditor.element;
          host.className = 'lightmetal lightmarkdown lightmetal-' + skin;
          host.dataset.lightmetalTheme = mode;
          host.style.width = '300px';
          __markdownEditor.setMarkdown('- [ ] A task with a long body that wraps across several visual lines.');
        }, { skin, mode });
        await click('[ ] A task');
        assert.match(await text(), /^- \[x\]/, skin + '/' + mode);
      }
    }

    await page.addScriptTag({ url: base + '/dist/MeltDown.js' });
    await page.evaluate(() => {
      __markdownEditor.destroy();
      window.__markdownEditor = maiden.init({ element: document.getElementById('editor'), preview: { render: meltDown.parse }, actions: ['preview', 'side-by-side', 'undo', 'redo'] });
      __markdownEditor.setMarkdown('- [ ] Split task');
    });
    await page.getByRole('button', { name: 'Side-by-side', exact: true }).click();
    await click('[ ] Split');
    assert.equal(await text(), '- [x] Split task', 'source half of split toggles');
    const preview = page.locator('.lightmarkdown-preview');
    await preview.getByText('Split task').click();
    assert.equal(await text(), '- [x] Split task', 'preview stays read-only');
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await preview.getByText('Split task').click();
    assert.equal(await text(), '- [x] Split task', 'preview-only mode stays read-only');

    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    p = await point('[x] Split'); await page.mouse.move(p.x, p.y); await page.mouse.down();
    await page.evaluate(() => __markdownEditor.destroy());
    await page.mouse.up();
    assert.equal(await page.locator('.lightmarkdown-input').count(), 0);

    await page.goto(base + '/examples/markdown-iframe.html');
    await page.waitForFunction(() => !document.getElementById('read-markdown').disabled);
    const frame = page.frameLocator('#isolated-editor');
    const frameSource = frame.locator('.lightmarkdown-input');
    await frameSource.waitFor();
    const framePoint = await frameSource.evaluate(content => {
      __markdownEditor.setMarkdown('- [ ] Frame task');
      const range = document.createRange(); range.setStart(content.firstChild.firstChild, 3); range.setEnd(content.firstChild.firstChild, 4);
      const rect = range.getBoundingClientRect(), box = content.getBoundingClientRect();
      return { x: rect.x + rect.width / 2 - box.x, y: rect.y + rect.height / 2 - box.y };
    });
    await frameSource.click({ position: framePoint });
    assert.equal(await frameSource.evaluate(() => __markdownEditor.getMarkdown()), '- [x] Frame task');
    await page.keyboard.press('Control+z');
    assert.equal(await frameSource.evaluate(() => __markdownEditor.getMarkdown()), '- [ ] Frame task');
    assert.deepEqual(errors, []);
    console.log(name + ': source task clicks, nested/quoted/tab markers, literal guards, native Undo, selections, drags/modifiers, composition, lifecycle and read-only preview: ok');
  } finally { await page.close(); }
}
module.exports = { taskClickChecks };
