import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
import {fixture} from '../test/helpers.js';

const name = process.env.ETCH_SHAPES_BROWSER ?? 'chromium';
if (!['chromium','firefox'].includes(name)) throw new Error('ETCH_SHAPES_BROWSER must be chromium or firefox');
const runtime = useBrowser(name);
const blank = () => ({format:'lightmetal-etch',version:1,background:null,layers:[{id:'ink',name:'Ink',visible:true,locked:false,offset:[0,0],elements:[]}],assets:[]});
const root = page => page.locator('#shape-card');
const viewport = page => root(page).locator('.etch-viewport');
async function settle(page) {await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));}
async function pageFor(t,{native=blank(),editorOptions={},contextOptions={}} = {}) {
  const context = await runtime.browser.newContext({viewport:{width:1280,height:900},...contextOptions}),page = await context.newPage(),errors = [],external = [];
  page.on('pageerror',e => errors.push(e.message));page.on('console',m => {if (m.type() === 'error') errors.push(m.text());});
  page.on('request',r => {if (!r.url().startsWith(runtime.server.origin+'/') && !/^(blob:|data:)/.test(r.url())) external.push(r.url());});
  t.after(async () => {await context.close();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});
  await page.goto(`${runtime.server.origin}/demo/`);await collapseDemoSidebar(page);
  await page.evaluate(async ({native,options}) => {
    const {createEtch} = await import('/etch.js'),card = document.createElement('div');card.id = 'shape-card';
    card.style.cssText = 'width:900px;height:430px';document.body.prepend(card);
    const e = window.shapeEditor = createEtch(card,options);await e.load(native);e.setViewState({zoom:1,pan:[0,0]});e.setTool('rect');
    window.shapeChanges = [];window.shapeErrors = [];e.on('change',e => window.shapeChanges.push(e));e.on('error',e => window.shapeErrors.push(e));
    card.querySelector('.etch-viewport').addEventListener('pointerdown',e => {window.shapePointerId = e.pointerId;});
  },{native,options:editorOptions});
  await settle(page);return page;
}
async function begin(page,x=50,y=80) {await viewport(page).scrollIntoViewIfNeeded();const box = await viewport(page).boundingBox();await page.mouse.move(box.x+x,box.y+y);await page.mouse.down();return box;}
async function elements(page) {return page.evaluate(() => window.shapeEditor.save().layers.flatMap(l => l.elements));}
async function pixel(page,canvas,x,y) {return root(page).locator(`.etch-${canvas}`).evaluate((c,[x,y]) => {
  const box = c.getBoundingClientRect();return [...c.getContext('2d').getImageData(Math.floor(x*c.width/box.width),Math.floor(y*c.height/box.height),1,1).data];
},[x,y]);}
const near = (a,b) => assert.ok(Math.abs(a-b) < 1e-8,`${a} != ${b}`);

test('all shape tools capture outside the card at DPR 2, preview committed-only and commit/undo/reopen identically',async t => {
  const native = blank();native.layers[0].offset = [15,-20];
  const page = await pageFor(t,{native,contextOptions:{deviceScaleFactor:2}});
  await root(page).evaluate(el => {el.style.width = '700px';});await settle(page);
  for (const tool of ['line','arrow','rect','ellipse']) {
    await page.evaluate(async ({native,tool}) => {
      const e = window.shapeEditor;await e.load(native);e.setViewState({zoom:2,pan:[80,60]});e.setTool(tool);
      e.setToolSettings(tool,{stroke:'#FF0000',strokeWidth:10,...(['line','arrow'].includes(tool) ? {} : {fill:'#FF0000'})});
      window.shapeChanges = [];window.shapeBefore = e.save();window.shapeRevision = e.getRevision();
    },{native,tool});await settle(page);
    const box = await begin(page,100,90),endY = ['line','arrow'].includes(tool) ? 90 : 170;
    await page.mouse.move(box.x+750,box.y+endY,{steps:5});await settle(page);
    assert.equal(await page.evaluate(() => JSON.stringify(window.shapeEditor.save()) === JSON.stringify(window.shapeBefore) && window.shapeEditor.getRevision() === window.shapeRevision && !window.shapeEditor.canUndo()),true);
    assert.equal(await page.evaluate(() => window.shapeChanges.length),0);
    assert.deepEqual(await pixel(page,'live',350,['line','arrow'].includes(tool) ? 90 : 130),[255,0,0,255]);
    const wet = await root(page).locator('.etch-live').evaluate(c => c.toDataURL());await page.mouse.up();await settle(page);
    const e = (await elements(page))[0];assert.equal(e.type,tool === 'arrow' ? 'path' : tool);assert.equal(e.strokeWidth,10);
    if (tool === 'line') {assert.deepEqual(e.start,[-5,35]);assert.deepEqual(e.end,[320,35]);}
    else if (tool === 'arrow') {assert.deepEqual(e.commands[0],['M',-5,35]);assert.deepEqual(e.commands[1],['L',320,35]);assert.equal(e.commands.length,5);}
    else if (tool === 'rect') {near(e.x,-5);near(e.y,35);near(e.width,325);near(e.height,40);}
    else {near(e.cx,157.5);near(e.cy,55);near(e.rx,162.5);near(e.ry,20);}
    assert.equal(await page.evaluate(() => window.shapeChanges.length),1);
    assert.equal(await root(page).locator('.etch-committed').evaluate(c => c.toDataURL()),wet);
    const saved = await page.evaluate(() => window.shapeEditor.save());await page.evaluate(() => window.shapeEditor.undo());assert.equal((await elements(page)).length,0);
    await page.evaluate(() => window.shapeEditor.redo());await settle(page);assert.deepEqual(await page.evaluate(() => window.shapeEditor.save()),saved);
    await page.evaluate(async saved => window.shapeEditor.load(saved),saved);await settle(page);
    assert.equal(await root(page).locator('.etch-committed').evaluate(c => c.toDataURL()),wet);
    assert.deepEqual(await page.evaluate(() => window.shapeChanges.map(e => e.source)),['edit','undo','redo']);
  }
});

test('Shift press/release updates live constraints without pointer motion and commits the displayed geometry',async t => {
  const page = await pageFor(t);
  for (const tool of ['rect','ellipse','line']) {
    await page.evaluate(async tool => {
      const e = window.shapeEditor,d = e.save();d.layers[0].elements = [];await e.load(d);e.setTool(tool);
      e.setToolSettings(tool,{stroke:'#008000',strokeWidth:4,...(tool === 'line' ? {} : {fill:'#008000'})});
    },tool);await settle(page);
    const box = await begin(page);await page.mouse.move(box.x+150,box.y+110);await settle(page);
    const probe = tool === 'line' ? [100,80] : [100,140];assert.equal((await pixel(page,'live',...probe))[3],0);
    await page.keyboard.down('Shift');await settle(page);assert.deepEqual(await pixel(page,'live',...probe),[0,128,0,255]);
    await page.keyboard.up('Shift');await settle(page);assert.equal((await pixel(page,'live',...probe))[3],0);
    await page.keyboard.down('Shift');await settle(page);const wet = await root(page).locator('.etch-live').evaluate(c => c.toDataURL());
    await page.mouse.up();await page.keyboard.up('Shift');await settle(page);
    assert.equal(await root(page).locator('.etch-committed').evaluate(c => c.toDataURL()),wet);
    const e = (await elements(page))[0];
    if (tool === 'rect') {near(e.width,100);near(e.height,100);}
    else if (tool === 'ellipse') {near(e.rx,50);near(e.ry,50);}
    else {near(e.end[1],80);near(e.end[0],50+Math.hypot(100,30));}
  }
});

test('Shapes properties offer type/border/width/fill-only/no-fill, retain per-tool preferences and never dirty content',async t => {
  const native = blank();native.layers.push({...native.layers[0],id:'other',name:'Other'});
  const page = await pageFor(t,{native}),card = root(page);
  await page.evaluate(() => {window.shapeEditor.setTool('pen');window.shapeEditor.setToolSettings('pen',{color:'#112233',width:13});window.shapeBaseline = window.shapeEditor.getRevision();});
  await card.getByRole('button',{name:'Shapes',exact:true}).click();assert.equal(await page.evaluate(() => window.shapeEditor.getTool()),'rect');
  assert.equal(await card.locator('.etch-sidebar').isVisible(),false);
  await card.getByRole('button',{name:'Toggle sidebar',exact:true}).click();await settle(page);
  const type = card.getByRole('combobox',{name:'Shape type'}),border = card.getByRole('checkbox',{name:'Border',exact:true}),fill = card.getByRole('checkbox',{name:'Fill',exact:true});
  const setColor = async (label,color) => card.getByLabel(label,{exact:true}).evaluate((el,value) => {el.value = value;el.dispatchEvent(new Event('input',{bubbles:true}));},color);
  const width = card.getByRole('spinbutton',{name:'Border width'});
  assert.equal(await type.inputValue(),'rect');assert.equal(await fill.isChecked(),false);assert.equal(await border.isDisabled(),true);
  await setColor('Border color','#aa2200');await width.fill('9.5');await width.press('Tab');
  await fill.check();await setColor('Fill color','#00aa11');await border.uncheck();assert.equal(await width.isDisabled(),true);assert.equal(await fill.isDisabled(),true);
  assert.deepEqual(await page.evaluate(() => window.shapeEditor.getToolSettings('rect')),{stroke:null,strokeWidth:9.5,fill:'#00AA11'});
  await border.check();await fill.uncheck();assert.equal(await card.getByLabel('Fill color',{exact:true}).isDisabled(),true);
  await type.selectOption('ellipse');assert.equal(await width.inputValue(),'2');await setColor('Border color','#aa00ff');
  await fill.check();await type.selectOption('line');assert.equal(await width.inputValue(),'2');assert.equal(await card.getByRole('checkbox',{name:'Fill',exact:true}).count(),0);
  await setColor('Border color','#ff0000');await width.fill('7');await width.press('Tab');
  await card.getByRole('button',{name:'Hand / Pan'}).click();assert.equal(await card.locator('.etch-tool-properties').isVisible(),false);
  await card.getByRole('button',{name:'Shapes',exact:true}).click();assert.equal(await type.inputValue(),'line');assert.equal(await width.inputValue(),'7');
  await type.selectOption('rect');assert.equal(await width.inputValue(),'9.5');assert.equal(await card.getByLabel('Border color',{exact:true}).inputValue(),'#aa2200');assert.equal(await fill.isChecked(),false);
  await fill.check();assert.equal(await card.getByLabel('Fill color',{exact:true}).inputValue(),'#00aa11');
  await card.getByRole('button',{name:'Other (0)',exact:true}).click();assert.equal(await type.inputValue(),'rect');
  await page.evaluate(() => window.shapeEditor.setTool('ellipse'));assert.equal(await type.inputValue(),'ellipse');
  await card.getByRole('button',{name:'Pen',exact:true}).click();assert.equal(await card.getByRole('spinbutton',{name:'Pen width'}).inputValue(),'13');
  await card.getByRole('button',{name:'Toggle sidebar',exact:true}).click();await card.getByRole('button',{name:'Shapes',exact:true}).click();
  assert.equal(await page.evaluate(() => window.shapeEditor.getTool()),'ellipse');assert.equal(await card.locator('.etch-sidebar').isVisible(),false);
  assert.equal(await page.evaluate(() => window.shapeEditor.getRevision() === window.shapeBaseline && !window.shapeEditor.canUndo() && !window.shapeChanges.length),true);
  assert.deepEqual(await page.evaluate(() => window.shapeEditor.save()),native);assert.equal(await page.evaluate(() => window.shapeEditor.getActiveLayer()),'other');
});

test('taps, flat/tiny boxes and a drag returned to its origin leave no mark, event or history',async t => {
  const page = await pageFor(t),revision = await page.evaluate(() => window.shapeEditor.getRevision());
  for (const tool of ['line','rect','ellipse']) {
    await page.evaluate(tool => window.shapeEditor.setTool(tool),tool);
    let box = await begin(page);await page.mouse.up();
    box = await begin(page);await page.mouse.move(box.x+51,box.y+(tool === 'line' ? 80 : 120));await page.mouse.up();
    if (tool !== 'line') {box = await begin(page);await page.mouse.move(box.x+150,box.y+80);await page.mouse.up();}
    box = await begin(page);await page.mouse.move(box.x+150,box.y+150);await settle(page);await page.mouse.move(box.x+50,box.y+80);await page.mouse.up();await settle(page);
    assert.equal((await elements(page)).length,0);assert.equal(await page.evaluate(() => window.shapeEditor.canUndo()),false);
  }
  assert.equal(await page.evaluate(() => window.shapeChanges.length),0);assert.equal(await page.evaluate(() => window.shapeEditor.getRevision()),revision);
  assert.equal(await root(page).locator('.etch-live').isVisible(),false);assert.equal(await root(page).locator('.etch-empty').isVisible(),true);
});

test('shape previews cancel on Escape/capture loss/cancel/blur/focus/resize/tool/layer/view/load boundaries',async t => {
  const native = blank();native.layers.push({...native.layers[0],id:'other',name:'Other'});
  const page = await pageFor(t,{native});
  const actions = ['escape','capture','pointercancel','blur','focus','resize','tool','layer','view','load','cancel'];
  for (const [i,action] of actions.entries()) {
    await page.evaluate(async ({native,tool}) => {await window.shapeEditor.load(native);window.shapeEditor.setTool(tool);window.shapeEditor.setViewState({zoom:1,pan:[0,0]});window.shapeChanges = [];},{native,tool:['rect','ellipse','line'][i%3]});await settle(page);
    const box = await begin(page);await page.mouse.move(box.x+150,box.y+150);await settle(page);assert.equal(await root(page).locator('.etch-live').isVisible(),true,action);
    if (action === 'escape') await page.keyboard.press('Escape');
    else if (action === 'capture') {await viewport(page).evaluate(el => el.releasePointerCapture(window.shapePointerId));await page.mouse.move(box.x+151,box.y+150);}
    else await page.evaluate(async action => {
      const e = window.shapeEditor,el = document.querySelector('#shape-card .etch-viewport');
      if (action === 'pointercancel') el.dispatchEvent(new PointerEvent('pointercancel',{pointerId:window.shapePointerId,pointerType:'mouse'}));
      if (action === 'blur') window.dispatchEvent(new Event('blur'));
      if (action === 'focus') document.querySelector('#native').focus();
      if (action === 'resize') document.querySelector('#shape-card').style.width = '800px';
      if (action === 'tool') e.setTool('pen');
      if (action === 'layer') e.setActiveLayer('other');
      if (action === 'view') e.setViewState({zoom:2});
      if (action === 'load') {try {await e.load('{');} catch { /* Failed load still cancels the gesture. */ }}
      if (action === 'cancel') e.cancel();
    },action);
    await settle(page);await page.mouse.up();await settle(page);
    assert.equal((await elements(page)).length,0,action);assert.equal(await page.evaluate(() => window.shapeChanges.length),0,action);
    assert.equal(await root(page).locator('.etch-live').isVisible(),false,action);assert.equal(await page.evaluate(() => window.shapeEditor.canUndo()),false,action);
    assert.equal(await viewport(page).evaluate(el => el.hasPointerCapture(window.shapePointerId)),false,action);
  }
});

test('reverse-dragged live shapes stay below upper shapes/PNG with no painter-order pop on commit',async t => {
  const native = blank();native.layers.push({id:'upper',name:'Upper',visible:true,locked:true,offset:[0,0],elements:[
    {id:'blue',type:'rect',transform:[1,0,0,1,0,0],x:100,y:50,width:80,height:100,fill:'#0000FF',stroke:null,strokeWidth:0,lineJoin:'round',miterLimit:4}]});
  const page = await pageFor(t,{native});
  await page.evaluate(async () => {
    const e = window.shapeEditor,d = e.save(),c = document.createElement('canvas');c.width = c.height = 2;const ctx = c.getContext('2d');ctx.fillStyle = '#008000';ctx.fillRect(0,0,2,2);
    d.assets.push({id:'green-png',mime:'image/png',width:2,height:2,data:c.toDataURL().split(',')[1]});
    d.layers[1].elements.push({id:'green-image',type:'image',transform:[1,0,0,1,0,0],assetId:'green-png',x:210,y:50,width:60,height:100,alt:'Opaque green fixture'});
    await e.load(d);e.setToolSettings('rect',{fill:'#FF0000',stroke:null});
  });await settle(page);
  const box = await begin(page,320,140);await page.mouse.move(box.x+50,box.y+70);await settle(page);
  for (const [x,color] of [[80,[255,0,0,255]],[130,[0,0,255,255]],[230,[0,128,0,255]]]) assert.deepEqual(await pixel(page,'live',x,100),color);
  const wet = await root(page).locator('.etch-live').evaluate(c => c.toDataURL());assert.equal((await elements(page)).length,2);
  await page.mouse.up();await settle(page);assert.equal(await root(page).locator('.etch-committed').evaluate(c => c.toDataURL()),wet);
  const e = (await elements(page))[0];near(e.x,50);near(e.y,70);near(e.width,270);near(e.height,70);assert.equal(e.strokeWidth,0);assert.equal(await page.evaluate(() => window.shapeChanges.length),1);
});

test('shape style is captured at start; shortcuts, temporary Hand and wheel ownership stay scoped',async t => {
  const page = await pageFor(t);await page.evaluate(() => window.shapeEditor.setToolSettings('rect',{stroke:'#FF0000',strokeWidth:8,fill:'#008000'}));
  let box = await begin(page);await page.mouse.move(box.x+150,box.y+150);await page.mouse.wheel(0,100);
  await page.evaluate(() => window.shapeEditor.setToolSettings('rect',{stroke:'#0000FF',strokeWidth:2,fill:null}));await page.mouse.up();
  const e = (await elements(page))[0];assert.equal(e.stroke,'#FF0000');assert.equal(e.strokeWidth,8);assert.equal(e.fill,'#008000');
  assert.deepEqual(await page.evaluate(() => window.shapeEditor.getViewState().pan),[0,0]);
  await viewport(page).focus();for (const [key,tool] of [['l','line'],['a','arrow'],['r','rect'],['o','ellipse'],['p','pen'],['h','hand']]) {
    await page.keyboard.press(key);assert.equal(await page.evaluate(() => window.shapeEditor.getTool()),tool);
  }
  await page.locator('#native').focus();await page.keyboard.press('r');assert.equal(await page.evaluate(() => window.shapeEditor.getTool()),'hand');
  await viewport(page).focus();await page.keyboard.press('o');await settle(page);
  // Opening quick controls resizes the viewport while preserving its world center.
  const pan = await page.evaluate(() => window.shapeEditor.getViewState().pan);
  await page.keyboard.down('Space');box = await begin(page);await page.mouse.move(box.x+90,box.y+100);await page.mouse.up();await page.keyboard.up('Space');
  assert.equal(await page.evaluate(() => window.shapeEditor.getTool()),'ellipse');assert.deepEqual(await page.evaluate(() => window.shapeEditor.getViewState().pan),[pan[0]+40,pan[1]+20]);
  assert.equal((await elements(page)).length,1);assert.equal(await page.evaluate(() => window.shapeChanges.length),1);
});

test('read-only/locked/hidden destinations cannot receive shapes or activate drawing shortcuts',async t => {
  for (const mode of ['readOnly','locked','hidden']) {
    const page = await pageFor(t,{editorOptions:{readOnly:mode === 'readOnly'}});
    await page.evaluate(mode => {
      const e = window.shapeEditor;if (mode === 'locked') e.setLayerLocked('ink',true);if (mode === 'hidden') e.setLayerVisibility('ink',false);
      window.shapeChanges = [];window.shapeRevision = e.getRevision();
    },mode);
    assert.equal(await root(page).getByRole('button',{name:'Shapes',exact:true}).isDisabled(),true);
    const box = await begin(page);await page.mouse.move(box.x+100,box.y+120);await page.mouse.up();await settle(page);
    await viewport(page).focus();await page.keyboard.press('o');assert.equal(await page.evaluate(() => window.shapeEditor.getTool()),'rect');
    assert.equal((await elements(page)).length,0);assert.equal(await page.evaluate(() => window.shapeChanges.length),0);
    assert.equal(await page.evaluate(() => window.shapeEditor.getRevision() === window.shapeRevision),true);
    if (mode !== 'readOnly') assert.equal(await page.evaluate(() => window.shapeErrors.at(-1).code),'LAYER_NOT_EDITABLE');
  }
});

test('derived-work failures remove the whole preview, release ownership and permit subsequent valid shapes',async t => {
  const page = await pageFor(t,{editorOptions:{limits:{derivedSegmentsPerElement:4,derivedSegments:6}}});
  const revision = await page.evaluate(() => window.shapeEditor.getRevision());
  let box = await begin(page);await page.mouse.move(box.x+150,box.y+150);await settle(page);await page.mouse.up();await settle(page);
  assert.equal((await elements(page)).length,0);assert.equal(await page.evaluate(() => window.shapeErrors.length),1);assert.equal(await page.evaluate(() => window.shapeErrors[0].code),'LIMIT_EXCEEDED');
  assert.equal(await page.evaluate(() => window.shapeEditor.getRevision()),revision);assert.equal(await root(page).locator('.etch-live').isVisible(),false);
  for (const tool of ['line','ellipse','line']) {
    await page.evaluate(tool => window.shapeEditor.setTool(tool),tool);box = await begin(page);await page.mouse.move(box.x+150,box.y+150);await settle(page);await page.mouse.up();await settle(page);
  }
  assert.deepEqual((await elements(page)).map(e => e.type),['line','ellipse']);assert.equal(await page.evaluate(() => window.shapeChanges.length),2);
  assert.equal(await page.evaluate(() => window.shapeErrors.length),2);assert.equal(await root(page).locator('.etch-live').isVisible(),false);
});

test('busy load cancels shapes and destroy disposes a queued shape preview and captured pointer',async t => {
  const page = await pageFor(t);let box = await begin(page);await page.mouse.move(box.x+150,box.y+150);
  await page.evaluate(async native => {
    const original = window.createImageBitmap;window.originalShapeDecode = original;let release;const gate = new Promise(r => {release = r;});window.releaseShapeDecode = release;
    window.createImageBitmap = async (...args) => {await gate;return original(...args);};window.pendingShapeLoad = window.shapeEditor.load(native);
  },fixture());
  assert.equal((await elements(page)).length,0);assert.equal(await root(page).getByRole('button',{name:'Shapes',exact:true}).isDisabled(),true);
  await page.mouse.up();box = await begin(page);await page.mouse.move(box.x+100,box.y+120);await page.mouse.up();assert.equal(await page.evaluate(() => window.shapeChanges.length),0);
  await page.evaluate(async () => {window.releaseShapeDecode();await window.pendingShapeLoad;window.createImageBitmap = window.originalShapeDecode;});await settle(page);
  await begin(page);await page.evaluate(() => {
    const el = document.querySelector('#shape-card .etch-viewport'),b = el.getBoundingClientRect();window.deadShapeRoot = document.querySelector('#shape-card .etch');
    el.dispatchEvent(new PointerEvent('pointermove',{pointerId:window.shapePointerId,pointerType:'mouse',buttons:1,clientX:b.left+150,clientY:b.top+150}));window.shapeEditor.destroy();
  });await page.mouse.up();await settle(page);
  assert.equal(await root(page).evaluate(el => el.childElementCount),0);
  assert.equal(await page.evaluate(() => {window.deadShapeRoot.dispatchEvent(new KeyboardEvent('keydown',{key:'r',bubbles:true}));try {window.shapeEditor.getTool();} catch (e) {return e.code;}}),'DESTROYED');
  assert.equal(await page.evaluate(() => window.shapeChanges.length),0);
});

test('tool settings follow compact layers; long lists scroll without pushing settings away on desktop/mobile',async t => {
  for (const mobile of [false,true]) {
    const page = await pageFor(t,{editorOptions:{sidebarOpen:true},contextOptions:mobile ? {hasTouch:true,viewport:{width:390,height:844}} : {}});
    await root(page).evaluate((el,mobile) => {el.style.width = mobile ? '340px' : '900px';el.style.height = mobile ? '480px' : '800px';},mobile);await settle(page);
    const measure = () => root(page).evaluate(el => {
      const section = el.querySelector('.etch-layer-section'),list = el.querySelector('.etch-layers'),props = el.querySelector('.etch-tool-properties'),sidebar = el.querySelector('.etch-sidebar');
      const a = section.getBoundingClientRect(),b = props.getBoundingClientRect(),last = list.lastElementChild.getBoundingClientRect();
      return {section:a.height,gap:b.top-a.bottom,rowGap:b.top-last.bottom,sidebar:sidebar.clientHeight,list:list.clientHeight,total:list.scrollHeight,props:props.clientHeight,overflow:el.querySelector('.etch-body').scrollHeight-el.querySelector('.etch-body').clientHeight};
    });
    const compact = await measure();assert.ok(Math.abs(compact.gap) <= 1,JSON.stringify(compact));assert.ok(compact.rowGap <= 32,JSON.stringify(compact));assert.ok(compact.section < 180);
    const many = blank();for (let i = 0;i < 35;i++) many.layers.push({...many.layers[0],id:`extra-${i}`,name:`Extra ${i}`});
    await page.evaluate(async data => shapeEditor.load(data),many);await settle(page);const crowded = await measure();
    assert.ok(crowded.total > crowded.list);assert.ok(crowded.section <= crowded.sidebar/2+1);assert.ok(crowded.props >= 28);assert.ok(crowded.overflow <= 1);
    await root(page).locator('.etch-layers').evaluate(el => {el.scrollTop = el.scrollHeight;});assert.ok(await root(page).locator('.etch-layers').evaluate(el => el.scrollTop > 0));
    await page.evaluate(() => shapeEditor.setTool('hand'));await settle(page);const expanded = await measure();assert.ok(expanded.list > crowded.list);
    await page.evaluate(() => shapeEditor.setTool('pen'));await settle(page);assert.ok(Math.abs((await measure()).gap) <= 1);assert.deepEqual(await page.evaluate(() => shapeEditor.save()),many);assert.equal(await page.evaluate(() => shapeChanges.length),0);
  }
});

test('320px coarse-pointer card keeps every toolbar action reachable and properties/layers independently scrollable',async t => {
  const native = blank();for (let i = 0;i < 25;i++) native.layers.push({...native.layers[0],id:`layer-${i}`,name:`Layer ${i}`});
  const page = await pageFor(t,{native,contextOptions:{hasTouch:true,viewport:{width:320,height:700}}});
  await root(page).evaluate(el => {el.style.width = '320px';el.style.height = '380px';});await settle(page);
  const card = root(page),bounds = await card.boundingBox(),buttons = card.locator('.etch-toolbar button');assert.equal(await buttons.count(),17);
  for (const button of await buttons.all()) {await button.scrollIntoViewIfNeeded();const b = await button.boundingBox();assert.ok(b.x >= bounds.x && b.x+b.width <= bounds.x+bounds.width,await button.getAttribute('aria-label'));}
  const before = await viewport(page).boundingBox();await card.getByRole('button',{name:'Toggle sidebar',exact:true}).click();await settle(page);
  assert.deepEqual(await viewport(page).boundingBox(),before);
  await card.getByRole('combobox',{name:'Shape type'}).selectOption('ellipse');
  const sizes = await card.evaluate(el => {
    const layers = el.querySelector('.etch-layers'),props = el.querySelector('.etch-properties-content');layers.scrollTop = layers.scrollHeight;props.scrollTop = props.scrollHeight;
    return {layers:layers.scrollTop,props:props.scrollTop,propertiesFit:props.scrollHeight<=props.clientHeight,overflow:props.scrollWidth-props.clientWidth,body:el.querySelector('.etch-body').scrollTop};
  });assert.ok(sizes.layers > 0);assert.ok(sizes.props > 0 || sizes.propertiesFit);assert.ok(sizes.overflow <= 1);assert.equal(sizes.body,0);
  await card.evaluate(el => {el.style.height = '240px';});await settle(page);
  const minimum = await card.evaluate(el => ({layers:el.querySelector('.etch-layers').clientHeight,
    props:el.querySelector('.etch-tool-properties').clientHeight,overflow:el.querySelector('.etch-body').scrollHeight-el.querySelector('.etch-body').clientHeight}));
  assert.ok(minimum.layers >= 40);assert.ok(minimum.props >= 28);assert.ok(minimum.overflow <= 1);
  await viewport(page).focus();await page.keyboard.press('Escape');assert.equal(await card.locator('.etch-sidebar').isVisible(),false);
  assert.equal(await page.evaluate(() => window.shapeEditor.getTool()),'ellipse');assert.equal(await page.evaluate(() => window.shapeChanges.length),0);
});

if (name === 'chromium') {
  test('finger shape drawing reuses touch navigation ownership and abandons the shape on a second finger',async t => {
    const page = await pageFor(t,{editorOptions:{drawWithTouch:false},contextOptions:{hasTouch:true}}),box = await viewport(page).boundingBox(),cdp = await page.context().newCDPSession(page);
    const point = (id,x,y=80) => ({id,x:box.x+x,y:box.y+y});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,40)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,60)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal((await elements(page)).length,0);assert.deepEqual(await page.evaluate(() => window.shapeEditor.getViewState().pan),[20,0]);
    await page.evaluate(() => {window.shapeEditor.setViewState({zoom:1,pan:[0,0]});window.shapeEditor.setDrawWithTouch(true);});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,40)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,100,120)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal((await elements(page)).length,1);const e = (await elements(page))[0];near(e.width,60);near(e.height,40);assert.equal(Object.hasOwn(e,'pressure'),false);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,40)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,100,120)]});await settle(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,100,120),point(2,200,120)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,120,140),point(2,220,140)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle(page);
    assert.equal((await elements(page)).length,1);assert.equal(await page.evaluate(() => window.shapeChanges.length),1);assert.deepEqual(await page.evaluate(() => window.shapeEditor.getViewState().pan),[20,20]);
  });
  test('stylus shapes keep a uniform world-unit border, ignore palm input and reject barrel-erasing ink',async t => {
    const page = await pageFor(t),box = await viewport(page).boundingBox(),cdp = await page.context().newCDPSession(page);
    await page.evaluate(() => {window.shapeEditor.setTool('line');window.shapeEditor.setToolSettings('line',{strokeWidth:6});});
    await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:box.x+40,y:box.y+80,button:'left',buttons:1,pointerType:'pen',force:0.1});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:box.x+150,y:box.y+80,button:'left',buttons:1,pointerType:'pen',force:1});
    await page.evaluate(() => {
      const el = document.querySelector('#shape-card .etch-viewport'),b = el.getBoundingClientRect();
      for (const type of ['pointerdown','pointermove','pointerup']) el.dispatchEvent(new PointerEvent(type,{pointerId:99,pointerType:'touch',button:0,buttons:1,clientX:b.left+200,clientY:b.top+200}));
    });await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x+150,y:box.y+80,button:'left',buttons:0,pointerType:'pen',force:0});await settle(page);
    const e = (await elements(page))[0];assert.equal(e.type,'line');assert.equal(e.strokeWidth,6);assert.equal(Object.hasOwn(e,'pressure'),false);
    assert.deepEqual(await page.evaluate(() => window.shapeEditor.getViewState().pan),[0,0]);
    await viewport(page).evaluate(el => {
      const b = el.getBoundingClientRect();for (const type of ['pointerdown','pointermove','pointerup']) el.dispatchEvent(new PointerEvent(type,{pointerId:77,pointerType:'pen',button:5,buttons:type === 'pointerup' ? 0 : 32,clientX:b.left+220,clientY:b.top+80}));
    });assert.equal((await elements(page)).length,1);assert.equal(await page.evaluate(() => window.shapeChanges.length),1);
  });
}
