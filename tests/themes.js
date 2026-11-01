const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const skins = ['', 'bootstrap', 'material-classic', 'material-outline', 'frost', 'patina', 'sterling', 'substantial'];

async function runThemeChecks(browser, { minified = false } = {}) {
  const asset = file => fs.readFileSync(path.join(root, 'dist', minified ? file.replace(/\.(css|js)$/, '.min.$1') : file), 'utf8');
  const page = await browser.newPage();
  const color = selector => page.locator(selector).evaluate(node => {
    const css = getComputedStyle(node);
    return { background: css.backgroundColor, color: css.color, border: css.borderTopColor };
  });
  try {
    // Editor styles do not need poliSH, a parser, or theme JavaScript.
    await page.setContent('<main id="scope">' + skins.map((skin, index) =>
      `<div id="editor-${index}" class="lightmetal${skin ? ' lightmetal-' + skin : ''}"><div class="lightmetal-actionbar">Toolbar</div><div class="lightmetal-content">Text</div></div>`).join('') + '</main>');
    await page.addStyleTag({ content: asset('lightmetal.css') });
    for (const skin of skins.filter(Boolean)) await page.addStyleTag({ content: asset(`skins/${skin}.css`) });
    const snapshot = () => Promise.all(skins.map((_, index) => color(`#editor-${index}`)));
    const palettes = {};
    for (const mode of ['light', 'dark']) {
      await page.locator('.lightmetal').evaluateAll((nodes, mode) => nodes.forEach(node => node.classList.add('lightmetal-' + mode)), mode);
      palettes[mode] = await snapshot();
      await page.locator('.lightmetal').evaluateAll((nodes, mode) => nodes.forEach(node => node.classList.remove('lightmetal-' + mode)), mode);
    }
    assert.notDeepEqual(palettes.light, palettes.dark);
    for (const system of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: system });
      for (const mode of ['light', 'dark', 'auto']) {
        await page.locator('#scope').evaluate((node, mode) => node.dataset.lightmetalTheme = mode, mode);
        assert.deepEqual(await snapshot(), palettes[mode === 'auto' ? system : mode]);
      }
    }
    await page.locator('#scope').evaluate(node => node.dataset.lightmetalTheme = 'dark');
    await page.locator('#editor-0').evaluate(node => node.dataset.lightmetalTheme = 'light');
    assert.deepEqual(await color('#editor-0'), palettes.light[0], 'nearest attribute wins');
    await page.locator('#editor-0').evaluate(node => node.classList.add('lightmetal-dark'));
    assert.deepEqual(await color('#editor-0'), palettes.dark[0], 'legacy host pin wins');
    await page.locator('#editor-0').evaluate(node => { node.classList.remove('lightmetal-dark'); node.dataset.lightmetalTheme = 'auto'; });
    assert.deepEqual(await color('#editor-0'), palettes.dark[0]);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() => getComputedStyle(document.getElementById('editor-0')).backgroundColor === 'rgb(255, 255, 255)');

    // Standalone code coloring works without editor CSS or JavaScript.
    await page.setContent('<main data-lightmetal-theme="dark"><pre id="code" class="code"><span class="token keyword">const</span></pre><section data-lightmetal-theme="light"><pre id="nested" class="code"><span class="token keyword">let</span></pre></section><pre id="pinned" class="code theme-dracula"><span class="token keyword">const</span></pre></main>');
    await page.addStyleTag({ content: asset('polish.css') });
    assert.equal((await color('#code')).background, 'rgb(13, 17, 23)');
    assert.equal((await color('#code .keyword')).color, 'rgb(255, 123, 114)');
    assert.equal((await color('#nested')).background, 'rgb(255, 255, 255)');
    const pinned = await color('#pinned .keyword');
    const unrelated = await page.evaluate(() => {
      const results = [];
      for (const base of ['code', 'polish']) {
        const probe = document.createElement('div');
        probe.className = base + ' app-theme-aware';
        probe.innerHTML = '<pre><span class="token keyword">const</span></pre>';
        document.querySelector('main').append(probe);
        results.push({ background: getComputedStyle(probe).backgroundColor, keyword: getComputedStyle(probe.querySelector('span')).color });
        probe.remove();
      }
      return results;
    });
    assert.deepEqual(unrelated, Array(2).fill({ background: 'rgb(13, 17, 23)', keyword: 'rgb(255, 123, 114)' }),
      'unrelated class-name substrings do not disable automatic themes');
    // HTML class tokens can be separated by space, tab, LF, CR, or form feed.
    const paletteColors = await page.evaluate(() => {
      const results = [];
      for (const separator of [' ', '\t', '\n', '\r', '\f']) {
        for (const classes of ['theme-dracula' + separator + 'code', 'code' + separator + 'theme-dracula']) {
          const probe = document.createElement('pre');
          probe.setAttribute('class', classes);
          probe.innerHTML = '<span class="token keyword">const</span>';
          document.querySelector('main').append(probe);
          results.push(getComputedStyle(probe.querySelector('span')).color);
          probe.remove();
        }
      }
      return results;
    });
    assert.ok(paletteColors.every(color => color === pinned.color), 'real palette classes work in either position with every HTML separator');
    assert.equal(await page.evaluate(() => {
      const probe = document.createElement('pre');
      probe.className = 'code theme-app-palette';
      probe.style.color = '#123456';
      probe.innerHTML = '<span class="token keyword">const</span>';
      document.querySelector('main').append(probe);
      const color = getComputedStyle(probe.querySelector('span')).color;
      probe.remove();
      return color;
    }), 'rgb(18, 52, 86)', 'app-defined palette classes still opt out of automatic colors');
    await page.locator('main').evaluate(node => {
      const parent = document.createElement('div');
      parent.className = 'polish theme-dracula';
      parent.innerHTML = '<pre id="inside-palette" class="code"><span class="token keyword">const</span></pre>';
      node.append(parent);
    });
    assert.equal((await color('#inside-palette .keyword')).color, pinned.color, 'nested code retains its surrounding named palette');
    await page.locator('main').evaluate(node => node.dataset.lightmetalTheme = 'light');
    assert.equal((await color('#code .keyword')).color, 'rgb(207, 34, 46)');
    assert.deepEqual(await color('#pinned .keyword'), pinned, 'named palette stays pinned');
    await page.locator('main').evaluate(node => node.dataset.lightmetalTheme = 'auto');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#code .keyword')).color === 'rgb(255, 123, 114)');

    // Real MaiDEn + MeltDown + poliSH integration requires no theme adapter.
    await page.setContent('<main data-lightmetal-theme="dark"><div id="markdown" class="lightmetal lightmetal-frost"></div></main>');
    const styles = ['lightmetal.css', 'skins/frost.css', 'maiden.css', 'polish.css'];
    // The independent mode declarations must work with either stylesheet order.
    for (const file of minified ? ['polish.css', ...styles.slice(0, -1)] : styles) await page.addStyleTag({ content: asset(file) });
    for (const file of ['MeltDown.js', 'polish.js', 'maiden.js']) await page.addScriptTag({ content: asset(file) });
    await page.evaluate(() => {
      const highlighter = polish.createHighlighter({ languages: polish.allLanguages });
      window.editor = maiden.init({ element: document.getElementById('markdown'), preview: { render: source => meltDown.parse(source, { highlight: highlighter.highlight }) } });
      editor.setMarkdown('```js\nconst answer = 42;\n```');
    });
    await page.getByRole('button', { name: 'Side-by-side', exact: true }).click();
    const keyword = '.lightmarkdown-preview .token.keyword';
    await page.locator(keyword).waitFor();
    assert.equal((await color(keyword)).color, 'rgb(255, 123, 114)');
    assert.equal((await color('#markdown')).background, 'rgb(20, 36, 45)');
    await page.locator('main').evaluate(node => node.dataset.lightmetalTheme = 'light');
    assert.equal((await color(keyword)).color, 'rgb(207, 34, 46)');
    assert.equal((await color('#markdown')).background, 'rgb(255, 255, 255)');
    assert.equal(await page.locator('.lightmarkdown-preview').evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)', 'code theme does not repaint the skin');
    await page.evaluate(() => editor.destroy());
  } finally { await page.close(); }
}

module.exports = { runThemeChecks };
if (require.main === module) {
  (async () => {
    const playwright = require('playwright');
    for (const name of process.argv.includes('--webkit') ? ['webkit'] : ['chromium', 'firefox']) {
      const browser = await playwright[name].launch({ headless: true });
      try {
        await runThemeChecks(browser);
        await runThemeChecks(browser, { minified: true });
        console.log(name + ': independent/shared themes (plain/minified) ok');
      }
      finally { await browser.close(); }
    }
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
