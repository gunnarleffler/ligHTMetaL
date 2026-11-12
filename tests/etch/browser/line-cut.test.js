import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
import {png} from '../test/helpers.js';
const name = process.env.ETCH_ERASER_BROWSER ?? 'chromium';
if (!['chromium','firefox'].includes(name)) throw new Error('ETCH_ERASER_BROWSER must be chromium or firefox');
const runtime = useBrowser(name);
const identity = [1,0,0,1,0,0];
const rect = (id,x,y,width,height,fill) => ({id,type:'rect',transform:identity,x,y,width,height,fill,stroke:null,strokeWidth:0,lineJoin:'round',miterLimit:4});
const line = (id,y,lineCap='round') => ({id,type:'line',transform:identity,start:[40,y],end:[420,y],stroke:'#0000FF',strokeWidth:8,lineCap});
const native = () => ({format:'lightmetal-etch',version:1,background:null,assets:[{id:'asset',mime:'image/png',width:1,height:1,data:png()}],layers:[
  {id:'floor',name:'Underneath',offset:[0,0],visible:true,locked:false,elements:[rect('red',20,20,650,250,'#FF0000')]},
  {id:'ink',name:'Straight lines',offset:[0,0],visible:true,locked:false,elements:[line('main',100),line('second',200,'butt'),rect('shape',470,40,60,80,'#00AA00'),
    {id:'pen',type:'stroke',transform:identity,points:[[500,180,1],[600,180,1]],color:'#112233',width:12,pressure:false},
    {id:'image',type:'image',transform:identity,x:600,y:40,width:40,height:40,assetId:'asset',alt:'Original alpha PNG'}]},
  {id:'upper',name:'Above',offset:[0,0],visible:true,locked:false,elements:[rect('black',180,85,20,30,'#111111')]},
]});
const root = page => page.locator('#partial-card'),viewport = page => root(page).locator('.etch-viewport');
async function settle(page) {await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));}
async function pageFor(t,{data=native(),options={},contextOptions={}}={}) {
  const context = await runtime.browser.newContext({viewport:{width:1280,height:900},...contextOptions}),page = await context.newPage(),errors = [],external = [];
  page.on('pageerror',e => errors.push(e.message));page.on('console',m => {if (m.type() === 'error') errors.push(m.text());});
  page.on('request',r => {if (!r.url().startsWith(runtime.server.origin+'/') && !/^(blob:|data:)/.test(r.url())) external.push(r.url());});
  t.after(async () => {await context.close();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});await page.goto(`${runtime.server.origin}/demo/`);await collapseDemoSidebar(page);
  await page.evaluate(async ({data,options}) => {
    const {createEtch} = await import('/etch.js'),card = document.createElement('div');card.id = 'partial-card';card.style.cssText = 'width:900px;height:460px';document.body.prepend(card);
    const e = window.partialEditor = createEtch(card,options);await e.load(data);e.setActiveLayer('ink');e.setTool('eraser');e.setToolSettings('eraser',{radius:10});e.setViewState({zoom:1,pan:[0,0]});
    window.partialChanges = [];window.partialErrors = [];e.on('change',e => window.partialChanges.push(e));e.on('error',e => window.partialErrors.push(e));
    card.querySelector('.etch-viewport').addEventListener('pointerdown',e => {window.partialPointerId = e.pointerId;});
  },{data,options});await settle(page);return page;
}
async function restore(page,data=native()) {await page.evaluate(async data => {const e = window.partialEditor;await e.load(data);e.setActiveLayer('ink');e.setTool('eraser');e.setToolSettings('eraser',{mode:'partial',radius:10});e.setViewState({zoom:1,pan:[0,0]});window.partialChanges = [];window.partialErrors = [];},data);await settle(page);}
async function save(page) {return page.evaluate(() => window.partialEditor.save());}
async function lines(page) {return page.evaluate(() => window.partialEditor.save().layers.find(l => l.id === 'ink').elements.filter(e => e.type === 'line'));}
async function begin(page,x=230,y=100) {await page.evaluate(() => window.scrollTo({top:0,left:0,behavior:'instant'}));await settle(page);const b = await viewport(page).boundingBox();await page.mouse.move(b.x+x,b.y+y);await page.mouse.down();return b;}
async function tap(page,x=230,y=100) {await begin(page,x,y);await page.mouse.up();await settle(page);}
async function pixel(page,canvas,x,y) {return root(page).locator(`.etch-${canvas}`).evaluate((c,[x,y]) => {const b = c.getBoundingClientRect();return [...c.getContext('2d').getImageData(Math.floor(x*c.width/b.width),Math.floor(y*c.height/b.height),1,1).data];},[x,y]);}

test('partial preview cuts an editable round line at DPR 2, reveals lower content below upper layers, and commits/undoes/reopens in one command',async t => {
  const page = await pageFor(t,{contextOptions:{deviceScaleFactor:2}});await page.evaluate(() => window.partialEditor.setSelection(['main','pen']));const before = await save(page),revision = await page.evaluate(() => window.partialEditor.getRevision());
  await begin(page);await settle(page);assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => window.partialEditor.getRevision()),revision);assert.equal(await page.evaluate(() => window.partialChanges.length),0);
  assert.deepEqual(await pixel(page,'live',230,100),[255,0,0,255]);assert.deepEqual(await pixel(page,'live',210,100),[0,0,255,255]);assert.deepEqual(await pixel(page,'live',250,100),[0,0,255,255]);assert.deepEqual(await pixel(page,'live',190,100),[17,17,17,255]);
  const wet = await root(page).locator('.etch-live').evaluate(c => c.toDataURL());await page.mouse.up();await settle(page);const after = await save(page),p = await lines(page);
  assert.equal(p.length,3);assert.deepEqual(p[0].start,[40,100]);assert.deepEqual(p[1].end,[420,100]);assert.equal(p[0].id,'main');assert.equal(p[0].lineCap,'round');assert.equal(p[1].lineCap,'round');assert.equal(p[1].strokeWidth,8);
  assert.deepEqual(after.layers[0],before.layers[0]);assert.deepEqual(after.layers[2],before.layers[2]);assert.deepEqual(after.assets,before.assets);assert.deepEqual(after.layers[1].elements.filter(e => e.type !== 'line'),before.layers[1].elements.filter(e => e.type !== 'line'));
  assert.equal(after.layers[1].elements[2].id,'second');assert.deepEqual(await page.evaluate(() => window.partialEditor.getSelection()),['main','pen']);assert.equal(await page.evaluate(() => window.partialChanges.length),1);assert.equal(await page.evaluate(() => window.partialChanges[0].label),'Partially erase lines');
  assert.equal(await root(page).locator('.etch-committed').evaluate(c => c.toDataURL()),wet);await page.evaluate(() => window.partialEditor.undo());assert.deepEqual(await save(page),before);await page.evaluate(() => window.partialEditor.redo());assert.deepEqual(await save(page),after);
  await page.evaluate(async () => window.partialEditor.load(window.partialEditor.save()));await settle(page);assert.deepEqual(await save(page),after);assert.equal(await root(page).locator('.etch-committed').evaluate(c => c.toDataURL()),wet);
});

test('one fast swept/coalesced gesture can make several gaps without missing intermediate intersections or dropping the release segment',async t => {
  const page = await pageFor(t);const b = await begin(page,120,60);
  await viewport(page).evaluate(el => {
    const b = el.getBoundingClientRect(),id = window.partialPointerId,make = (x,y,type='pointermove') => new PointerEvent(type,{pointerId:id,pointerType:'mouse',buttons:type === 'pointerup' ? 0 : 1,clientX:b.left+x,clientY:b.top+y});
    const move = make(300,140);Object.defineProperty(move,'getCoalescedEvents',{value:() => [make(120,140),move]});el.dispatchEvent(move);
    const up = make(300,60,'pointerup');Object.defineProperty(up,'getCoalescedEvents',{value:() => [make(300,90)]});el.dispatchEvent(up);
  });await page.mouse.up();await settle(page);const p = await lines(page);assert.equal(p.length,4);assert.equal(p.at(-1).id,'second');
  assert.equal(await page.evaluate(() => window.partialChanges.length),1);assert.equal(await viewport(page).evaluate(el => el.hasPointerCapture(window.partialPointerId)),false);assert.ok(b.width > 0);
});

test('partial mode ignores shapes/images and misses preserve native content, selected IDs, redo and revision',async t => {
  const page = await pageFor(t);await page.evaluate(() => {const e = window.partialEditor;e.translateLayer('ink',[1,0]);e.undo();e.setSelection(['main','image']);window.partialChanges = [];});
  const before = await save(page),revision = await page.evaluate(() => window.partialEditor.getRevision());
  for (const [x,y] of [[500,80],[620,60],[30,30],[230,140]]) await tap(page,x,y);
  assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => window.partialEditor.getRevision()),revision);assert.deepEqual(await page.evaluate(() => window.partialEditor.getSelection()),['main','image']);assert.equal(await page.evaluate(() => window.partialEditor.canRedo()),true);assert.equal(await page.evaluate(() => window.partialChanges.length),0);
});

test('remaining native pieces can be cut again; tapping an existing gap does not edit or create IDs/history',async t => {
  const page = await pageFor(t);await tap(page);const first = await save(page),revision = await page.evaluate(() => window.partialEditor.getRevision());await tap(page);
  assert.deepEqual(await save(page),first);assert.equal(await page.evaluate(() => window.partialEditor.getRevision()),revision);await tap(page,80,100);assert.equal((await lines(page)).length,4);
  const second = await save(page);assert.equal(new Set(second.layers[1].elements.map(e => e.id)).size,second.layers[1].elements.length);assert.equal(await page.evaluate(() => window.partialChanges.length),2);
  await page.evaluate(() => window.partialEditor.undo());assert.deepEqual(await save(page),first);await page.evaluate(() => window.partialEditor.redo());assert.deepEqual(await save(page),second);
});

test('endpoint cuts trim instead of creating stubs and a sweep along the whole line removes it entirely',async t => {
  const page = await pageFor(t);await tap(page,40,100);let p = await lines(page);assert.equal(p.length,2);assert.equal(p[0].id,'main');assert.ok(p[0].start[0] > 50);assert.deepEqual(p[0].end,[420,100]);
  await restore(page);const b = await begin(page,20,100);await page.mouse.move(b.x+450,b.y+100);await page.mouse.up();await settle(page);p = await lines(page);assert.deepEqual(p.map(e => e.id),['second']);assert.equal(await page.evaluate(() => window.partialChanges.length),1);
});

test('mode and radius are captured at gesture start; the next gesture uses the new Whole Object preference',async t => {
  const page = await pageFor(t);await page.evaluate(() => window.partialEditor.setToolSettings('eraser',{radius:4}));const b = await begin(page);await settle(page);
  await page.evaluate(() => window.partialEditor.setToolSettings('eraser',{mode:'object',radius:40}));await page.mouse.move(b.x+231,b.y+100);await settle(page);
  assert.equal(await root(page).locator('.etch-eraser-cursor').evaluate(el => el.getBoundingClientRect().width),8);await page.mouse.up();assert.equal((await lines(page)).length,3);
  assert.equal(await page.evaluate(() => window.partialChanges[0].label),'Partially erase lines');await tap(page,500,80);
  assert.equal((await save(page)).layers[1].elements.some(e => e.id === 'shape'),false);assert.equal(await page.evaluate(() => window.partialChanges[1].label),'Erase objects');
});

test('affine moved/skewed/reflected lines split in local coordinates and CSS radius stays constant across zoom/DPR',async t => {
  const data = native();data.layers[1].offset = [30,40];data.layers[1].elements = [{...line('main',0),start:[0,0],end:[200,0],transform:[1,0.3,2,-0.2,40,80]}];
  const page = await pageFor(t,{data,contextOptions:{deviceScaleFactor:2}});await tap(page,170,150);let p = await lines(page);assert.equal(p.length,2);assert.deepEqual(p[0].transform,data.layers[1].elements[0].transform);assert.deepEqual(p[1].transform,p[0].transform);assert.ok(p[0].end[0] < 100);assert.ok(p[1].start[0] > 100);assert.deepEqual(await pixel(page,'committed',170,150),[255,0,0,255]);
  const zoomData = native();zoomData.layers[1].elements = zoomData.layers[1].elements.filter(e => e.id !== 'second');
  for (const zoom of [0.1,1,2]) {
    await restore(page,zoomData);await page.evaluate(zoom => window.partialEditor.setViewState({zoom,pan:[20,20]}),zoom);await settle(page);await tap(page,20+230*zoom,20+100*zoom);p = await lines(page);assert.equal(p.length,2);
    assert.equal(await root(page).locator('.etch-eraser-cursor').evaluate(el => el.getBoundingClientRect().width),20);assert.deepEqual(await pixel(page,'committed',20+230*zoom,20+100*zoom),[255,0,0,255]);
  }
});

test('cancellation boundaries restore the complete original line and a delayed pointer-up cannot commit fragments',async t => {
  const page = await pageFor(t);
  for (const action of ['escape','pointercancel','capture','blur','focus','resize','tool','layer','view','lock','selection','load','cancel']) {
    await root(page).evaluate(el => {el.style.width = '900px';});await restore(page);const b = await begin(page);await settle(page);assert.deepEqual(await pixel(page,'live',230,100),[255,0,0,255],action);
    if (action === 'escape') await page.keyboard.press('Escape');
    else if (action === 'capture') {await viewport(page).evaluate(el => el.releasePointerCapture(window.partialPointerId));await page.mouse.move(b.x+231,b.y+100);}
    else await page.evaluate(async action => {const e = window.partialEditor,el = document.querySelector('#partial-card .etch-viewport');
      if (action === 'pointercancel') el.dispatchEvent(new PointerEvent('pointercancel',{pointerId:window.partialPointerId,pointerType:'mouse'}));if (action === 'blur') window.dispatchEvent(new Event('blur'));if (action === 'focus') document.querySelector('#native').focus();
      if (action === 'resize') document.querySelector('#partial-card').style.width = '850px';if (action === 'tool') e.setTool('pen');if (action === 'layer') e.setActiveLayer('floor');if (action === 'view') e.setViewState({zoom:2});if (action === 'lock') e.setLayerLocked('ink',true);if (action === 'selection') e.setSelection(['main']);
      if (action === 'load') {try {await e.load('{');} catch { /* Invalid loads still cancel. */ }}if (action === 'cancel') e.cancel();
    },action);await settle(page);const before = await save(page),revision = await page.evaluate(() => window.partialEditor.getRevision());await page.mouse.up();await settle(page);
    assert.deepEqual(await save(page),before,action);assert.equal((await lines(page)).length,2,action);assert.equal(await page.evaluate(() => window.partialEditor.getRevision()),revision,action);assert.equal(await page.evaluate(() => window.partialChanges.some(e => e.label === 'Partially erase lines')),false,action);assert.equal(await root(page).locator('.etch-live').isVisible(),false,action);
  }
});

test('sample and destination-capacity failures discard all fragments without whole-object fallback, then a valid gesture can recover',async t => {
  const full = await pageFor(t,{options:{limits:{elements:7}}}),before = await save(full),revision = await full.evaluate(() => window.partialEditor.getRevision());await tap(full);
  assert.deepEqual(await save(full),before);assert.equal(await full.evaluate(() => window.partialEditor.getRevision()),revision);assert.equal(await full.evaluate(() => window.partialErrors.length),1);assert.equal(await full.evaluate(() => window.partialErrors[0].code),'LIMIT_EXCEEDED');assert.equal(await full.evaluate(() => window.partialChanges.length),0);
  const b = await begin(full,20,100);await full.mouse.move(b.x+450,b.y+100);await full.mouse.up();await settle(full);assert.deepEqual((await lines(full)).map(e => e.id),['second']);
  const data = native();data.layers[1].elements.find(e => e.id === 'pen').points = [[500,180,1]];const page = await pageFor(t,{data,options:{limits:{pointsPerElement:1}}}),saved = await save(page);
  const box = await begin(page);await settle(page);await page.mouse.move(box.x+250,box.y+100);await page.mouse.up();await settle(page);assert.deepEqual(await save(page),saved);assert.equal(await page.evaluate(() => window.partialErrors.length),1);
  await tap(page);assert.equal((await lines(page)).length,3);assert.equal(await page.evaluate(() => window.partialChanges.length),1);
});

test('read-only, hidden and locked layers cannot be partially erased or use E to activate editing',async t => {
  for (const mode of ['readOnly','hidden','locked']) {
    const page = await pageFor(t,{options:{readOnly:mode === 'readOnly'}});await page.evaluate(mode => {const e = window.partialEditor;if (mode === 'hidden') e.setLayerVisibility('ink',false);if (mode === 'locked') e.setLayerLocked('ink',true);e.setTool('hand');window.partialChanges = [];},mode);
    await viewport(page).focus();await page.keyboard.press('e');assert.equal(await page.evaluate(() => window.partialEditor.getTool()),'hand');await page.evaluate(() => window.partialEditor.setTool('eraser'));
    const before = await save(page),revision = await page.evaluate(() => window.partialEditor.getRevision());await tap(page);assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => window.partialEditor.getRevision()),revision);assert.equal(await page.evaluate(() => window.partialChanges.length),0);
    assert.equal(await root(page).getByRole('button',{name:'Eraser',exact:true}).isDisabled(),true);
  }
});

test('sidebar exposes both modes, retains preferences independently, and stays usable in a 320×240 coarse-pointer card',async t => {
  const data = native();for (let i = 0;i < 25;i++) data.layers.push({id:`empty-${i}`,name:`Layer ${i}`,offset:[0,0],visible:true,locked:false,elements:[]});
  const page = await pageFor(t,{data,contextOptions:{hasTouch:true,viewport:{width:390,height:844}}}),card = root(page),before = await save(page),revision = await page.evaluate(() => window.partialEditor.getRevision());
  await card.evaluate(el => {el.style.width = '320px';el.style.height = '240px';});await settle(page);await card.getByRole('button',{name:'Toggle sidebar'}).click();const mode = card.getByRole('combobox',{name:'Eraser mode'});
  assert.equal(await mode.inputValue(),'partial');await mode.selectOption('object');await mode.selectOption('partial');assert.match(await card.locator('.etch-tool-note').textContent(),/Highlights, shapes, paths and images stay untouched/);
  await card.getByRole('spinbutton',{name:'Eraser radius'}).fill('12');await card.getByRole('spinbutton',{name:'Eraser radius'}).press('Tab');
  await card.getByRole('button',{name:'Pen',exact:true}).click();await card.getByRole('button',{name:'Eraser',exact:true}).click();assert.equal(await mode.inputValue(),'partial');
  const sizes = await card.evaluate(el => {const layers = el.querySelector('.etch-layers'),props = el.querySelector('.etch-properties-content');layers.scrollTop = layers.scrollHeight;props.scrollTop = props.scrollHeight;return {layers:layers.scrollTop,props:props.scrollTop,overflow:props.scrollWidth-props.clientWidth};});assert.ok(sizes.layers > 0 && sizes.props > 0);assert.ok(sizes.overflow <= 1);
  assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => window.partialEditor.getRevision()),revision);assert.equal(await page.evaluate(() => window.partialChanges.length),0);assert.deepEqual(await page.evaluate(() => window.partialEditor.getToolSettings('eraser')),{mode:'partial',radius:12});
});

test('actual demo draws a straight line, selects Partial mode through the sidebar, cuts/saves it and undoes the gap',async t => {
  const page = await pageFor(t),card = page.locator('#editor'),vp = card.locator('.etch-viewport');await vp.scrollIntoViewIfNeeded();await vp.focus();await page.keyboard.press('l');await settle(page);
  let b = await vp.boundingBox();await page.mouse.move(b.x+80,b.y+120);await page.mouse.down();await page.mouse.move(b.x+380,b.y+120);await page.mouse.up();await page.locator('#save').click();
  const original = JSON.parse(await page.locator('#native').inputValue());assert.equal(original.layers[0].elements.length,1);assert.equal(original.layers[0].elements[0].type,'line');
  await card.getByRole('button',{name:'Eraser',exact:true}).click();await card.getByRole('button',{name:'Toggle sidebar'}).click();await card.getByRole('combobox',{name:'Eraser mode'}).selectOption('partial');
  await card.getByRole('button',{name:'Toggle sidebar'}).click();await settle(page);await vp.scrollIntoViewIfNeeded();b = await vp.boundingBox();await page.mouse.click(b.x+230,b.y+120);await settle(page);await page.locator('#save').click();
  const after = JSON.parse(await page.locator('#native').inputValue());assert.equal(after.layers[0].elements.length,2);assert.ok(after.layers[0].elements.every(e => e.type === 'line'));
  await card.getByRole('button',{name:'Undo',exact:true}).click();await page.locator('#save').click();assert.deepEqual(JSON.parse(await page.locator('#native').inputValue()),original);
});

if (name === 'chromium') test('finger-off preserves lines; finger-on cuts, second touch restores and temporary pen erasing uses the chosen mode',async t => {
  const page = await pageFor(t,{options:{drawWithTouch:false},contextOptions:{hasTouch:true}}),b = await viewport(page).boundingBox(),cdp = await page.context().newCDPSession(page),point = (id,x,y=100) => ({id,x:b.x+x,y:b.y+y});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,230)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal((await lines(page)).length,2);
  await page.evaluate(() => window.partialEditor.setDrawWithTouch(true));await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,230)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal((await lines(page)).length,3);
  await restore(page);const before = await save(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,230)]});await settle(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,230),point(2,330)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,250,120),point(2,350,120)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle(page);
  assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => window.partialChanges.length),0);
  await restore(page);await page.evaluate(() => window.partialEditor.setTool('pen'));await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:b.x+230,y:b.y+100,button:'left',buttons:1,pointerType:'pen',force:0.5});
  await viewport(page).evaluate(el => {const b = el.getBoundingClientRect();el.dispatchEvent(new PointerEvent('pointermove',{pointerId:window.partialPointerId,pointerType:'pen',button:5,buttons:32,clientX:b.left+230,clientY:b.top+100}));});
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:b.x+230,y:b.y+100,button:'left',buttons:0,pointerType:'pen',force:0});await settle(page);
  assert.equal((await lines(page)).length,3);assert.equal(await page.evaluate(() => window.partialEditor.getTool()),'pen');assert.equal(await page.evaluate(() => window.partialChanges.length),1);assert.equal(await page.evaluate(() => window.partialChanges[0].label),'Partially erase lines');
});
