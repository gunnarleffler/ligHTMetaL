import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
const name = process.env.ETCH_ERASER_BROWSER ?? 'chromium';
if (!['chromium','firefox'].includes(name)) throw new Error('ETCH_ERASER_BROWSER must be chromium or firefox');
const runtime = useBrowser(name);
const matrix = [1,0,0,1,0,0];
const rect = (id,x,y,width,height,fill) => ({id,type:'rect',transform:matrix,x,y,width,height,fill,stroke:null,strokeWidth:0,lineJoin:'round',miterLimit:4});
const pen = patch => ({id:'pen',type:'stroke',transform:matrix,color:'#0000FF',width:14,pressure:true,points:[[40,120,1],[230,120,0.2],[420,120,1]],...patch});
const native = (e=pen()) => ({format:'lightmetal-etch',version:1,background:null,assets:[],layers:[
  {id:'floor',name:'Underneath',offset:[0,0],visible:true,locked:false,elements:[rect('red',0,0,800,360,'#FF0000')]},
  {id:'ink',name:'Freehand',offset:[0,0],visible:true,locked:false,elements:[e,rect('shape',470,40,60,80,'#00AA00'),{id:'path',type:'path',transform:matrix,commands:[['M',560,40],['L',600,40],['L',600,80],['L',560,80],['Z']],fill:'#00AA00',stroke:null,strokeWidth:0,lineCap:'butt',lineJoin:'round',miterLimit:4,fillRule:'nonzero'}]},
  {id:'upper',name:'Above',offset:[0,0],visible:true,locked:false,elements:[rect('cover',180,105,20,30,'#111111')]},
]});
const root = page => page.locator('#ink-card'),viewport = page => root(page).locator('.etch-viewport');
async function settle(page) {await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));}
async function pageFor(t,{data=native(),options={},contextOptions={}}={}) {
  const {browser,server} = runtime;
  const context = await browser.newContext({viewport:{width:1280,height:900},...contextOptions}),page = await context.newPage(),errors = [],external = [];
  page.on('pageerror',e => errors.push(e.message));page.on('console',m => {if (m.type() === 'error') errors.push(m.text());});
  page.on('request',r => {if (!r.url().startsWith(server.origin+'/') && !/^(blob:|data:)/.test(r.url())) external.push(r.url());});
  t.after(async () => {await context.close();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});await page.goto(`${server.origin}/demo/`);await collapseDemoSidebar(page);
  await page.evaluate(async ({data,options}) => {
    const {createEtch} = await import('/etch.js'),card = document.createElement('div');card.id = 'ink-card';card.style.cssText = 'width:900px;height:460px';document.body.prepend(card);
    const e = window.inkEditor = createEtch(card,options);await e.load(data);e.setActiveLayer('ink');e.setTool('eraser');e.setToolSettings('eraser',{mode:'partial',radius:8});e.setViewState({zoom:1,pan:[0,0]});
    window.inkChanges = [];window.inkErrors = [];e.on('change',e => window.inkChanges.push(e));e.on('error',e => window.inkErrors.push(e));card.querySelector('.etch-viewport').addEventListener('pointerdown',e => {window.inkPointer = e.pointerId;});
  },{data,options});await settle(page);return page;
}
async function restore(page,data=native()) {await page.evaluate(async data => {const e = window.inkEditor;await e.load(data);e.setActiveLayer('ink');e.setTool('eraser');e.setToolSettings('eraser',{mode:'partial',radius:8});e.setViewState({zoom:1,pan:[0,0]});window.inkChanges = [];window.inkErrors = [];},data);await settle(page);}
const save = page => page.evaluate(() => window.inkEditor.save());
const ink = page => page.evaluate(() => window.inkEditor.save().layers.find(l => l.id === 'ink').elements.filter(e => e.type === 'ink'));
async function begin(page,x=230,y=120) {await page.evaluate(() => window.scrollTo({top:0,left:0,behavior:'instant'}));await settle(page);const b = await viewport(page).boundingBox();await page.mouse.move(b.x+x,b.y+y);await page.mouse.down();return b;}
async function tap(page,x=230,y=120) {await begin(page,x,y);await page.mouse.up();await settle(page);}
async function pixel(page,canvas,x,y) {return root(page).locator(`.etch-${canvas}`).evaluate((c,[x,y]) => {const b = c.getBoundingClientRect();return [...c.getContext('2d').getImageData(Math.floor(x*c.width/b.width),Math.floor(y*c.height/b.height),1,1).data];},[x,y]);}

test('DPR-2 pressure preview preserves untouched pixels, painter order and committed-only saves; cut/Undo/redo/reopen are exact',async t => {
  const page = await pageFor(t,{contextOptions:{deviceScaleFactor:2}});await page.evaluate(() => {
    window.inkEditor.setSelection(['pen','shape']);const c = document.querySelector('#ink-card .etch-committed');window.originalPixels = c.getContext('2d').getImageData(0,0,c.width,c.height);
  });const before = await save(page),revision = await page.evaluate(() => window.inkEditor.getRevision());
  await begin(page);await settle(page);assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => window.inkEditor.getRevision()),revision);assert.equal(await page.evaluate(() => window.inkChanges.length),0);
  assert.deepEqual(await pixel(page,'live',230,120),[255,0,0,255]);assert.deepEqual(await pixel(page,'live',190,120),[17,17,17,255]);assert.deepEqual(await pixel(page,'live',210,120),[0,0,255,255]);
  const diff = await root(page).locator('.etch-live').evaluate(c => {const old = window.originalPixels.data,data = c.getContext('2d').getImageData(0,0,c.width,c.height).data,dpr = c.width/c.getBoundingClientRect().width;let diff = 0,maxDelta = 0,examples = [];for (let y = 0;y < c.height;y++) for (let x = 0;x < c.width;x++) {if (Math.abs(x/dpr-230) < 35 && Math.abs(y/dpr-120) < 35) continue;const i = 4*(y*c.width+x);if (data[i] !== old[i] || data[i+1] !== old[i+1] || data[i+2] !== old[i+2] || data[i+3] !== old[i+3]) {diff++;for (let j = 0;j < 4;j++) maxDelta = Math.max(maxDelta,Math.abs(data[i+j]-old[i+j]));if (examples.length < 5) examples.push({x,y,before:[...old.slice(i,i+4)],after:[...data.slice(i,i+4)]});}}return {diff,maxDelta,examples};});// Regrouping identical cubic commands into two Path2Ds can change a few
  // edge-coverage bytes in native Canvas. No changed interior pixel is allowed.
  assert.ok(diff.maxDelta <= 8 && diff.diff <= 8 && diff.examples.every(p => p.before[0] > 0 && p.before[2] > 0 && p.after[0] > 0 && p.after[2] > 0),JSON.stringify(diff));
  const wet = await root(page).locator('.etch-live').evaluate(c => c.toDataURL());await page.mouse.up();await settle(page);const after = await save(page),p = await ink(page);assert.equal(p.length,2);assert.equal(p[0].id,'pen');assert.equal(after.layers[1].elements[2].id,'shape');assert.deepEqual(after.layers[0],before.layers[0]);assert.deepEqual(after.layers[2],before.layers[2]);
  assert.deepEqual(await page.evaluate(() => window.inkEditor.getSelection()),['pen','shape']);assert.equal(await page.evaluate(() => window.inkChanges.length),1);assert.equal(await page.evaluate(() => window.inkChanges[0].label),'Partially erase ink');assert.equal(await root(page).locator('.etch-committed').evaluate(c => c.toDataURL()),wet);
  await page.evaluate(() => window.inkEditor.undo());assert.deepEqual(await save(page),before);await page.evaluate(() => window.inkEditor.redo());assert.deepEqual(await save(page),after);await page.evaluate(async () => window.inkEditor.load(window.inkEditor.save()));await settle(page);assert.deepEqual(await save(page),after);assert.equal(await root(page).locator('.etch-committed').evaluate(c => c.toDataURL()),wet);
});

test('subsequent partial cuts work on native ink and gaps are no-ops in both Partial and Whole Object modes',async t => {
  const page = await pageFor(t);await tap(page);const first = await save(page),revision = await page.evaluate(() => window.inkEditor.getRevision());await tap(page);assert.deepEqual(await save(page),first);assert.equal(await page.evaluate(() => window.inkEditor.getRevision()),revision);
  await page.evaluate(() => window.inkEditor.setToolSettings('eraser',{mode:'object',radius:2}));await tap(page);assert.deepEqual(await save(page),first);
  await page.evaluate(() => window.inkEditor.setToolSettings('eraser',{mode:'partial',radius:8}));await tap(page,100,120);assert.equal((await ink(page)).length,3);const second = await save(page);
  await page.evaluate(() => window.inkEditor.undo());assert.deepEqual(await save(page),first);await page.evaluate(() => window.inkEditor.redo());assert.deepEqual(await save(page),second);
  await page.evaluate(() => window.inkEditor.setToolSettings('eraser',{mode:'object',radius:2}));await tap(page,60,120);assert.equal((await ink(page)).length,2);
});

test('coalesced bends and release samples cut multiple freehand sections in one undo step',async t => {
  const page = await pageFor(t);await begin(page,110,70);
  await viewport(page).evaluate(el => {const b = el.getBoundingClientRect(),id = window.inkPointer,make = (x,y,type='pointermove') => new PointerEvent(type,{pointerId:id,pointerType:'mouse',buttons:type === 'pointerup' ? 0 : 1,clientX:b.left+x,clientY:b.top+y});const move = make(330,170);Object.defineProperty(move,'getCoalescedEvents',{value:() => [make(110,170),move]});el.dispatchEvent(move);const up = make(330,70,'pointerup');Object.defineProperty(up,'getCoalescedEvents',{value:() => [make(330,100)]});el.dispatchEvent(up);});
  await page.mouse.up();await settle(page);assert.equal((await ink(page)).length,3);assert.equal(await page.evaluate(() => window.inkChanges.length),1);assert.equal(await page.evaluate(() => window.inkErrors.length),0);
});

test('curved variable pressure survives affine reflection/skew, layer offsets, zoom and DPR with a CSS-sized gap',async t => {
  const e = pen({transform:[1,0.2,0.6,-0.8,0,220],points:[[40,100,1],[150,30,0.1],[300,170,0.8],[420,100,1]]}),data = native(e);data.layers[1].offset = [20,10];const page = await pageFor(t,{data,contextOptions:{deviceScaleFactor:2}});
  const point = await page.evaluate(async () => {const {strokeSegments} = await import('/etch/geometry/stroke.js');const {apply,multiply,translate} = await import('/etch/geometry/matrix.js');const e = window.inkEditor.save().layers[1].elements[0],segment = [...strokeSegments(e.points)][2],p = segment[0].map((n,i) => n*0.25+segment[1][i]*0.5+segment[2][i]*0.25);return apply(multiply(translate(20,10),e.transform),p);});
  await tap(page,...point);assert.ok((await ink(page)).length >= 2);assert.deepEqual(await pixel(page,'committed',...point),[255,0,0,255]);assert.equal(await page.evaluate(() => window.inkErrors.length),0);
  const simple = native(pen({points:[[40,30,1],[240,30,0.2],[420,30,1]]}));await restore(page,simple);await page.evaluate(() => window.inkEditor.setViewState({zoom:2,pan:[0,20]}));await settle(page);await tap(page,480,80);assert.equal((await ink(page)).length,2);assert.deepEqual(await pixel(page,'committed',480,80),[255,0,0,255]);
});

test('a thick Pen dot can become a vector ring; its hole is not paint and complete erasure removes the element',async t => {
  const data = native(pen({points:[[230,120,1]],width:60})),page = await pageFor(t,{data});await tap(page);assert.equal((await ink(page)).length,1);assert.deepEqual(await pixel(page,'committed',230,120),[255,0,0,255]);assert.deepEqual(await pixel(page,'committed',250,120),[0,0,255,255]);
  const ring = await save(page);await page.evaluate(() => window.inkEditor.setToolSettings('eraser',{mode:'object',radius:2}));await tap(page);assert.deepEqual(await save(page),ring);
  await page.evaluate(() => window.inkEditor.setToolSettings('eraser',{mode:'partial',radius:50}));await tap(page);assert.equal((await save(page)).layers[1].elements.some(e => e.id === 'pen'),false);await page.evaluate(() => window.inkEditor.undo());assert.deepEqual(await save(page),ring);
});

test('freehand previews cancel on Escape, capture loss, tool/layer/view/selection/load, focus and resize boundaries',async t => {
  const page = await pageFor(t);
  for (const action of ['escape','capture','pointercancel','tool','layer','view','selection','load','blur','resize']) {
    await restore(page);const b = await begin(page);await settle(page);assert.equal(await root(page).locator('.etch-live').isVisible(),true);
    if (action === 'escape') await page.keyboard.press('Escape');
    else if (action === 'capture') {await viewport(page).evaluate(el => el.releasePointerCapture(window.inkPointer));await page.mouse.move(b.x+231,b.y+120);}
    else await page.evaluate(async action => {const e = window.inkEditor,el = document.querySelector('#ink-card .etch-viewport');if (action === 'pointercancel') el.dispatchEvent(new PointerEvent('pointercancel',{pointerId:window.inkPointer,pointerType:'mouse'}));if (action === 'tool') e.setTool('pen');if (action === 'layer') e.setActiveLayer('floor');if (action === 'view') e.setViewState({zoom:2});if (action === 'selection') e.setSelection(['pen']);if (action === 'load') try {await e.load('not json');}catch{}if (action === 'blur') window.dispatchEvent(new Event('blur'));if (action === 'resize') document.querySelector('#ink-card').style.width = '850px';},action);
    await settle(page);const before = await save(page);await page.mouse.up();await settle(page);assert.deepEqual(await save(page),before,action);assert.equal((await ink(page)).length,0,action);assert.equal(await page.evaluate(() => window.inkChanges.some(c => c.label === 'Partially erase ink')),false,action);assert.equal(await root(page).locator('.etch-live').isVisible(),false,action);
    await root(page).evaluate(el => el.style.width = '900px');await settle(page);
  }
});

test('element/stored-command destination failures roll back every ink piece and permit a subsequent valid gesture',async t => {
  const full = await pageFor(t,{options:{limits:{elements:5}}}),before = await save(full),revision = await full.evaluate(() => window.inkEditor.getRevision());await tap(full);assert.deepEqual(await save(full),before);assert.equal(await full.evaluate(() => window.inkEditor.getRevision()),revision);assert.equal(await full.evaluate(() => window.inkErrors[0].code),'LIMIT_EXCEEDED');
  const page = await pageFor(t,{options:{limits:{pointsPerElement:5}}}),original = await save(page);await tap(page);assert.deepEqual(await save(page),original);assert.equal(await page.evaluate(() => window.inkErrors[0].code),'LIMIT_EXCEEDED');
  // Full removal needs no stored output commands. Fit it inside the initial disk:
  // a multi-frame sweep can correctly hit the partial-output limit before reaching
  // full removal, so recovery must not rely on pointer events racing animation frames.
  await page.evaluate(() => {window.inkEditor.setToolSettings('eraser',{radius:128});window.inkEditor.setViewState({zoom:0.5,pan:[0,0]});});
  await begin(page,115,60);await settle(page);await page.mouse.up();await settle(page);assert.equal((await save(page)).layers[1].elements.some(e => e.id === 'pen'),false);
});

test('late interactive-work failure discards an already visible ink preview and a later gesture recovers',async t => {
  const page = await pageFor(t),before = await save(page),revision = await page.evaluate(() => window.inkEditor.getRevision()),b = await begin(page);await settle(page);assert.equal(await root(page).locator('.etch-live').isVisible(),true);
  await page.evaluate(async () => {const {HitBudget} = await import('/etch/geometry/hit-test.js');window.inkStep = HitBudget.prototype.step;HitBudget.prototype.step = function(n) {this.maxWork = 0;return window.inkStep.call(this,n);};});
  await page.mouse.move(b.x+231,b.y+120);await settle(page);await page.mouse.up();await settle(page);
  await page.evaluate(async () => {const {HitBudget} = await import('/etch/geometry/hit-test.js');HitBudget.prototype.step = window.inkStep;});
  assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => window.inkEditor.getRevision()),revision);assert.equal(await page.evaluate(() => window.inkErrors[0].code),'LIMIT_EXCEEDED');assert.equal(await page.evaluate(() => window.inkChanges.length),0);assert.equal(await root(page).locator('.etch-live').isVisible(),false);
  await tap(page);assert.equal((await ink(page)).length,2);assert.equal(await page.evaluate(() => window.inkChanges.length),1);
});

test('locked/read-only/hidden destinations and ignored general shapes/paths cannot be cut; mode/radius remain captured',async t => {
  const page = await pageFor(t);for (const point of [[500,80],[580,60]]) {const before = await save(page);await tap(page,...point);assert.deepEqual(await save(page),before);}
  for (const locked of [true,false]) {await page.evaluate(locked => {const e = window.inkEditor;e.setLayerLocked('ink',locked);e.setLayerVisibility('ink',locked);},locked);const before = await save(page);await tap(page);assert.deepEqual(await save(page),before);}
  await restore(page);await begin(page);await settle(page);await page.evaluate(() => window.inkEditor.setToolSettings('eraser',{mode:'object',radius:40}));assert.equal(await root(page).locator('.etch-eraser-cursor').evaluate(el => el.getBoundingClientRect().width),16);await page.mouse.up();await settle(page);assert.equal((await ink(page)).length,2);
  const ro = await pageFor(t,{options:{readOnly:true}}),before = await save(ro);await tap(ro);assert.deepEqual(await save(ro),before);
});

test('actual demo UI draws freehand and cuts/saves/undoes it in desktop and mobile layouts',async t => {
  for (const viewportSize of [{width:1600,height:1100},{width:390,height:844}]) {
    const {browser,server} = runtime;
    const context = await browser.newContext({viewport:viewportSize}),page = await context.newPage();t.after(() => context.close());await page.goto(`${server.origin}/demo/`);await collapseDemoSidebar(page);const card = page.locator('#editor'),vp = card.locator('.etch-viewport');await card.getByRole('button',{name:'Pen',exact:true}).click();await vp.focus();await vp.scrollIntoViewIfNeeded();await settle(page);
    const b = await vp.boundingBox(),y = b.y+b.height*0.45;await page.mouse.move(b.x+40,y);await page.mouse.down();await page.mouse.move(b.x+b.width-40,y,{steps:12});await page.mouse.up();await settle(page);await page.getByRole('button',{name:'Save snapshot',exact:true}).click();const before = JSON.parse(await page.locator('#native').inputValue());assert.equal(before.layers[0].elements[0]?.type,'stroke',`${name} ${viewportSize.width}: ${await page.locator('#error').textContent()}`);
    await card.getByRole('button',{name:'Eraser',exact:true}).click();await card.getByRole('button',{name:'Toggle sidebar'}).click();await card.getByRole('combobox',{name:'Eraser mode'}).selectOption('partial');await card.getByRole('button',{name:'Toggle sidebar'}).click();await vp.scrollIntoViewIfNeeded();await settle(page);const box = await vp.boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height*0.45);await settle(page);
    await page.getByRole('button',{name:'Save snapshot',exact:true}).click();const after = JSON.parse(await page.locator('#native').inputValue());assert.equal(after.layers[0].elements.length,2);assert.ok(after.layers[0].elements.every(e => e.type === 'ink'));await card.getByRole('button',{name:'Undo',exact:true}).click();await page.getByRole('button',{name:'Save snapshot',exact:true}).click();assert.deepEqual(JSON.parse(await page.locator('#native').inputValue()),before);assert.equal(await page.locator('#error').textContent(),'');
  }
});

if (name === 'chromium') test('finger-off preserves ink, finger-on cuts, second touch cancels and pen eraser preserves selected tool',async t => {
  const page = await pageFor(t,{options:{drawWithTouch:false},contextOptions:{hasTouch:true}}),cdp = await page.context().newCDPSession(page),b = await viewport(page).boundingBox(),point = id => ({id,x:b.x+230,y:b.y+120,radiusX:2,radiusY:2,force:1}),before = await save(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.deepEqual(await save(page),before);
  await page.evaluate(() => window.inkEditor.setDrawWithTouch(true));await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle(page);assert.equal((await ink(page)).length,2);
  await restore(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1)]});await settle(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1),{...point(2),x:b.x+280}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.deepEqual(await save(page),before);
  await restore(page);await page.evaluate(() => window.inkEditor.setTool('pen'));await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:b.x+230,y:b.y+120,button:'left',buttons:1,pointerType:'pen',force:0.5});
  await viewport(page).evaluate(el => {const b = el.getBoundingClientRect();el.dispatchEvent(new PointerEvent('pointermove',{pointerId:window.inkPointer,pointerType:'pen',button:5,buttons:32,clientX:b.left+230,clientY:b.top+120}));});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:b.x+230,y:b.y+120,button:'left',buttons:0,pointerType:'pen'});await settle(page);assert.equal((await ink(page)).length,2);assert.equal(await page.evaluate(() => window.inkEditor.getTool()),'pen');assert.equal(await page.evaluate(() => window.inkChanges.length),1);
});
