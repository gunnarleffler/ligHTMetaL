import { test } from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
import { fixture } from '../test/helpers.js';

// Original foundation fixtures include Chromium-specific corrupt-PNG decoding expectations.
const runtime = useBrowser('chromium');
async function pageFor(t) {
  const {browser,server} = runtime;
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const errors = [], external = [];
  page.on('pageerror',error => errors.push(error.message));
  page.on('console',message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request',request => {
    if (!request.url().startsWith(server.origin+'/') && !request.url().startsWith('data:') && !request.url().startsWith('blob:')) external.push(request.url());
  });
  t.after(async () => {
    await context.close(); assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
  });
  await page.goto(`${server.origin}/demo/`);await collapseDemoSidebar(page);
  await page.getByRole('button',{name:'Toggle sidebar',exact:true}).waitFor();
  return page;
}

test('demo starts expanded without autofocus; embedded default remains collapsed and sidebarOpen is validated',async t => {
  const page = await pageFor(t);await page.goto(`${runtime.server.origin}/demo/`);
  const toggle = page.locator('#editor .etch-sidebar-toggle');assert.equal(await toggle.getAttribute('aria-expanded'),'true');assert.equal(await page.locator('#editor .etch-sidebar').isVisible(),true);
  assert.notEqual(await page.evaluate(() => document.activeElement.closest?.('#editor')?.id),'editor');
  const result = await page.evaluate(async () => {const {createEtch} = await import('/etch.js');let code;try {createEtch(document.createElement('div'),{sidebarOpen:'yes'});}catch(e) {code = e.code;}const host = document.createElement('div');document.body.append(host);const e = createEtch(host);const expanded = host.querySelector('.etch-sidebar-toggle').getAttribute('aria-expanded');e.destroy();return {code,expanded};});assert.deepEqual(result,{code:'INVALID_ARGUMENT',expanded:'false'});
  await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'false');
});

test('real public demo loads with no build; host save/reopen/download and layer history work', async t => {
  const page = await pageFor(t);
  assert.match(await page.locator('.etch-empty').innerText(),/Start drawing/);
  await page.getByRole('button',{name:'Save snapshot',exact:true}).click();
  await page.getByRole('button',{name:'Reopen saved',exact:true}).waitFor({state:'visible'});
  await page.getByRole('button',{name:'Toggle sidebar',exact:true}).click();
  await page.getByRole('button',{name:'New layer',exact:true}).click();
  assert.equal(await page.locator('.etch-layer').count(),2);
  assert.equal(await page.locator('#save-status').innerText(),'Unsaved changes');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  assert.equal(await page.locator('.etch-layer').count(),1);
  await page.getByRole('button',{name:'Redo',exact:true}).click();
  assert.equal(await page.locator('.etch-layer').count(),2);
  await page.getByRole('button',{name:'Reopen saved',exact:true}).click();
  await page.waitForFunction(() => document.querySelectorAll('.etch-layer').length === 1);
  assert.equal(await page.getByRole('button',{name:'Undo',exact:true}).isDisabled(),true);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button',{name:'Download native JSON',exact:true}).click();
  const download = await downloadPromise; assert.equal(download.suggestedFilename(),'drawing.etch.json');
});

test('native PNG decoding, snapshots, failed-load atomicity, revisions and instance isolation', async t => {
  const page = await pageFor(t);
  const d = fixture();
  const corrupt = structuredClone(d), bytes = Buffer.from(corrupt.assets[0].data,'base64');
  bytes.fill(0,41,50); corrupt.assets[0].data = bytes.toString('base64');
  const result = await page.evaluate(async ({native, corrupt}) => {
    const { createEtch } = await import('/etch.js');
    const a = document.createElement('div'), b = document.createElement('div');
    a.innerHTML = '<span class="sentinel">host content</span>'; document.body.append(a,b);
    const one = createEtch(a), two = createEtch(b,{readOnly:true}), changes = [], loads = [];
    one.on('change', e => changes.push(e)); one.on('load',e => loads.push(e));
    await one.load(native); await two.load(native);
    const baseline = one.save(), token = one.getRevision();
    const detached = one.save(); detached.layers[0].elements[0].points[0][0] = 999;
    let invalid;
    try { await one.load(corrupt); } catch (error) { invalid = error.code; }
    const atomic = JSON.stringify(one.save()) === JSON.stringify(baseline) && one.getRevision() === token;
    one.createLayer();
    let readOnly;
    try { two.createLayer(); } catch (error) { readOnly = error.code; }
    const isolated = two.save().layers.length === 1 && !two.canUndo();
    one.destroy(); one.destroy();
    const removed = a.querySelector('.etch') === null && a.querySelector('.sentinel') !== null;
    let destroyed;
    try { one.save(); } catch (error) { destroyed = error.code; }
    two.destroy(); a.remove(); b.remove();
    return {baseline, invalid, atomic, isolated, readOnly, removed, destroyed, changes:changes.length, loads:loads.length};
  },{native:d, corrupt});
  assert.deepEqual(result.baseline,d); assert.equal(result.invalid,'DECODE_FAILED'); assert.equal(result.atomic,true);
  assert.equal(result.isolated,true); assert.equal(result.readOnly,'READ_ONLY'); assert.equal(result.removed,true);
  assert.equal(result.destroyed,'DESTROYED'); assert.equal(result.changes,1); assert.equal(result.loads,1);
});

test('superseded/destroyed browser loads cannot install stale content or resources', async t => {
  const page = await pageFor(t);
  const result = await page.evaluate(async native => {
    const { createEtch } = await import('/etch.js');
    const container = document.createElement('div'); document.body.append(container);
    const editor = createEtch(container);
    const empty = editor.save();
    const first = editor.load(native).then(() => 'unexpected',e => e.code);
    await editor.load(empty);
    const cancelled = await first;
    const current = editor.save();
    const last = editor.load(native).then(() => 'unexpected',e => e.code);
    editor.destroy(); const destroyed = await last;
    const clean = container.childElementCount === 0; container.remove();
    return {cancelled, current, empty, destroyed, clean};
  },fixture());
  assert.equal(result.cancelled,'CANCELLED'); assert.deepEqual(result.current,result.empty);
  assert.equal(result.destroyed,'CANCELLED'); assert.equal(result.clean,true);
});

test('native PNG load also works without createImageBitmap and mounting does not steal focus', async t => {
  const page = await pageFor(t);
  const result = await page.evaluate(async native => {
    const { createEtch } = await import('/etch.js');
    Object.defineProperty(globalThis,'createImageBitmap',{value:undefined,configurable:true});
    const input = document.querySelector('#native'); input.focus();
    const container = document.createElement('div'); document.body.append(container);
    const editor = createEtch(container,{readOnly:true});
    await editor.load(native);
    const data = editor.save();
    const focusPreserved = document.activeElement === input;
    const buttons = [...container.querySelectorAll('.etch-toolbar button')];
    const disabled = buttons.every(button => button.disabled === ['Undo','Redo','Select','Pen','Highlighter','Eraser','Shapes','Choose shape','Move Layer','Rotate clockwise 90°','Document background'].includes(button.getAttribute('aria-label')));
    editor.destroy(); container.remove();
    return {data,focusPreserved,disabled};
  },fixture());
  assert.deepEqual(result.data,fixture()); assert.equal(result.focusPreserved,true); assert.equal(result.disabled,true);
});

test('layer control focus survives refresh; shortcuts are scoped and do not hijack host text input', async t => {
  const page = await pageFor(t);
  await page.getByRole('button',{name:'Toggle sidebar',exact:true}).click();
  await page.getByRole('button',{name:'New layer',exact:true}).click();
  const lock = page.getByRole('button',{name:'Lock Layer 2',exact:true});
  await lock.focus(); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')),'Unlock Layer 2');
  await page.keyboard.press('Control+z');
  assert.equal(await page.getByRole('button',{name:'Lock Layer 2',exact:true}).count(),1);
  const json = page.locator('#native'); await json.focus(); await page.keyboard.press('Control+z');
  assert.equal(await page.locator('.etch-layer').count(),2);
});

test('sidebar defaults closed, uses a desktop column, and preserves viewport/document/history', async t => {
  const page = await pageFor(t);
  await page.evaluate(async native => {
    const {createEtch} = await import('/etch.js');
    const card = document.createElement('div'); card.id = 'ui-card';
    card.style.cssText = 'width:900px;height:320px'; document.body.append(card);
    const editor = createEtch(card); await editor.load(native); editor.createLayer();
    const viewport = card.querySelector('.etch-viewport');
    // Lifecycle sentinel only: verifies layout never remounts/clears a future canvas.
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2;
    const context = canvas.getContext('2d'); context.fillStyle = '#123456'; context.fillRect(0,0,2,2);
    viewport.append(canvas);
    window.uiFixture = {editor, viewport, canvas, before:JSON.stringify(editor.save()),
      revision:editor.getRevision(), active:editor.getActiveLayer()};
  },fixture());
  const root = page.locator('#ui-card .etch'), toggle = root.getByRole('button',{name:'Toggle sidebar',exact:true});
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  assert.equal(await root.locator('.etch-sidebar').isVisible(),false);
  assert.equal(await root.getByRole('button',{name:'New layer',exact:true}).count(),0);
  assert.equal(await root.locator('.etch-toolbar button').count(),17);
  assert.equal(await root.locator('.etch-toolbar svg[aria-hidden="true"]').count(),17);
  const collapsed = await root.locator('.etch-viewport').boundingBox();
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'),'true');
  const expanded = await root.locator('.etch-viewport').boundingBox();
  const sidebar = await root.locator('.etch-sidebar').boundingBox();
  assert.ok(Math.abs(collapsed.width-expanded.width-240) < 1);
  assert.ok(Math.abs(sidebar.width-240) < 1);
  assert.equal(await root.locator('.etch-sidebar-scrim').isVisible(),false);
  assert.equal(await root.getByRole('heading',{name:'Layers',exact:true}).isVisible(),true);
  await toggle.click(); await toggle.click();
  const preserved = await page.evaluate(() => {
    const {editor,viewport,canvas,before,revision,active} = window.uiFixture;
    const result = {
      identity:document.querySelector('#ui-card .etch-viewport') === viewport && viewport.contains(canvas),
      pixel:[...canvas.getContext('2d').getImageData(0,0,1,1).data],
      content:JSON.stringify(editor.save()) === before, revision:editor.getRevision() === revision,
      active:editor.getActiveLayer() === active, undo:editor.canUndo(), redo:editor.canRedo(),
    };
    editor.undo(); editor.redo(); result.history = JSON.stringify(editor.save()) === before;
    editor.destroy(); return result;
  });
  assert.deepEqual(preserved,{identity:true,pixel:[18,52,86,255],content:true,revision:true,active:true,undo:true,redo:false,history:true});
});

test('narrow-card sidebar overlays without resizing the viewport, dismisses and restores focus', async t => {
  const page = await pageFor(t);
  await page.setViewportSize({width:390,height:844});
  const toggle = page.getByRole('button',{name:'Toggle sidebar',exact:true});
  const viewport = page.locator('.etch-viewport');
  const before = await viewport.boundingBox();
  await toggle.click();
  const after = await viewport.boundingBox();
  assert.equal(after.width,before.width); assert.equal(after.height,before.height);
  assert.equal(await page.locator('.etch-sidebar-scrim').isVisible(),true);
  assert.equal(await page.getByRole('button',{name:'New layer',exact:true}).isVisible(),true);
  await page.locator('.etch-sidebar-scrim').click({position:{x:10,y:10}});
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  await toggle.click(); await page.getByRole('button',{name:'New layer',exact:true}).focus();
  await page.keyboard.press('Escape');
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  assert.equal(await toggle.evaluate(el => el === document.activeElement),true);
  // A narrow card on a wide desktop must also use the drawer layout.
  await page.setViewportSize({width:1280,height:800});
  await page.locator('#editor').evaluate(el => { el.style.width = '360px'; });
  await toggle.click();
  assert.equal(await page.locator('.etch-sidebar-scrim').isVisible(),true);
});

test('layer list scrolls independently and sidebar visibility is isolated per instance', async t => {
  const page = await pageFor(t);
  await page.evaluate(async () => {
    const {createEtch} = await import('/etch.js');
    const card = document.createElement('div'); card.id = 'scroll-card';
    card.style.cssText = 'width:900px;height:240px'; document.body.append(card);
    const editor = createEtch(card);
    for (let i = 0; i < 35; i++) editor.createLayer();
    window.scrollEditor = editor;
  });
  const root = page.locator('#scroll-card .etch'), toggle = root.getByRole('button',{name:'Toggle sidebar',exact:true});
  const firstToggle = page.locator('#editor').getByRole('button',{name:'Toggle sidebar',exact:true});
  assert.notEqual(await toggle.getAttribute('aria-controls'),await firstToggle.getAttribute('aria-controls'));
  await toggle.click();
  assert.equal(await firstToggle.getAttribute('aria-expanded'),'false');
  const layers = root.locator('.etch-layers'); await layers.hover();
  const scroll = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0,600);
  await page.waitForFunction(() => document.querySelector('#scroll-card .etch-layers').scrollTop > 0);
  assert.equal(await page.evaluate(() => window.scrollY),scroll);
  assert.equal(await root.locator('.etch-viewport').evaluate(el => el.scrollTop),0);
  assert.equal(await root.getByRole('heading',{name:'Layers',exact:true}).isVisible(),true);
  const firstHeader = await root.locator('.etch-sidebar-header').boundingBox();
  await layers.evaluate(el => { el.scrollTop = el.scrollHeight; });
  assert.deepEqual(await root.locator('.etch-sidebar-header').boundingBox(),firstHeader);
  await page.evaluate(() => window.scrollEditor.destroy());
});

test('light/dark defaults and inherited host theme tokens cover toolbar, canvas and sidebar', async t => {
  const page = await pageFor(t);
  const root = page.locator('.etch');
  const colors = () => root.evaluate(el => ({background:getComputedStyle(el).backgroundColor,
    ink:getComputedStyle(el).color, canvas:getComputedStyle(el.querySelector('.etch-viewport')).backgroundColor}));
  await page.emulateMedia({colorScheme:'light'}); const light = await colors();
  await page.emulateMedia({colorScheme:'dark'}); const dark = await colors();
  assert.notEqual(light.background,dark.background); assert.notEqual(light.ink,dark.ink);
  assert.equal(light.canvas,'rgb(255, 255, 255)'); assert.equal(dark.canvas,light.canvas);
  await page.locator('#editor').evaluate(el => {
    el.style.setProperty('--etch-bg','#112233'); el.style.setProperty('--etch-ink','#ddeeff');
    el.style.setProperty('--etch-canvas','#223344');
  });
  await root.getByRole('button',{name:'Toggle sidebar',exact:true}).click();
  assert.deepEqual(await colors(),{background:'rgb(17, 34, 51)',ink:'rgb(221, 238, 255)',canvas:'rgb(34, 51, 68)'});
  assert.equal(await root.locator('.etch-sidebar').evaluate(el => getComputedStyle(el).backgroundColor),'rgb(17, 34, 51)');
});
