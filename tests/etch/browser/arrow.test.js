import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser,collapseDemoSidebar} from './fixture.js';

const engine=process.env.ETCH_SHAPES_BROWSER ?? 'chromium',fixture=useBrowser(engine);
const root=page=>page.locator('#arrow-card');
const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function setup(t,{mobile=false,options={}}={}) {
  const context=await fixture.browser.newContext({viewport:{width:1200,height:850},deviceScaleFactor:2,hasTouch:mobile}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));t.after(async()=>{await context.close();assert.deepEqual(errors,[]);});
  await page.goto(fixture.server.origin+'/demo/');await collapseDemoSidebar(page);
  await page.evaluate(async({mobile,options})=>{
    const {createEtch}=await import('/etch.js'),host=document.createElement('div');host.id='arrow-card';host.style=mobile?'width:320px;height:240px':'width:900px;height:500px';document.body.prepend(host);
    window.arrowEditor=createEtch(host,options);window.arrowChanges=[];window.arrowErrors=[];
    arrowEditor.on('change',e=>arrowChanges.push(e));arrowEditor.on('error',e=>arrowErrors.push(e));
  },{mobile,options});await settle(page);return page;
}
async function drag(page,start=[40,70],end=[220,70]) {
  const vp=root(page).locator('.etch-viewport');await vp.scrollIntoViewIfNeeded();const b=await vp.boundingBox();
  await page.mouse.move(b.x+start[0],b.y+start[1]);await page.mouse.down();await page.mouse.move(b.x+end[0],b.y+end[1],{steps:4});return b;
}
const save=page=>page.evaluate(()=>arrowEditor.save());

for(const mobile of [false,true]) test(`Arrow appears in Shapes, synchronizes line-only controls and keeps preferences (${mobile?'mobile':'desktop'})`,async t=>{
  const page=await setup(t,{mobile}),card=root(page),quick=card.locator('.etch-quick-toolbar'),before=await save(page);
  await card.getByRole('button',{name:'Choose shape',exact:true}).click();await card.getByRole('button',{name:'Arrow (A)',exact:true}).click();
  assert.equal(await page.evaluate(()=>arrowEditor.getTool()),'arrow');assert.equal(await quick.isVisible(),true);
  assert.equal(await quick.getByRole('combobox',{name:'Quick shape',exact:true}).inputValue(),'arrow');
  assert.equal(await quick.getByRole('checkbox',{name:'Quick shape fill',exact:true}).isVisible(),false);
  await quick.getByRole('button',{name:'Stroke color #EF4444',exact:true}).click();await quick.getByRole('button',{name:'Stroke width 6',exact:true}).click();
  await card.getByRole('button',{name:'Toggle sidebar',exact:true}).click();
  assert.equal(await card.getByLabel('Border color',{exact:true}).inputValue(),'#ef4444');assert.equal(await card.getByLabel('Border width',{exact:true}).inputValue(),'6');
  assert.equal(await card.getByLabel('Fill color',{exact:true}).count(),0);
  await card.getByLabel('Border width',{exact:true}).fill('7.5');await card.getByLabel('Border width',{exact:true}).press('Tab');assert.equal(await page.evaluate(()=>arrowEditor.getToolSettings('arrow').strokeWidth),7.5);
  await card.getByRole('combobox',{name:'Shape type',exact:true}).selectOption('line');assert.equal(await card.getByLabel('Border width',{exact:true}).inputValue(),'2');
  await card.getByRole('combobox',{name:'Shape type',exact:true}).selectOption('arrow');assert.equal(await card.getByLabel('Border width',{exact:true}).inputValue(),'7.5');
  await card.getByRole('button',{name:'Toggle sidebar',exact:true}).click();await card.getByRole('button',{name:'Pen',exact:true}).click();
  await card.getByRole('button',{name:'Shapes',exact:true}).click();assert.equal(await page.evaluate(()=>arrowEditor.getTool()),'arrow');
  await card.getByRole('button',{name:'Shapes',exact:true}).click();assert.equal(await quick.isVisible(),false);
  await card.locator('.etch-viewport').focus();await page.keyboard.press('a');assert.equal(await quick.isVisible(),true);
  assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(()=>arrowEditor.canUndo()),false);
});

test('Arrow previews and commits as one native path with matching viewport/PNG/SVG, Undo and reopen',async t=>{
  const page=await setup(t),card=root(page);
  await page.evaluate(async()=>{const d=arrowEditor.save();d.layers[0].offset=[15,-20];await arrowEditor.load(d);arrowEditor.setTool('arrow');arrowEditor.setToolSettings('arrow',{stroke:'#FF0000',strokeWidth:4});arrowEditor.setViewState({zoom:2,pan:[20,30]});});await settle(page);
  const before=await save(page);await drag(page,[60,90],[260,90]);await settle(page);assert.deepEqual(await save(page),before);
  const wet=await card.locator('.etch-live').evaluate(c=>c.toDataURL());await page.mouse.up();await settle(page);
  const after=await save(page),e=after.layers[0].elements[0];assert.equal(e.type,'path');assert.deepEqual(e.commands,[['M',5,50],['L',105,50],['M',89,58],['L',105,50],['L',89,42]]);
  assert.equal(await card.locator('.etch-committed').evaluate(c=>c.toDataURL()),wet);assert.deepEqual(await page.evaluate(()=>arrowChanges.map(e=>e.label)),['Draw arrow']);
  const samples=await page.evaluate(async()=>{
    const {blob}=await arrowEditor.exportPNG({bounds:{x:0,y:0,width:160,height:100},padding:0,scale:2}),{svg}=arrowEditor.exportSVG({bounds:{x:0,y:0,width:160,height:100},padding:0});
    const c=document.createElement('canvas');c.width=320;c.height=200;const ctx=c.getContext('2d');
    const read=async blob=>{const image=await createImageBitmap(blob);ctx.clearRect(0,0,320,200);ctx.drawImage(image,0,0,320,200);image.close();return ctx.getImageData(0,0,320,200).data;};
    const png=await read(blob),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),image=new Image();
    try{image.src=url;await image.decode();ctx.clearRect(0,0,320,200);ctx.drawImage(image,0,0,320,200);}finally{URL.revokeObjectURL(url);image.src='';}
    const vector=ctx.getImageData(0,0,320,200).data;let total=0;for(let i=0;i<png.length;i++)total+=Math.abs(png[i]-vector[i]);
    const at=(x,y)=>Array.from(png.slice((y*320+x)*4,(y*320+x)*4+4));c.width=c.height=0;
    return {difference:total/png.length,shaft:at(100,60),head:at(224,68),svg};
  });
  assert.deepEqual(samples.shaft,[255,0,0,255]);assert.deepEqual(samples.head,[255,0,0,255]);assert.ok(samples.difference<0.5);assert.match(samples.svg,/<path /);assert.doesNotMatch(samples.svg,/<marker/);
  await page.evaluate(()=>arrowEditor.undo());assert.deepEqual(await save(page),before);await page.evaluate(()=>arrowEditor.redo());assert.deepEqual(await save(page),after);
  await page.evaluate(async()=>arrowEditor.load(arrowEditor.save()));await settle(page);assert.equal(await card.locator('.etch-committed').evaluate(c=>c.toDataURL()),wet);
});

test('Arrow head is selectable, transforms preserve path geometry, Partial leaves it intact and Whole erases it',async t=>{
  const page=await setup(t);await page.evaluate(()=>{arrowEditor.setTool('arrow');arrowEditor.setToolSettings('arrow',{strokeWidth:4});arrowEditor.setViewState({zoom:1,pan:[0,0]});});await settle(page);
  const b=await drag(page,[40,70],[220,70]);await page.mouse.up();await settle(page);const original=await save(page),e=original.layers[0].elements[0];
  await page.evaluate(()=>arrowEditor.setTool('select'));await page.mouse.click(b.x+212,b.y+74);assert.deepEqual(await page.evaluate(()=>arrowEditor.getSelection()),[e.id]);
  await page.evaluate(()=>arrowEditor.rotateSelection());const rotated=(await save(page)).layers[0].elements[0];assert.deepEqual(rotated.commands,e.commands);assert.notDeepEqual(rotated.transform,e.transform);
  await page.evaluate(()=>arrowEditor.undo());assert.deepEqual(await save(page),original);
  await page.evaluate(()=>{arrowEditor.setTool('eraser');arrowEditor.setToolSettings('eraser',{radius:3,mode:'partial'});});await page.mouse.click(b.x+212,b.y+74);assert.deepEqual(await save(page),original);
  await page.evaluate(()=>arrowEditor.setToolSettings('eraser',{mode:'object'}));await page.mouse.click(b.x+212,b.y+74);assert.equal((await save(page)).layers[0].elements.length,0);
  await page.evaluate(()=>arrowEditor.undo());assert.deepEqual(await save(page),original);
});

test('Arrow draws with touch and stylus on a minimum-size card',{skip:engine!=='chromium'},async t=>{
  const page=await setup(t,{mobile:true}),card=root(page),cdp=await page.context().newCDPSession(page);
  await card.locator('.etch-viewport').focus();await page.keyboard.press('a');await settle(page);
  const b=await card.locator('.etch-viewport').boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:b.x+30,y:b.y+35}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:b.x+150,y:b.y+35}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle(page);
  const touch=(await save(page)).layers[0].elements[0];assert.equal(touch.type,'path');assert.equal(touch.strokeWidth,2);
  const point={button:'left',pointerType:'pen'};
  await cdp.send('Input.dispatchMouseEvent',{...point,type:'mousePressed',buttons:1,force:0.1,x:b.x+30,y:b.y+70});
  await cdp.send('Input.dispatchMouseEvent',{...point,type:'mouseMoved',buttons:1,force:0.95,x:b.x+150,y:b.y+70});
  await cdp.send('Input.dispatchMouseEvent',{...point,type:'mouseReleased',buttons:0,force:0,x:b.x+150,y:b.y+70});await settle(page);
  const stylus=(await save(page)).layers[0].elements[1];assert.equal(stylus.type,'path');assert.equal(stylus.strokeWidth,2);assert.equal(stylus.commands.length,5);
});

test('Arrow shortcuts respect read-only, locked layers and host text inputs',async t=>{
  for(const mode of ['readOnly','locked','hidden']) {
    const page=await setup(t,{options:{readOnly:mode==='readOnly'}}),card=root(page);
    await page.evaluate(mode=>{const id=arrowEditor.getActiveLayer();if(mode==='locked')arrowEditor.setLayerLocked(id,true);if(mode==='hidden')arrowEditor.setLayerVisibility(id,false);},mode);
    const before=await save(page),tool=await page.evaluate(()=>arrowEditor.getTool());await card.locator('.etch-viewport').focus();await page.keyboard.press('a');
    assert.equal(await page.evaluate(()=>arrowEditor.getTool()),tool);assert.equal(await card.getByRole('button',{name:'Shapes',exact:true}).isDisabled(),true);assert.deepEqual(await save(page),before);
  }
  const page=await setup(t);await page.locator('#native').focus();await page.keyboard.press('a');assert.equal(await page.evaluate(()=>arrowEditor.getTool()),'pen');
});

test('Arrow Shift snapping, cancellation and command-limit failures are atomic',async t=>{
  const page=await setup(t);await page.evaluate(()=>{arrowEditor.setTool('arrow');arrowEditor.setViewState({zoom:1,pan:[0,0]});});await settle(page);
  await drag(page,[40,70],[140,90]);await page.keyboard.down('Shift');await settle(page);const wet=await root(page).locator('.etch-live').evaluate(c=>c.toDataURL());await page.mouse.up();await page.keyboard.up('Shift');await settle(page);
  const e=(await save(page)).layers[0].elements[0];assert.ok(Math.abs(e.commands[1][2]-e.commands[0][2])<1e-9);assert.equal(await root(page).locator('.etch-committed').evaluate(c=>c.toDataURL()),wet);
  const before=await save(page);await drag(page);await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await save(page),before);
  const limited=await setup(t,{options:{limits:{points:4}}});await limited.evaluate(()=>arrowEditor.setTool('arrow'));const empty=await save(limited);await drag(limited);await settle(limited);await limited.mouse.up();
  assert.deepEqual(await save(limited),empty);assert.equal(await limited.evaluate(()=>arrowEditor.canUndo()),false);assert.equal(await root(limited).locator('.etch-live').isVisible(),false);assert.equal(await limited.evaluate(()=>arrowErrors[0].code),'LIMIT_EXCEEDED');
});
