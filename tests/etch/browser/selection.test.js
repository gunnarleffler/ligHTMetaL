import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser} from './fixture.js';

const runtime = useBrowser(process.env.ETCH_SELECTION_BROWSER === 'firefox' ? 'firefox' : 'chromium');
async function setup(t,options={}) {
  const {browser,server} = runtime;
  const page = await browser.newPage({viewport:{width:1100,height:800},deviceScaleFactor:2}),errors=[];
  page.on('pageerror',e => errors.push(e.message));t.after(async () => {await page.close();assert.deepEqual(errors,[]);});
  await page.goto(server.origin+'/demo/');
  await page.evaluate(async options => {
    const {createEtch} = await import('/etch.js');const card = document.createElement('div');card.id='selection-card';card.style='width:700px;height:420px';document.body.prepend(card);
    const e = window.selectionEditor = createEtch(card,options),d=e.save();d.layers[0].offset=[10,20];d.layers[0].elements=[
      {id:'a',type:'rect',transform:[1,0,0,1,0,0],x:30,y:30,width:60,height:60,fill:'#FF0000',stroke:null,strokeWidth:0,lineJoin:'round',miterLimit:4},
      {id:'b',type:'rect',transform:[1,0,0,1,0,0],x:60,y:50,width:60,height:60,fill:'#0000FF',stroke:null,strokeWidth:0,lineJoin:'round',miterLimit:4}];
    await e.load(d);e.setViewState({zoom:1,pan:[0,0]});e.setTool('select');window.selectionChanges=[];window.selectionErrors=[];e.on('change',e => window.selectionChanges.push(e));e.on('error',e=>window.selectionErrors.push(e));
  },options);await settle(page);return page;
}
async function settle(page) {await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));}
const vp = page => page.locator('#selection-card .etch-viewport');
const ids = page => page.evaluate(() => window.selectionEditor.getSelection());
const save = page => page.evaluate(() => window.selectionEditor.save());
async function point(page,x,y) {const b=await vp(page).boundingBox();await page.mouse.move(b.x+x,b.y+y);}
async function click(page,x,y) {await point(page,x,y);await page.mouse.down();await page.mouse.up();await settle(page);}
async function drag(page,a,b,release=true) {await point(page,...a);await page.mouse.down();await point(page,...b);await settle(page);if(release){await page.mouse.up();await settle(page);}}

test('Select picks topmost active-layer paint, toggles with Shift, clears on empty click and never dirties',async t => {
  const page=await setup(t),before=await save(page);
  await click(page,80,80);assert.deepEqual(await ids(page),['b']);
  assert.equal(await page.locator('#selection-card .etch-selection-outline').first().isVisible(),true);
  await page.keyboard.down('Shift');await click(page,50,60);await page.keyboard.up('Shift');assert.deepEqual(await ids(page),['b','a']);
  await page.keyboard.down('Shift');await click(page,80,80);await page.keyboard.up('Shift');assert.deepEqual(await ids(page),['a']);
  await click(page,300,200);assert.deepEqual(await ids(page),[]);assert.deepEqual(await save(page),before);
  assert.equal(await page.evaluate(()=>window.selectionChanges.length),0);
});
test('selection drag is committed-only, zoom-correct, one Undo step and preserves painter order',async t => {
  const page=await setup(t);await page.evaluate(()=>window.selectionEditor.setViewState({zoom:2,pan:[20,10]}));await settle(page);
  const before=await save(page);await drag(page,[180,170],[220,150],false);
  assert.deepEqual(await ids(page),['b']);assert.deepEqual(await save(page),before);
  await page.mouse.up();await settle(page);const after=await save(page);
  assert.deepEqual(after.layers[0].elements[1].transform,[1,0,0,1,20,-10]);assert.deepEqual(after.layers[0].elements[0],before.layers[0].elements[0]);
  assert.equal(await page.evaluate(()=>window.selectionChanges.length),1);
  await page.evaluate(()=>window.selectionEditor.undo());assert.deepEqual(await save(page),before);
  await page.evaluate(()=>window.selectionEditor.redo());assert.deepEqual(await save(page),after);
  await page.evaluate(async()=>{const e=window.selectionEditor;await e.load(e.save());});assert.deepEqual(await save(page),after);
});
test('reverse marquee fully contains bounds, Shift adds, empty selection-box interior starts marquee',async t => {
  const page=await setup(t);
  await drag(page,[150,150],[20,30]);assert.deepEqual(await ids(page),['a','b']);
  await drag(page,[120,55],[20,30]);assert.deepEqual(await ids(page),[]);
  await click(page,50,60);await page.keyboard.down('Shift');await drag(page,[150,150],[65,65]);await page.keyboard.up('Shift');assert.deepEqual(await ids(page),['a','b']);
  assert.equal(await page.evaluate(()=>window.selectionChanges.length),0);
});
test('Escape cancels movement then clears selection; select-all and Delete are scoped and undoable',async t => {
  const page=await setup(t),before=await save(page);await drag(page,[80,80],[180,150],false);
  await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await save(page),before);assert.deepEqual(await ids(page),['b']);
  await page.keyboard.press('Escape');assert.deepEqual(await ids(page),[]);
  await page.keyboard.press('ControlOrMeta+a');assert.deepEqual(await ids(page),['a','b']);
  await page.keyboard.press('Delete');assert.equal((await save(page)).layers[0].elements.length,0);
  await page.evaluate(()=>window.selectionEditor.undo());assert.deepEqual(await save(page),before);
  assert.deepEqual(await page.evaluate(()=>window.selectionErrors),[]);
});
test('multi-selection moves together without changing order; no-op clicks preserve redo',async t => {
  const page=await setup(t),before=await save(page);
  await vp(page).focus();await page.keyboard.press('ControlOrMeta+a');
  await drag(page,[80,80],[100,110]);const after=await save(page);
  assert.deepEqual(after.layers[0].elements.map(e=>e.transform),[[1,0,0,1,20,30],[1,0,0,1,20,30]]);
  assert.deepEqual(after.layers[0].elements.map(e=>e.id),['a','b']);
  await page.evaluate(()=>window.selectionEditor.undo());await click(page,80,80);
  assert.equal(await page.evaluate(()=>window.selectionEditor.canRedo()),true);assert.deepEqual(await save(page),before);
  await page.evaluate(()=>{const e=window.selectionEditor;e.setLayerLocked(e.getActiveLayer(),true);});
  assert.deepEqual(await ids(page),[]);assert.equal(await page.locator('#selection-card').getByRole('button',{name:'Select',exact:true}).isDisabled(),true);
});
test('finger selection opts in and a second finger cancels the uncommitted move before navigation',{skip:process.env.ETCH_SELECTION_BROWSER === 'firefox' && 'CDP touch dispatch is Chromium-only'},async t => {
  const page=await setup(t,{drawWithTouch:true}),before=await save(page);
  const cdp=await page.context().newCDPSession(page),box=await vp(page).boundingBox();
  const p=(id,x,y)=>({id,x:box.x+x,y:box.y+y,radiusX:1,radiusY:1,force:1});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p(1,80,80)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[p(1,120,100)]});await settle(page);
  assert.deepEqual(await save(page),before);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p(1,120,100),p(2,200,100)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[p(1,130,110),p(2,220,110)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle(page);
  assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(()=>window.selectionChanges.length),0);
});
test('tool changes cancel wet moves and narrow toolbar actions remain reachable',async t => {
  const page=await setup(t),before=await save(page);await drag(page,[80,80],[180,150],false);
  await page.evaluate(()=>window.selectionEditor.setTool('pen'));await page.mouse.up();assert.deepEqual(await save(page),before);
  await page.evaluate(()=>{document.querySelector('#selection-card').style.width='320px';window.selectionEditor.setTool('select');});await settle(page);
  const box=await page.locator('#selection-card').boundingBox();
  for(const b of await page.locator('#selection-card .etch-toolbar button').all()) {await b.scrollIntoViewIfNeeded();const r=await b.boundingBox();assert.ok(r.x>=box.x && r.x+r.width<=box.x+box.width);}
  await vp(page).focus();await page.keyboard.press('v');assert.equal(await page.evaluate(()=>window.selectionEditor.getTool()),'select');
});
