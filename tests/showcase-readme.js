const assert = require('node:assert/strict');
const path = require('node:path');
const { withPage } = require('./browser-checks');
const readme = require('node:fs').readFileSync(path.join(__dirname, '../README.md'), 'utf8');
const fences = [...readme.matchAll(/^```([^\r\n]*)\r?$/gm)].map(match => match[1]);
const languages = fences.filter((_, index) => index % 2 === 0);
assert.equal(fences.length % 2, 0, 'README fences are paired');
assert.ok(languages.every(language => ['html', 'js', 'javascript', 'bash', 'css'].includes(language)), 'every README fence has an explicit language');
assert.ok(fences.filter((_, index) => index % 2 === 1).every(language => language === ''), 'closing fences remain untagged');

function readmeUI(page) {
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  const tab = page.getByRole('tab', { name: 'README.md', exact: true });
  const frame = page.frameLocator('#readme-preview');
  const reload = page.getByRole('button', { name: 'Reload README', exact: true });
  const status = page.locator('#readme-status');
  const readmeRequests = () => requests.filter(url => new URL(url).pathname.endsWith('/README.md')).length;
  return { tab, frame, reload, status, requests, readmeRequests };
}

async function theme(frame, mode) {
  await frame.locator('.polish.theme-' + mode).waitFor({ state: 'visible' });
  assert.equal(await frame.locator('html').evaluate(node => getComputedStyle(node).colorScheme), mode);
}

module.exports = async function readmeChecks(browser, base) {
  for (const prefix of [base, base + 'examples/', 'file://' + path.join(__dirname, '../examples/')]) {
    await withPage(browser, 'README gallery ' + prefix, async page => {
      const { tab, frame, reload, status, readmeRequests } = readmeUI(page);
      await page.emulateMedia({ colorScheme: 'light' });
      await page.goto(prefix + 'index.html');
      const accents = await page.locator('[role="tabpanel"] > h2').evaluateAll(headings => Object.fromEntries(headings.map(heading => {
        const accent = getComputedStyle(document.querySelector('.page-head h1 .cap')).color;
        const caps = [...heading.querySelectorAll('.cap')];
        return [heading.parentElement.id, { letters: caps.map(span => span.textContent).join(''), colored: caps.every(span => getComputedStyle(span).color === accent) }];
      })));
      assert.deepEqual(accents, Object.fromEntries(Object.entries({
        'panel-html': 'HTML', 'panel-markdown': 'HTMLMDE', 'panel-parser': 'HTMLMD',
        'panel-polish': 'HTMLSH', 'panel-etch': 'HTMLE', 'panel-readme': 'MDSH'
      }).map(([id, letters]) => [id, { letters, colored: true }])));
      assert.equal(await page.locator('[role="tabpanel"] .cap:not(h2 .cap)').count(), 0, 'only tab titles get accent spans');
      const before = readmeRequests();
      assert.equal(await page.locator('#readme-preview').isHidden(), true);
      assert.equal(await page.locator('#panel-readme input[type="file"]').count(), 0, 'README has no file picker');
      assert.equal(await page.locator('#polish-ansi-file').count(), 1, 'ANSI art retains its picker');
      await page.getByRole('tab', { name: 'HTML Editor', exact: true }).focus();
      await page.keyboard.press('End');
      assert.equal(await tab.getAttribute('aria-selected'), 'true', 'keyboard navigation reaches the README tab');
      if (prefix.startsWith('file:')) {
        assert.equal(await reload.isDisabled(), true);
        assert.match(await status.textContent(), /local demo server/);
        assert.equal(await page.locator('#readme-preview').isHidden(), true);
        assert.equal(readmeRequests(), before, 'file pages explain blocked AJAX without attempting a request');
        return;
      }
      await frame.getByRole('heading', { name: 'ligHTMetaL', exact: true }).waitFor();
      await frame.getByRole('heading', { name: 'Quickstart: CDN', exact: true, level: 2 }).waitFor();
      await frame.locator('pre .token.keyword').first().waitFor();
      await frame.locator('pre .token.tag').first().waitFor();
      assert.equal(await page.locator('#readme-preview').getAttribute('sandbox'), '');
      assert.equal(await frame.locator('a[href]:not([href^="about:srcdoc#"]),script').count(), 0, 'external README navigation and scripts stay inactive');
      const sectionLink = frame.getByRole('link', { name: 'ligHTMetaL::MeltDown', exact: true });
      await sectionLink.click();
      await frame.locator('#markdown-parsing-with-meltdown').evaluate(heading => {
        if (Math.abs(heading.getBoundingClientRect().top) > 2) throw new Error('heading link did not scroll to its target');
      });
      await frame.locator('body').evaluate(() => scrollTo(0, 0));
      assert.equal((await frame.locator('body').textContent()).includes('<p align="center">'), false, 'raw logo markup renders as HTML, not text');
      const logo = frame.getByRole('img', { name: 'ligHTMetaL logo', exact: true });
      assert.equal(await logo.isVisible(), true);
      assert.equal(await logo.evaluate(async image => { await image.decode(); return image.naturalWidth > 0 && image.getBoundingClientRect().width === 320; }), true, 'the README logo loads inside the frame at 320px');
      assert.equal(await frame.locator('img[src]').count(), 1, 'only the known local logo has an image source');
      assert.equal(await logo.getAttribute('src'), await page.locator('img.logo').evaluate(image => image.src));
      const blocks = await frame.locator('pre > code').evaluateAll(blocks => blocks.map(block => ({
        language: [...block.classList].find(name => name.startsWith('language-'))?.slice(9),
        highlighted: !!block.querySelector('.token')
      })));
      assert.deepEqual(blocks.map(block => block.language), languages, 'all README examples retain their fence languages');
      // Plain shell commands need not contain a recognized keyword or string.
      assert.ok(blocks.every(block => block.language === 'bash' || block.highlighted), 'HTML, JS, and CSS examples have syntax tokens');
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await logo.evaluate(image => image.getBoundingClientRect().width <= 320 && image.getBoundingClientRect().width <= innerWidth - 40), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await frame.locator('html').evaluate(node => node.scrollWidth <= innerWidth), true);
      await page.setViewportSize({ width: 1280, height: 720 });
      await theme(frame, 'light');
      for (const mode of ['dark', 'light', 'auto']) {
        await page.locator('#theme-toggle').click();
        await theme(frame, mode === 'auto' ? 'light' : mode);
      }
      await page.emulateMedia({ colorScheme: 'dark' });
      await theme(frame, 'dark');
      await page.emulateMedia({ colorScheme: 'light' });
      await theme(frame, 'light');
      assert.equal(readmeRequests() - before, prefix.startsWith('file:') ? 0 : 1, 'README loads once, only when requested');
      await page.getByRole('tab', { name: 'HTML Editor', exact: true }).click();
      await tab.click();
      assert.equal(readmeRequests() - before, prefix.startsWith('file:') ? 0 : 1, 'tab/theme changes reuse the loaded source');
      if (!prefix.startsWith('file:')) {
        const response = page.waitForResponse(response => new URL(response.url()).pathname === '/README.md');
        await reload.click();
        assert.equal((await response).status(), 200);
        await page.waitForFunction(() => document.getElementById('readme-status').textContent === 'Loaded README.md.');
        assert.equal(readmeRequests() - before, 2, 'reload fetches the live README again');
      }
    });
  }
  await withPage(browser, 'README fetch recovery and sandbox safety', async page => {
    const { tab, frame, reload, requests } = readmeUI(page);
    let attempts = 0;
    let markdown = '# Updated README\n\n```js\nconst short = true;\n```\n\n```javascript\nconst full = false;\n```';
    await page.route('**/README.md', route => {
      attempts++;
      return route.fulfill(attempts === 1 ? { status: 503, body: 'Unavailable' } : {
        contentType: 'text/markdown; charset=utf-8', body: markdown
      });
    });
    await page.goto(base);
    await tab.click();
    await page.waitForFunction(() => document.getElementById('readme-status').textContent.includes('HTTP 503'));
    assert.equal(await page.locator('#readme-preview').isHidden(), true);
    await reload.click();
    await frame.getByRole('heading', { name: 'Updated README', exact: true }).waitFor();
    await frame.locator('code.language-js .token.boolean').waitFor();
    await frame.locator('code.language-javascript .token.boolean').waitFor();
    assert.equal(await frame.locator('code.language-js .token.keyword').textContent(), 'const');
    assert.equal(await frame.locator('code.language-javascript .token.keyword').textContent(), 'const');
    const resourceCount = requests.filter(url => url.includes('readme-must-not-load')).length;
    markdown = '# Raw README\n\n<div style="text-align:center"><img width="320" alt="ligHTMetaL logo" src="./ligHTMetaL.png"></div>\n\n<p id="raw-html-proof"><em>Rendered HTML</em></p>\n\n<script>window.__readmeExecuted = true</script>\n\n<meta http-equiv="refresh" content="0;url=https://example.invalid/readme-must-not-load">\n\n<iframe src="https://example.invalid/readme-must-not-load"></iframe>\n\n<img src="https://example.invalid/readme-must-not-load.png" onerror="window.__readmeExecuted=true">\n\n![image](https://example.invalid/readme-must-not-load.png)\n\n[link](https://example.invalid/readme-must-not-load)\n\n```html\n<img onerror="alert(1)">\n```';
    await reload.click();
    await frame.getByRole('heading', { name: 'Raw README', exact: true }).waitFor();
    assert.equal(await frame.locator('#raw-html-proof em').textContent(), 'Rendered HTML', 'trusted README HTML renders normally');
    assert.equal(await frame.locator('script,a[href],iframe,meta[http-equiv="refresh"],[onerror]').count(), 0);
    assert.equal(await frame.locator('img[src]').count(), 1, 'alternate logo markup works without exact-header matching');
    assert.equal(await frame.getByRole('img', { name: 'ligHTMetaL logo', exact: true }).evaluate(async image => { await image.decode(); return image.naturalWidth > 0; }), true);
    assert.equal(await frame.locator('body').evaluate(() => window.__readmeExecuted), undefined);
    assert.equal(requests.filter(url => url.includes('readme-must-not-load')).length, resourceCount, 'sandboxed README does not request payload resources');
    assert.match(await frame.locator('pre code').textContent(), /<img onerror="alert\(1\)">/);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await frame.locator('html').evaluate(node => node.scrollWidth <= innerWidth), true);
    await page.getByRole('tab', { name: 'Markdown Parser', exact: true }).click();
    await page.locator('#parser-input').fill('<p id="parser-raw-proof">Escaped HTML</p>');
    const parserFrame = page.frameLocator('#parser-preview');
    await parserFrame.locator('body').filter({ hasText: '<p id="parser-raw-proof">' }).waitFor();
    assert.equal(await parserFrame.locator('#parser-raw-proof').count(), 0, 'other parser/editor rendering keeps raw HTML escaped');
  });
};
