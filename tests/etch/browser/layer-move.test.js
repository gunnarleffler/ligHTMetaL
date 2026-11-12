import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
import {fixture,png} from '../test/helpers.js';

const name = process.env.ETCH_LAYER_BROWSER ?? 'chromium';
if (!['chromium','firefox'].includes(name)) throw new Error('ETCH_LAYER_BROWSER must be chromium or firefox');
const runtime = useBrowser(name);
const rect = (id,x,y,width,height,fill) => ({id,type:'rect',transform:[1,0,0,1,0,0],x,y,width,height,fill,stroke:null,strokeWidth:0,lineJoin:'round',miterLimit:4});
const native = () => ({format:'lightmetal-etch',version:1,background:null,assets:[{id:'asset',mime:'image/png',width:1,height:1,data:png()}],layers:[
  {id:'lower',name:'Background',visible:true,locked:false,offset:[10,20],elements:[rect('red',30,40,100,100,'#FF0000'),
    {id:'image',type:'image',transform:[1,0,0,1,0,0],assetId:'asset',x:200,y:40,width:50,height:50,alt:'Original blue alpha pixel'}]},
  {id:'upper',name:'Foreground',visible:true,locked:false,offset:[0,0],elements:[rect('blue',100,60,80,100,'#0000FF')]},
]});
const root = page => page.locator('#move-card');
const viewport = page => root(page).locator('.etch-viewport');
async function settle(page) {await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));}
async function pageFor(t,{data=native(),options={},contextOptions={},tool='move-layer'} = {}) {
  const context = await runtime.browser.newContext({viewport:{width:1280,height:900},...contextOptions}),page = await context.newPage(),errors = [],external = [];
  page.on('pageerror',e => errors.push(e.message));page.on('console',m => {if (m.type() === 'error') errors.push(m.text());});
  page.on('request',r => {if (!r.url().startsWith(runtime.server.origin+'/') && !/^(blob:|data:)/.test(r.url())) external.push(r.url());});
  t.after(async () => {await context.close();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});
  await page.goto(`${runtime.server.origin}/demo/`);await collapseDemoSidebar(page);
  await page.evaluate(async ({data,options,tool}) => {
    const {createEtch} = await import('/etch.js'),card = document.createElement('div');card.id = 'move-card';card.style.cssText = 'width:900px;height:450px';document.body.prepend(card);
    const e = window.layerEditor = createEtch(card,options);await e.load(data);e.setActiveLayer('lower');e.setViewState({zoom:1,pan:[0,0]});e.setTool(tool);
    window.layerChanges = [];window.layerErrors = [];e.on('change',e => window.layerChanges.push(e));e.on('error',e => window.layerErrors.push(e));
    card.querySelector('.etch-viewport').addEventListener('pointerdown',e => {window.layerPointerId = e.pointerId;});
  },{data,options,tool});await settle(page);return page;
}
async function begin(page,x=20,y=80) {
  // The fixture card is prepended. Settle Firefox's asynchronous focus/host-input
  // scrolling before capturing a CSS displacement; do not weaken exact offset checks.
  await page.evaluate(() => window.scrollTo({top:0,left:0,behavior:'instant'}));await settle(page);
  const box = await viewport(page).boundingBox();await page.mouse.move(box.x+x,box.y+y);await page.mouse.down();return box;
}
async function save(page) {return page.evaluate(() => window.layerEditor.save());}
async function pixel(page,canvas,x,y) {return root(page).locator(`.etch-${canvas}`).evaluate((c,[x,y]) => {
  const box = c.getBoundingClientRect();return [...c.getContext('2d').getImageData(Math.floor(x*c.width/box.width),Math.floor(y*c.height/box.height),1,1).data];
},[x,y]);}

test('drag anywhere moves only the active layer, preserves upper painter order/PNG pixels, saves committed-only and undoes/reopens exactly',async t => {
  const page = await pageFor(t,{contextOptions:{deviceScaleFactor:2}});
  await page.evaluate(() => {window.layerEditor.setViewState({zoom:2,pan:[30,20]});window.layerBefore = window.layerEditor.save();window.layerRevision = window.layerEditor.getRevision();});await settle(page);
  const before = await save(page),view = await page.evaluate(() => window.layerEditor.getViewState());
  const alpha = await pixel(page,'committed',460,150);assert.ok(alpha[3] > 0 && alpha[3] < 255);
  const box = await begin(page,20,90);await page.mouse.move(box.x+120,box.y+50,{steps:5});await settle(page);
  assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => window.layerEditor.getRevision() === window.layerRevision && !window.layerEditor.canUndo() && !window.layerChanges.length),true);
  assert.equal((await pixel(page,'live',130,150))[3],0);assert.deepEqual(await pixel(page,'live',220,120),[255,0,0,255]);
  assert.deepEqual(await pixel(page,'live',250,180),[0,0,255,255]);assert.deepEqual(await pixel(page,'live',560,110),alpha);
  const wet = await root(page).locator('.etch-live').evaluate(c => c.toDataURL());await page.mouse.up();await settle(page);
  const after = await save(page);assert.deepEqual(after.layers[0].offset,[60,0]);assert.deepEqual(after.layers[0].elements,before.layers[0].elements);
  assert.deepEqual(after.layers[1],before.layers[1]);assert.deepEqual(after.assets,before.assets);assert.equal(after.background,before.background);
  assert.deepEqual(await page.evaluate(() => window.layerEditor.getViewState()),view);assert.equal(await page.evaluate(() => window.layerChanges.length),1);
  assert.equal(await root(page).locator('.etch-committed').evaluate(c => c.toDataURL()),wet);
  await page.evaluate(() => window.layerEditor.undo());assert.deepEqual(await save(page),before);
  await page.evaluate(() => window.layerEditor.redo());await settle(page);assert.deepEqual(await save(page),after);
  assert.equal(await root(page).locator('.etch-committed').evaluate(c => c.toDataURL()),wet);
  await page.evaluate(async () => {await window.layerEditor.load(window.layerEditor.save());});await settle(page);
  assert.equal(await root(page).locator('.etch-committed').evaluate(c => c.toDataURL()),wet);
  assert.deepEqual(await page.evaluate(() => window.layerChanges.map(e => [e.label,e.source])),[['Move layer','edit'],['Move layer','undo'],['Move layer','redo']]);
});

test('real capture follows a layer drag outside the viewport with zoom-correct world displacement',async t => {
  const page = await pageFor(t);
  for (const zoom of [0.5,8]) {
    await page.evaluate(async ({data,zoom}) => {await window.layerEditor.load(data);window.layerEditor.setActiveLayer('lower');window.layerEditor.setViewState({zoom,pan:[17,-31]});window.layerChanges = [];},{data:native(),zoom});await settle(page);
    const box = await begin(page,30,90);await page.mouse.move(box.x+1000,box.y+160,{steps:5});await settle(page);await page.mouse.up();await settle(page);
    const d = await save(page);assert.deepEqual(d.layers[0].offset,[10+970/zoom,20+70/zoom]);assert.deepEqual(d.layers[1],native().layers[1]);
    assert.equal(await page.evaluate(() => window.layerChanges.length),1);assert.equal(await viewport(page).evaluate(el => el.hasPointerCapture(window.layerPointerId)),false);
  }
});

test('Move Layer UI names its target, keeps sidebar/tool/preferences independent and moves a layer chosen in Layers',async t => {
  const page = await pageFor(t,{tool:'pen'}),card = root(page);
  await page.evaluate(() => {window.layerEditor.setToolSettings('pen',{width:13,color:'#112233'});window.layerEditor.setToolSettings('rect',{fill:'#ABCDEF'});});
  await card.getByRole('button',{name:'Move Layer',exact:true}).click();assert.equal(await card.locator('.etch-sidebar').isVisible(),false);
  assert.match(await card.locator('.etch-status').textContent(),/Background/);
  await card.getByRole('button',{name:'Toggle sidebar',exact:true}).click();await settle(page);
  const revision = await page.evaluate(() => window.layerEditor.getRevision()),view = await page.evaluate(() => window.layerEditor.getViewState());
  await card.getByRole('button',{name:'Foreground (1)',exact:true}).click();assert.equal(await page.evaluate(() => window.layerEditor.getTool()),'move-layer');
  assert.match(await card.locator('.etch-status').textContent(),/Foreground/);assert.equal(await card.locator('.etch-move-target').textContent(),'Layer: Foreground');
  assert.equal(await card.getByRole('spinbutton').count(),0);assert.deepEqual(await page.evaluate(() => window.layerEditor.getToolSettings('move-layer')),{});
  await card.getByRole('checkbox',{name:'Move with finger',exact:true}).check();
  await card.getByRole('button',{name:'Pen',exact:true}).click();assert.equal(await card.getByRole('checkbox',{name:'Draw with finger'}).isChecked(),true);
  assert.equal(await card.getByRole('spinbutton',{name:'Pen width'}).inputValue(),'13');
  await card.getByRole('button',{name:'Move Layer',exact:true}).click();await card.getByRole('button',{name:'Background (2)',exact:true}).click();
  assert.match(await card.locator('.etch-status').textContent(),/Background/);await card.getByRole('button',{name:'Foreground (1)',exact:true}).click();
  assert.equal(await page.evaluate(() => window.layerEditor.getRevision()),revision);assert.deepEqual(await page.evaluate(() => window.layerEditor.getViewState()),view);
  assert.equal(await page.evaluate(() => window.layerChanges.length),0);assert.deepEqual(await page.evaluate(() => window.layerEditor.getToolSettings('rect')),{stroke:'#24292F',strokeWidth:2,fill:'#ABCDEF'});
  const box = await begin(page);await page.mouse.move(box.x+60,box.y+110);await page.mouse.up();await settle(page);
  const d = await save(page);assert.deepEqual(d.layers[1].offset,[40,30]);assert.deepEqual(d.layers[0],native().layers[0]);
  assert.match(await card.locator('.etch-status').textContent(),/Foreground/);assert.equal(await card.getByRole('button',{name:'Toggle sidebar'}).getAttribute('aria-expanded'),'true');
});

test('tap/jitter/retracted layer drags preserve selection, redo, revision, native content and history',async t => {
  const page = await pageFor(t);
  await page.evaluate(() => {const e = window.layerEditor;e.translateLayer('lower',[10,0]);e.undo();e.setSelection(['red']);window.layerRevision = e.getRevision();window.layerChanges = [];});
  const before = await save(page);
  for (const end of [[20,80],[21,80],[20,80]]) {
    const box = await begin(page);await page.mouse.move(box.x+100,box.y+120);await settle(page);await page.mouse.move(box.x+end[0],box.y+end[1]);await page.mouse.up();await settle(page);
    assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => window.layerEditor.getRevision() === window.layerRevision && window.layerEditor.canRedo() && !window.layerChanges.length),true);
    assert.deepEqual(await page.evaluate(() => window.layerEditor.getSelection()),['red']);assert.equal(await root(page).locator('.etch-live').isVisible(),false);
  }
});

test('layer move previews roll back on cancellation, capture/focus loss, resize, tool/layer/view/content/load changes',async t => {
  const page = await pageFor(t);
  for (const action of ['escape','pointercancel','capture','blur','focus','resize','tool','layer','view','lock','load','cancel']) {
    await page.evaluate(async data => {const e = window.layerEditor;await e.load(data);e.setActiveLayer('lower');e.setTool('move-layer');e.setViewState({zoom:1,pan:[0,0]});window.layerChanges = [];},native());await settle(page);
    const box = await begin(page);await page.mouse.move(box.x+100,box.y+120);await settle(page);assert.equal(await root(page).locator('.etch-live').isVisible(),true,action);
    if (action === 'escape') await page.keyboard.press('Escape');
    else if (action === 'capture') {await viewport(page).evaluate(el => el.releasePointerCapture(window.layerPointerId));await page.mouse.move(box.x+101,box.y+120);}
    else await page.evaluate(async action => {
      const e = window.layerEditor,el = document.querySelector('#move-card .etch-viewport');
      if (action === 'pointercancel') el.dispatchEvent(new PointerEvent('pointercancel',{pointerId:window.layerPointerId,pointerType:'mouse'}));
      if (action === 'blur') window.dispatchEvent(new Event('blur'));
      if (action === 'focus') document.querySelector('#native').focus();
      if (action === 'resize') document.querySelector('#move-card').style.width = '800px';
      if (action === 'tool') e.setTool('pen');
      if (action === 'layer') e.setActiveLayer('upper');
      if (action === 'view') e.setViewState({zoom:2});
      if (action === 'lock') e.setLayerLocked('lower',true);
      if (action === 'load') {try {await e.load('{');} catch { /* Failed loads still cancel gestures. */ }}
      if (action === 'cancel') e.cancel();
    },action);
    await settle(page);const expected = await save(page),revision = await page.evaluate(() => window.layerEditor.getRevision());
    await page.mouse.up();await settle(page);assert.deepEqual(await save(page),expected,action);assert.deepEqual(expected.layers[0].offset,[10,20],action);
    assert.equal(await page.evaluate(() => window.layerEditor.getRevision()),revision,action);
    assert.equal(await page.evaluate(() => window.layerChanges.some(e => e.label === 'Move layer')),false,action);
    assert.equal(await root(page).locator('.etch-live').isVisible(),false,action);assert.equal(await viewport(page).evaluate(el => el.hasPointerCapture(window.layerPointerId)),false,action);
  }
});

test('read-only/hidden/locked layers cannot be moved and M respects editability and host text input',async t => {
  for (const mode of ['readOnly','locked','hidden']) {
    const page = await pageFor(t,{options:{readOnly:mode === 'readOnly'}});
    await page.evaluate(mode => {const e = window.layerEditor;if (mode === 'locked') e.setLayerLocked('lower',true);if (mode === 'hidden') e.setLayerVisibility('lower',false);e.setTool('hand');window.layerChanges = [];},mode);
    await viewport(page).focus();await page.keyboard.press('m');assert.equal(await page.evaluate(() => window.layerEditor.getTool()),'hand');
    await page.evaluate(() => window.layerEditor.setTool('move-layer'));assert.equal(await root(page).getByRole('button',{name:'Move Layer',exact:true}).isDisabled(),true);
    const before = await save(page),revision = await page.evaluate(() => window.layerEditor.getRevision());
    const box = await begin(page);await page.mouse.move(box.x+100,box.y+120);await page.mouse.up();await settle(page);
    assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => window.layerEditor.getRevision()),revision);assert.equal(await page.evaluate(() => window.layerChanges.length),0);
    if (mode !== 'readOnly') assert.equal(await page.evaluate(() => window.layerErrors.at(-1).code),'LAYER_NOT_EDITABLE');
  }
});

test('invalid painted world placement cancels the entire move with feedback, then a valid move succeeds',async t => {
  const data = native();data.layers[0].offset = [9_999_700,0];const page = await pageFor(t,{data});
  await page.evaluate(() => window.layerEditor.setViewState({zoom:1,pan:[-9_999_700,0]}));await settle(page);
  const before = await save(page),revision = await page.evaluate(() => window.layerEditor.getRevision());
  const box = await begin(page);await page.mouse.move(box.x+100,box.y+100);await settle(page);await page.mouse.up();await settle(page);
  assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => window.layerEditor.getRevision()),revision);
  assert.equal(await page.evaluate(() => window.layerErrors.length),1);assert.equal(await page.evaluate(() => window.layerErrors[0].code),'INVALID_DOCUMENT');
  assert.equal(await page.evaluate(() => window.layerChanges.length),0);assert.equal(await root(page).locator('.etch-live').isVisible(),false);
  const next = await begin(page,50,80);await page.mouse.move(next.x+30,next.y+80);await page.mouse.up();await settle(page);
  assert.deepEqual((await save(page)).layers[0].offset,[9_999_680,0]);assert.equal(await page.evaluate(() => window.layerChanges.length),1);
});

test('empty layers can move, and subsequent Pen marks use the moved layer-local origin',async t => {
  const data = native();data.layers.push({id:'empty',name:'Empty',visible:true,locked:false,offset:[0,0],elements:[]});
  const page = await pageFor(t,{data});await page.evaluate(() => window.layerEditor.setActiveLayer('empty'));
  const box = await begin(page);await page.mouse.move(box.x+70,box.y+110);await page.mouse.up();await settle(page);
  assert.deepEqual((await save(page)).layers[2].offset,[50,30]);assert.match(await root(page).locator('.etch-status').textContent(),/Empty/);
  await page.evaluate(() => window.layerEditor.setTool('pen'));await page.mouse.click(box.x+100,box.y+100);await settle(page);
  const stroke = (await save(page)).layers[2].elements[0];assert.deepEqual(stroke.points,[[50,70,1]]);
  assert.deepEqual(await pixel(page,'committed',100,100),[36,41,47,255]);assert.equal(await page.evaluate(() => window.layerChanges.length),2);
});

test('Move Layer and Hand remain distinct; Space/middle/wheel navigation never translates native layers',async t => {
  const page = await pageFor(t),before = await save(page);await viewport(page).focus();await page.keyboard.press('h');await page.keyboard.press('m');
  assert.equal(await page.evaluate(() => window.layerEditor.getTool()),'move-layer');
  await page.locator('#native').focus();await page.keyboard.press('h');await page.keyboard.press('m');assert.equal(await page.evaluate(() => window.layerEditor.getTool()),'move-layer');
  // Let Firefox finish returning focus/scroll from the host textarea before
  // holding Space; focus-loss cancellation must not race this navigation check.
  await viewport(page).focus();await page.evaluate(() => window.scrollTo({top:0,left:0,behavior:'instant'}));await settle(page);
  await page.keyboard.down('Space');let box = await begin(page);await page.mouse.move(box.x+60,box.y+100);await page.mouse.up();await page.keyboard.up('Space');
  assert.deepEqual(await page.evaluate(() => window.layerEditor.getViewState().pan),[40,20]);assert.equal(await page.evaluate(() => window.layerEditor.getTool()),'move-layer');
  await page.mouse.move(box.x+20,box.y+80);await page.mouse.down({button:'middle'});await page.mouse.move(box.x+40,box.y+80);await page.mouse.up({button:'middle'});
  assert.deepEqual(await page.evaluate(() => window.layerEditor.getViewState().pan),[60,20]);assert.deepEqual(await save(page),before);
  box = await begin(page);await page.mouse.move(box.x+100,box.y+120);await page.mouse.wheel(20,100);await settle(page);
  assert.deepEqual(await page.evaluate(() => window.layerEditor.getViewState().pan),[60,20]);await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await save(page),before);
  assert.equal(await page.evaluate(() => window.layerChanges.length),0);
});

test('busy load cancels layer moves and destroy releases a pointer with a queued preview',async t => {
  const page = await pageFor(t);const before = await save(page);let box = await begin(page);await page.mouse.move(box.x+100,box.y+120);
  await page.evaluate(async data => {
    const original = window.createImageBitmap;window.originalLayerDecode = original;let release;const gate = new Promise(r => {release = r;});window.releaseLayerDecode = release;
    window.createImageBitmap = async (...args) => {await gate;return original(...args);};window.layerPendingLoad = window.layerEditor.load(data);
  },fixture());
  assert.deepEqual(await save(page),before);assert.equal(await root(page).getByRole('button',{name:'Move Layer',exact:true}).isDisabled(),true);
  await page.mouse.up();box = await begin(page);await page.mouse.move(box.x+100,box.y+120);await page.mouse.up();assert.deepEqual(await save(page),before);
  await page.evaluate(async () => {window.releaseLayerDecode();await window.layerPendingLoad;window.createImageBitmap = window.originalLayerDecode;});await settle(page);
  await begin(page);await page.evaluate(() => {
    const el = document.querySelector('#move-card .etch-viewport'),b = el.getBoundingClientRect();window.deadLayerRoot = document.querySelector('#move-card .etch');
    el.dispatchEvent(new PointerEvent('pointermove',{pointerId:window.layerPointerId,pointerType:'mouse',buttons:1,clientX:b.left+100,clientY:b.top+120}));window.layerEditor.destroy();
  });await page.mouse.up();await settle(page);
  assert.equal(await root(page).evaluate(el => el.childElementCount),0);
  assert.equal(await page.evaluate(() => {window.deadLayerRoot.dispatchEvent(new KeyboardEvent('keydown',{key:'m',bubbles:true}));try {window.layerEditor.getTool();} catch (e) {return e.code;}}),'DESTROYED');
  assert.equal(await page.evaluate(() => window.layerChanges.length),0);
});

test('enlarged public demo is responsive and its sample layers can be moved and saved through the real UI',async t => {
  const page = await pageFor(t);await page.evaluate(() => {window.layerEditor.destroy();document.querySelector('#move-card').remove();});await settle(page);
  let card = page.locator('#editor'),b = await card.boundingBox();assert.ok(b.width > 1100);assert.ok(b.height >= 600);
  await page.setViewportSize({width:1920,height:1080});await settle(page);b = await card.boundingBox();assert.ok(b.width > 1300 && b.width <= 1440);assert.ok(b.height > 850 && b.height <= 1000);
  await page.setViewportSize({width:390,height:844});await settle(page);b = await card.boundingBox();assert.ok(b.width <= 390 && b.height >= 480 && b.height <= 760);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),true);
  await page.getByRole('button',{name:'Load sample drawing',exact:true}).click();await page.waitForFunction(() => document.querySelector('#save-status').textContent.startsWith('Loaded baseline'));await settle(page);
  const before = JSON.parse(await page.locator('#native').inputValue()),layer = before.layers.find(l => l.visible && !l.locked && l.elements.length);
  await card.getByRole('button',{name:'Toggle sidebar',exact:true}).click();await card.getByRole('button',{name:`${layer.name} (${layer.elements.length})`,exact:true}).click();
  await card.getByRole('button',{name:'Move Layer',exact:true}).click();assert.ok((await card.locator('.etch-status').textContent()).includes(layer.name));
  await card.getByRole('button',{name:'Toggle sidebar',exact:true}).click();await card.locator('.etch-viewport').scrollIntoViewIfNeeded();b = await card.locator('.etch-viewport').boundingBox();
  await page.mouse.move(b.x+20,b.y+80);await page.mouse.down();await page.mouse.move(b.x+60,b.y+110,{steps:3});await page.mouse.up();await settle(page);
  await page.getByRole('button',{name:'Save snapshot',exact:true}).click();const after = JSON.parse(await page.locator('#native').inputValue());
  const moved = after.layers.find(l => l.id === layer.id);assert.notDeepEqual(moved.offset,layer.offset);assert.deepEqual(moved.elements,layer.elements);
  assert.deepEqual(after.layers.filter(l => l.id !== layer.id),before.layers.filter(l => l.id !== layer.id));assert.deepEqual(after.assets,before.assets);assert.equal(after.background,before.background);
});

test('minimum-size coarse-pointer editor keeps every toolbar action, the named layer and finger control usable',async t => {
  const data = native();data.layers[0].name = `Layer ${'x'.repeat(74)}`;
  const page = await pageFor(t,{data,contextOptions:{hasTouch:true,viewport:{width:320,height:700}}}),card = root(page);
  await card.evaluate(el => {el.style.width = '320px';el.style.height = '240px';});await settle(page);
  const bounds = await card.boundingBox(),buttons = card.locator('.etch-toolbar button');assert.equal(await buttons.count(),17);
  for (const button of await buttons.all()) {await button.scrollIntoViewIfNeeded();const b = await button.boundingBox();assert.ok(b.x >= bounds.x && b.x+b.width <= bounds.x+bounds.width,await button.getAttribute('aria-label'));}
  await card.getByRole('button',{name:'Toggle sidebar',exact:true}).click();await settle(page);
  assert.ok((await card.locator('.etch-status').getAttribute('title')).includes(data.layers[0].name));
  await card.getByRole('checkbox',{name:'Move with finger',exact:true}).check();
  const sizes = await card.evaluate(el => {
    const layers = el.querySelector('.etch-layers'),props = el.querySelector('.etch-properties-content'),body = el.querySelector('.etch-body');
    layers.scrollTop = layers.scrollHeight;props.scrollTop = props.scrollHeight;
    return {layers:layers.clientHeight,props:props.parentElement.clientHeight,layerScroll:layers.scrollTop,propScroll:props.scrollTop,wide:props.scrollWidth-props.clientWidth,overflow:body.scrollHeight-body.clientHeight};
  });assert.ok(sizes.layers >= 40);assert.ok(sizes.props >= 28);assert.ok(sizes.layerScroll > 0 && sizes.propScroll > 0);assert.ok(sizes.wide <= 1 && sizes.overflow <= 1);
  assert.deepEqual(await save(page),data);assert.equal(await page.evaluate(() => window.layerChanges.length),0);
});

if (name === 'chromium') {
  test('finger-off navigates, finger-on moves layers; a second finger abandons the preview and rebases navigation',async t => {
    const page = await pageFor(t,{options:{drawWithTouch:false},contextOptions:{hasTouch:true}}),box = await viewport(page).boundingBox(),cdp = await page.context().newCDPSession(page);
    const point = (id,x,y=80) => ({id,x:box.x+x,y:box.y+y});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,20)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,40)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.deepEqual((await save(page)).layers[0].offset,[10,20]);assert.deepEqual(await page.evaluate(() => window.layerEditor.getViewState().pan),[20,0]);
    await page.evaluate(() => {window.layerEditor.setDrawWithTouch(true);window.layerEditor.setViewState({zoom:1,pan:[0,0]});});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,20)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,60,110)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.deepEqual((await save(page)).layers[0].offset,[50,50]);assert.equal(await page.evaluate(() => window.layerChanges.length),1);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,20)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,70,100)]});await settle(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,70,100),point(2,170,100)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,90,120),point(2,190,120)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle(page);
    assert.deepEqual((await save(page)).layers[0].offset,[50,50]);assert.equal(await page.evaluate(() => window.layerChanges.length),1);assert.deepEqual(await page.evaluate(() => window.layerEditor.getViewState().pan),[20,20]);
  });
  test('stylus layer movement ignores pressure and incidental palm contacts without creating ink',async t => {
    const page = await pageFor(t),before = await save(page),box = await viewport(page).boundingBox(),cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:box.x+20,y:box.y+80,button:'left',buttons:1,pointerType:'pen',force:0.1});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:box.x+80,y:box.y+100,button:'left',buttons:1,pointerType:'pen',force:1});
    await viewport(page).evaluate(el => {const b = el.getBoundingClientRect();for (const type of ['pointerdown','pointermove','pointerup']) el.dispatchEvent(new PointerEvent(type,{pointerId:99,pointerType:'touch',button:0,buttons:1,clientX:b.left+200,clientY:b.top+200}));});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x+80,y:box.y+100,button:'left',buttons:0,pointerType:'pen',force:0});await settle(page);
    const after = await save(page);assert.deepEqual(after.layers[0].offset,[70,40]);assert.deepEqual(after.layers[0].elements,before.layers[0].elements);assert.deepEqual(after.layers[1],before.layers[1]);
    assert.deepEqual(await page.evaluate(() => window.layerEditor.getViewState().pan),[0,0]);assert.equal(await page.evaluate(() => window.layerChanges.length),1);
  });
}
