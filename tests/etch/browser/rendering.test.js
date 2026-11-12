import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
import {fixture} from '../test/helpers.js';

const name = process.env.ETCH_RENDER_BROWSER ?? 'chromium';
if (!['chromium','firefox'].includes(name)) throw new Error('ETCH_RENDER_BROWSER must be chromium or firefox');
const runtime = useBrowser(name);
const I = [1,0,0,1,0,0];
const rect = (id,x,y,width,height,fill,extra={}) => ({id,type:'rect',transform:I,x,y,width,height,fill,stroke:null,strokeWidth:0,lineJoin:'round',miterLimit:4,...extra});
function scene() {
  const d = fixture(), e = d.layers[0].elements;
  d.layers = [
    {id:'base',name:'Base',offset:[10,10],visible:true,locked:false,elements:[
      rect('red',0,0,120,100,'#FF0000'),
      {...e[3],id:'ellipse',cx:180,cy:40,rx:30,ry:20,fill:'#00AA00'},
      {...e[4],id:'hole',transform:I,commands:[['M',250,10],['L',330,10],['L',330,90],['L',250,90],['Z'],
        ['M',275,35],['L',305,35],['L',305,65],['L',275,65],['Z']],fillRule:'evenodd',fill:'#00AAFF',stroke:null,strokeWidth:0},
      {...e[1],id:'line',start:[20,130],end:[120,130],stroke:'#000000',strokeWidth:10,lineCap:'square'},
      {...e[0],id:'pressure',points:[[180,140,0],[230,140,1]],width:20,color:'#8844AA'},
      {...e[5],id:'png',x:350,y:120,width:32,height:32,transform:[1,0.1,0.3,1,0,0]},
      rect('affine',0,0,40,30,'#FF8800',{transform:[1,0.4,0.6,1,400,20],stroke:'#112233',strokeWidth:6}),
    ]},
    {id:'upper',name:'Upper',offset:[20,20],visible:true,locked:true,elements:[rect('blue',0,0,60,40,'#0000FF')]},
    {id:'hidden',name:'Hidden',offset:[0,0],visible:false,locked:false,elements:[rect('hidden-rect',0,0,600,300,'#000000')]},
  ]; return d;
}
async function pageFor(t,options={}) {
  const {browser,server} = runtime;
  const context = await browser.newContext({viewport:{width:1280,height:800},...options}),page = await context.newPage();
  const errors = [];
  page.on('pageerror',error => errors.push(error.message));
  page.on('console',message => {if (message.type() === 'error') errors.push(message.text());});
  t.after(async () => {await context.close();assert.deepEqual(errors,[]);});
  await page.goto(`${server.origin}/demo/`);await collapseDemoSidebar(page); return page;
}
async function settle(page) {await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));}
async function mount(page,native=scene(),options={}) {
  await page.evaluate(async ({native,options}) => {
    const {createEtch} = await import('/etch.js');
    const card = document.createElement('div');card.id = 'render-card';
    card.style.cssText = `width:${options.width ?? 600}px;height:${options.height ?? 320}px;${options.hidden ? 'display:none' : ''}`;
    document.body.prepend(card);
    window.renderEditor = createEtch(card,{readOnly:options.readOnly ?? false});
    await window.renderEditor.load(native);
    window.renderEditor.setViewState({zoom:1,pan:[0,0]});
  },{native,options});
  await settle(page);
}
async function pixel(page,x,y,selector='#render-card .etch-committed') {
  return page.locator(selector).evaluate((canvas,[x,y]) => {
    const box = canvas.getBoundingClientRect();
    return [...canvas.getContext('2d').getImageData(Math.floor(x*canvas.width/box.width),Math.floor(y*canvas.height/box.height),1,1).data];
  },[x,y]);
}
const closeColor = (a,b,tolerance=1) => a.forEach((n,i) => assert.ok(Math.abs(n-b[i]) <= tolerance,`${a} != ${b}`));

test('native types, affine transforms, alpha PNG, pressure width, holes and locked-layer painter order render correctly',async t => {
  const page = await pageFor(t);await mount(page);
  assert.deepEqual(await pixel(page,15,15),[255,0,0,255]);
  assert.deepEqual(await pixel(page,40,40),[0,0,255,255]);
  assert.deepEqual(await pixel(page,190,50),[0,170,0,255]);
  assert.deepEqual(await pixel(page,270,30),[0,170,255,255]);
  assert.deepEqual(await pixel(page,300,60),[0,0,0,0]);
  assert.deepEqual(await pixel(page,60,140),[0,0,0,255]);
  assert.deepEqual(await pixel(page,239,156),[136,68,170,255]);
  assert.deepEqual(await pixel(page,191,156),[0,0,0,0]);
  assert.deepEqual(await pixel(page,439,53),[255,136,0,255]);
  closeColor(await pixel(page,416,183),[40,120,200,128]);
  assert.equal(await page.locator('#render-card .etch-viewport canvas').count(),2);
  assert.equal(await page.locator('#render-card .etch-empty').isVisible(),false);
  assert.equal(await page.evaluate(() => window.renderEditor.save().background),null);
  assert.match(await page.locator('#render-card .etch-sr-only').innerText(),/1 image.*Original blue pixel/);
});

test('visibility, layer translation, Merge Down and undo preserve pixels and stacking',async t => {
  const page = await pageFor(t);await mount(page);
  await page.evaluate(() => window.renderEditor.setLayerVisibility('upper',false));await settle(page);
  assert.deepEqual(await pixel(page,40,40),[255,0,0,255]);
  await page.evaluate(() => {window.renderEditor.undo();window.renderEditor.setLayerLocked('upper',false);window.renderEditor.translateLayer('upper',[100,0]);});
  await settle(page);assert.deepEqual(await pixel(page,40,40),[255,0,0,255]);
  assert.deepEqual(await pixel(page,150,40),[0,0,255,255]);
  await page.evaluate(() => window.renderEditor.undo());await settle(page);
  const before = await page.locator('#render-card .etch-committed').evaluate(c => c.toDataURL());
  await page.evaluate(() => window.renderEditor.mergeDown('upper'));await settle(page);
  assert.equal(await page.locator('#render-card .etch-committed').evaluate(c => c.toDataURL()),before);
  await page.evaluate(() => window.renderEditor.undo());await settle(page);
  assert.equal(await page.locator('#render-card .etch-committed').evaluate(c => c.toDataURL()),before);
});

test('composited lower-layer previews stay below upper shapes/images and eraser omissions reveal lower content',async t => {
  const page = await pageFor(t);
  const result = await page.evaluate(async () => {
    const {createCanvasRenderer} = await import('/etch/rendering/canvas.js');
    const {Viewport} = await import('/etch/viewport.js');
    const viewport = document.createElement('div');viewport.style.cssText = 'position:relative;width:200px;height:100px';document.body.prepend(viewport);
    const rect = (id,x,fill) => ({id,type:'rect',transform:[1,0,0,1,0,0],x,y:0,width:80,height:80,fill,stroke:null,strokeWidth:0,lineJoin:'round',miterLimit:4});
    const image = document.createElement('canvas');image.width = image.height = 2;
    image.getContext('2d').fillStyle = '#0000FF';image.getContext('2d').fillRect(0,0,2,2);
    const lower = rect('lower',0,'#FF0000');lower.width = 180;
    const documentData = {background:'#FFFF00',layers:[{id:'lower-layer',visible:true,offset:[0,0],elements:[lower]},
      {id:'upper-layer',visible:true,offset:[0,0],elements:[rect('upper',30,'#0000FF'),{id:'image',type:'image',assetId:'png',transform:[1,0,0,1,0,0],x:120,y:0,width:60,height:80}]}]};
    const view = new Viewport();
    const errors = [];
    const state = {document:documentData,assets:new Map([['png',image]]),getActiveLayer:() => 'lower-layer',getSelection:() => [],readOnly:false,busy:false};
    const renderer = createCanvasRenderer(viewport,state,view,{onViewChange(){},onError:e => errors.push(e.code)});
    view.set({zoom:1,pan:[0,0]});
    renderer.setPreview({layerId:'lower-layer',elements:[{...lower,fill:'#00FF00'}]});
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const canvases = viewport.querySelectorAll('canvas');
    const read = (canvas,x) => [...canvas.getContext('2d').getImageData(x,30,1,1).data];
    const preview = {lower:read(canvases[1],10),upper:read(canvases[1],50),image:read(canvases[1],140),mainHidden:canvases[0].hidden};
    renderer.setPreview({layerId:'lower-layer',elements:[]});
    await new Promise(r => requestAnimationFrame(r));
    const erased = read(canvases[1],10);
    renderer.clearPreview();await new Promise(r => requestAnimationFrame(r));
    const restored = read(canvases[0],10),liveHidden = canvases[1].hidden,cleared = read(canvases[1],10);
    renderer.destroy();viewport.remove();return {preview,erased,restored,liveHidden,cleared,errors};
  });
  assert.deepEqual(result,{preview:{lower:[0,255,0,255],upper:[0,0,255,255],image:[0,0,255,255],mainHidden:true},
    erased:[255,255,0,255],restored:[255,0,0,255],liveHidden:true,cleared:[0,0,0,0],errors:[]});
});

test('DPR backing size, zero-size reveal and card/sidebar resizes preserve world center and canvas identity',async t => {
  const page = await pageFor(t,{deviceScaleFactor:2});await mount(page,scene(),{width:900,height:350});
  await page.evaluate(() => {
    window.renderEditor.setViewState({zoom:2,pan:[100,120]});
    window.retainedCanvas = document.querySelector('#render-card .etch-committed');
  });await settle(page);
  const center = () => page.evaluate(() => {
    const c = document.querySelector('#render-card .etch-committed'),box = c.getBoundingClientRect(),v = window.renderEditor.getViewState();
    return {x:(box.width/2-v.pan[0])/v.zoom,y:(box.height/2-v.pan[1])/v.zoom,zoom:v.zoom,ratio:c.width/box.width};
  });
  const before = await center();assert.ok(Math.abs(before.ratio-2) < 0.01);
  await page.locator('#render-card .etch-sidebar-toggle').click();await settle(page);
  const opened = await center();assert.ok(Math.abs(opened.x-before.x) < 1e-7 && Math.abs(opened.y-before.y) < 1e-7);
  await page.locator('#render-card').evaluate(el => {el.style.display = 'none';});await settle(page);
  assert.equal(await page.locator('#render-card .etch-committed').evaluate(c => c.width),0);
  await page.locator('#render-card').evaluate(el => {el.style.width = '600px';el.style.height = '300px';el.style.display = 'block';});await settle(page);
  const revealed = await center();assert.ok(Math.abs(revealed.x-before.x) < 1e-7 && Math.abs(revealed.y-before.y) < 1e-7);
  assert.equal(await page.evaluate(() => window.retainedCanvas === document.querySelector('#render-card .etch-committed')),true);
  if (name === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    // CDP's DPR-only override emits neither resize nor resolution-media events.
    // A one-pixel window change supplies the normal browser display-change notification.
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1279,height:800,deviceScaleFactor:1,mobile:false});await settle(page);
    await page.waitForFunction(() => document.querySelector('#render-card .etch-committed').width === Math.round(document.querySelector('#render-card .etch-viewport').getBoundingClientRect().width));
    const changed = await center();assert.ok(Math.abs(changed.x-before.x) < 1e-7);assert.ok(Math.abs(changed.ratio-1) < 0.01);
  }
});

test('initially hidden mount allocates no backing pixels, then reveals and fits visible painted bounds',async t => {
  const page = await pageFor(t);await mount(page,scene(),{hidden:true,width:700});
  assert.equal(await page.locator('#render-card .etch-committed').evaluate(c => c.width*c.height),0);
  await page.locator('#render-card').evaluate(el => {el.style.display = 'block';});await settle(page);
  const result = await page.evaluate(async () => {
    const {documentBounds} = await import('/etch/geometry/paths.js');
    const editor = window.renderEditor,viewport = document.querySelector('#render-card .etch-viewport'),box = viewport.getBoundingClientRect();
    const initial = editor.getViewState();editor.fit();
    const v = editor.getViewState(),b = documentBounds(editor.save());
    return {initialCenter:[(box.width/2-initial.pan[0])/initial.zoom,(box.height/2-initial.pan[1])/initial.zoom],
      fit:[b.x*v.zoom+v.pan[0],b.y*v.zoom+v.pan[1],(b.x+b.width)*v.zoom+v.pan[0],(b.y+b.height)*v.zoom+v.pan[1]],width:box.width,height:box.height};
  });
  assert.deepEqual(result.initialCenter,[0,0]);
  assert.ok(result.fit[0] >= 24-1e-7 && result.fit[1] >= 24-1e-7);
  assert.ok(result.fit[2] <= result.width-24+1e-7 && result.fit[3] <= result.height-24+1e-7);
});

test('real pointer capture, wheel/keyboard zoom anchoring and navigation remain read-only content operations',async t => {
  const page = await pageFor(t);await mount(page,scene(),{readOnly:true});
  await page.evaluate(() => {
    window.nativeBefore = JSON.stringify(window.renderEditor.save());window.revisionBefore = window.renderEditor.getRevision();
    window.contentChanges = 0;window.viewChanges = 0;
    window.renderEditor.on('change',() => window.contentChanges++);window.renderEditor.on('viewchange',() => window.viewChanges++);
  });
  const viewport = page.locator('#render-card .etch-viewport'),box = await viewport.boundingBox();
  await page.mouse.move(box.x+80,box.y+80);await page.mouse.down();
  await page.mouse.move(box.x+780,box.y+380);await page.mouse.up();await settle(page);
  assert.deepEqual(await page.evaluate(() => window.renderEditor.getViewState().pan),[700,300]);
  await page.evaluate(() => window.renderEditor.setViewState({zoom:1,pan:[0,0]}));await settle(page);
  await page.mouse.move(box.x+150,box.y+100);await page.mouse.wheel(25,50);
  await page.waitForFunction(() => window.renderEditor.getViewState().pan[1] === -50);
  const old = await page.evaluate(() => window.renderEditor.getViewState());
  await page.keyboard.down('Control');await page.mouse.wheel(0,-120);await page.keyboard.up('Control');
  await page.waitForFunction(() => window.renderEditor.getViewState().zoom > 1);
  const next = await page.evaluate(() => window.renderEditor.getViewState());
  assert.ok(Math.abs((150-next.pan[0])/next.zoom-(150-old.pan[0])/old.zoom) < 1e-6);
  assert.ok(Math.abs((100-next.pan[1])/next.zoom-(100-old.pan[1])/old.zoom) < 1e-6);
  await page.locator('#render-card').getByRole('button',{name:'100%',exact:true}).click();await settle(page);
  assert.equal(await page.evaluate(() => window.renderEditor.getViewState().zoom),1);
  await viewport.focus();await page.keyboard.press('+');await settle(page);
  assert.ok(await page.evaluate(() => window.renderEditor.getViewState().zoom > 1));
  const preserved = await page.evaluate(() => ({native:JSON.stringify(window.renderEditor.save()) === window.nativeBefore,
    revision:window.renderEditor.getRevision() === window.revisionBefore,changes:window.contentChanges,views:window.viewChanges}));
  assert.equal(preserved.native,true);assert.equal(preserved.revision,true);assert.equal(preserved.changes,0);assert.ok(preserved.views > 0);
});

if (name === 'chromium') test('two-finger touch pans and zooms together without jumping to a new anchor',async t => {
  const page = await pageFor(t,{hasTouch:true});await mount(page);
  const box = await page.locator('#render-card .etch-viewport').boundingBox(),cdp = await page.context().newCDPSession(page);
  const points = (x1,x2,y) => [{x:box.x+x1,y:box.y+y,id:1},{x:box.x+x2,y:box.y+y,id:2}];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(80,180,80)});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(60,220,100)});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle(page);
  const view = await page.evaluate(() => window.renderEditor.getViewState());
  assert.ok(Math.abs(view.zoom-1.6) < 0.02);assert.ok(Math.abs(view.pan[0]+68) < 2);assert.ok(Math.abs(view.pan[1]+28) < 2);
});

test('view events coalesce, failed geometry load stays atomic, and destroy cancels queued work/listeners',async t => {
  const page = await pageFor(t);await mount(page);
  const result = await page.evaluate(async native => {
    const editor = window.renderEditor,before = JSON.stringify(editor.save()),revision = editor.getRevision();
    let views = 0, observed;editor.on('viewchange',() => views++);
    editor.on('selectionchange',() => editor.setViewState({zoom:2}));
    editor.on('selectionchange',() => {observed = editor.getViewState().zoom;});
    editor.setActiveLayer('upper');
    const reentrant = observed === 1 && editor.getViewState().zoom === 2;
    editor.setViewState({zoom:2});editor.setViewState({zoom:3});editor.setViewState({zoom:4});
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const coalesced = views;native.layers[0].elements[0].points = [[0,0,1],[1_000_000,0,1]];native.layers[0].elements[0].width = 0.01;
    let loadCode;try {await editor.load(native);} catch (e) {loadCode = e.code;}
    const atomic = JSON.stringify(editor.save()) === before && editor.getRevision() === revision;
    const viewport = document.querySelector('#render-card .etch-viewport'),root = document.querySelector('#render-card .etch');
    editor.setViewState({zoom:5});editor.destroy();editor.destroy();
    const wheel = new WheelEvent('wheel',{deltaY:10,cancelable:true});viewport.dispatchEvent(wheel);
    root.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    let destroyed;try {editor.getViewState();} catch (e) {destroyed = e.code;}
    return {coalesced,reentrant,loadCode,atomic,views,destroyed,prevented:wheel.defaultPrevented,children:document.querySelector('#render-card').childElementCount};
  },fixture());
  assert.deepEqual(result,{coalesced:1,reentrant:true,loadCode:'LIMIT_EXCEEDED',atomic:true,views:1,destroyed:'DESTROYED',prevented:false,children:0});
});

test('oversized viewport allocations fail safely and recover on resize',async t => {
  const page = await pageFor(t);await mount(page);
  await page.evaluate(() => {window.renderErrors = [];window.renderEditor.on('error',e => window.renderErrors.push(e));});
  await page.locator('#render-card').evaluate(el => {el.style.width = '9000px';});await settle(page);
  assert.equal(await page.evaluate(() => window.renderErrors.at(-1).code),'LIMIT_EXCEEDED');
  assert.ok(await page.locator('#render-card .etch-committed').evaluate(c => c.width <= 8192 && c.width*c.height <= 16_777_216));
  await page.locator('#render-card').evaluate(el => {el.style.width = '600px';});await settle(page);
  await page.evaluate(() => window.renderEditor.setViewState({zoom:1,pan:[0,0]}));await settle(page);
  assert.deepEqual(await pixel(page,40,40),[0,0,255,255]);
});

test('public demo loads the original multi-layer sample and frames it without a drawing tool',async t => {
  const page = await pageFor(t);
  await page.getByRole('button',{name:'Load sample drawing',exact:true}).click();
  await page.waitForFunction(() => document.querySelector('.etch-empty').hidden);
  await settle(page);
  assert.equal(await page.locator('.etch-empty').isVisible(),false);
  assert.equal(JSON.parse(await page.locator('#native').inputValue()).layers.length,3);
  const painted = await page.locator('.etch-committed').evaluate(c => {
    const data = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let count = 0;for (let i = 3; i < data.length; i += 4) if (data[i]) count++;
    return count;
  });assert.ok(painted > 5000);
  await page.getByRole('button',{name:'Fit drawing',exact:true}).click();
});
