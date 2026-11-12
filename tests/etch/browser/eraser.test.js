import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
import {png} from '../test/helpers.js';
const name = process.env.ETCH_ERASER_BROWSER ?? 'chromium';
if (!['chromium','firefox'].includes(name)) throw new Error('ETCH_ERASER_BROWSER must be chromium or firefox');
const runtime = useBrowser(name);
const matrix = [1,0,0,1,0,0];
const rect = (id,x,y,width,height,fill='#FF0000') => ({id,type:'rect',transform:matrix,x,y,width,height,fill,stroke:fill ? null : '#0000FF',strokeWidth:fill ? 0 : 2,lineJoin:'round',miterLimit:4});
const line = (id,x) => ({id,type:'line',transform:matrix,start:[x,40],end:[x,100],stroke:'#0000FF',strokeWidth:1,lineCap:'butt'});
const native = () => ({format:'lightmetal-etch',version:1,background:null,assets:[{id:'asset',mime:'image/png',width:1,height:1,data:png()}],layers:[
  {id:'floor',name:'Underneath',visible:true,locked:false,offset:[0,0],elements:[rect('paper',20,20,620,260)]},
  {id:'ink',name:'Erase here',visible:true,locked:false,offset:[0,0],elements:[line('a',80),line('b',160),rect('outline',240,40,80,80,null),
    {id:'ellipse',type:'ellipse',transform:matrix,cx:380,cy:80,rx:30,ry:20,fill:'#0000FF',stroke:null,strokeWidth:0},
    {id:'path',type:'path',transform:matrix,commands:[['M',440,100],['Q',470,20,500,100]],fill:null,fillRule:'nonzero',stroke:'#0000FF',strokeWidth:3,lineCap:'butt',lineJoin:'miter',miterLimit:4},
    {id:'image',type:'image',transform:matrix,x:560,y:40,width:50,height:50,assetId:'asset',alt:'Original alpha PNG'},
    {id:'pressure',type:'stroke',transform:matrix,points:[[80,180,0.1],[140,230,0.9],[200,180,0.4]],color:'#0000FF',width:12,pressure:true}]},
  {id:'upper',name:'Above',visible:true,locked:false,offset:[0,0],elements:[rect('cover',150,50,20,40,'#111111')]},
]});
const root = page => page.locator('#eraser-card');
const viewport = page => root(page).locator('.etch-viewport');
async function settle(page) {await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));}
async function pageFor(t,{data=native(),options={},contextOptions={},tool='eraser'}={}) {
  const context = await runtime.browser.newContext({viewport:{width:1280,height:900},...contextOptions}),page = await context.newPage(),errors = [],external = [];
  page.on('pageerror',e => errors.push(e.message));page.on('console',m => {if (m.type() === 'error') errors.push(m.text());});
  page.on('request',r => {if (!r.url().startsWith(runtime.server.origin+'/') && !/^(blob:|data:)/.test(r.url())) external.push(r.url());});
  t.after(async () => {await context.close();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});
  await page.goto(`${runtime.server.origin}/demo/`);await collapseDemoSidebar(page);
  await page.evaluate(async ({data,options,tool}) => {
    const {createEtch} = await import('/etch.js'),card = document.createElement('div');card.id = 'eraser-card';card.style.cssText = 'width:900px;height:460px';document.body.prepend(card);
    const e = window.eraseEditor = createEtch(card,options);await e.load(data);e.setActiveLayer('ink');e.setViewState({zoom:1,pan:[0,0]});e.setTool(tool);e.setToolSettings('eraser',{mode:'object',radius:2});
    window.eraseChanges = [];window.eraseErrors = [];e.on('change',e => window.eraseChanges.push(e));e.on('error',e => window.eraseErrors.push(e));
    card.querySelector('.etch-viewport').addEventListener('pointerdown',e => {window.erasePointerId = e.pointerId;});
  },{data,options,tool});await settle(page);return page;
}
async function save(page) {return page.evaluate(() => window.eraseEditor.save());}
async function ids(page) {return page.evaluate(() => window.eraseEditor.save().layers.find(l => l.id === 'ink').elements.map(e => e.id));}
async function begin(page,x=20,y=70) {await viewport(page).scrollIntoViewIfNeeded();const box = await viewport(page).boundingBox();await page.mouse.move(box.x+x,box.y+y);await page.mouse.down();return box;}
async function tap(page,x,y) {const b = await viewport(page).boundingBox();await page.mouse.click(b.x+x,b.y+y);await settle(page);}
async function restore(page,data=native()) {
  await page.evaluate(async data => {const e = window.eraseEditor;await e.load(data);e.setActiveLayer('ink');e.setViewState({zoom:1,pan:[0,0]});e.setTool('eraser');e.setToolSettings('eraser',{mode:'object',radius:2});window.eraseChanges = [];window.eraseErrors = [];},data);await settle(page);
}
async function pixel(page,canvas,x,y) {return root(page).locator(`.etch-${canvas}`).evaluate((c,[x,y]) => {const b = c.getBoundingClientRect();return [...c.getContext('2d').getImageData(Math.floor(x*c.width/b.width),Math.floor(y*c.height/b.height),1,1).data];},[x,y]);}

test('fast DPR-2 sweep previews lower-layer omissions, preserves upper painter order, commits once and restores original order on undo/reopen',async t => {
  const page = await pageFor(t,{contextOptions:{deviceScaleFactor:2}});await page.evaluate(() => window.eraseEditor.setSelection(['a','outline']));
  const before = await save(page),revision = await page.evaluate(() => window.eraseEditor.getRevision());
  const box = await begin(page);await page.mouse.move(box.x+210,box.y+70);await settle(page);
  assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => window.eraseEditor.getRevision()),revision);assert.equal(await page.evaluate(() => window.eraseChanges.length),0);
  assert.deepEqual(await pixel(page,'live',80,70),[255,0,0,255]);assert.deepEqual(await pixel(page,'live',160,70),[17,17,17,255]);
  const wet = await root(page).locator('.etch-live').evaluate(c => c.toDataURL());await page.mouse.up();await settle(page);
  const after = await save(page);assert.deepEqual(await ids(page),['outline','ellipse','path','image','pressure']);
  assert.deepEqual(after.layers[0],before.layers[0]);assert.deepEqual(after.layers[2],before.layers[2]);assert.deepEqual(after.assets,before.assets);
  assert.deepEqual(after.layers[1].offset,before.layers[1].offset);assert.deepEqual(await page.evaluate(() => window.eraseEditor.getSelection()),['outline']);
  assert.equal(await page.evaluate(() => window.eraseChanges.length),1);assert.equal(await page.evaluate(() => window.eraseChanges[0].label),'Erase objects');
  assert.equal(await root(page).locator('.etch-committed').evaluate(c => c.toDataURL()),wet);
  await page.evaluate(() => window.eraseEditor.undo());assert.deepEqual(await save(page),before);await page.evaluate(() => window.eraseEditor.redo());assert.deepEqual(await save(page),after);
  await page.evaluate(async () => {await window.eraseEditor.load(window.eraseEditor.save());});await settle(page);assert.deepEqual(await save(page),after);
  assert.equal(await root(page).locator('.etch-committed').evaluate(c => c.toDataURL()),wet);
});

test('coalesced bends and pointer-up batches are swept in order even when parent/frame endpoints miss all marks',async t => {
  const page = await pageFor(t);const box = await begin(page,20,140);
  await viewport(page).evaluate(el => {
    const b = el.getBoundingClientRect(),id = window.erasePointerId;
    const make = (x,y,type='pointermove') => new PointerEvent(type,{pointerId:id,pointerType:'mouse',buttons:type === 'pointerup' ? 0 : 1,clientX:b.left+x,clientY:b.top+y});
    const outer = make(210,140),batch = [make(80,70),make(160,70),make(210,140)];Object.defineProperty(outer,'getCoalescedEvents',{value:() => batch});el.dispatchEvent(outer);
    const up = make(210,140,'pointerup');Object.defineProperty(up,'getCoalescedEvents',{value:() => [make(280,40),make(210,140)]});el.dispatchEvent(up);
  });await page.mouse.up();await settle(page);
  assert.deepEqual(await ids(page),['ellipse','path','image','pressure']);assert.equal(await page.evaluate(() => window.eraseChanges.length),1);
  assert.equal(await viewport(page).evaluate(el => el.hasPointerCapture(window.erasePointerId)),false);
  assert.equal(await root(page).locator('.etch-live').isVisible(),false);assert.ok(box.width > 0);
});

test('taps erase each painted native type, and long sweeps intersect curves rather than just their endpoints',async t => {
  const page = await pageFor(t);
  for (const [id,x,y] of [['outline',240,80],['ellipse',380,80],['path',470,60],['image',585,65],['pressure',140,218]]) {
    await restore(page);const before = await save(page);await tap(page,x,y);assert.equal((await ids(page)).includes(id),false,id);
    assert.equal(await page.evaluate(() => window.eraseChanges.length),1,id);await page.evaluate(() => window.eraseEditor.undo());assert.deepEqual(await save(page),before,id);
  }
  await restore(page);const b = await begin(page,425,80);await page.mouse.move(b.x+520,b.y+80);await page.mouse.up();await settle(page);
  assert.equal((await ids(page)).includes('path'),false);assert.equal(await page.evaluate(() => window.eraseChanges.length),1);
});

test('unfilled interiors, ellipse corners, curve hulls, other layers and native background are not erase targets; misses preserve redo/selection',async t => {
  const page = await pageFor(t);await page.evaluate(() => {const e = window.eraseEditor;e.translateLayer('ink',[1,0]);e.undo();e.setSelection(['outline']);window.eraseChanges = [];});
  const before = await save(page),revision = await page.evaluate(() => window.eraseEditor.getRevision());
  for (const p of [[280,80],[350,60],[470,25],[30,30],[20,350]]) await tap(page,...p);
  assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => window.eraseEditor.getRevision()),revision);
  assert.equal(await page.evaluate(() => window.eraseEditor.canRedo()),true);assert.deepEqual(await page.evaluate(() => window.eraseEditor.getSelection()),['outline']);assert.equal(await page.evaluate(() => window.eraseChanges.length),0);
});

test('correct fill rules and coincident cancelling contours survive swept queries through holes',async t => {
  const data = native(),box = (x,y,w,h) => [['M',x,y],['L',x+w,y],['L',x+w,y+h],['L',x,y+h],['Z']];
  const base = {id:'hole',type:'path',transform:matrix,commands:[...box(40,40,100,100),...box(60,60,60,60)],fill:'#0000FF',fillRule:'evenodd',stroke:null,strokeWidth:0,lineCap:'butt',lineJoin:'miter',miterLimit:4};
  data.layers[1].elements = [base];const page = await pageFor(t,{data});await tap(page,90,90);assert.deepEqual(await ids(page),['hole']);
  const b = await begin(page,70,90);await page.mouse.move(b.x+110,b.y+90);await page.mouse.up();assert.deepEqual(await ids(page),['hole']);
  await tap(page,50,90);assert.deepEqual(await ids(page),[]);
  base.fillRule = 'nonzero';await restore(page,data);await tap(page,90,90);assert.deepEqual(await ids(page),[]);
  base.commands = [...box(40,40,100,100),['M',40,40],['L',40,140],['L',140,140],['L',140,40],['Z']];
  await restore(page,data);const c = await begin(page,20,90);await page.mouse.move(c.x+170,c.y+90);await page.mouse.up();assert.deepEqual(await ids(page),['hole']);
});

test('erasing a PNG releases it from snapshots but undo keeps its decoded alpha pixels; transparent image areas still erase the whole image',async t => {
  const data = native();data.layers[0].elements = [];const page = await pageFor(t,{data});const before = await save(page),rgba = await pixel(page,'committed',585,65);assert.ok(rgba[3] > 0 && rgba[3] < 255);
  await tap(page,585,65);assert.deepEqual((await save(page)).assets,[]);await page.evaluate(() => window.eraseEditor.undo());await settle(page);
  assert.deepEqual(await save(page),before);assert.deepEqual(await pixel(page,'committed',585,65),rgba);
  data.assets[0].data = await page.evaluate(() => {const c = document.createElement('canvas');c.width = c.height = 1;return c.toDataURL().split(',')[1];});
  await restore(page,data);assert.equal((await pixel(page,'committed',585,65))[3],0);await tap(page,585,65);assert.equal((await ids(page)).includes('image'),false);
});

test('radius/cursor remain CSS-sized at every zoom and DPR; preference changes during a gesture affect only its successor',async t => {
  const data = native();data.layers[1].elements = [line('a',80)];const page = await pageFor(t,{data,contextOptions:{deviceScaleFactor:2}});
  for (const zoom of [0.1,1,8]) {
    await restore(page,data);await page.evaluate(zoom => window.eraseEditor.setViewState({zoom,pan:[50-80*zoom,100-70*zoom]}),zoom);await settle(page);
    await tap(page,50+0.5*zoom+4,100);assert.deepEqual(await ids(page),['a']);
    assert.equal(await root(page).locator('.etch-eraser-cursor').evaluate(el => el.getBoundingClientRect().width),4);
    await tap(page,50+0.5*zoom+1,100);assert.deepEqual(await ids(page),[]);
  }
  await restore(page,data);await begin(page,88,70);await page.evaluate(() => window.eraseEditor.setToolSettings('eraser',{radius:20}));await settle(page);
  assert.equal(await root(page).locator('.etch-eraser-cursor').evaluate(el => el.getBoundingClientRect().width),4);
  await page.mouse.up();assert.deepEqual(await ids(page),['a']);await tap(page,88,70);assert.deepEqual(await ids(page),[]);
  assert.equal(await root(page).locator('.etch-eraser-cursor').evaluate(el => el.getBoundingClientRect().width),40);
});

test('affine skew/reflection and layer offsets are tested as painted geometry, not a single inverse scale or transformed bounding box',async t => {
  const data = native();data.layers[1].offset = [30,40];data.layers[1].elements = [rect('outline',0,0,100,100,null)];data.layers[1].elements[0].transform = [1,0.3,2,-0.2,40,50];
  const page = await pageFor(t,{data});await tap(page,220,95);assert.deepEqual(await ids(page),['outline']); // transformed center
  await tap(page,120,105);assert.deepEqual(await ids(page),[]); // transformed upper edge midpoint
});

test('all cancellation boundaries restore omitted objects and never commit a delayed pointer-up',async t => {
  const page = await pageFor(t);
  for (const action of ['escape','pointercancel','capture','blur','focus','resize','tool','layer','view','lock','selection','load','cancel']) {
    await root(page).evaluate(el => {el.style.width = '900px';});await restore(page);const b = await begin(page,80,70);await settle(page);
    assert.deepEqual(await pixel(page,'live',80,70),[255,0,0,255],action);
    if (action === 'escape') await page.keyboard.press('Escape');
    else if (action === 'capture') {await viewport(page).evaluate(el => el.releasePointerCapture(window.erasePointerId));await page.mouse.move(b.x+81,b.y+70);}
    else await page.evaluate(async action => {
      const e = window.eraseEditor,el = document.querySelector('#eraser-card .etch-viewport');
      if (action === 'pointercancel') el.dispatchEvent(new PointerEvent('pointercancel',{pointerId:window.erasePointerId,pointerType:'mouse'}));
      if (action === 'blur') window.dispatchEvent(new Event('blur'));
      if (action === 'focus') document.querySelector('#native').focus();
      if (action === 'resize') document.querySelector('#eraser-card').style.width = '850px';
      if (action === 'tool') e.setTool('pen');if (action === 'layer') e.setActiveLayer('floor');if (action === 'view') e.setViewState({zoom:2});
      if (action === 'lock') e.setLayerLocked('ink',true);if (action === 'selection') e.setSelection(['outline']);
      if (action === 'load') {try {await e.load('{');} catch { /* An invalid load still cancels. */ }}
      if (action === 'cancel') e.cancel();
    },action);await settle(page);const expected = await save(page),revision = await page.evaluate(() => window.eraseEditor.getRevision());
    await page.mouse.up();await settle(page);assert.deepEqual(await save(page),expected,action);assert.equal((await ids(page)).includes('a'),true,action);
    assert.equal(await page.evaluate(() => window.eraseEditor.getRevision()),revision,action);assert.equal(await page.evaluate(() => window.eraseChanges.some(e => e.label === 'Erase objects')),false,action);
    assert.equal(await root(page).locator('.etch-live').isVisible(),false,action);assert.equal(await viewport(page).evaluate(el => el.hasPointerCapture(window.erasePointerId)),false,action);
  }
});

test('sample-limit failures discard the entire accumulated omission set and release ownership; full native capacity still permits erasing',async t => {
  const data = native();data.layers[1].elements = [line('a',80),line('b',160)];
  const page = await pageFor(t,{data,options:{limits:{pointsPerElement:1,elements:4,points:1}}}),before = await save(page),revision = await page.evaluate(() => window.eraseEditor.getRevision());
  const b = await begin(page,80,70);await settle(page);assert.deepEqual(await pixel(page,'live',80,70),[255,0,0,255]);
  await page.mouse.move(b.x+160,b.y+70);await settle(page);await page.mouse.up();assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => window.eraseEditor.getRevision()),revision);
  assert.equal(await page.evaluate(() => window.eraseErrors.length),1);assert.equal(await page.evaluate(() => window.eraseErrors[0].code),'LIMIT_EXCEEDED');
  assert.equal(await page.evaluate(() => window.eraseChanges.length),0);assert.equal(await root(page).locator('.etch-live').isVisible(),false);
  await tap(page,160,70);assert.deepEqual(await ids(page),['a']);assert.equal(await page.evaluate(() => window.eraseChanges.length),1);
});

test('read-only, locked and hidden destinations block E/eraser controls, never erase, and retain normal input shortcuts',async t => {
  for (const mode of ['readOnly','locked','hidden']) {
    const page = await pageFor(t,{options:{readOnly:mode === 'readOnly'}});
    await page.evaluate(mode => {const e = window.eraseEditor;if (mode === 'locked') e.setLayerLocked('ink',true);if (mode === 'hidden') e.setLayerVisibility('ink',false);e.setTool('hand');window.eraseChanges = [];},mode);
    await viewport(page).focus();await page.keyboard.press('e');assert.equal(await page.evaluate(() => window.eraseEditor.getTool()),'hand');
    await page.evaluate(() => window.eraseEditor.setTool('eraser'));assert.equal(await root(page).getByRole('button',{name:'Eraser',exact:true}).isDisabled(),true);
    const before = await save(page);await tap(page,80,70);assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => window.eraseChanges.length),0);
    assert.equal(await root(page).locator('.etch-eraser-cursor').isVisible(),false);if (mode !== 'readOnly') assert.equal(await page.evaluate(() => window.eraseErrors.at(-1).code),'LAYER_NOT_EDITABLE');
  }
});

test('E/UI/preferences stay independent, wheel is blocked during erasing, and Space/middle-drag still navigate without committing',async t => {
  const page = await pageFor(t,{tool:'pen'}),card = root(page);const before = await save(page),revision = await page.evaluate(() => window.eraseEditor.getRevision());
  await card.getByRole('button',{name:'Eraser',exact:true}).click();assert.equal(await card.locator('.etch-sidebar').isVisible(),false);
  await card.getByRole('button',{name:'Toggle sidebar'}).click();await settle(page);assert.equal(await card.getByRole('spinbutton',{name:'Eraser radius'}).inputValue(),'2');
  assert.equal(await card.locator('input[type="color"]').filter({visible:true}).count(),0);
  await card.getByRole('spinbutton',{name:'Eraser radius'}).fill('12');await card.getByRole('spinbutton',{name:'Eraser radius'}).press('Tab');
  await card.getByRole('checkbox',{name:'Erase with finger'}).check();await card.getByRole('button',{name:'Pen',exact:true}).click();assert.equal(await card.getByRole('checkbox',{name:'Draw with finger'}).isChecked(),true);
  await card.getByRole('button',{name:'Toggle sidebar'}).click();await page.locator('#native').focus();await page.keyboard.press('e');assert.equal(await page.evaluate(() => window.eraseEditor.getTool()),'pen');
  await viewport(page).focus();await page.keyboard.press('e');assert.equal(await page.evaluate(() => window.eraseEditor.getTool()),'eraser');
  assert.equal(await page.evaluate(() => window.eraseEditor.getToolSettings('eraser').radius),12);assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => window.eraseEditor.getRevision()),revision);
  await settle(page);const pan = await page.evaluate(() => window.eraseEditor.getViewState().pan);
  const b = await begin(page,80,70);await viewport(page).evaluate(el => {const e = new WheelEvent('wheel',{deltaY:100,ctrlKey:true,cancelable:true});el.dispatchEvent(e);window.eraseWheelBlocked = e.defaultPrevented;});
  assert.equal(await page.evaluate(() => window.eraseWheelBlocked),true);assert.deepEqual(await page.evaluate(() => window.eraseEditor.getViewState().pan),pan);
  await page.keyboard.down('Space');await page.mouse.up();await page.mouse.move(b.x+30,b.y+150);await page.mouse.down();await page.mouse.move(b.x+50,b.y+170);await page.mouse.up();await page.keyboard.up('Space');
  assert.deepEqual(await save(page),before);assert.deepEqual(await page.evaluate(() => window.eraseEditor.getViewState().pan),[pan[0]+20,pan[1]+20]);
  await page.mouse.move(b.x+40,b.y+160);await page.mouse.down({button:'middle'});await page.mouse.move(b.x+50,b.y+160);await page.mouse.up({button:'middle'});
  assert.deepEqual(await page.evaluate(() => window.eraseEditor.getViewState().pan),[pan[0]+30,pan[1]+20]);assert.equal(await page.evaluate(() => window.eraseChanges.length),0);
});

test('busy loads and destroy cancel wet omissions and dispose queued work/cursor/listeners',async t => {
  const page = await pageFor(t);await begin(page,80,70);await settle(page);
  await page.evaluate(data => {const original = window.createImageBitmap;window.originalEraseDecode = original;let release;const gate = new Promise(r => {release = r;});window.releaseEraseDecode = release;
    window.createImageBitmap = async (...args) => {await gate;return original(...args);};window.pendingEraseLoad = window.eraseEditor.load(data);},native());
  assert.equal(await root(page).getByRole('button',{name:'Eraser',exact:true}).isDisabled(),true);assert.equal(await root(page).locator('.etch-eraser-cursor').isVisible(),false);
  await page.mouse.up();await tap(page,80,70);assert.equal(await page.evaluate(() => window.eraseChanges.length),0);
  await page.evaluate(async () => {window.releaseEraseDecode();await window.pendingEraseLoad;window.createImageBitmap = window.originalEraseDecode;});await settle(page);
  await begin(page,80,70);await page.evaluate(() => {window.deadEraseRoot = document.querySelector('#eraser-card .etch');window.eraseEditor.destroy();});await page.mouse.up();await settle(page);
  assert.equal(await root(page).evaluate(el => el.childElementCount),0);assert.equal(await page.evaluate(() => window.eraseChanges.length),0);
  assert.equal(await page.evaluate(() => {window.deadEraseRoot.dispatchEvent(new KeyboardEvent('keydown',{key:'e',bubbles:true}));try {window.eraseEditor.getTool();} catch (e) {return e.code;}}),'DESTROYED');
});

test('all toolbar actions and eraser properties stay usable on narrow coarse-pointer and minimum-height cards',async t => {
  const data = native();for (let i = 0;i < 25;i++) data.layers.push({id:`empty-${i}`,name:`Layer ${i}`,offset:[0,0],visible:true,locked:false,elements:[]});
  const page = await pageFor(t,{data,contextOptions:{hasTouch:true,viewport:{width:600,height:800}}}),card = root(page);
  for (const width of [320,360,366,384,386,388,390,451,500]) {
    await card.evaluate((el,width) => {el.style.width = `${width}px`;el.style.height = '240px';},width);await settle(page);const bounds = await card.boundingBox(),buttons = card.locator('.etch-toolbar button');assert.equal(await buttons.count(),17);
    for (const button of await buttons.all()) {await button.scrollIntoViewIfNeeded();const b = await button.boundingBox();assert.ok(b.x >= bounds.x && b.x+b.width <= bounds.x+bounds.width,`${width}: ${await button.getAttribute('aria-label')}`);assert.ok(b.width >= 32 && b.height >= 32);}
  }
  await card.getByRole('button',{name:'Toggle sidebar'}).click();await settle(page);
  await card.getByRole('spinbutton',{name:'Eraser radius'}).fill('16');await card.getByRole('spinbutton',{name:'Eraser radius'}).press('Tab');
  assert.equal(await page.evaluate(() => window.eraseEditor.getToolSettings('eraser').radius),16);
  const sizes = await card.evaluate(el => {const layers = el.querySelector('.etch-layers'),props = el.querySelector('.etch-properties-content');layers.scrollTop = layers.scrollHeight;props.scrollTop = props.scrollHeight;return {layers:layers.scrollTop,props:props.scrollTop,overflow:props.scrollWidth-props.clientWidth};});
  assert.ok(sizes.layers > 0);assert.ok(sizes.props > 0);assert.ok(sizes.overflow <= 1);assert.equal(await page.evaluate(() => window.eraseChanges.length),0);
});

test('actual public demo selects a sample layer, erases/saves one whole stroke and restores it with Undo',async t => {
  const page = await pageFor(t),card = page.locator('#editor');await page.locator('#sample').click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('#native').value).layers.length === 3);await settle(page);
  const before = JSON.parse(await page.locator('#native').inputValue());
  await card.getByRole('button',{name:'Toggle sidebar'}).click();await card.getByRole('button',{name:'Pressure ink (2)',exact:true}).click();
  await card.getByRole('button',{name:'Eraser',exact:true}).click();await card.getByRole('button',{name:'Toggle sidebar'}).click();await settle(page);
  await card.getByRole('button',{name:'Toggle sidebar'}).click();await card.getByRole('combobox',{name:'Eraser mode'}).selectOption('object');await card.getByRole('button',{name:'Toggle sidebar'}).click();
  const vp = card.locator('.etch-viewport');await vp.scrollIntoViewIfNeeded();
  const point = await vp.evaluate(async el => {
    const {Viewport} = await import('/etch/viewport.js'),{documentBounds} = await import('/etch/geometry/paths.js');
    const data = JSON.parse(document.querySelector('#native').value),box = el.getBoundingClientRect(),v = new Viewport();v.resize(box.width,box.height);v.fit(documentBounds(data));
    const {zoom,pan} = v.get(),p = data.layers.find(l => l.id === 'sample-ink').elements[0].points[0];return [box.left+p[0]*zoom+pan[0],box.top+p[1]*zoom+pan[1]];
  });await page.mouse.click(...point);await settle(page);await page.locator('#save').click();
  await page.waitForFunction(() => document.querySelector('#save-status').textContent.startsWith('Saved current'));
  const after = JSON.parse(await page.locator('#native').inputValue());assert.equal(after.layers[1].elements.length,1);
  assert.deepEqual(after.layers[0],before.layers[0]);assert.deepEqual(after.layers[2],before.layers[2]);assert.deepEqual(after.assets,before.assets);
  await card.getByRole('button',{name:'Undo',exact:true}).click();await page.locator('#save').click();
  assert.deepEqual(JSON.parse(await page.locator('#native').inputValue()),before);
});

test('flattened painted geometry agrees with native Canvas fills/strokes within the screen error band, including short wide joins',async t => {
  const page = await pageFor(t);
  const result = await page.evaluate(async () => {
    const {flattenPaint,HitBudget} = await import('/etch/geometry/hit-test.js');
    const {traceElementPath} = await import('/etch/geometry/paths.js');
    const {apply} = await import('/etch/geometry/matrix.js');
    const ctx = document.createElement('canvas').getContext('2d'),m = [1.1,0.4,0.7,-0.8,30,40];
    const base = {id:'p',type:'path',transform:[1,0,0,1,0,0],commands:[['M',0,0],['L',0.5,0],['L',0.5,0.5]],fill:null,fillRule:'nonzero',stroke:'#112233',strokeWidth:20,lineCap:'butt',lineJoin:'round',miterLimit:4};
    const elements = [];
    for (const lineJoin of ['round','bevel','miter']) for (const lineCap of ['butt','round','square']) elements.push({...base,id:`${lineJoin}/${lineCap}`,lineJoin,lineCap});
    elements.push({...base,id:'cubic',commands:[['M',-20,-10],['C',-20,40,50,40,50,-10]],strokeWidth:16});
    elements.push({...base,id:'quadratic',commands:[['M',-20,-10],['Q',15,60,50,-10]],strokeWidth:16});
    elements.push({...base,id:'zero round',commands:[['M',0,0],['L',0,0]],lineCap:'round'});
    elements.push({...base,id:'zero square',commands:[['M',0,0],['L',0,0]],lineCap:'square'});
    elements.push({id:'ellipse',type:'ellipse',transform:base.transform,cx:0,cy:0,rx:35,ry:4,fill:null,stroke:'#112233',strokeWidth:12});
    const winding = (points,[x,y]) => {
      let w = 0;
      for (let i = 0;i < points.length;i++) {const a = points[i],b = points[(i+1)%points.length],s = (b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);if (a[1] <= y && b[1] > y && s > 0) w++;else if (a[1] > y && b[1] <= y && s < 0) w--;}
      return w;
    };
    const errors = [];let checked = 0;
    for (const e of elements) {
      const geometry = flattenPaint(e,m,new HitBudget()),path = new Path2D();traceElementPath(path,e);
      ctx.setTransform(...m);ctx.lineWidth = e.strokeWidth;ctx.lineCap = e.lineCap ?? 'butt';ctx.lineJoin = e.lineJoin ?? 'round';ctx.miterLimit = e.miterLimit ?? 4;
      const exact = p => ctx.isPointInStroke(path,...p),flat = p => geometry.polygons.some(poly => winding(poly,p) !== 0);
      for (let x = -25;x <= 60;x += 3.7) for (let y = -25;y <= 60;y += 3.7) {
        const p = apply(m,[x,y]),a = exact(p),b = flat(p);checked++;if (a === b) continue;
        const probes = Array.from({length:16},(_,i) => [p[0]+0.25*Math.cos(i*Math.PI/8),p[1]+0.25*Math.sin(i*Math.PI/8)]);
        if (a ? probes.some(flat) : probes.some(exact)) continue;
        errors.push({type:e.id,p,exact:a,flat:b});if (errors.length >= 8) return {errors,checked};
      }
    }
    return {errors,checked};
  });
  assert.deepEqual(result.errors,[]);assert.ok(result.checked > 5000);
});

if (name === 'chromium') {
  test('explicit finger-off navigates, finger-on erases, second touch restores omissions and stylus ignores palm',async t => {
    const page = await pageFor(t,{options:{drawWithTouch:false},contextOptions:{hasTouch:true}}),b = await viewport(page).boundingBox(),cdp = await page.context().newCDPSession(page);
    const point = (id,x,y=70) => ({id,x:b.x+x,y:b.y+y});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,80)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,160)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await page.evaluate(() => window.eraseChanges.length),0);assert.deepEqual(await page.evaluate(() => window.eraseEditor.getViewState().pan),[80,0]);
    await restore(page);await page.evaluate(() => window.eraseEditor.setDrawWithTouch(true));
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,80)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,160)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle(page);
    assert.equal((await ids(page)).includes('a'),false);assert.equal((await ids(page)).includes('b'),false);assert.equal(await page.evaluate(() => window.eraseChanges.length),1);
    await restore(page);const before = await save(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,80)]});await settle(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,80),point(2,220)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,100,90),point(2,240,90)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle(page);
    assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => window.eraseChanges.length),0);assert.deepEqual(await page.evaluate(() => window.eraseEditor.getViewState().pan),[20,20]);
    await restore(page);await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:b.x+80,y:b.y+70,button:'left',buttons:1,pointerType:'pen',force:0.1});
    await viewport(page).evaluate(el => {const b = el.getBoundingClientRect();for (const type of ['pointerdown','pointermove','pointerup']) el.dispatchEvent(new PointerEvent(type,{pointerId:99,pointerType:'touch',button:0,buttons:1,clientX:b.left+160,clientY:b.top+70}));});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:b.x+80,y:b.y+70,button:'left',buttons:0,pointerType:'pen',force:1});await settle(page);
    assert.equal((await ids(page)).includes('a'),false);assert.equal((await ids(page)).includes('b'),true);assert.deepEqual(await page.evaluate(() => window.eraseEditor.getViewState().pan),[0,0]);
  });
  test('reliable pen barrel/eraser input temporarily erases, cancels unfinished ink and restores the selected tool/preferences',async t => {
    const page = await pageFor(t),b = await viewport(page).boundingBox(),cdp = await page.context().newCDPSession(page);
    for (const tool of ['pen','line','hand']) {
      await restore(page);await page.evaluate(tool => {window.eraseEditor.setTool(tool);window.eraseEditor.setToolSettings('pen',{width:13,color:'#123456'});},tool);
      await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:b.x+20,y:b.y+70,button:'left',buttons:1,pointerType:'pen',force:0.5});
      await viewport(page).evaluate((el,tool) => {
        const b = el.getBoundingClientRect(),id = window.erasePointerId;
        el.dispatchEvent(new PointerEvent('pointermove',{pointerId:id,pointerType:'pen',button:5,buttons:32,clientX:b.left+20,clientY:b.top+70}));
        el.dispatchEvent(new PointerEvent('pointermove',{pointerId:id,pointerType:'pen',button:-1,buttons:32,clientX:b.left+210,clientY:b.top+70}));
      },tool);await settle(page);
      assert.equal(await root(page).locator('.etch-eraser-cursor').isVisible(),true,tool);assert.equal(await page.evaluate(() => window.eraseEditor.getTool()),tool);
      await viewport(page).evaluate(el => {const b = el.getBoundingClientRect();el.dispatchEvent(new PointerEvent('pointerup',{pointerId:window.erasePointerId,pointerType:'pen',button:5,buttons:0,clientX:b.left+210,clientY:b.top+70}));});
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:b.x+210,y:b.y+70,button:'left',buttons:0,pointerType:'pen',force:0});await settle(page);
      assert.deepEqual(await ids(page),['outline','ellipse','path','image','pressure'],tool);assert.equal(await page.evaluate(() => window.eraseChanges.length),1);
      assert.equal(await page.evaluate(() => window.eraseChanges[0].label),'Erase objects');assert.equal(await page.evaluate(() => window.eraseEditor.getTool()),tool);
      assert.deepEqual(await page.evaluate(() => window.eraseEditor.getToolSettings('pen')),{width:13,color:'#123456',pressure:true});assert.equal(await page.evaluate(() => window.eraseErrors.length),0);
    }
    // CDP's mouse-button enum cannot report a physical eraser end. Inject each
    // reliable PointerEvent flag before the shared owner sees a real captured pen.
    for (const flag of ['button','buttons']) {
      await restore(page);await page.evaluate(() => window.eraseEditor.setTool('hand'));
      await viewport(page).evaluate((el,flag) => el.addEventListener('pointerdown',event => Object.defineProperty(event,flag,{value:flag === 'button' ? 5 : 32}),{capture:true,once:true}),flag);
      await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:b.x+20,y:b.y+70,button:'left',buttons:1,pointerType:'pen',force:0.5});
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:b.x+210,y:b.y+70,button:'left',buttons:1,pointerType:'pen',force:0.5});
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:b.x+210,y:b.y+70,button:'left',buttons:0,pointerType:'pen',force:0});await settle(page);
      assert.equal((await ids(page)).includes('a'),false,flag);assert.equal((await ids(page)).includes('b'),false,flag);
      assert.equal(await page.evaluate(() => window.eraseEditor.getTool()),'hand');assert.equal(await page.evaluate(() => window.eraseChanges.length),1);
    }
  });
}
