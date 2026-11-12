import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
import {fixture} from '../test/helpers.js';

const name = process.env.ETCH_LAYER_BROWSER ?? 'chromium';
if (!['chromium','firefox'].includes(name)) throw new Error('ETCH_LAYER_BROWSER must be chromium or firefox');
const runtime = useBrowser(name);
function native() {const d = fixture();d.layers.push({id:'drawing',name:'Drawing',visible:true,locked:false,offset:[20,30],elements:[{...d.layers[0].elements[2],id:'upper-rect'}]});return d;}
const root = page => page.locator('#options-card');
const dialog = page => root(page).locator('.etch-layer-dialog');
async function settle(page) {await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));}
async function pageFor(t,{data=native(),options={},mobile=false}={}) {
  const {browser,server} = runtime;
  const context = await browser.newContext({viewport:mobile ? {width:390,height:320} : {width:1280,height:900},hasTouch:mobile}),page = await context.newPage(),errors = [];
  page.on('pageerror',e => errors.push(e.message));page.on('console',m => {if (m.type() === 'error') errors.push(m.text());});t.after(async () => {await context.close();assert.deepEqual(errors,[]);});await page.goto(`${server.origin}/demo/`);await collapseDemoSidebar(page);
  await page.evaluate(async ({data,options,mobile}) => {const {createEtch} = await import('/etch.js'),card = document.createElement('div');card.id = 'options-card';card.style.cssText = mobile ? 'width:320px;height:240px' : 'width:900px;height:450px';document.body.prepend(card);const e = window.optionsEditor = createEtch(card,{...options,sidebarOpen:true});await e.load(data);e.setActiveLayer('layer');e.setViewState({zoom:1,pan:[100,100]});window.optionsChanges = [];e.on('change',event => window.optionsChanges.push(event));}, {data,options,mobile});await settle(page);return page;
}
async function snapshot(page) {return page.evaluate(() => {const e = window.optionsEditor;return {document:e.save(),revision:e.getRevision(),active:e.getActiveLayer(),selection:e.getSelection(),view:e.getViewState(),tool:e.getTool(),undo:e.canUndo(),redo:e.canRedo()};});}

test('Layer options renames with Enter as one command, preserving geometry/assets/view/tool/selection and exact Undo',async t => {
  const page = await pageFor(t);await page.evaluate(() => window.optionsEditor.setSelection(['line']));const before = await snapshot(page);await root(page).getByRole('button',{name:'Layer options',exact:true}).click();assert.equal(await dialog(page).getByRole('textbox',{name:'Layer name',exact:true}).inputValue(),'Original marks');
  await dialog(page).getByRole('textbox',{name:'Layer name',exact:true}).fill('Picture <&> “special”');await page.keyboard.press('Enter');assert.equal(await dialog(page).isVisible(),false);const after = await snapshot(page);assert.equal(after.document.layers[0].name,'Picture <&> “special”');assert.deepEqual(after.document.layers[0].elements,before.document.layers[0].elements);assert.deepEqual(after.document.assets,before.document.assets);assert.deepEqual(after.selection,before.selection);assert.deepEqual(after.view,before.view);assert.equal(after.active,before.active);assert.equal(after.tool,before.tool);assert.deepEqual(await page.evaluate(() => window.optionsChanges.map(e => e.label)),['Rename layer']);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),'Layer options');await root(page).getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual((await snapshot(page)).document,before.document);await root(page).getByRole('button',{name:'Redo',exact:true}).click();assert.deepEqual((await snapshot(page)).document,after.document);
});

test('F2 edits the focused row without changing active layer; Escape/invalid/unchanged names preserve redo and sidebar',async t => {
  const page = await pageFor(t);await page.evaluate(() => {window.optionsEditor.renameLayer('layer','Temporary');window.optionsEditor.undo();window.optionsChanges = [];});const before = await snapshot(page),target = root(page).getByRole('button',{name:'Drawing (1)',exact:true});await target.focus();await page.keyboard.press('F2');assert.match(await dialog(page).getByRole('heading').textContent(),/Drawing/);assert.equal((await snapshot(page)).active,'layer');await dialog(page).getByRole('textbox',{name:'Layer name',exact:true}).fill('Draft');await page.keyboard.press('Escape');assert.deepEqual(await snapshot(page),before);assert.equal(await root(page).getByRole('button',{name:'Toggle sidebar'}).getAttribute('aria-expanded'),'true');
  await root(page).getByRole('button',{name:'Layer options',exact:true}).click();await dialog(page).getByRole('button',{name:'Move layer up',exact:true}).focus();await page.keyboard.press('h');await page.keyboard.press('0');assert.deepEqual(await snapshot(page),before);await dialog(page).getByRole('textbox',{name:'Layer name',exact:true}).fill('   ');await dialog(page).getByRole('button',{name:'Rename layer',exact:true}).click();assert.match(await dialog(page).getByRole('alert').textContent(),/1–80/);assert.deepEqual(await snapshot(page),before);
  await dialog(page).getByRole('textbox',{name:'Layer name',exact:true}).fill('Original marks');await page.keyboard.press('Enter');assert.deepEqual(await snapshot(page),before);assert.deepEqual(await page.evaluate(() => window.optionsChanges),[]);
});

test('Move up/down changes only stacking order, obeys endpoints and independently undoes each step',async t => {
  const page = await pageFor(t),before = await snapshot(page);await root(page).getByRole('button',{name:'Layer options',exact:true}).click();const up = dialog(page).getByRole('button',{name:'Move layer up',exact:true}),down = dialog(page).getByRole('button',{name:'Move layer down',exact:true});assert.equal(await down.isDisabled(),true);await up.click();assert.equal(await up.isDisabled(),true);const raised = await snapshot(page);assert.deepEqual(raised.document.layers,[before.document.layers[1],before.document.layers[0]]);assert.deepEqual(raised.view,before.view);assert.equal(raised.active,before.active);assert.equal(raised.tool,before.tool);
  await down.click();assert.equal(await down.isDisabled(),true);assert.deepEqual((await snapshot(page)).document,before.document);assert.deepEqual(await page.evaluate(() => window.optionsChanges.map(e => e.label)),['Reorder layer','Reorder layer']);await dialog(page).getByRole('button',{name:'Done',exact:true}).click();await root(page).getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual((await snapshot(page)).document,raised.document);await root(page).getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual((await snapshot(page)).document,before.document);
});

test('locked/read-only/busy management is disabled, hidden unlocked layers remain editable and removed targets close safely',async t => {
  const data = native();data.layers[0].locked = true;const locked = await pageFor(t,{data});assert.equal(await root(locked).getByRole('button',{name:'Layer options',exact:true}).isDisabled(),true);await root(locked).getByRole('button',{name:'Original marks (6)',exact:true}).focus();await locked.keyboard.press('F2');assert.equal(await dialog(locked).isVisible(),false);
  const ro = await pageFor(t,{options:{readOnly:true}});assert.equal(await root(ro).getByRole('button',{name:'Layer options',exact:true}).isDisabled(),true);
  const hidden = native();hidden.layers[0].visible = false;const page = await pageFor(t,{data:hidden});await root(page).getByRole('button',{name:'Layer options',exact:true}).click();assert.equal(await dialog(page).isVisible(),true);await page.evaluate(() => window.optionsEditor.deleteLayer('layer'));assert.equal(await dialog(page).isVisible(),false);
  await root(page).getByRole('button',{name:'Layer options',exact:true}).click();await page.evaluate(async () => {const d = window.optionsEditor.save();await window.optionsEditor.load(d);});assert.equal(await dialog(page).isVisible(),false);
});

test('320×240 card retains a full row/properties and the layer dialog scrolls inside a short phone viewport',async t => {
  const page = await pageFor(t,{mobile:true}),card = root(page);const sizes = await card.evaluate(el => {const list = el.querySelector('.etch-layers'),props = el.querySelector('.etch-tool-properties'),body = el.querySelector('.etch-body');return {layers:list.clientHeight,props:props.clientHeight,overflow:body.scrollHeight-body.clientHeight};});assert.ok(sizes.layers >= 40,JSON.stringify(sizes));assert.ok(sizes.props >= 28,JSON.stringify(sizes));assert.ok(sizes.overflow <= 1);
  await card.getByRole('button',{name:'Layer options',exact:true}).click();const box = await dialog(page).boundingBox();assert.ok(box.width <= 366 && box.height <= 296);await dialog(page).getByRole('textbox',{name:'Layer name',exact:true}).fill('Phone picture');await dialog(page).getByRole('button',{name:'Rename layer',exact:true}).click();assert.equal((await snapshot(page)).document.layers[0].name,'Phone picture');assert.equal(await card.getByRole('button',{name:'Toggle sidebar'}).getAttribute('aria-expanded'),'true');assert.equal(await card.locator('.etch-toolbar button').count(),17);
});
