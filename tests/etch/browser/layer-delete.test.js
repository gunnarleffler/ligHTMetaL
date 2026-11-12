import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
import {fixture,png} from '../test/helpers.js';

const name = process.env.ETCH_LAYER_BROWSER ?? 'chromium';
if (!['chromium','firefox'].includes(name)) throw new Error('ETCH_LAYER_BROWSER must be chromium or firefox');
const runtime = useBrowser(name);
function native() {
  const d = fixture();d.layers[0].name = 'Picture';
  d.layers.push({id:'drawing',name:'Drawing',visible:true,locked:false,offset:[0,0],elements:[{...d.layers[0].elements.find(e => e.type === 'rect'),id:'upper-rect'}]});return d;
}
const root = page => page.locator('#delete-card');
async function pageFor(t,{data=native(),options={},mobile=false}={}) {
  const {browser,server} = runtime;
  const context = await browser.newContext({viewport:mobile ? {width:390,height:844} : {width:1280,height:900},hasTouch:mobile}),page = await context.newPage(),errors = [];
  page.on('pageerror',e => errors.push(e.message));page.on('console',m => {if (m.type() === 'error') errors.push(m.text());});
  t.after(async () => {await context.close();assert.deepEqual(errors,[]);});
  await page.goto(`${server.origin}/demo/`);await collapseDemoSidebar(page);
  await page.evaluate(async ({data,options,mobile}) => {
    const {createEtch} = await import('/etch.js'),card = document.createElement('div');card.id = 'delete-card';card.style.cssText = mobile ? 'width:320px;height:240px' : 'width:900px;height:450px';document.body.prepend(card);
    const e = window.deleteEditor = createEtch(card,{...options,sidebarOpen:true});if (data) {await e.load(data);e.setActiveLayer(data.layers[0].id);}e.setTool('hand');
    window.deleteChanges = [];e.on('change',event => window.deleteChanges.push(event));
  },{data,options,mobile});await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));return page;
}
async function snapshot(page) {
  return page.evaluate(() => {const e = window.deleteEditor;return {document:e.save(),revision:e.getRevision(),active:e.getActiveLayer(),selection:e.getSelection(),tool:e.getTool(),view:e.getViewState(),undo:e.canUndo(),redo:e.canRedo()};});
}

test('nonempty trash confirms; cancel preserves redo/selection and keyboard acceptance deletes only that row with Undo/redo',async t => {
  const page = await pageFor(t);await page.evaluate(() => {const e = window.deleteEditor;e.translateLayer('layer',[1,0]);e.undo();e.setSelection(['line']);window.deleteChanges = [];});const before = await snapshot(page);
  const trash = root(page).getByRole('button',{name:'Delete layer Drawing',exact:true});
  page.once('dialog',dialog => {assert.equal(dialog.type(),'confirm');assert.match(dialog.message(),/Drawing.*1 mark/);return dialog.dismiss();});await trash.click();assert.deepEqual(await snapshot(page),before);assert.deepEqual(await page.evaluate(() => window.deleteChanges),[]);
  page.once('dialog',dialog => dialog.accept());await trash.focus();await page.keyboard.press('Enter');
  const after = await snapshot(page);assert.deepEqual(after.document.layers.map(l => l.id),['layer']);assert.equal(after.active,before.active);assert.deepEqual(after.view,before.view);assert.equal(after.tool,before.tool);assert.equal(await root(page).getByRole('button',{name:'Toggle sidebar'}).getAttribute('aria-expanded'),'true');
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('etch-layer-select')),true);
  assert.deepEqual(await page.evaluate(() => window.deleteChanges.map(e => e.label)),['Delete layer']);
  await root(page).getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual((await snapshot(page)).document,before.document);
  await root(page).getByRole('button',{name:'Redo',exact:true}).click();assert.deepEqual((await snapshot(page)).document,after.document);
});

test('deleting the active image layer prunes current assets but exact image bytes/active layer return on Undo',async t => {
  for (const onlyLayer of [false,true]) {
    const data = native();if (onlyLayer) data.layers.pop();const page = await pageFor(t,{data}),before = await snapshot(page);page.once('dialog',dialog => dialog.accept());await root(page).getByRole('button',{name:'Delete layer Picture',exact:true}).click();
    const after = await snapshot(page);assert.notEqual(after.active,'layer');if (!onlyLayer) assert.equal(after.active,'drawing');else assert.deepEqual(after.document.layers[0].elements,[]);assert.equal(after.document.assets.length,0);assert.equal(after.document.layers.length,1);
    await root(page).getByRole('button',{name:'Undo',exact:true}).click();const restored = await snapshot(page);assert.deepEqual(restored.document,before.document);assert.equal(restored.active,'layer');
    await root(page).getByRole('button',{name:'Redo',exact:true}).click();assert.deepEqual((await snapshot(page)).document,after.document);
  }
});

test('the last empty layer is replaced without confirmation, with usable focus and one undoable command',async t => {
  const page = await pageFor(t,{data:null}),before = await snapshot(page),dialogs = [];page.on('dialog',dialog => {dialogs.push(dialog.message());return dialog.dismiss();});await root(page).locator('.etch-layer-delete').click();
  const after = await snapshot(page);assert.deepEqual(dialogs,[]);assert.equal(after.document.layers.length,1);assert.notEqual(after.active,before.active);assert.deepEqual(after.document.layers[0].elements,[]);assert.equal(after.document.layers[0].locked,false);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-pressed')),'true');assert.deepEqual(await page.evaluate(() => window.deleteChanges.map(e => e.label)),['Delete layer']);
  await root(page).getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual((await snapshot(page)).document,before.document);await root(page).getByRole('button',{name:'Redo',exact:true}).click();assert.deepEqual((await snapshot(page)).document,after.document);
});

test('locked/read-only/busy trash is disabled; hidden unlocked layers remain deletable',async t => {
  const data = native();data.layers[0].locked = true;data.layers[1].visible = false;const page = await pageFor(t,{data});
  const locked = root(page).getByRole('button',{name:'Delete layer Picture',exact:true});assert.equal(await locked.isDisabled(),true);assert.match(await locked.getAttribute('title'),/Unlock/);
  page.once('dialog',dialog => dialog.accept());await root(page).getByRole('button',{name:'Delete layer Drawing',exact:true}).click();assert.equal((await snapshot(page)).document.layers.length,1);
  const ro = await pageFor(t,{options:{readOnly:true}});for (const button of await root(ro).locator('.etch-layer-delete').all()) assert.equal(await button.isDisabled(),true);
  const busy = await pageFor(t);await busy.evaluate(data => {const old = window.createImageBitmap;window.createImageBitmap = async (...args) => {await new Promise(r => window.releaseDecode = r);return old(...args);};window.pendingImport = window.deleteEditor.importImage(new Blob([Uint8Array.from(atob(data),c => c.charCodeAt(0))])).catch(e => e.code);},png());await busy.waitForFunction(() => Boolean(window.releaseDecode));
  for (const button of await root(busy).locator('.etch-layer-delete').all()) assert.equal(await button.isDisabled(),true);
  await busy.evaluate(async () => {window.deleteEditor.cancel();window.releaseDecode();await window.pendingImport;});assert.equal(await root(busy).getByRole('button',{name:'Delete layer Picture',exact:true}).isEnabled(),true);
});

test('320×240 touch-capable drawer fits every row action and long layer names without horizontal overflow',async t => {
  const data = native();data.layers[0].name = 'A very long picture layer name '.repeat(3).slice(0,80);const page = await pageFor(t,{data,mobile:true}),card = root(page),row = card.locator('.etch-layer').first();
  await row.scrollIntoViewIfNeeded();const minimum = await page.evaluate(() => matchMedia('(pointer:coarse)').matches ? 40 : 28); // Firefox touch emulation retains a fine primary pointer.
  const bounds = await card.locator('.etch-sidebar').boundingBox();for (const button of await row.locator('button').all()) {const b = await button.boundingBox();assert.ok(b.width >= minimum-0.05 && b.height >= minimum-0.05,JSON.stringify({label:await button.getAttribute('aria-label'),b,minimum}));assert.ok(b.x >= bounds.x && b.x+b.width <= bounds.x+bounds.width);}
  assert.equal(await row.locator('.etch-layer-delete').isVisible(),true);assert.ok(await card.locator('.etch-layers').evaluate(el => el.scrollWidth <= el.clientWidth+1));
  assert.ok(await card.locator('.etch-layers').evaluate(el => el.clientHeight >= 40));
});
