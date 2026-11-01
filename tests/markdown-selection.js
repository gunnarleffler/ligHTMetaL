/* Run with NODE_PATH=$(npm root -g) node tests/markdown-selection.js. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, firefox } = require('playwright');
const { skinNames } = require('./skins');
const asset = file => fs.readFileSync(path.join(__dirname, '..', 'dist', file), 'utf8');

async function check(engine) {
  const browser = await engine.launch({ headless: true });
  let cases = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const suffix of ['', '.min']) for (const skin of ['', ...skinNames]) {
      await page.setContent('<div id="editor" style="width:800px"></div>');
      for (const file of [`lightmetal${suffix}.css`, ...(skin ? [`skins/${skin}${suffix}.css`] : []), `maiden${suffix}.css`]) {
        await page.addStyleTag({ content: asset(file) });
      }
      await page.addScriptTag({ content: asset('maiden.js') });
      await page.evaluate(skin => {
        const host = document.getElementById('editor');
        if (skin) host.classList.add('lightmetal-' + skin);
        window.editor = maiden.init({ element: host });
        editor.setMarkdown('Plain text with `inline code`.\n\n```js\nconst answer = 42;\n```\n\nAfter code.');
      }, skin);
      for (const mode of ['light', 'dark']) {
        await page.locator('#editor').evaluate((host, mode) => {
          host.classList.remove('lightmetal-light', 'lightmetal-dark');
          host.classList.add('lightmetal-' + mode);
        }, mode);
        const snapshot = () => page.evaluate(() => {
          const source = editor.content, paint = source.previousElementSibling;
          const style = getComputedStyle(source);
          return {
            text: editor.getMarkdown(), caret: style.caretColor,
            foreground: getComputedStyle(source.parentElement).getPropertyValue('--lightmetal-color').trim(),
            band: getComputedStyle(paint).backgroundImage,
            tokens: Array.from(paint.querySelectorAll('*'), node => {
              const s = getComputedStyle(node);
              return [node.className, s.color, s.backgroundColor];
            }),
            rect: [source.offsetWidth, source.offsetHeight]
          };
        });
        const before = await snapshot();
        assert.notEqual(before.band, 'none', 'fence shading exists');
        assert.ok(before.tokens.some(([cls, , bg]) => cls.includes('lightmarkdown-code') && bg !== 'rgba(0, 0, 0, 0)'), 'inline shading exists');
        const colors = await page.evaluate(() => {
          const source = editor.content;
          return [source, ...source.querySelectorAll('*')].map(node => {
            const s = getComputedStyle(node, '::selection');
            return [s.backgroundColor, s.color];
          });
        });
        for (const [bg, fg] of colors) {
          assert.equal(bg, mode === 'light' ? 'rgb(196, 227, 235)' : 'rgb(49, 86, 99)');
          assert.equal(fg, before.caret, 'selected text uses normal foreground');
        }
        const source = page.locator('.lightmarkdown-input');
        await source.focus();
        await page.keyboard.press('Control+Home');
        await page.keyboard.press('Control+Shift+End');
        const selected = () => page.evaluate(() => getSelection().toString());
        assert.match(await selected(), /inline code[\s\S]*const answer = 42;/);
        await page.keyboard.press('ArrowRight');
        assert.equal(await selected(), '');
        const box = await source.boundingBox();
        await page.mouse.move(box.x + 14, box.y + 12);
        await page.mouse.down();
        await page.mouse.move(box.x + 260, box.y + box.height - 16, { steps: 12 });
        await page.mouse.up();
        assert.match(await selected(), /inline code[\s\S]*const answer = 42;/);
        await page.keyboard.press('ArrowRight');
        assert.equal(await selected(), '');
        assert.deepEqual(await snapshot(), before, 'selection leaves text, paint, caret and layout unchanged');
        // Native replacement at a keyboard-positioned caret must retain editing/history.
        await source.focus();
        await page.keyboard.press('Control+End');
        await page.keyboard.type('!');
        assert.equal(await page.evaluate(() => editor.getMarkdown()), before.text + '!');
        await page.keyboard.press('Control+z');
        assert.equal(await page.evaluate(() => editor.getMarkdown()), before.text);
        // Selection overrides must not recolor code or alter source geometry.
        await page.locator('#editor').evaluate(host => {
          host.style.setProperty('--lightmetal-selection-bg', '#8967ab');
          host.style.setProperty('--lightmetal-selection-color', '#ffffff');
        });
        assert.deepEqual(await page.evaluate(() => {
          const s = getComputedStyle(editor.content, '::selection');
          return [s.backgroundColor, s.color];
        }), ['rgb(137, 103, 171)', 'rgb(255, 255, 255)']);
        assert.deepEqual(await snapshot(), before, 'custom selection colors leave code backgrounds independent');
        await page.locator('#editor').evaluate(host => {
          host.style.removeProperty('--lightmetal-selection-bg');
          host.style.removeProperty('--lightmetal-selection-color');
        });
        if (!suffix && !skin) {
          await page.keyboard.press('Control+Home');
          await page.keyboard.press('Control+Shift+End');
          await page.screenshot({ path: `/tmp/lightmetal-selection-${engine.name()}-${mode}.png` });
          await page.keyboard.press('ArrowRight');
        }
        cases++;
      }
    }
    assert.deepEqual(errors, []);
    console.log(`${engine.name()}: ${cases} selection cases passed (base/seven skins, light/dark, plain/minified, keyboard/mouse)`);
  } finally { await browser.close(); }
}
(async () => { for (const engine of [chromium, firefox]) await check(engine); })().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
