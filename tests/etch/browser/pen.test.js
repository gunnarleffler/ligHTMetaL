import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
import {fixture} from '../test/helpers.js';

const name = process.env.ETCH_PEN_BROWSER ?? 'chromium';
if (!['chromium','firefox','webkit'].includes(name)) throw new Error('ETCH_PEN_BROWSER must be chromium, firefox or webkit');
const runtime = useBrowser(name);
const blank = () => ({format:'lightmetal-etch',version:1,background:null,layers:[{id:'ink',name:'Ink',visible:true,locked:false,offset:[0,0],elements:[]}],assets:[]});
async function pageFor(t,{native=blank(),editorOptions={},contextOptions={}} = {}) {
  const context = await runtime.browser.newContext({viewport:{width:1280,height:900},...contextOptions}),page = await context.newPage(),errors = [],external = [];
  page.on('pageerror',e => errors.push(e.message));page.on('console',m => {if (m.type() === 'error') errors.push(m.text());});
  page.on('request',r => {if (!r.url().startsWith(runtime.server.origin+'/') && !/^(blob:|data:)/.test(r.url())) external.push(r.url());});
  t.after(async () => {await context.close();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});
  await page.goto(`${runtime.server.origin}/demo/`);await collapseDemoSidebar(page);
  await page.evaluate(async ({native,options}) => {
    const {createEtch} = await import('/etch.js'),card = document.createElement('div');card.id = 'pen-card';
    card.style.cssText = 'width:700px;height:400px';document.body.prepend(card);
    const editor = window.penEditor = createEtch(card,options);await editor.load(native);editor.setViewState({zoom:1,pan:[0,0]});
    window.inkChanges = [];window.inkErrors = [];
    editor.on('change',e => window.inkChanges.push(e));editor.on('error',e => window.inkErrors.push(e));
    card.querySelector('.etch-viewport').addEventListener('pointerdown',e => {window.inkPointerId = e.pointerId;});
  },{native,options:editorOptions});
  await settle(page);return page;
}
async function settle(page) {await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));}
const viewport = page => page.locator('#pen-card .etch-viewport');
async function begin(page,x=50,y=100) {await viewport(page).scrollIntoViewIfNeeded();const box = await viewport(page).boundingBox();await page.mouse.move(box.x+x,box.y+y);await page.mouse.down();return box;}
async function strokes(page) {return page.evaluate(() => window.penEditor.save().layers.flatMap(l => l.elements.filter(e => e.type === 'stroke')));}
async function pixel(page,canvas,x,y) {return page.locator(`#pen-card .etch-${canvas}`).evaluate((c,[x,y]) => {
  const box = c.getBoundingClientRect();return [...c.getContext('2d').getImageData(Math.floor(x*c.width/box.width),Math.floor(y*c.height/box.height),1,1).data];
},[x,y]);}

for (const format of ['png','webp']) test(`writing on an imported ${format} does not re-inspect or serialize unchanged image bytes`,async t => {
  const page = await pageFor(t,{contextOptions:{deviceScaleFactor:2}});
  await page.evaluate(async format => {
    const c = document.createElement('canvas');c.width = 1024;c.height = 768;
    const ctx = c.getContext('2d'),pixels = ctx.createImageData(c.width,c.height);let seed = 7;
    for (let i=0;i<pixels.data.length;i+=4) {
      seed = (Math.imul(seed,1664525)+1013904223)>>>0;
      pixels.data[i] = seed&255;pixels.data[i+1] = (seed>>>8)&255;pixels.data[i+2] = (seed>>>16)&255;pixels.data[i+3] = 255;
    }
    ctx.putImageData(pixels,0,0);
    const blob = await new Promise(r => c.toBlob(r,'image/png'));
    await penEditor.importImage(blob,{format});c.width = c.height = 0;
    window.photoBefore = penEditor.save();window.inkChanges.length = 0;
    const decode = window.atob,stringify = JSON.stringify;
    window.imageWork = {decodes:0,serializations:0};
    window.atob = (...args) => {imageWork.decodes++;return decode(...args);};
    JSON.stringify = function(value,...args) {
      if (value?.assets?.some(a => a.data?.length > 1024)) imageWork.serializations++;
      return stringify.call(this,value,...args);
    };
    window.restoreImageWork = () => {window.atob = decode;JSON.stringify = stringify;};
  },format);await settle(page);
  const box = await begin(page,120,140);
  await page.mouse.move(box.x+320,box.y+145,{steps:12});await settle(page);
  assert.deepEqual(await page.evaluate(() => imageWork),{decodes:0,serializations:0});
  await page.mouse.up();await settle(page);
  assert.deepEqual(await page.evaluate(() => {restoreImageWork();return imageWork;}),{decodes:0,serializations:0});
  const after = await page.evaluate(() => penEditor.save()),before = await page.evaluate(() => photoBefore);
  assert.deepEqual(after.assets,before.assets);assert.equal((await strokes(page)).length,1);
  assert.equal(await page.evaluate(() => inkChanges.length),1);
  await page.evaluate(() => penEditor.undo());assert.deepEqual(await page.evaluate(() => penEditor.save()),before);
  await page.evaluate(async () => {penEditor.redo();await penEditor.load(penEditor.save());});
  assert.deepEqual(await page.evaluate(() => penEditor.save()),after);
});

test('drawing suppresses native copy/context callouts only on the viewport surface',async t => {
  const page = await pageFor(t);
  const result = await page.evaluate(() => {
    const root = document.querySelector('#pen-card .etch'),viewport = root.querySelector('.etch-viewport'),canvas = root.querySelector('.etch-committed');
    const input = document.createElement('input');input.value = 'Normal host text';document.body.prepend(input);
    const canceled = (target,type) => !target.dispatchEvent(new Event(type,{bubbles:true,cancelable:true}));
    const surface = ['contextmenu','selectstart'].map(type => canceled(canvas,type));
    const controls = ['contextmenu','selectstart'].map(type => canceled(viewport.querySelector('button'),type));
    const toolbar = ['contextmenu','selectstart'].map(type => canceled(root.querySelector('.etch-toolbar button'),type));
    const host = ['contextmenu','selectstart'].map(type => canceled(input,type));
    const style = getComputedStyle(viewport),selection = style.userSelect || style.webkitUserSelect;
    const callout = style.getPropertyValue('-webkit-touch-callout');
    return {surface,controls,toolbar,host,selection,callout};
  });
  assert.deepEqual(result.surface,[true,true]);assert.deepEqual(result.controls,[false,false]);
  assert.deepEqual(result.toolbar,[false,false]);assert.deepEqual(result.host,[false,false]);
  assert.equal(result.selection,'none');if (result.callout) assert.equal(result.callout,'none');
  const box = await begin(page,80,100);await page.mouse.move(box.x+120,box.y+100);await page.mouse.up();
  assert.equal((await strokes(page)).length,1);
});

test('real mouse pen captures outside the viewport, saves only committed ink, and commits/undoes/reopens exactly',async t => {
  const native = blank();native.layers[0].offset = [15,-20];
  const page = await pageFor(t,{native,contextOptions:{deviceScaleFactor:2}});
  await page.evaluate(() => {window.penEditor.setViewState({zoom:2,pan:[80,60]});window.inkBefore = window.penEditor.save();window.inkRevision = window.penEditor.getRevision();});await settle(page);
  const box = await begin(page,100,90);await page.mouse.move(box.x+750,box.y+90,{steps:8});await settle(page);
  assert.equal(await page.evaluate(() => JSON.stringify(window.penEditor.save()) === JSON.stringify(window.inkBefore) && window.penEditor.getRevision() === window.inkRevision && !window.penEditor.canUndo()),true);
  assert.equal(await page.evaluate(() => window.inkChanges.length),0);
  assert.equal(await page.locator('#pen-card .etch-empty').isVisible(),false);
  assert.deepEqual(await pixel(page,'live',150,90),[36,41,47,255]);
  await page.mouse.up();await settle(page);
  const ink = (await strokes(page))[0];assert.equal(ink.pressure,false);assert.equal(ink.width,3);
  assert.deepEqual(ink.points[0],[-5,35,1]);assert.deepEqual(ink.points.at(-1),[320,35,1]);
  assert.equal(await page.evaluate(() => window.inkChanges.length),1);
  const painted = await page.locator('#pen-card .etch-committed').evaluate(c => c.toDataURL());
  await page.evaluate(() => window.penEditor.undo());assert.equal((await strokes(page)).length,0);
  await page.evaluate(() => window.penEditor.redo());await settle(page);
  assert.equal(await page.locator('#pen-card .etch-committed').evaluate(c => c.toDataURL()),painted);
  await page.evaluate(async () => {const data = window.penEditor.save();await window.penEditor.load(data);});await settle(page);
  assert.equal(await page.locator('#pen-card .etch-committed').evaluate(c => c.toDataURL()),painted);
  assert.equal(await page.evaluate(() => window.penEditor.canUndo()),false);
  assert.deepEqual(await page.evaluate(() => window.inkChanges.map(e => e.source)),['edit','undo','redo']);
});

test('tap dots and short strokes survive; wheel cannot change the view while ink owns the pointer',async t => {
  const page = await pageFor(t);const box = await begin(page,40,50);
  const before = await page.evaluate(() => window.penEditor.getViewState());
  await page.mouse.wheel(10,80);await settle(page);
  assert.deepEqual(await page.evaluate(() => window.penEditor.getViewState()),before);
  await page.mouse.up();await settle(page);
  const dot = (await strokes(page))[0];assert.equal(dot.points.length,1);assert.deepEqual(await pixel(page,'committed',40,50),[36,41,47,255]);
  await page.mouse.move(box.x+80,box.y+50);await page.mouse.down();await page.mouse.move(box.x+81,box.y+50);await page.mouse.up();
  const short = (await strokes(page))[1];assert.ok(short.points.at(-1)[0]-short.points[0][0] > 0.1);
  assert.equal(await page.evaluate(() => window.inkChanges.length),2);
});

test('all coalesced samples are captured in order and a subpixel final endpoint survives dispatch dedup',async t => {
  const page = await pageFor(t);await begin(page,20,80);
  await page.evaluate(() => {
    const el = document.querySelector('#pen-card .etch-viewport'),box = el.getBoundingClientRect(),id = window.inkPointerId;
    const make = (type,x,time,pressure=0.5) => {
      const e = new PointerEvent(type,{pointerId:id,pointerType:'mouse',buttons:type === 'pointerup' ? 0 : 1,pressure,clientX:box.left+x,clientY:box.top+80});
      Object.defineProperty(e,'timeStamp',{value:time});return e;
    };
    const batch = [make('pointermove',20.1,100),make('pointermove',20.3,101),make('pointermove',30,102),make('pointermove',40.1,103)];
    const outer = make('pointermove',40.1,103);Object.defineProperty(outer,'getCoalescedEvents',{value:() => batch});
    const getRect = el.getBoundingClientRect;let measurements = 0;
    el.getBoundingClientRect = function() {measurements++;return getRect.call(this);};
    try {el.dispatchEvent(outer);window.coalescedRectReads = measurements;}
    finally {el.getBoundingClientRect = getRect;}
    el.dispatchEvent(make('pointerup',40.2,104,0));
  });await page.mouse.up();await settle(page);
  assert.equal(await page.evaluate(() => window.coalescedRectReads),2); // Hover + one batch snapshot, not one layout query per sample.
  const points = (await strokes(page))[0].points;
  assert.equal(points.length,5);for (const [i,x] of [20,20.3,30,40.1,40.2].entries()) assert.ok(Math.abs(points[i][0]-x) < 1e-8);
  assert.equal(await page.evaluate(() => window.inkChanges.length),1);
});

test('wet pen on a lower layer stays beneath upper shapes and opaque PNG, with no z-order pop on commit',async t => {
  const native = blank();native.layers.push({id:'upper',name:'Upper',visible:true,locked:true,offset:[0,0],elements:[
    {id:'blue',type:'rect',transform:[1,0,0,1,0,0],x:100,y:50,width:80,height:100,fill:'#0000FF',stroke:null,strokeWidth:0,lineJoin:'round',miterLimit:4}]});
  const page = await pageFor(t,{native});
  await page.evaluate(async () => {
    const d = window.penEditor.save(),c = document.createElement('canvas');c.width = c.height = 2;c.getContext('2d').fillStyle = '#008000';c.getContext('2d').fillRect(0,0,2,2);
    d.assets.push({id:'green-png',mime:'image/png',width:2,height:2,data:c.toDataURL().split(',')[1]});
    d.layers[1].elements.push({id:'green-image',type:'image',transform:[1,0,0,1,0,0],assetId:'green-png',x:210,y:50,width:60,height:100,alt:'Opaque green fixture'});
    await window.penEditor.load(d);window.penEditor.setToolSettings('pen',{width:20,color:'#FF0000'});
  });await settle(page);
  const box = await begin(page,50,100);await page.mouse.move(box.x+300,box.y+100,{steps:10});await settle(page);
  assert.deepEqual(await pixel(page,'live',80,100),[255,0,0,255]);assert.deepEqual(await pixel(page,'live',130,100),[0,0,255,255]);
  assert.deepEqual(await pixel(page,'live',230,100),[0,128,0,255]);
  const wet = await page.locator('#pen-card .etch-live').evaluate(c => c.toDataURL());
  assert.equal((await strokes(page)).length,0);await page.mouse.up();await settle(page);
  assert.equal(await page.locator('#pen-card .etch-committed').evaluate(c => c.toDataURL()),wet);
  assert.equal((await strokes(page)).length,1);assert.equal(await page.evaluate(() => window.penEditor.getActiveLayer()),'ink');
});

test('Escape, pointercancel, real capture loss, blur, tool/layer changes, load and explicit cancel discard wet ink',async t => {
  const native = blank();native.layers.unshift({...native.layers[0],id:'other',name:'Other'});
  const page = await pageFor(t,{native});
  for (const action of ['escape','pointercancel','capture','blur','focus','resize','tool','layer','load','cancel']) {
    await page.evaluate(async d => {await window.penEditor.load(d);window.penEditor.setTool('pen');window.penEditor.setViewState({zoom:1,pan:[0,0]});window.inkChanges = [];},native);await settle(page);
    const box = await begin(page,50,80);await page.mouse.move(box.x+120,box.y+80);await settle(page);
    assert.equal(await page.locator('#pen-card .etch-live').isVisible(),true,action);
    if (action === 'escape') await page.keyboard.press('Escape');
    else if (action === 'capture') {
      await viewport(page).evaluate(el => el.releasePointerCapture(window.inkPointerId));await page.mouse.move(box.x+121,box.y+80);
    } else await page.evaluate(async action => {
      const el = document.querySelector('#pen-card .etch-viewport'),editor = window.penEditor;
      if (action === 'pointercancel') el.dispatchEvent(new PointerEvent('pointercancel',{pointerId:window.inkPointerId,pointerType:'mouse'}));
      if (action === 'blur') window.dispatchEvent(new Event('blur'));
      if (action === 'focus') document.querySelector('#native').focus();
      if (action === 'resize') document.querySelector('#pen-card').style.width = '600px';
      if (action === 'tool') editor.setTool('hand');
      if (action === 'layer') editor.setActiveLayer('other');
      if (action === 'load') {try {await editor.load('{');} catch { /* Expected failed load; preview still cancels. */ }}
      if (action === 'cancel') editor.cancel();
    },action);
    await settle(page);await page.mouse.up();await settle(page);
    assert.equal((await strokes(page)).length,0,action);assert.equal(await page.evaluate(() => window.inkChanges.length),0,action);
    assert.equal(await page.locator('#pen-card .etch-live').isVisible(),false,action);
    assert.equal(await viewport(page).evaluate(el => el.hasPointerCapture(window.inkPointerId)),false,action);
    assert.equal(await page.evaluate(() => window.penEditor.canUndo()),false,action);
  }
});

test('read-only and locked/hidden layers cannot receive ink; settings/tool/layer state remain independent',async t => {
  const page = await pageFor(t);await page.locator('#pen-card .etch-sidebar-toggle').click();await settle(page);
  const color = page.locator('#pen-card').getByLabel('Pen color',{exact:true}),width = page.getByRole('spinbutton',{name:'Pen width',exact:true});
  await color.evaluate(el => {el.value = '#ff00aa';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await width.fill('9.5');await width.press('Tab');
  await page.locator('#pen-card').getByRole('checkbox',{name:'Draw with finger',exact:true}).check();
  assert.deepEqual(await page.evaluate(() => window.penEditor.getToolSettings('pen')),{color:'#FF00AA',width:9.5,pressure:true});
  assert.equal(await page.evaluate(() => window.inkChanges.length),0);
  await page.locator('#pen-card').getByRole('button',{name:'Hand / Pan',exact:true}).click();
  assert.equal(await page.locator('#pen-card .etch-tool-properties').isVisible(),false);
  await page.evaluate(() => {window.penEditor.setActiveLayer('ink');window.penEditor.setTool('pen');});
  await page.locator('#pen-card .etch-sidebar-toggle').click();await settle(page);
  for (const flag of ['locked','hidden']) {
    await page.evaluate(flag => {const e = window.penEditor;flag === 'locked' ? e.setLayerLocked('ink',true) : e.setLayerVisibility('ink',false);window.inkChanges = [];},flag);
    assert.equal(await page.locator('#pen-card').getByRole('button',{name:'Pen',exact:true}).isDisabled(),true);
    const box = await viewport(page).boundingBox();await page.mouse.click(box.x+30,box.y+30);await settle(page);
    assert.equal((await strokes(page)).length,0);assert.equal(await page.evaluate(() => window.inkChanges.length),0);
    assert.equal(await page.evaluate(() => window.inkErrors.at(-1).code),'LAYER_NOT_EDITABLE');
    await page.evaluate(() => {window.penEditor.setLayerLocked('ink',false);window.penEditor.setLayerVisibility('ink',true);});
  }
  await page.evaluate(() => {window.penEditor.createLayer({name:'New ink'});window.inkChanges = [];});
  assert.deepEqual(await page.evaluate(() => window.penEditor.getToolSettings('pen')),{color:'#FF00AA',width:9.5,pressure:true});
  const box = await viewport(page).boundingBox();await page.mouse.click(box.x+50,box.y+80);await settle(page);
  assert.equal((await strokes(page))[0].width,9.5);assert.equal((await strokes(page))[0].color,'#FF00AA');
  const readOnly = await page.evaluate(async native => {
    const {createEtch} = await import('/etch.js'),card = document.createElement('div');card.style.cssText = 'width:600px;height:300px';document.body.prepend(card);
    const e = createEtch(card,{readOnly:true});await e.load(native);e.setTool('pen');
    window.readOnlyPen = e;card.id = 'read-only-pen';return JSON.stringify(e.save());
  },blank());await settle(page);
  const ro = await page.locator('#read-only-pen .etch-viewport').boundingBox();await page.mouse.move(ro.x+20,ro.y+20);await page.mouse.down();await page.mouse.move(ro.x+60,ro.y+20);await page.mouse.up();
  assert.equal(await page.evaluate(() => JSON.stringify(window.readOnlyPen.save())),readOnly);
  assert.equal(await page.evaluate(() => window.readOnlyPen.canUndo()),false);
  assert.deepEqual(await page.evaluate(() => window.readOnlyPen.getToolSettings('pen')),{color:'#24292F',width:3,pressure:true});
});

test('stored/derived limits cancel complete strokes without truncation, history, revision, or stale preview',async t => {
  const page = await pageFor(t,{editorOptions:{limits:{pointsPerElement:2}}});
  const revision = await page.evaluate(() => window.penEditor.getRevision());
  const box = await begin(page);await page.mouse.move(box.x+80,box.y+100);await page.mouse.move(box.x+120,box.y+100);await page.mouse.up();await settle(page);
  assert.equal((await strokes(page)).length,0);assert.equal(await page.evaluate(() => window.penEditor.getRevision()),revision);
  assert.equal(await page.evaluate(() => window.inkErrors.length),1);assert.equal(await page.evaluate(() => window.inkErrors[0].code),'LIMIT_EXCEEDED');
  assert.equal(await page.locator('#pen-card .etch-live').isVisible(),false);
  // A valid tap after failure demonstrates pointer ownership was released.
  await page.mouse.click(box.x+50,box.y+40);assert.equal((await strokes(page)).length,1);
  await page.evaluate(async () => {
    const {createEtch} = await import('/etch.js');window.penEditor.destroy();
    window.penEditor = createEtch(document.querySelector('#pen-card'),{limits:{derivedSegmentsPerElement:10}});
    window.inkErrors = [];window.penEditor.on('error',e => window.inkErrors.push(e));window.penEditor.setViewState({zoom:1,pan:[0,0]});
  });await settle(page);
  const next = await begin(page);await page.mouse.move(next.x+150,next.y+100);await settle(page);await page.mouse.up();await settle(page);
  assert.equal((await strokes(page)).length,0);assert.equal(await page.evaluate(() => window.penEditor.canUndo()),false);
  assert.equal(await page.evaluate(() => window.inkErrors.at(-1).code),'LIMIT_EXCEEDED');
  assert.equal(await page.locator('#pen-card .etch-live').isVisible(),false);
});

test('Space/middle-drag temporarily pan, keyboard tools stay scoped, and settings affect only subsequent marks',async t => {
  const page = await pageFor(t);let box = await viewport(page).boundingBox();
  await viewport(page).focus();await page.keyboard.down('Space');await begin(page,40,50);await page.mouse.move(box.x+80,box.y+70);await page.mouse.up();await page.keyboard.up('Space');
  assert.equal((await strokes(page)).length,0);assert.equal(await page.evaluate(() => window.penEditor.getTool()),'pen');
  assert.deepEqual(await page.evaluate(() => window.penEditor.getViewState().pan),[40,20]);
  await page.mouse.move(box.x+40,box.y+50);await page.mouse.down({button:'middle'});await page.mouse.move(box.x+60,box.y+50);await page.mouse.up({button:'middle'});
  assert.deepEqual(await page.evaluate(() => window.penEditor.getViewState().pan),[60,20]);
  await viewport(page).focus();await page.keyboard.press('h');assert.equal(await page.evaluate(() => window.penEditor.getTool()),'hand');
  await page.keyboard.press('b');assert.equal(await page.evaluate(() => window.penEditor.getTool()),'pen');
  await page.locator('#native').focus();await page.keyboard.press('h');assert.equal(await page.evaluate(() => window.penEditor.getTool()),'pen');
  await page.evaluate(() => window.penEditor.setViewState({zoom:1,pan:[0,0]}));await settle(page);
  box = await begin(page); // Refresh coordinates after shortcut layout and focus scrolling.
  await page.mouse.move(box.x+90,box.y+100);
  await page.evaluate(() => window.penEditor.setToolSettings('pen',{color:'#FF0000',width:20}));
  await page.mouse.up();assert.equal((await strokes(page))[0].width,3);assert.equal((await strokes(page))[0].color,'#24292F');
  await page.mouse.click(box.x+40,box.y+40);assert.equal((await strokes(page))[1].width,20);
});

test('load cancels ink while busy, committed content stays saveable, and destroy releases a queued wet frame',async t => {
  const page = await pageFor(t);await begin(page);await page.evaluate(async native => {
    const original = window.createImageBitmap;window.originalInkDecode = original;
    let release;const gate = new Promise(r => {release = r;});window.releaseInkDecode = release;
    window.createImageBitmap = async (...args) => {await gate;return original(...args);};
    window.pendingInkLoad = window.penEditor.load(native);
  },fixture());
  assert.equal((await strokes(page)).length,0);assert.equal(await page.locator('#pen-card').getByRole('button',{name:'Pen',exact:true}).isDisabled(),true);
  await page.mouse.up();await settle(page);
  const box = await viewport(page).boundingBox();await page.mouse.click(box.x+20,box.y+20);assert.equal(await page.evaluate(() => window.inkChanges.length),0);
  await page.evaluate(async () => {window.releaseInkDecode();await window.pendingInkLoad;window.createImageBitmap = window.originalInkDecode;});await settle(page);
  const count = (await strokes(page)).length;await begin(page,100,100);await page.mouse.move(box.x+160,box.y+100);
  await page.evaluate(() => {window.deadInkRoot = document.querySelector('#pen-card .etch');window.penEditor.destroy();});await page.mouse.up();await settle(page);
  assert.equal(await page.locator('#pen-card').evaluate(el => el.childElementCount),0);
  const destroyed = await page.evaluate(() => {
    window.deadInkRoot.dispatchEvent(new KeyboardEvent('keydown',{key:'p',bubbles:true}));
    try {window.penEditor.getTool();} catch (e) {return e.code;}
  });assert.equal(destroyed,'DESTROYED');assert.equal(count,1);assert.equal(await page.evaluate(() => window.inkChanges.length),0);
});

if (name === 'chromium') {
  test('stylus pressure/coalesced samples persist once; incidental palm and wheel cannot navigate or finish ink',async t => {
    const page = await pageFor(t),box = await viewport(page).boundingBox(),cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:box.x+20,y:box.y+80,button:'left',buttons:1,pointerType:'pen',force:0.2});
    await page.evaluate(() => {
      const el = document.querySelector('#pen-card .etch-viewport'),box = el.getBoundingClientRect(),id = window.inkPointerId;
      const make = (x,p,time) => {
        const e = new PointerEvent('pointermove',{pointerId:id,pointerType:'pen',buttons:1,pressure:p,clientX:box.left+x,clientY:box.top+80});
        Object.defineProperty(e,'timeStamp',{value:time});return e;
      };
      const a = make(40,0.8,100),b = make(60,1,101),outer = make(60,1,101);
      Object.defineProperty(outer,'getCoalescedEvents',{value:() => [a,b]});el.dispatchEvent(outer);
      el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:99,pointerType:'touch',button:0,clientX:box.left+150,clientY:box.top+80}));
      el.dispatchEvent(new PointerEvent('pointermove',{pointerId:99,pointerType:'touch',buttons:1,clientX:box.left+200,clientY:box.top+100}));
      el.dispatchEvent(new PointerEvent('pointerup',{pointerId:99,pointerType:'touch'}));
      const wheel = new WheelEvent('wheel',{deltaY:100,ctrlKey:true,cancelable:true});el.dispatchEvent(wheel);window.inkWheelBlocked = wheel.defaultPrevented;
    });await settle(page);
    assert.equal((await strokes(page)).length,0);assert.deepEqual(await page.evaluate(() => window.penEditor.getViewState()),{zoom:1,pan:[0,0],expanded:false});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x+60,y:box.y+80,button:'left',buttons:0,pointerType:'pen',force:0});await settle(page);
    const stroke = (await strokes(page))[0];assert.equal(stroke.pressure,true);assert.equal(stroke.points.length,3);
    for (const [i,p] of [0.2,0.41,0.6165].entries()) assert.ok(Math.abs(stroke.points[i][2]-p) < 1e-6);
    assert.equal(await page.evaluate(() => window.inkWheelBlocked),true);assert.equal(await page.evaluate(() => window.inkChanges.length),1);
  });
  test('explicit finger-off navigates; finger-on commits constant ink, while second touch cancels into pinch',async t => {
    const page = await pageFor(t,{editorOptions:{drawWithTouch:false},contextOptions:{hasTouch:true}}),box = await viewport(page).boundingBox(),cdp = await page.context().newCDPSession(page);
    const point = (id,x,y=80) => ({id,x:box.x+x,y:box.y+y});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,40)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,60)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal((await strokes(page)).length,0);assert.deepEqual(await page.evaluate(() => window.penEditor.getViewState().pan),[20,0]);
    await page.evaluate(() => {window.penEditor.setViewState({zoom:1,pan:[0,0]});window.penEditor.setDrawWithTouch(true);});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,40)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,60)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal((await strokes(page)).length,1);assert.equal((await strokes(page))[0].pressure,false);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,40)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,60)]});await settle(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,60),point(2,160)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,80,100),point(2,180,100)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle(page);
    assert.equal((await strokes(page)).length,1);assert.equal(await page.evaluate(() => window.inkChanges.length),1);
    assert.deepEqual(await page.evaluate(() => window.penEditor.getViewState().pan),[20,20]);
  });
}
