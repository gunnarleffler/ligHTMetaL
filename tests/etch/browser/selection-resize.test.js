import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser} from './fixture.js';
import {png} from '../test/helpers.js';

const engine=process.env.ETCH_SELECTION_BROWSER ?? 'chromium';
const runtime = useBrowser(engine);
const rect=(id,x,y,width,height,fill)=>({id,type:'rect',transform:[1,0,0,1,0,0],x,y,width,height,fill,stroke:null,strokeWidth:0,lineJoin:'round',miterLimit:4});
const native=()=>({format:'lightmetal-etch',version:1,background:null,assets:[{id:'asset',mime:'image/png',width:1,height:1,data:png()}],layers:[
  {id:'lower',name:'Below',offset:[0,0],visible:true,locked:false,elements:[rect('yellow',0,0,500,350,'#FFFF00')]},
  {id:'active',name:'Artwork',offset:[10,20],visible:true,locked:false,elements:[{id:'image',type:'image',transform:[1,0,0,1,0,0],assetId:'asset',x:100,y:80,width:100,height:80,alt:'Alpha pixel'},rect('rect',250,80,50,60,'#FF0000')]},
  {id:'upper',name:'Above',offset:[0,0],visible:true,locked:false,elements:[rect('green',150,120,30,30,'#008000')]},
]});
const root=page=>page.locator('#resize-card'),vp=page=>root(page).locator('.etch-viewport');
async function settle(page){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function setup(t,{options={},size={width:1100,height:800}}={}){
  const {browser,server} = runtime;
  const page=await browser.newPage({viewport:size,deviceScaleFactor:2}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));t.after(async()=>{await page.close();assert.deepEqual(errors,[]);});
  await page.goto(server.origin+'/demo/');await page.evaluate(async({data,options})=>{
    const {createEtch}=await import('/etch.js'),card=document.createElement('div');card.id='resize-card';card.style='width:700px;height:420px';document.body.prepend(card);
    const e=window.resizeEditor=createEtch(card,options);await e.load(data);e.setActiveLayer('active');e.setViewState({zoom:1,pan:[0,0]});e.setTool('select');e.setSelection(['image']);
    window.resizeChanges=[];window.resizeErrors=[];e.on('change',e=>window.resizeChanges.push(e));e.on('error',e=>window.resizeErrors.push(e));
    card.querySelector('.etch-viewport').addEventListener('pointerdown',e=>window.resizePointer=e.pointerId);
  },{data:native(),options});await settle(page);return page;
}
const save=page=>page.evaluate(()=>window.resizeEditor.save());
async function move(page,x,y){const box=await vp(page).boundingBox();await page.mouse.move(box.x+x,box.y+y);}
async function begin(page,name='se',offset=[0,0]){
  await page.evaluate(()=>window.scrollTo({top:0,left:0,behavior:'instant'}));await settle(page);
  const box=await root(page).locator(`.etch-selection-handle[data-handle="${name}"]`).boundingBox();
  const point=[box.x+box.width/2+offset[0],box.y+box.height/2+offset[1]];await page.mouse.move(...point);await page.mouse.down();return point;
}
async function pixel(page,canvas,x,y){return root(page).locator(`.etch-${canvas}`).evaluate((c,[x,y])=>{const b=c.getBoundingClientRect();return [...c.getContext('2d').getImageData(Math.floor(x*c.width/b.width),Math.floor(y*c.height/b.height),1,1).data];},[x,y]);}
async function exported(page){return page.evaluate(async()=>{const {blob}=await window.resizeEditor.exportPNG({bounds:{x:0,y:0,width:500,height:350},padding:0});return Array.from(new Uint8Array(await blob.arrayBuffer()));});}
const close=(a,b)=>a.forEach((n,i)=>assert.ok(Math.abs(n-b[i])<1e-7,`${a} != ${b}`));

test('eight handles resize an image from original matrices, retain bytes/order/layers and undo/reopen exactly',async t=>{
  const page=await setup(t),before=await save(page),pngBefore=await exported(page);assert.equal(await root(page).locator('.etch-selection-handle:visible').count(),8);
  const p=await begin(page);await page.mouse.move(p[0]+50,p[1]+40);await settle(page);
  assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(()=>window.resizeChanges.length),0);assert.deepEqual(await exported(page),pngBefore);
  assert.deepEqual(await pixel(page,'live',160,130),[0,128,0,255]); // upper layer remains above preview
  const wet=await root(page).locator('.etch-live').evaluate(c=>c.toDataURL());
  await page.mouse.up();await settle(page);const after=await save(page);
  assert.deepEqual(after.layers[1].elements[0],{...before.layers[1].elements[0],transform:[1.5,0,0,1.5,-50,-40]});
  assert.notDeepEqual(await exported(page),pngBefore);
  assert.deepEqual(after.assets,before.assets);assert.deepEqual(after.layers[0],before.layers[0]);assert.deepEqual(after.layers[2],before.layers[2]);assert.deepEqual(after.layers[1].elements[1],before.layers[1].elements[1]);
  assert.equal(await root(page).locator('.etch-committed').evaluate(c=>c.toDataURL()),wet);assert.equal(await page.evaluate(()=>window.resizeChanges.length),1);
  await page.evaluate(()=>window.resizeEditor.undo());assert.deepEqual(await save(page),before);
  await page.evaluate(()=>window.resizeEditor.redo());assert.deepEqual(await save(page),after);
  await page.evaluate(async()=>{const e=window.resizeEditor;await e.load(e.save());});await settle(page);assert.deepEqual(await save(page),after);
  assert.equal(await root(page).locator('.etch-committed').evaluate(c=>c.toDataURL()),wet);
});
test('image corner aspect is locked by default, Shift unlocks immediately; ordinary corners invert that rule',async t=>{
  const page=await setup(t);let p=await begin(page);await page.mouse.move(p[0]+50,p[1]+8);await settle(page);
  const box=()=>root(page).locator('.etch-selection-outline').first().boundingBox();let b=await box();close([b.width,b.height],[150,120]);
  await page.keyboard.down('Shift');await settle(page);b=await box();close([b.width,b.height],[150,88]);
  await page.keyboard.up('Shift');await settle(page);b=await box();close([b.width,b.height],[150,120]);await page.mouse.up();
  await page.evaluate(()=>window.resizeEditor.setSelection(['rect']));await settle(page);p=await begin(page);await page.mouse.move(p[0]+25,p[1]+6);await settle(page);b=await box();close([b.width,b.height],[75,66]);
  await page.keyboard.down('Shift');await settle(page);b=await box();close([b.width,b.height],[75,90]);await page.mouse.up();await page.keyboard.up('Shift');
  close((await save(page)).layers[1].elements[1].transform.slice(0,4),[1.5,0,0,1.5]);
});
test('side handles change one axis only; handle hits outrank paint and pointer grab offsets do not jump',async t=>{
  const page=await setup(t),before=await save(page);const p=await begin(page,'e',[7,0]);await settle(page);assert.deepEqual(await save(page),before);
  await page.mouse.move(p[0]+50,p[1]+30);await page.mouse.up();await settle(page);
  close((await save(page)).layers[1].elements[0].transform,[1.5,0,0,1,-50,0]);
  assert.deepEqual(await page.evaluate(()=>window.resizeEditor.getSelection()),['image']);
  assert.equal(await page.evaluate(()=>window.resizeChanges[0].label),'Resize selection');
});
test('zoom/pan/DPR do not affect world scale, and multi-selection uses one affine edit',async t=>{
  const page=await setup(t),before=await save(page);
  await page.evaluate(()=>{const e=window.resizeEditor;e.setSelection(['image','rect']);e.setViewState({zoom:2,pan:[-100,-70]});});await settle(page);
  const p=await begin(page);await page.mouse.move(p[0]+100,p[1]+40);await page.mouse.up();await settle(page);
  const after=await save(page);for(let i=0;i<2;i++)close(after.layers[1].elements[i].transform,[1.25,0,0,1.25,-25,-20]);
  assert.equal(await page.evaluate(()=>window.resizeChanges.length),1);await page.evaluate(()=>window.resizeEditor.undo());assert.deepEqual(await save(page),before);
});
test('taps, jitter and origin-return resize gestures preserve redo/revision and selection',async t=>{
  const page=await setup(t);await page.evaluate(()=>{const e=window.resizeEditor;e.translateLayer('active',[2,0]);e.undo();window.noopRevision=e.getRevision();});await settle(page);const before=await save(page);
  for(const delta of [[0,0],[1,0],[60,40]]){const p=await begin(page);await page.mouse.move(p[0]+delta[0],p[1]+delta[1]);if(delta[0]===60)await page.mouse.move(...p);await page.mouse.up();await settle(page);}
  assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(()=>window.resizeEditor.getRevision()===window.noopRevision && window.resizeEditor.canRedo()),true);
  assert.deepEqual(await page.evaluate(()=>window.resizeEditor.getSelection()),['image']);
});
test('Escape, tool/view/layer changes and cancel discard the entire resize preview',async t=>{
  const page=await setup(t),data=native();
  for(const action of ['escape','tool','view','layer','cancel']){
    await page.evaluate(async data=>{const e=window.resizeEditor;await e.load(data);e.setActiveLayer('active');e.setSelection(['image']);e.setViewState({zoom:1,pan:[0,0]});e.setTool('select');window.resizeChanges=[];},data);await settle(page);
    const before=await save(page),p=await begin(page);await page.mouse.move(p[0]+50,p[1]+40);await settle(page);
    if(action==='escape')await page.keyboard.press('Escape');else await page.evaluate(action=>{const e=window.resizeEditor;if(action==='tool')e.setTool('pen');if(action==='view')e.setViewState({zoom:2});if(action==='layer')e.setActiveLayer('upper');if(action==='cancel')e.cancel();},action);
    await page.mouse.up();await settle(page);assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(()=>window.resizeChanges.length),0);
  }
});
test('oversized resize fails atomically, drops pointer ownership and leaves original assets/content intact',async t=>{
  const page=await setup(t),before=await save(page);await begin(page);
  await vp(page).evaluate(el=>el.dispatchEvent(new PointerEvent('pointermove',{pointerId:window.resizePointer,pointerType:'mouse',buttons:1,clientX:1e9,clientY:1e9,bubbles:true})));await settle(page);await page.mouse.up();await settle(page);
  assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(()=>window.resizeChanges.length),0);assert.equal(await page.evaluate(()=>window.resizeErrors.length),1);
  assert.equal(await vp(page).evaluate(el=>el.hasPointerCapture(window.resizePointer)),false);assert.equal(await root(page).locator('.etch-live').isVisible(),false);
});
test('arrow keys nudge selection in world units, Shift uses ten, text controls retain their keys',async t=>{
  const page=await setup(t),before=await save(page);await vp(page).focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Shift+ArrowDown');
  close((await save(page)).layers[1].elements[0].transform,[1,0,0,1,1,10]);assert.equal(await page.evaluate(()=>window.resizeChanges.length),2);
  await page.evaluate(()=>{window.resizeEditor.undo();window.resizeEditor.undo();});assert.deepEqual(await save(page),before);
  await page.evaluate(()=>{const input=document.createElement('input');document.querySelector('#resize-card').append(input);input.focus();});await page.keyboard.press('ArrowRight');assert.deepEqual(await save(page),before);
});
test('readonly/busy editors hide resize handles while committed content remains saveable',async t=>{
  const ro=await setup(t,{options:{readOnly:true}});assert.equal(await root(ro).locator('.etch-selection-handle:visible').count(),0);assert.equal(await root(ro).getByRole('button',{name:'Select',exact:true}).isDisabled(),true);
  const page=await setup(t),before=await save(page);
  await page.evaluate(data=>{
    const original=window.createImageBitmap;let release;const gate=new Promise(r=>release=r);
    window.createImageBitmap=async(...args)=>{await gate;return original(...args);};window.releaseResizeLoad=()=>{window.createImageBitmap=original;release();};
    window.pendingResizeLoad=window.resizeEditor.load(data);
  },native());await settle(page);
  assert.equal(await root(page).locator('.etch-selection-handle:visible').count(),0);assert.deepEqual(await save(page),before);
  await page.evaluate(async()=>{window.releaseResizeLoad();await window.pendingResizeLoad;});await settle(page);
});
test('touch resize uses the larger hit area and second touch cancels without committing',{skip:engine==='firefox' && 'CDP touch dispatch is Chromium-only'},async t=>{
  const page=await setup(t,{options:{drawWithTouch:true}}),before=await save(page),cdp=await page.context().newCDPSession(page),box=await vp(page).boundingBox();
  const p=(id,x,y)=>({id,x:box.x+x,y:box.y+y,radiusX:1,radiusY:1,force:1});
  // 10px outside the painted corner: within touch's 24px hit area, outside mouse's 16px.
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p(1,220,190)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[p(1,270,230)]});await settle(page);
  assert.equal(await vp(page).evaluate(el=>el.classList.contains('etch-resizing')),true);assert.deepEqual(await save(page),before);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle(page);close((await save(page)).layers[1].elements[0].transform,[1.5,0,0,1.5,-50,-40]);
  await page.evaluate(()=>window.resizeEditor.undo());await settle(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p(1,220,190)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[p(1,250,214)]});await settle(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p(1,250,214),p(2,290,240)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle(page);assert.deepEqual(await save(page),before);
});
test('actual desktop/mobile demo imports an image, selects/resizes it, saves exact bytes and undoes via UI',async t=>{
  for(const [name,size] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
    const {browser,server} = runtime;
    const context=await browser.newContext({viewport:size}),page=await context.newPage();t.after(()=>context.close());
    await page.goto(server.origin+'/demo/');await page.locator('#sample-coloring').click();await page.waitForFunction(()=>JSON.parse(document.querySelector('#native').value).assets.length===1);await settle(page);
    const editor=page.locator('#editor'),view=editor.locator('.etch-viewport'),toggle=editor.getByRole('button',{name:'Toggle sidebar',exact:true});
    if(await toggle.getAttribute('aria-expanded')==='true')await toggle.click();
    await editor.getByRole('button',{name:'Select',exact:true}).click();await view.scrollIntoViewIfNeeded();await settle(page);
    await view.click({position:{x:(await view.boundingBox()).width/2,y:(await view.boundingBox()).height/2}});await settle(page);
    assert.equal(await editor.locator('.etch-selection-handle:visible').count(),8);await page.locator('#save').click();const before=JSON.parse(await page.locator('#native').inputValue());
    const handle=editor.locator('.etch-selection-handle[data-handle="nw"]');await handle.scrollIntoViewIfNeeded();await settle(page);
    const bounds=await editor.locator('.etch-selection-outline').first().boundingBox(),h=await handle.boundingBox(),p=[h.x+h.width/2,h.y+h.height/2];
    await page.mouse.move(...p);await page.mouse.down();await page.mouse.move(p[0]+bounds.width*0.2,p[1]+bounds.height*0.2);await page.mouse.up();await settle(page);
    await page.locator('#save').click();const after=JSON.parse(await page.locator('#native').inputValue());assert.deepEqual(after.assets,before.assets);
    const original=before.layers.flatMap(l=>l.elements).find(e=>e.type==='image'),resized=after.layers.flatMap(l=>l.elements).find(e=>e.type==='image');
    assert.ok(Math.abs(resized.transform[0]-0.8)<0.01);assert.ok(Math.abs(resized.transform[3]-0.8)<0.01);assert.deepEqual({...resized,transform:original.transform},original);
    await view.scrollIntoViewIfNeeded();await settle(page);await page.screenshot({path:`/tmp/etch-resize-demo-${engine}-${name}.png`});
    await editor.getByRole('button',{name:'Undo',exact:true}).click();await page.locator('#save').click();assert.deepEqual(JSON.parse(await page.locator('#native').inputValue()),before);
    assert.equal(await page.locator('#error').textContent(),'');
  }
});
test('handles hide outside Select or locked layers; narrow cards retain eight handles',async t=>{
  const page=await setup(t);await page.evaluate(()=>window.resizeEditor.setTool('pen'));await settle(page);assert.equal(await root(page).locator('.etch-selection-handle:visible').count(),0);
  await page.evaluate(()=>{const e=window.resizeEditor;e.setTool('select');e.setLayerLocked('active',true);});await settle(page);assert.equal(await root(page).locator('.etch-selection-handle:visible').count(),0);
  await page.evaluate(()=>{const e=window.resizeEditor;e.setLayerLocked('active',false);e.setSelection(['image']);document.querySelector('#resize-card').style.width='320px';});await settle(page);assert.equal(await root(page).locator('.etch-selection-handle:visible').count(),8);
});
