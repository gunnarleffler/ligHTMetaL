/* Diagnostic, not a performance budget or heap-leak proof.
 * NODE_PATH=$(npm root -g) node tests/markdown-performance.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, firefox } = require('playwright');
const asset = file => fs.readFileSync(path.join(__dirname, '..', 'dist', file), 'utf8');

async function check(engine) {
  const browser = await engine.launch({ headless: true });
  const report = { browser: engine.name(), documents: [], cycles: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<div id="editor" style="width:1000px"></div>');
    for (const file of ['lightmetal.css', 'maiden.css', 'polish.css']) await page.addStyleTag({ content: asset(file) });
    for (const file of ['MeltDown.js', 'polish.js', 'maiden.js']) await page.addScriptTag({ content: asset(file) });
    await page.evaluate(() => {
      const highlighter = polish.createHighlighter({ languages: polish.allLanguages });
      window.render = source => meltDown.parse(source, { highlight: highlighter.highlight });
      window.editor = maiden.init({ element: document.getElementById('editor'), preview: { render } });
      window.sample = kib => {
        const section = '# Repeated heading\n\nParagraph **bold**, *italic*, [link](relative), and `inline code`.\n\n```js\nconst answer = 42;\nconsole.log(answer);\n```\n\n';
        return section.repeat(Math.ceil(kib * 1024 / section.length));
      };
    });
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const button = name => page.getByRole('button', { name, exact: true });
    for (const kib of [20, 200]) {
      const timing = await page.evaluate(kib => {
        window.text = sample(kib);
        const start = performance.now(); editor.setMarkdown(text); const set = performance.now();
        editor.content.getBoundingClientRect(); const layout = performance.now();
        const read = editor.getMarkdown(); const end = performance.now();
        return { kib, bytes: text.length, setMs: set - start, layoutMs: layout - set, getMs: end - layout, matches: read === text };
      }, kib);
      assert.equal(timing.matches, true);
      await page.locator('.lightmarkdown-input').focus();
      await page.keyboard.press('Control+End');
      let start = performance.now();
      await page.keyboard.type('native typing');
      await settle();
      timing.nativeTypingRoundtripMs = performance.now() - start;
      assert.equal(await page.evaluate(() => editor.getMarkdown()), await page.evaluate(() => text + 'native typing'));
      await page.keyboard.press('Control+z');
      assert.equal(await page.evaluate(() => editor.getMarkdown()), await page.evaluate(() => text));
      await page.keyboard.press('Control+Home');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Control+Shift+ArrowRight');
      start = performance.now();
      await button('Bold').click();
      await settle();
      timing.boldRoundtripMs = performance.now() - start;
      assert.notEqual(await page.evaluate(() => editor.getMarkdown()), await page.evaluate(() => text));
      await page.keyboard.press('Control+z');
      assert.equal(await page.evaluate(() => editor.getMarkdown()), await page.evaluate(() => text));
      for (const mode of ['Preview', 'Side-by-side']) {
        start = performance.now();
        await button(mode).click();
        await page.locator('.lightmarkdown-preview .token.keyword').first().waitFor();
        await settle();
        timing[mode + 'RoundtripMs'] = performance.now() - start;
        await button(mode).click();
        assert.equal(await page.evaluate(() => editor.getMarkdown()), await page.evaluate(() => text));
      }
      report.documents.push(timing);
    }
    report.stress = await page.evaluate(() => {
      const measure = source => {
        const start = performance.now(); const html = render(source);
        return { ms: performance.now() - start, inputBytes: source.length, outputBytes: html.length };
      };
      const headings = measure('# Same title\n'.repeat(8000));
      const fence = measure('```js\n' + 'const answer = 42; // highlighted\n'.repeat(6000) + '```');
      return { headings, fence };
    });
    await button('Side-by-side').click();
    const counts = () => page.evaluate(() => ({
      sourcePaint: editor.content.previousElementSibling.querySelectorAll('*').length,
      preview: document.querySelector('.lightmarkdown-preview').querySelectorAll('*').length,
      all: document.getElementById('editor').querySelectorAll('*').length
    }));
    for (let cycle = 0; cycle < 4; cycle++) {
      await page.evaluate(() => editor.setMarkdown(sample(200)));
      await settle();
      const large = await counts();
      await page.evaluate(() => editor.setMarkdown('Small `document`.'));
      await settle();
      const small = await counts();
      report.cycles.push({ large, small });
    }
    for (const cycle of report.cycles.slice(1)) assert.deepEqual(cycle, report.cycles[1], 'retained DOM plateaus after warmup');
    await page.evaluate(() => editor.destroy());
    assert.equal(await page.locator('#editor *').count(), 0, 'destroy removes owned UI');
    await page.evaluate(() => { editor.setMarkdown('late'); window.dispatchEvent(new Event('resize')); });
    await settle();
    assert.equal(await page.locator('#editor *').count(), 0, 'late setter/resize do not recreate UI');
    assert.deepEqual(errors, []);
    report.teardown = 'owned DOM removed; late setter/resize inert';
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
}
(async () => { for (const engine of [chromium, firefox]) await check(engine); })().catch(error => {
  console.error(error); process.exitCode = 1;
});
