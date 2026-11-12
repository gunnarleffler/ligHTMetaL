import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {useBrowser} from './fixture.js';
import { fixture } from '../test/helpers.js';

const engineName = process.env.ETCH_THEME_BROWSER ?? 'chromium';
if (!['chromium', 'firefox'].includes(engineName)) throw new Error('ETCH_THEME_BROWSER must be chromium or firefox');
const css = await readFile(new URL('../../../src/etch.css', import.meta.url), 'utf8');
const runtime = useBrowser(engineName);

async function pageFor(t) {
  const {browser,server} = runtime;
  const page = await browser.newPage({colorScheme:'light'}), errors = [], external = [];
  page.on('pageerror',error => errors.push(error.message));
  page.on('console',message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request',request => {
    if (!request.url().startsWith(server.origin+'/') && !/^(data|blob):/.test(request.url())) external.push(request.url());
  });
  t.after(async () => { await page.close(); assert.deepEqual(errors,[]); assert.deepEqual(external,[]); });
  return page;
}
const shell = id => `<section class="etch" id="${id}"><div class="etch-toolbar">Toolbar</div><div class="etch-body"><div class="etch-viewport">Viewport</div><aside class="etch-sidebar">Sidebar</aside></div><p class="etch-status">Status</p></section>`;
const palettes = {
  light: {background:'rgb(255, 255, 255)',panel:'rgb(247, 248, 250)',ink:'rgb(36, 41, 47)',border:'rgb(227, 230, 235)'},
  dark: {background:'rgb(22, 24, 28)',panel:'rgb(30, 33, 38)',ink:'rgb(230, 233, 238)',border:'rgb(44, 49, 58)'},
};
async function assertPalette(page, id, mode) {
  const actual = await page.locator(`#${id}`).evaluate(el => {
    const root = getComputedStyle(el), panel = getComputedStyle(el.querySelector('.etch-toolbar'));
    return {background:root.backgroundColor,panel:panel.backgroundColor,ink:root.color,border:root.borderTopColor};
  });
  assert.deepEqual(actual,palettes[mode],`${engineName}: #${id} should use ${mode}`);
}

test('Etch CSS alone follows live system preference and explicit ancestor modes', async t => {
  const page = await pageFor(t);
  await page.setContent(`<main id="scope">${shell('etch')}</main>`);
  await page.addStyleTag({content:css}); // No Lightmetal stylesheet or runtime.
  for (const system of ['light','dark']) {
    await page.emulateMedia({colorScheme:system});
    await assertPalette(page,'etch',system);
    for (const mode of ['light','dark','auto']) {
      await page.locator('#scope').evaluate((el,mode) => { el.dataset.lightmetalTheme = mode; },mode);
      await assertPalette(page,'etch',mode === 'auto' ? system : mode);
    }
    await page.locator('#scope').evaluate(el => el.removeAttribute('data-lightmetal-theme'));
  }
});

test('nearest attribute wins, auto resets an inherited pin, and removal restores inheritance', async t => {
  const page = await pageFor(t);
  await page.setContent(`<main data-lightmetal-theme="dark">${shell('inherited')}
    <section data-lightmetal-theme="light">${shell('light')}
      <section data-lightmetal-theme="auto">${shell('auto')}</section>
    </section></main>`);
  await page.addStyleTag({content:css});
  await assertPalette(page,'inherited','dark'); await assertPalette(page,'light','light');
  await assertPalette(page,'auto','light');
  await page.emulateMedia({colorScheme:'dark'});
  await assertPalette(page,'auto','dark'); await assertPalette(page,'light','light');
  await page.locator('#light').evaluate(el => { el.dataset.lightmetalTheme = 'dark'; });
  await assertPalette(page,'light','dark');
  await page.locator('#light').evaluate(el => { el.dataset.lightmetalTheme = 'auto'; });
  await page.emulateMedia({colorScheme:'light'}); await assertPalette(page,'light','light');
  await page.locator('#light').evaluate(el => el.removeAttribute('data-lightmetal-theme'));
  await assertPalette(page,'light','light'); // Enclosing section is still pinned light.
  await page.locator('#light').evaluate(el => { el.parentElement.dataset.lightmetalTheme = 'dark'; });
  await assertPalette(page,'light','dark');
});

test('inherited suite mode variable works without an attribute or theme adapter', async t => {
  const page = await pageFor(t);
  await page.setContent(`<main style="--lightmetal-color-scheme:dark">${shell('etch')}</main>`);
  await page.addStyleTag({content:css}); await assertPalette(page,'etch','dark');
  await page.locator('main').evaluate(el => { el.style.setProperty('--lightmetal-color-scheme','light'); });
  await page.emulateMedia({colorScheme:'dark'}); await assertPalette(page,'etch','light');
});

test('shared mode rules compose with another suite stylesheet in either load order', async t => {
  const page = await pageFor(t);
  // A tiny independent contract consumer, not an import from a sibling checkout.
  const suiteCSS = `
    [data-lightmetal-theme="light"] { --lightmetal-color-scheme:light; color-scheme:light; }
    [data-lightmetal-theme="dark"] { --lightmetal-color-scheme:dark; color-scheme:dark; }
    [data-lightmetal-theme="auto"] { --lightmetal-color-scheme:light dark; color-scheme:light dark; }
    .suite-probe { color-scheme:var(--lightmetal-color-scheme,light dark); color:light-dark(#123456,#abcdef); }
    .suite-local-light { --lightmetal-color-scheme:light; }
  `;
  for (const order of [[suiteCSS,css],[css,suiteCSS]]) {
    await page.setContent(`<main data-lightmetal-theme="dark"><div class="suite-probe">Suite</div>${shell('etch')}
      <section class="suite-local-light">${shell('local')}</section></main>`);
    for (const content of order) await page.addStyleTag({content});
    await assertPalette(page,'etch','dark'); await assertPalette(page,'local','light');
    assert.equal(await page.locator('.suite-probe').evaluate(el => getComputedStyle(el).color),'rgb(171, 205, 239)');
    await page.locator('main').evaluate(el => { el.dataset.lightmetalTheme = 'auto'; });
    await page.emulateMedia({colorScheme:'light'}); await assertPalette(page,'etch','light');
    await page.emulateMedia({colorScheme:'dark'}); await assertPalette(page,'etch','dark');
  }
});

test('public host tokens and local overrides win in both modes, with independent panel and canvas colors', async t => {
  const page = await pageFor(t);
  await page.setContent(`<main style="--etch-bg:#112233;--etch-ink:#ddeeff;--etch-canvas:#223344">${shell('etch')}</main>`);
  await page.addStyleTag({content:css});
  for (const mode of ['light','dark']) {
    await page.locator('main').evaluate((el,mode) => { el.dataset.lightmetalTheme = mode; },mode);
    const colors = await page.locator('#etch').evaluate(el => ({
      background:getComputedStyle(el).backgroundColor, ink:getComputedStyle(el).color,
      panel:getComputedStyle(el.querySelector('.etch-sidebar')).backgroundColor,
      canvas:getComputedStyle(el.querySelector('.etch-viewport')).backgroundColor,
    }));
    assert.deepEqual(colors,{background:'rgb(17, 34, 51)',ink:'rgb(221, 238, 255)',panel:'rgb(17, 34, 51)',canvas:'rgb(34, 51, 68)'});
  }
  await page.locator('#etch').evaluate(el => {
    el.style.setProperty('--etch-ink','#ffcc88'); el.style.setProperty('--etch-panel','#334455');
  });
  assert.equal(await page.locator('#etch').evaluate(el => getComputedStyle(el).color),'rgb(255, 204, 136)');
  for (const selector of ['.etch-toolbar','.etch-sidebar','.etch-status']) {
    assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).backgroundColor),'rgb(51, 68, 85)');
  }
});

test('theme changes preserve native data, selection, viewport, history, sidebar and revision without content events', async t => {
  const page = await pageFor(t); await page.goto(`${runtime.server.origin}/demo/`);
  const result = await page.evaluate(async native => {
    const {createEtch} = await import('/etch.js');
    const host = document.createElement('div'); host.id = 'theme-host'; document.body.append(host);
    const editor = createEtch(host); await editor.load(native);
    editor.setBackground('#aabbcc'); editor.renameLayer('layer','Temporary'); editor.undo();
    editor.setSelection(['rect']); host.querySelector('.etch-sidebar-toggle').click();
    const viewport = host.querySelector('.etch-viewport');
    const before = JSON.stringify({document:editor.save(),revision:editor.getRevision(),active:editor.getActiveLayer(),
      selection:editor.getSelection(),undo:editor.canUndo(),redo:editor.canRedo()});
    let changes = 0; editor.on('change',() => changes++);
    window.themeFixture = {host,editor,viewport,before,get changes(){return changes;}};
    return {undo:editor.canUndo(),redo:editor.canRedo()};
  },fixture());
  assert.deepEqual(result,{undo:true,redo:true});
  for (const system of ['dark','light']) {
    await page.emulateMedia({colorScheme:system});
    for (const mode of ['light','dark','auto']) {
      await page.locator('#theme-host').evaluate((el,mode) => { el.dataset.lightmetalTheme = mode; },mode);
      const current = await page.evaluate(() => {
        const {host,editor,viewport,before,changes} = window.themeFixture;
        return {same:before === JSON.stringify({document:editor.save(),revision:editor.getRevision(),active:editor.getActiveLayer(),
          selection:editor.getSelection(),undo:editor.canUndo(),redo:editor.canRedo()}),changes,
        node:host.querySelector('.etch-viewport') === viewport,open:host.querySelector('.etch-sidebar-toggle').getAttribute('aria-expanded')};
      });
      assert.deepEqual(current,{same:true,changes:0,node:true,open:'true'});
    }
  }
  await page.evaluate(() => { window.themeFixture.editor.redo(); window.themeFixture.editor.undo(); window.themeFixture.editor.destroy(); });
});

test('demo Appearance control pins the whole page, auto follows live OS changes, and saved status stays clean', async t => {
  const page = await pageFor(t); await page.goto(`${runtime.server.origin}/demo/`);
  await page.getByRole('button',{name:'Save snapshot',exact:true}).click();
  const saved = await page.locator('#save-status').innerText();
  const json = await page.locator('#native').inputValue();
  await page.emulateMedia({colorScheme:'light'});
  await page.getByLabel('Appearance',{exact:true}).selectOption('dark');
  assert.equal(await page.locator('html').getAttribute('data-lightmetal-theme'),'dark');
  assert.equal(await page.locator('.etch').evaluate(el => getComputedStyle(el).backgroundColor),palettes.dark.background);
  await page.emulateMedia({colorScheme:'dark'});
  await page.getByLabel('Appearance',{exact:true}).selectOption('light');
  assert.equal(await page.locator('.etch').evaluate(el => getComputedStyle(el).backgroundColor),palettes.light.background);
  await page.getByLabel('Appearance',{exact:true}).selectOption('auto');
  assert.equal(await page.locator('.etch').evaluate(el => getComputedStyle(el).backgroundColor),palettes.dark.background);
  await page.emulateMedia({colorScheme:'light'});
  assert.equal(await page.locator('.etch').evaluate(el => getComputedStyle(el).backgroundColor),palettes.light.background);
  assert.equal(await page.locator('#save-status').innerText(),saved);
  assert.equal(await page.locator('#native').inputValue(),json);
});
