const assert = require('node:assert/strict');

async function sourceHighlightChecks(browser, base, name) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base + '/tests/fixtures/markdown.html');
    await page.addScriptTag({ url: base + '/dist/polish.js' });
    // Load poliSH last to exercise its stronger token typography rules.
    await page.addStyleTag({ url: base + '/dist/polish.css' });
    await page.evaluate(() => {
      __markdownEditor.destroy();
      window.calls = [];
      window.highlighter = polish.createHighlighter({ languages: polish.allLanguages });
      window.mount = hook => {
        window.__markdownEditor = maiden.init({ element: document.getElementById('editor'),
          sourceHighlight: hook, onChange: value => __markdownChanges.push(value) });
      };
      mount((code, language) => { calls.push([code, language]); return highlighter.highlightTokens(code, language); });
      window.visibleTokens = () => [...document.querySelectorAll('.lightmarkdown-paint span')]
        .filter(node => node.firstChild?.nodeType === Node.TEXT_NODE && !node.closest('[hidden]'));
      window.colored = kind => visibleTokens().filter(node => node.classList.contains(kind)).map(node => node.textContent).join('');
    });
    const result = await page.evaluate(() => {
      const source = '> - ```js\n>   /* first\n>   second */\n>   const\tanswer = "😀";\n>   ```\n\n```\n{"ready": true}\n```\n\nInline `const count = 42;` and `hello`.\n\n```text\nconst plain = 1;\n```\n\n```unknown\nconst unknown = 2;\n```\n\n```ansi\n\x1b[31mred\x1b[0m\n```\n\n~~~python\ndef greet():\n    return "hi"';
      __markdownEditor.setMarkdown(source);
      const firstCalls = calls.length;
      const nodes = visibleTokens(), texts = nodes.map(node => node.firstChild);
      const comments = colored('comment'), keywords = colored('keyword'), booleans = colored('boolean');
      const observer = new MutationObserver(() => {});
      observer.observe(document.querySelector('.lightmarkdown-paint'), { subtree: true, attributes: true, characterData: true, childList: true });
      __markdownEditor.content.dispatchEvent(new InputEvent('input', { bubbles: true }));
      const writes = observer.takeRecords().filter(record => nodes.includes(record.target) || texts.includes(record.target)).length;
      observer.disconnect();
      const unchangedCalls = calls.length;
      __markdownEditor.setMarkdown(source.replace('answer', 'result'));
      const changedCalls = calls.length - unchangedCalls;
      return { source, actual: __markdownEditor.getMarkdown(), painted: visibleTokens().map(node => node.textContent).join(''),
        comments, keywords, booleans, firstCalls, unchangedCalls, changedCalls, writes,
        retained: nodes.every((node, i) => node.isConnected && node.firstChild === texts[i]),
        typography: visibleTokens().filter(node => node.classList.contains('token')).every(node => {
          const style = getComputedStyle(node); return style.fontStyle === 'normal' && style.fontWeight === '400';
        }), calls };
    });
    assert.match(result.comments, /first.*second/s, 'multiline context crosses container lines');
    assert.match(result.keywords, /const/);
    assert.match(result.keywords, /def/);
    assert.match(result.booleans, /true/, 'unlabeled fence guesses JSON');
    assert.equal(result.unchangedCalls, result.firstCalls, 'unchanged snippets use cached tokens');
    assert.equal(result.changedCalls, 1, 'only edited block is highlighted again');
    assert.equal(result.writes, 0);
    assert.equal(result.retained, true);
    assert.equal(result.typography, true);
    assert.equal(result.actual, result.source.replace('answer', 'result'));
    assert.equal(result.painted, result.actual.replace(/\n/g, ''), 'tabs, prefixes, controls and Unicode stay exact across native blocks');
    assert.ok(result.calls.some(([code, label]) => code === 'const count = 42;' && label === ''), 'inline code invokes guessing');
    assert.ok(result.calls.some(([code]) => code.includes('/* first\nsecond */\nconst\tanswer')));
    assert.ok(!result.keywords.includes('plain'));

    // Original LF, BR and native block shapes all keep the same paint text.
    for (const shape of ['lf', 'br', 'div']) {
      const shapeResult = await page.evaluate(shape => {
        const text = '```js\nconst n = 1;\n/* a\nb */\n```\n\n> `const x =\n> 2;`\n\n`const tail = 1;\n`';
        const content = __markdownEditor.content;
        content.replaceChildren();
        if (shape === 'lf') content.textContent = text;
        else text.split('\n').forEach((line, i) => {
          if (shape === 'br') { if (i) content.append(document.createElement('br')); content.append(document.createTextNode(line)); }
          else { const div = document.createElement('div'); div.textContent = line; if (!line) div.append(document.createElement('br')); content.append(div); }
        });
        content.dispatchEvent(new InputEvent('input', { bubbles: true }));
        return { actual: __markdownEditor.getMarkdown(), paint: visibleTokens().map(node => node.textContent).join(''), text,
          comment: colored('comment'), calls: calls.slice(-2) };
      }, shape);
      assert.equal(shapeResult.actual, shapeResult.text, shape);
      assert.equal(shapeResult.paint.replace(/\n/g, ''), shapeResult.text.replace(/\n/g, ''), shape);
      assert.match(shapeResult.comment, /a\s*b/, shape);
      assert.ok(shapeResult.calls.some(([code]) => code === 'const tail = 1;\n'), 'inline trailing newline reaches the hook');
    }

    // Native input creates changing token boundaries, but one grouped Undo.
    await page.evaluate(() => {
      const content = __markdownEditor.content;
      content.textContent = '```js\n\n```';
      content.dispatchEvent(new InputEvent('input', { bubbles: true }));
      content.focus();
      const range = document.createRange(); range.setStart(content.firstChild, 6); range.collapse(true);
      document.getSelection().removeAllRanges(); document.getSelection().addRange(range);
      __markdownChanges.length = 0;
    });
    await page.keyboard.type('const answer = 42;');
    assert.equal(await page.evaluate(() => colored('keyword')), 'const');
    assert.equal(await page.evaluate(() => __markdownChanges.length), 'const answer = 42;'.length);
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), '```js\n\n```');
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), '```js\nconst answer = 42;\n```');

    const guards = await page.evaluate(() => {
      const content = __markdownEditor.content;
      const before = calls.length;
      content.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      content.firstChild.data = content.firstChild.data.replace('42', '43');
      content.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
      const during = calls.length;
      content.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      return { before, during, after: calls.length, text: __markdownEditor.getMarkdown() };
    });
    assert.equal(guards.during, guards.before, 'composition suppresses highlighting');
    assert.equal(guards.after, guards.before + 1);
    assert.match(guards.text, /43/);

    await page.evaluate(() => {
      const content = __markdownEditor.content;
      content.textContent = 'Inline ';
      content.dispatchEvent(new InputEvent('input', { bubbles: true }));
      content.focus();
      const range = document.createRange(); range.selectNodeContents(content); range.collapse(false);
      document.getSelection().removeAllRanges(); document.getSelection().addRange(range);
    });
    await page.keyboard.type('`const n = 1;`');
    assert.equal(await page.evaluate(() => colored('keyword')), 'const', 'closing inline code paints its tokens');
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), 'Inline ');
    await page.keyboard.press('Control+Shift+z');
    await page.keyboard.down('Shift');
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
    await page.keyboard.up('Shift');
    assert.equal(await page.evaluate(() => document.getSelection().getRangeAt(0).cloneContents().textContent), '1;`');
    await page.keyboard.type('2;`');
    assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), 'Inline `const n = 2;`');
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), 'Inline `const n = 1;`');
    const emphasis = await page.evaluate(() => {
      __markdownEditor.setMarkdown('**`const n = 1;`** and *`const x = 2;`*');
      return visibleTokens().filter(node => node.classList.contains('keyword')).map(node => {
        const style = getComputedStyle(node); return [style.fontWeight, style.fontStyle];
      });
    });
    assert.deepEqual(emphasis, [['700', 'normal'], ['400', 'italic']], 'source colors preserve Markdown emphasis');

    // Check caret alignment after wrapping, with every skin and mode. Token CSS
    // must not introduce italics, bold weight, spacing or different font metrics.
    const layout = await page.evaluate(() => {
      const host = __markdownEditor.element, content = __markdownEditor.content;
      host.style.width = '310px';
      const text = '```js\n/* a comment that wraps across several visual lines and stays aligned */\nconst message = "some long string contents that also wrap";\n```\n\nInline `const n = 1;`';
      content.textContent = text;
      content.dispatchEvent(new InputEvent('input', { bubbles: true }));
      const nodes = visibleTokens(), results = [];
      for (const skin of ['bootstrap', 'material-classic', 'material-outline', 'frost', 'patina', 'sterling', 'substantial']) {
        host.className = 'lightmetal lightmarkdown lightmetal-' + skin;
        for (const mode of ['light', 'dark']) {
          host.dataset.lightmetalTheme = mode;
          for (const position of [text.indexOf('comment'), text.indexOf('stays'), text.indexOf('const'), text.indexOf('contents'), text.indexOf('n =')]) {
            let at = position, node;
            for (const candidate of nodes) { if (at < candidate.textContent.length) { node = candidate.firstChild; break; } at -= candidate.textContent.length; }
            const range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + 1);
            const painted = range.getBoundingClientRect();
            range.setStart(content.firstChild, position); range.setEnd(content.firstChild, position + 1);
            const editable = range.getBoundingClientRect();
            results.push({ skin, mode, dx: Math.abs(painted.x - editable.x), dy: Math.abs(painted.y - editable.y) });
          }
        }
      }
      host.dataset.lightmetalTheme = 'light';
      const light = getComputedStyle(nodes.find(node => node.classList.contains('keyword'))).color;
      host.dataset.lightmetalTheme = 'dark';
      const dark = getComputedStyle(nodes.find(node => node.classList.contains('keyword'))).color;
      return { results, light, dark };
    });
    assert.ok(layout.results.every(({ dx, dy }) => dx < 1 && dy < 1), JSON.stringify(layout.results));
    assert.notEqual(layout.light, layout.dark, 'source token palette follows the editor mode');

    const failures = await page.evaluate(() => {
      __markdownEditor.destroy();
      const text = '```js\nconst n = 1;\n```';
      const results = [];
      for (const hook of [() => { throw Error('bad hook'); }, () => ({ tokens: [{ start: 0, end: 999, kind: 'keyword' }] }),
        () => ({ tokens: [{ start: 0, end: 12, kind: 'evil" onclick="alert(1)' }] }), () => '<b>not tokens</b>']) {
        mount(hook); __markdownEditor.setMarkdown(text);
        results.push(__markdownEditor.getMarkdown() === text && !document.querySelector('.lightmarkdown-paint .token'));
        __markdownEditor.destroy();
      }
      let replace = false;
      mount((code, label) => { if (replace) { replace = false; __markdownEditor.setMarkdown('Replacement'); } return highlighter.highlightTokens(code, label); });
      replace = true; __markdownEditor.setMarkdown(text);
      const replacement = __markdownEditor.getMarkdown() === 'Replacement' && visibleTokens().map(node => node.textContent).join('') === 'Replacement';
      __markdownEditor.destroy();
      let destroy = false;
      mount((code, label) => { if (destroy) __markdownEditor.destroy(); return highlighter.highlightTokens(code, label); });
      destroy = true; __markdownEditor.setMarkdown(text);
      let invalid = false;
      try { maiden.init({ element: document.getElementById('editor'), sourceHighlight: true }); } catch { invalid = true; }
      return { results, replacement, invalid, destroyed: !document.querySelector('.lightmarkdown-paint') };
    });
    assert.ok(failures.results.every(Boolean), 'bad hooks fall back to plain code');
    assert.equal(failures.replacement, true, 'reentrant replacement suppresses stale painting');
    assert.equal(failures.destroyed, true);
    assert.equal(failures.invalid, true);
    for (const format of ['minified', 'esm', 'source']) {
      await page.goto(base + '/tests/fixtures/markdown.html');
      if (format === 'minified') {
        await page.addScriptTag({ url: base + '/dist/maiden.min.js' });
        await page.addScriptTag({ url: base + '/dist/polish.min.js' });
        await page.addStyleTag({ url: base + '/dist/maiden.min.css' });
        await page.addStyleTag({ url: base + '/dist/polish.min.css' });
      }
      const built = await page.evaluate(async format => {
        __markdownEditor.destroy();
        let init, createHighlighter, allLanguages;
        if (format === 'minified') ({ init } = maiden, { createHighlighter, allLanguages } = polish);
        else {
          ({ init } = await import(format === 'esm' ? '/dist/maiden.esm.js' : '/src/maiden.js'));
          ({ createHighlighter } = await import(format === 'esm' ? '/dist/polish.esm.js' : '/src/polish.js'));
          ({ allLanguages } = await import(format === 'esm' ? '/dist/polish.esm.js' : '/src/polish-languages.js'));
        }
        const editor = init({ element: document.getElementById('editor'), sourceHighlight: createHighlighter({ languages: allLanguages }).highlightTokens });
        const text = '```\nconst answer = 42;\n```\n\n`{"ready": true}`';
        editor.setMarkdown(text);
        const keyword = [...editor.element.querySelectorAll('.lightmarkdown-paint .keyword')].some(node => !node.closest('[hidden]') && node.textContent === 'const');
        const inline = [...editor.element.querySelectorAll('.lightmarkdown-paint .boolean')].some(node => !node.closest('[hidden]') && node.textContent === 'true');
        editor.destroy();
        return { keyword, inline };
      }, format);
      assert.deepEqual(built, { keyword: true, inline: true }, format);
    }
    assert.deepEqual(errors, []);
    console.log(name + ': live source tokens, guessing, multiline containers, native shapes, caching, retained nodes, typing Undo/Redo, composition and lifecycle guards: ok');
  } finally { await page.close(); }
}
module.exports = { sourceHighlightChecks };
