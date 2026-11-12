const assert = require('node:assert/strict');
const path = require('node:path');
const { withPage } = require('./browser-checks');
const ansiFile = path.join(__dirname, '../examples/POLISH.ANS');
const ansiArt = require('node:fs').readFileSync(ansiFile, 'utf8');
const plainArt = ansiArt.replace(/\x1b\[\?25[lh]/g, '').replace(/\x1b\[[0-9;]*m/g, '');

async function assertANSIArt(page) {
  const art = page.locator('#polish-ansi-art');
  if (page.url().startsWith('file:') && await art.isHidden()) {
    assert.match(await page.locator('#polish-ansi-status').textContent(), /Open an ANSI file/);
    assert.equal(await page.getByRole('button', { name: 'Reload art', exact: true }).isDisabled(), true);
    await page.getByLabel('Open ANSI file', { exact: true }).setInputFiles(ansiFile);
  }
  await art.waitFor({ state: 'visible' });
  assert.equal(await art.textContent(), plainArt, 'ANSI art retains its text, spacing, and line breaks');
  assert.equal(await art.locator('img,svg,canvas,script').count(), 0, 'art is rendered text, not an image');
  assert.equal(await art.evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(0, 0, 0)', 'terminal canvas stays black in every page theme');
}

async function assertParserTheme(page, mode) {
  const frame = page.frameLocator('#parser-preview');
  await frame.locator('.polish.theme-' + mode).waitFor({ state: 'visible' });
  assert.deepEqual(await frame.locator('html').evaluate(node => {
    const style = getComputedStyle(node);
    return { scheme: style.colorScheme, background: style.backgroundColor, color: style.color };
  }), mode === 'dark'
    ? { scheme: 'dark', background: 'rgb(13, 17, 23)', color: 'rgb(230, 237, 243)' }
    : { scheme: 'light', background: 'rgb(255, 255, 255)', color: 'rgb(36, 41, 47)' });
}

async function runShowcaseChecks(browser, base) {
  for (const prefix of [base, base + 'examples/', 'file://' + path.join(__dirname, '../examples/')]) {
    await withPage(browser, 'gallery ' + prefix, async page => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto(prefix + 'index.html');
      await page.locator('#made-editor .lightmarkdown-preview h1').waitFor();
      assert.equal(await page.getByRole('tab').first().getAttribute('id'), 'tab-markdown');
      assert.equal(await page.locator('#tab-markdown').getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('#tab-markdown').evaluate(node => node.tabIndex), 0);
      assert.equal(await page.locator('#panel-html').isHidden(), true);
      assert.equal(await page.locator('#made-editor .lightmarkdown-input').isVisible(), true);
      assert.equal(await page.getByRole('button', { name: 'Side-by-side', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.evaluate(() => document.activeElement === document.body && scrollY === 0), true, 'startup shows split without taking focus or scrolling');
      await page.getByRole('heading', { name: 'Built to stay useful', exact: true }).waitFor();
      for (const panel of ['html', 'markdown']) {
        for (const framework of ['react', 'vue']) {
          const link = page.locator('#panel-' + panel).getByRole('link', { name: framework === 'react' ? 'React example' : 'Vue example', exact: true, includeHidden: true });
          assert.equal(await link.getAttribute('href'), '../examples/frameworks/' + framework + '.html');
          const destination = await link.evaluate(node => node.href);
          if (prefix.startsWith('file:')) assert.equal(destination, 'file://' + path.join(__dirname, '../examples/frameworks/', framework + '.html'));
          else {
            assert.equal(new URL(destination).pathname, '/examples/frameworks/' + framework + '.html');
            const response = await page.request.get(destination);
            assert.equal(response.status(), 200, panel + '/' + framework + ': local framework example resolves');
            assert.match(await response.text(), /npm run build:framework-examples/);
          }
        }
      }
      assert.match(await page.locator('section[aria-labelledby="philosophy-heading"]').textContent(), /personal app used since 2012/);
      await page.getByRole('tab', { name: 'Markdown Parser', exact: true }).click();
      await assertParserTheme(page, 'dark');
      assert.match(await page.locator('#html-output').textContent(), /<h2>/);
      assert.equal(await page.locator('.logo').evaluate(img => img.getBoundingClientRect().width), 640);
      for (const theme of ['dark', 'light', 'auto']) {
        await page.locator('#theme-toggle').click();
        assert.equal(await page.locator('#theme-toggle').textContent(), 'Theme: ' + theme);
        assert.equal(await page.locator('html').getAttribute('data-lightmetal-theme'), theme);
        assert.equal(await page.locator('#html-editor').evaluate(node => getComputedStyle(node).backgroundColor), theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(22, 24, 28)');
        await assertParserTheme(page, theme === 'auto' ? 'dark' : theme);
      }
      await page.emulateMedia({ colorScheme: 'light' });
      await assertParserTheme(page, 'light');
      await page.getByRole('tab', { name: 'HTML Editor', exact: true }).focus();
      await page.keyboard.press('ArrowLeft');
      await page.locator('#panel-markdown').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#tab-markdown').getAttribute('aria-selected'), 'true');
      const markdownSample = await page.evaluate(() => markdownSamples.full);
      assert.equal(await page.locator('#markdown-output').textContent(), markdownSample, 'gallery starts with the shared editable Markdown document');
      await page.locator('#panel-markdown .lightmarkdown-paint .token.keyword').first().waitFor();
      assert.equal(await page.locator('#made-editor img').count(), 0, 'branding stays outside saved content');
      assert.equal(await page.getByRole('button', { name: 'Side-by-side', exact: true }).getAttribute('aria-pressed'), 'true');
      const markdownPreview = page.locator('#panel-markdown .lightmarkdown-preview');
      await markdownPreview.locator('table').waitFor();
      assert.equal(await markdownPreview.locator('h1').textContent(), 'Your words. Your metal.');
      assert.equal(await markdownPreview.locator('table tbody tr').count(), 5);
      assert.equal(await markdownPreview.locator('blockquote blockquote').count(), 1);
      assert.equal(await markdownPreview.locator('ul ol').count(), 1);
      await markdownPreview.locator('.token.keyword').first().waitFor();
      const task = await page.locator('#made-editor .lightmarkdown-input').evaluate(content => {
        const line = [...content.children].find(node => node.textContent === '- [ ] Click this source checkbox');
        line.scrollIntoView({ block: 'nearest' });
        const range = document.createRange(); range.setStart(line.firstChild, 3); range.setEnd(line.firstChild, 4);
        const rect = range.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      });
      await page.mouse.click(task.x, task.y);
      assert.equal(await page.locator('#markdown-output').textContent(), markdownSample.replace('- [ ] Click this source checkbox', '- [x] Click this source checkbox'));
      await page.keyboard.press('Control+z');
      assert.equal(await page.locator('#markdown-output').textContent(), markdownSample, 'showcase tasks support native Undo');
      await page.getByRole('button', { name: 'Side-by-side', exact: true }).click();
      await page.getByRole('tab', { name: 'HTML Editor', exact: true }).click();
      await page.getByRole('tab', { name: 'Markdown Editor', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'Side-by-side', exact: true }).getAttribute('aria-pressed'), 'false', 'tab changes retain the chosen view');
      await page.getByRole('button', { name: 'Side-by-side', exact: true }).click();
      await page.getByRole('tab', { name: 'Sketch Editor', exact: true }).click();
      const sketch = page.locator('#sketch-editor');
      const surface = sketch.locator('.etch-viewport');
      await surface.waitFor();
      await sketch.getByRole('button', {name:'Pen',exact:true}).click();
      await surface.scrollIntoViewIfNeeded();
      const box = await surface.boundingBox();
      await page.mouse.move(box.x + 40, box.y + 80);
      await page.mouse.down();
      await page.mouse.move(box.x + 160, box.y + 120, {steps:8});
      await page.mouse.up();
      await page.waitForFunction(() => document.querySelector('#sketch-editor .etch-layer-count')?.textContent === '1');
      await page.getByRole('tab', {name:'HTML Editor',exact:true}).click();
      await page.getByRole('tab', {name:'Sketch Editor',exact:true}).click();
      assert.equal(await sketch.locator('.etch').count(), 1, 'tab changes reuse the editor');
      assert.equal(await sketch.locator('.etch-layer-count').textContent(), '1', 'tab changes retain artwork');
      await sketch.getByRole('button', {name:'Undo',exact:true}).click();
      await page.waitForFunction(() => document.querySelector('#sketch-editor .etch-layer-count')?.textContent === '0');
      await sketch.getByRole('button', {name:'Redo',exact:true}).click();
      await page.waitForFunction(() => document.querySelector('#sketch-editor .etch-layer-count')?.textContent === '1');
      const sketchLink = page.getByRole('link', {name:'Open the sketch editor →',exact:true});
      assert.equal(await sketchLink.getAttribute('href'), 'etch/index.html');
      if (!prefix.startsWith('file:')) {
        const sketchPage = await browser.newPage();
        try {
          await sketchPage.goto(new URL(await sketchLink.getAttribute('href'), page.url()).href);
          await sketchPage.locator('#editor .etch-viewport').waitFor();
        } finally { await sketchPage.close(); }
      }
      await page.getByRole('tab', { name: 'Syntax Highlighter', exact: true }).click();
      await page.locator('#polish-output .token.keyword').first().waitFor();
      await assertANSIArt(page);
      assert.equal(await page.locator('.polish-logo').evaluate(async img => { await img.decode(); return img.naturalWidth > 0; }), true);
      await page.locator('#polish-theme').selectOption('cyberpunk');
      assert.equal(await page.locator('#polish-output').getAttribute('class'), 'code theme-cyberpunk');
      await assertANSIArt(page);
      await page.locator('#polish-language').selectOption('json');
      await page.locator('#polish-input').fill('{"enabled":true}');
      assert.equal(await page.locator('#polish-output .token.boolean').textContent(), 'true');
      await page.getByRole('tab', { name: 'Markdown Parser', exact: true }).click();
      await page.locator('#parser-input').fill('# Changed\n\n[link](https://example.invalid)\n\n![image](https://example.invalid/a.png)');
      assert.match(await page.locator('#parser-output').textContent(), /<h1 id="changed">Changed<\/h1>/);
      const frame = page.frameLocator('#parser-preview');
      await frame.locator('h1').filter({ hasText: 'Changed' }).waitFor();
      assert.equal(await frame.locator('a').getAttribute('href'), null);
      for (const file of ['html.html', 'markdown.html', 'meltdown.html', 'skins.html', 'markdown-skins.html', 'polish.html', 'markdown-iframe.html']) {
        const response = await page.goto(prefix + file);
        if (!prefix.startsWith('file:')) assert.equal(response.status(), 200, file + ': example loads');
        assert.ok(await page.title(), file + ': example has a page title');
        assert.equal(await page.locator('pre:not(.lightmetal pre):not(.code)').count(), 0, file + ': every page code block must use poliSH');
        for (const block of await page.locator('pre[data-code-language]').all()) {
          assert.equal(await block.evaluate(node => node.classList.contains('code')), true);
          if ((await block.textContent()).trim()) assert.ok(await block.locator('.token').count(), file + ': nonempty snippets contain syntax tokens');
        }
        if (file === 'markdown-skins.html') {
          await page.waitForFunction(() => Object.keys(window.__skinEditors || {}).length === 8);
          assert.equal(await page.evaluate(() => Object.values(__skinEditors).every(editor => editor.getMarkdown() === markdownSamples.compact && editor.element.classList.contains('lightmarkdown-split'))), true, 'skin cards start with the compact document in split view');
          assert.equal(await page.evaluate(() => document.activeElement === document.body && scrollY === 0), true, 'skin startup does not jump to the last editor');
          await page.locator('#palette').selectOption('dark');
          assert.equal(await page.locator('html').getAttribute('data-lightmetal-theme'), 'dark');
          assert.equal(await page.locator('#skin-frost').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(20, 36, 45)');
        }
        if (file === 'polish.html') {
          await page.locator('#polish-output .token.keyword').first().waitFor();
          await assertANSIArt(page);
          assert.equal(await page.locator('#polish-language option').count(), 52);
          assert.equal(await page.locator('#polish-theme option').count(), 11);
        }
        if (file === 'html.html') await page.waitForFunction(() => Boolean(window.editor));
        if (file === 'meltdown.html') {
          assert.match(await page.locator('#parser-output').textContent(), /<table>/);
          await assertParserTheme(page, 'light');
          await page.emulateMedia({ colorScheme: 'dark' });
          await assertParserTheme(page, 'dark');
          await page.emulateMedia({ colorScheme: 'light' });
          await assertParserTheme(page, 'light');
        }
      }
    });
  }
  await withPage(browser, 'poliSH live output and native history', async page => {
    // Complete the initial AJAX render while typing; it must not split native undo.
    let releaseArt;
    const artReady = new Promise(resolve => { releaseArt = resolve; });
    await page.route('**/examples/POLISH.ANS', async route => {
      await artReady;
      await route.fulfill({ contentType: 'text/plain; charset=utf-8', body: ansiArt });
    });
    await page.goto(base + 'polish.html');
    const input = page.locator('#polish-input');
    // Set initial state without a preceding native clear/delete undo entry.
    await input.evaluate(node => { node.value = ''; node.dispatchEvent(new Event('input', { bubbles: true })); });
    await input.focus();
    await page.keyboard.type('const answer');
    releaseArt();
    await assertANSIArt(page);
    await page.keyboard.type(' = 42;');
    await page.keyboard.press('Control+z');
    assert.equal(await input.inputValue(), '', 'playground typing stays one native undo group');
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await input.inputValue(), 'const answer = 42;');
    assert.equal(await page.locator('#polish-output').textContent(), 'const answer = 42;');
    await page.locator('#polish-theme').selectOption('light');
    await page.evaluate(() => document.documentElement.classList.add('page-dark'));
    assert.equal(await page.locator('#polish-output').getAttribute('class'), 'code theme-light', 'playground keeps its selected theme');
    await page.locator('#polish-language').selectOption('ansi');
    // Firefox's insertText strips ESC, so supply actual terminal control characters.
    await input.evaluate(node => { node.value = '\u001b[31mred\u001b[0m'; node.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.locator('#polish-output').textContent(), 'red');
    assert.equal(await page.locator('#polish-output span[style]').first().evaluate(node => getComputedStyle(node).color), 'rgb(187, 0, 0)');
    await page.locator('#polish-language').selectOption('javascript');
    await input.fill('const answer = 42;');
    assert.equal(await page.locator('#polish-output span:not([hidden])').first().evaluate(node => node.style.cssText), '');
    const painted = await page.evaluate(() => {
      const block = document.createElement('pre'); document.body.append(block);
      exampleCode.write(block, 'const value = 42;', 'javascript');
      const spans = [...block.children];
      exampleCode.write(block, '', 'javascript');
      const retained = spans.every(node => node.isConnected);
      const source = '<img src=x onerror=alert(1)> &copy;\r\n😀';
      exampleCode.write(block, source, 'html');
      return { retained, exact: block.textContent === source, unsafe: block.querySelectorAll('img,script,[onclick]').length };
    });
    assert.deepEqual(painted, { retained: true, exact: true, unsafe: 0 });
    await page.unroute('**/examples/POLISH.ANS');
    let requests = 0;
    await page.route('**/examples/POLISH.ANS', route => {
      requests++;
      return route.fulfill(requests === 2 ? { status: 503, body: 'Unavailable' } : {
        contentType: 'text/plain; charset=utf-8',
        body: (requests === 1 ? '\u001b[38;2;1;2;3;48;2;4;5;6mSmall art' : '\u001b[38;2;7;8;9mA different size and color') + '\u001b[0m'
      });
    });
    const reload = page.getByRole('button', { name: 'Reload art', exact: true });
    const art = page.locator('#polish-ansi-art');
    await reload.click();
    await page.waitForFunction(() => document.getElementById('polish-ansi-art').textContent === 'Small art');
    assert.deepEqual(await art.locator('span:not([hidden])[style]').first().evaluate(node => ({
      color: node.style.color, background: node.style.backgroundColor
    })), { color: 'rgb(1, 2, 3)', background: 'rgb(4, 5, 6)' });
    await reload.click();
    await page.waitForFunction(() => document.getElementById('polish-ansi-status').textContent.includes('HTTP 503'));
    assert.equal(await art.textContent(), 'Small art', 'failed reload retains the last good artwork');
    await reload.click();
    await page.waitForFunction(() => document.getElementById('polish-ansi-art').textContent === 'A different size and color');
    assert.equal(requests, 3, 'each reload fetches the asset again without a build');
    assert.equal(await art.locator('span:not([hidden])[style]').first().evaluate(node => node.style.color), 'rgb(7, 8, 9)');
    assert.equal(await input.inputValue(), 'const answer = 42;', 'art reloads leave the playground alone');
    const literal = '<img src="/ansi-must-not-load" onerror="alert(1)">';
    await page.getByLabel('Open ANSI file', { exact: true }).setInputFiles({
      name: 'custom.ANS', mimeType: 'text/plain', buffer: Buffer.from('\u001b[32m' + literal + '\u001b[0m')
    });
    await page.waitForFunction(() => document.getElementById('polish-ansi-status').textContent === 'Loaded custom.ANS.');
    assert.equal(await art.textContent(), literal);
    assert.equal(await art.locator('img,script').count(), 0, 'opened ANSI files stay escaped text');
    await page.unroute('**/examples/POLISH.ANS');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + 'polish.html');
    await assertANSIArt(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'ANSI art does not widen the page');
    await page.goto(base);
    await page.getByRole('tab', { name: 'Markdown Editor', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  });
  await require('./showcase-readme.js')(browser, base);
}
module.exports = { runShowcaseChecks };
