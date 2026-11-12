import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser} from './fixture.js';

const engine=process.env.ETCH_UI_BROWSER ?? 'chromium';
const runtime = useBrowser(engine);
async function setup(t,{small=false,readOnly=false}={}) {
  const {browser,server} = runtime;
  const context=await browser.newContext({viewport:small?{width:390,height:600}:{width:1280,height:900},hasTouch:small}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));t.after(async()=>{await context.close();assert.deepEqual(errors,[]);});
  await page.goto(server.origin+'/demo/');
  await page.evaluate(async({small,readOnly})=>{
    const {createEtch}=await import('/etch.js'),card=document.createElement('div');card.id='refresh-card';card.style=small?'width:320px;height:240px':'width:960px;height:640px';document.body.prepend(card);
    const editor=window.refreshEditor=createEtch(card,{sidebarOpen:true,readOnly});
    window.refreshBaseline={data:editor.save(),revision:editor.getRevision(),active:editor.getActiveLayer()};
    window.refreshViewport=card.querySelector('.etch-viewport');window.refreshCanvases=[...card.querySelectorAll('canvas')];
  },{small,readOnly});return page;
}
const root=page=>page.locator('#refresh-card');
async function unchanged(page) {
  assert.deepEqual(await page.evaluate(()=>{
    const e=window.refreshEditor,b=window.refreshBaseline,c=document.querySelector('#refresh-card');
    return {data:JSON.stringify(e.save())===JSON.stringify(b.data),revision:e.getRevision()===b.revision,active:e.getActiveLayer()===b.active,undo:e.canUndo(),viewport:c.querySelector('.etch-viewport')===window.refreshViewport,canvases:[...c.querySelectorAll('canvas')].every((v,i)=>v===window.refreshCanvases[i])};
  }),{data:true,revision:true,active:true,undo:false,viewport:true,canvases:true});
}

test('pen slider, numeric field and shared-outline preview synchronize without content edits',async t=>{
  const page=await setup(t),card=root(page),slider=card.getByRole('slider',{name:'Pen width slider'}),width=card.getByRole('spinbutton',{name:'Pen width',exact:true}),preview=card.locator('.etch-stroke-preview');
  const initial=await preview.locator('path').getAttribute('d');
  await slider.focus();await slider.press('ArrowRight');assert.equal(await width.inputValue(),'3.5');assert.notEqual(await preview.locator('path').getAttribute('d'),initial);
  await width.fill('64');await width.press('Tab');assert.equal(await slider.inputValue(),'64');assert.match(await preview.getAttribute('aria-label'),/64 world units/);
  await card.getByLabel('Pen color',{exact:true}).evaluate(el=>{el.value='#ff0044';el.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await preview.locator('path').getAttribute('fill'),'#FF0044');
  await width.fill('0');await width.press('Tab');assert.equal(await width.inputValue(),'64');assert.equal(await slider.inputValue(),'64');
  await page.evaluate(()=>{const e=window.refreshEditor;e.setTool('rect');e.setTool('pen');});assert.equal(await width.inputValue(),'64');
  await unchanged(page);
});

test('finger input defaults on and an explicit off survives tool switches and sidebar collapse',async t=>{
  const page=await setup(t),card=root(page),finger=card.getByRole('checkbox',{name:'Draw with finger',exact:true});
  assert.equal(await finger.isChecked(),true);assert.equal(await page.evaluate(()=>refreshEditor.getDrawWithTouch()),true);
  await finger.uncheck();
  for(const [tool,label] of [['eraser','Erase with finger'],['move-layer','Move with finger'],['pen','Draw with finger']]){
    await page.evaluate(tool=>refreshEditor.setTool(tool),tool);
    assert.equal(await card.getByRole('checkbox',{name:label,exact:true}).isChecked(),false);
  }
  await card.getByRole('button',{name:'Toggle sidebar',exact:true}).click();
  await page.evaluate(()=>{refreshEditor.setTool('rect');refreshEditor.setTool('pen');});
  await card.getByRole('button',{name:'Toggle sidebar',exact:true}).click();
  assert.equal(await finger.isChecked(),false);await unchanged(page);
});

test('session refreshes retain layer rows/focus and skip unchanged document summaries and bounds',async t=>{
  const page=await setup(t),card=root(page);
  await page.evaluate(async()=>{
    const e=refreshEditor,d=e.save();
    d.layers[0].elements=[{id:'box',type:'rect',transform:[1,0,0,1,0,0],x:10,y:20,width:30,height:40,fill:'#FF0000',stroke:null,strokeWidth:0,lineJoin:'round',miterLimit:4}];
    d.layers.push({id:'other',name:'Other',visible:true,locked:false,offset:[0,0],elements:[]});
    await e.load(d);e.setActiveLayer(d.layers[0].id);e.setTool('select');
  });
  await card.locator('.etch-layer-select').first().focus();
  const result=await page.evaluate(()=>{
    const e=refreshEditor,root=document.querySelector('#refresh-card'),list=root.querySelector('.etch-layers');
    const rows=[...list.children],focus=document.activeElement,summary=document.getElementById(refreshViewport.getAttribute('aria-describedby')),metrics=root.querySelector('.etch-export-size');
    const observer=new MutationObserver(()=>{});
    for(const target of [list,summary,metrics]) observer.observe(target,{childList:true,subtree:true,characterData:true});
    const before=e.save(),revision=e.getRevision();
    e.setSelection(['box']);e.setActiveLayer('other');e.cancel();e.setTool('pen');e.setTool('select');
    const mutations=observer.takeRecords().length;observer.disconnect();
    return {mutations,rowsStable:rows.every((row,i)=>row===list.children[i]),focusStable:focus===document.activeElement,
      active:[...list.querySelectorAll('.etch-layer-select')].filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.dataset.etchLayerId),
      unchanged:JSON.stringify(before)===JSON.stringify(e.save())&&revision===e.getRevision()};
  });
  assert.deepEqual(result,{mutations:0,rowsStable:true,focusStable:true,active:['other'],unchanged:true});
  const beforeSummary=await card.locator('.etch-viewport .etch-sr-only').textContent();
  await page.evaluate(()=>refreshEditor.renameLayer('other','Renamed'));
  assert.notEqual(await card.locator('.etch-viewport .etch-sr-only').textContent(),beforeSummary);
  assert.equal(await card.getByRole('button',{name:'Renamed (0)',exact:true}).getAttribute('aria-pressed'),'true');
  await page.evaluate(()=>refreshEditor.undo());assert.equal(await card.locator('.etch-viewport .etch-sr-only').textContent(),beforeSummary);
});

test('Layers and properties collapse independently and retain disclosure state across tool changes',async t=>{
  const page=await setup(t),card=root(page),layers=card.getByRole('button',{name:'Layers',exact:true}),properties=card.getByRole('button',{name:'Pen properties',exact:true});
  await layers.click();assert.equal(await card.locator('.etch-layers').isVisible(),false);assert.equal(await properties.isVisible(),true);
  await properties.click();assert.equal(await card.locator('.etch-properties-content').isVisible(),false);
  await page.evaluate(()=>window.refreshEditor.setTool('ellipse'));const shapes=card.getByRole('button',{name:'Shape properties',exact:true});assert.equal(await shapes.getAttribute('aria-expanded'),'false');
  await shapes.click();assert.equal(await card.getByRole('combobox',{name:'Shape type'}).isVisible(),true);
  await layers.click();assert.equal(await card.locator('.etch-layers').isVisible(),true);await unchanged(page);
});

test('collapsed properties keep their reopen header in place and inside short sidebars',async t=>{
  for (const scenario of [{small:false,height:640,count:1},{small:false,height:240,count:30},{small:true,height:240,count:1},{small:true,height:240,count:30}]) {
    const page=await setup(t,{small:scenario.small}),card=root(page);
    await card.evaluate((el,height)=>el.style.height=`${height}px`,scenario.height);
    await page.evaluate(async count=>{
      const e=window.refreshEditor,d=e.save();
      for(let i=1;i<count;i++)d.layers.push({...d.layers[0],id:`extra-${i}`,name:`Extra ${i}`,elements:[]});
      await e.load(d);e.setToolSettings('pen',{width:7});
      window.refreshBaseline={data:e.save(),revision:e.getRevision(),active:e.getActiveLayer()};
    },scenario.count);
    const disclosure=card.getByRole('button',{name:'Pen properties',exact:true});await settle(page);
    const before=await disclosure.boundingBox();await disclosure.click();await settle(page);
    const after=await disclosure.boundingBox(),body=await card.locator('.etch-body').boundingBox();
    assert.ok(Math.abs(after.y-before.y)<1,`Header moved after collapse: ${JSON.stringify({scenario,before,after})}`);
    assert.ok(after.y>=body.y && after.y+after.height<=body.y+body.height,`Header clipped: ${JSON.stringify({scenario,after,body})}`);
    assert.equal(await disclosure.evaluate(el=>{const b=el.getBoundingClientRect();return el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}),true);
    await disclosure.click();assert.equal(await disclosure.getAttribute('aria-expanded'),'true');assert.equal(await card.getByRole('spinbutton',{name:'Pen width',exact:true}).inputValue(),'7');
    await card.getByRole('button',{name:'Layers',exact:true}).click();const compact=await disclosure.boundingBox();
    await disclosure.click();await settle(page);assert.ok(Math.abs((await disclosure.boundingBox()).y-compact.y)<1);
    await disclosure.press('Enter');assert.equal(await disclosure.getAttribute('aria-expanded'),'true');await unchanged(page);
  }
});

test('shape split-button chooses and remembers shapes, updates icon and scopes keyboard/focus',async t=>{
  const page=await setup(t),card=root(page),choose=card.getByRole('button',{name:'Choose shape',exact:true}),main=card.getByRole('button',{name:'Shapes',exact:true}),menu=card.locator('.etch-shape-menu');
  const rectangle=await main.locator('path').getAttribute('d');await choose.click();assert.equal(await choose.getAttribute('aria-expanded'),'true');
  await page.keyboard.press('End');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.refreshEditor.getTool()),'ellipse');assert.notEqual(await main.locator('path').getAttribute('d'),rectangle);assert.equal(await main.getAttribute('aria-pressed'),'true');
  await card.getByRole('button',{name:'Pen',exact:true}).click();await main.click();assert.equal(await page.evaluate(()=>window.refreshEditor.getTool()),'ellipse');
  await choose.click();await page.keyboard.press('h');await page.keyboard.press('ControlOrMeta+z');assert.equal(await page.evaluate(()=>window.refreshEditor.getTool()),'ellipse');
  await page.keyboard.press('Escape');assert.equal(await menu.isVisible(),false);assert.equal(await choose.evaluate(el=>el===document.activeElement),true);assert.equal(await card.locator('.etch-sidebar').isVisible(),true);
  await choose.click();await menu.getByRole('button',{name:'Line (L)',exact:true}).click();assert.equal(await page.evaluate(()=>window.refreshEditor.getTool()),'line');await unchanged(page);
});

test('small coarse-pointer cards preserve targets, scroll toolbar and keep sidebar independently usable',async t=>{
  const page=await setup(t,{small:true}),card=root(page),toggle=card.getByRole('button',{name:'Toggle sidebar'});
  for(const button of await card.locator('.etch-toolbar button').all()) {await button.scrollIntoViewIfNeeded();const box=await button.boundingBox();assert.ok(box.width>=32 && box.height>=32);}
  assert.equal(await toggle.isVisible(),true);await card.getByRole('button',{name:'Choose shape',exact:true}).click();
  const box=await card.locator('.etch-shape-menu').boundingBox();assert.ok(box.x>=0 && box.x+box.width<=390 && box.y>=0 && box.y+box.height<=600);await page.keyboard.press('Escape');
  const layout=await card.evaluate(el=>({overflow:el.querySelector('.etch-body').scrollHeight-el.querySelector('.etch-body').clientHeight,layers:el.querySelector('.etch-layers').clientHeight,properties:el.querySelector('.etch-tool-properties').clientHeight}));assert.ok(layout.overflow<=1 && layout.layers>=40 && layout.properties>=28,JSON.stringify(layout));
  await card.getByRole('button',{name:'Layers',exact:true}).click();await card.getByRole('slider',{name:'Pen width slider'}).focus();await page.keyboard.press('End');assert.equal(await page.evaluate(()=>window.refreshEditor.getToolSettings('pen').width),64);await unchanged(page);
});

test('shape chooser Escape closes only the chooser while expanded, then expansion can close',async t=>{
  const page=await setup(t),card=root(page);
  await page.evaluate(async()=>{document.querySelector('#refresh-card .etch').requestFullscreen=undefined;await window.refreshEditor.setExpanded(true);});
  await card.getByRole('button',{name:'Choose shape',exact:true}).click();await page.keyboard.press('Escape');
  assert.equal(await card.locator('.etch-shape-menu').isVisible(),false);assert.equal(await page.evaluate(()=>window.refreshEditor.getViewState().expanded),true);
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!window.refreshEditor.getViewState().expanded);await unchanged(page);
});

test('new editors default to partial erasing while an explicit Whole object choice persists',async t=>{
  const page=await setup(t),card=root(page);await card.getByRole('button',{name:'Eraser',exact:true}).click();
  const mode=card.getByRole('combobox',{name:'Eraser mode'});assert.equal(await mode.inputValue(),'partial');
  assert.deepEqual(await page.evaluate(()=>window.refreshEditor.getToolSettings('eraser')),{radius:10,mode:'partial'});
  await mode.selectOption('object');await card.getByRole('button',{name:'Pen',exact:true}).click();await card.getByRole('button',{name:'Eraser',exact:true}).click();
  assert.equal(await mode.inputValue(),'object');await unchanged(page);
});

test('read-only disables drawing controls but permits section disclosures and navigation',async t=>{
  const page=await setup(t,{readOnly:true}),card=root(page);assert.equal(await card.getByRole('button',{name:'Choose shape',exact:true}).isDisabled(),true);
  const divider=card.getByRole('separator',{name:'Resize sidebar'});await divider.press('ArrowLeft');assert.equal((await card.locator('.etch-sidebar').boundingBox()).width,250);
  await card.getByRole('button',{name:'Layers',exact:true}).click();assert.equal(await card.getByRole('button',{name:'Hand / Pan',exact:true}).isEnabled(),true);await unchanged(page);
});

async function settle(page) {await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function sidebarWidth(page) {await settle(page);return (await root(page).locator('.etch-sidebar').boundingBox()).width;}
async function center(page) {return page.evaluate(()=>{const e=window.refreshEditor,v=e.getViewState(),b=document.querySelector('#refresh-card .etch-viewport').getBoundingClientRect();return {zoom:v.zoom,world:[(b.width/2-v.pan[0])/v.zoom,(b.height/2-v.pan[1])/v.zoom]};});}
async function dragDivider(page,delta,{release=true}={}) {
  const divider=root(page).getByRole('separator',{name:'Resize sidebar'});await divider.scrollIntoViewIfNeeded();const b=await divider.boundingBox();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+delta,b.y+b.height/2,{steps:4});await settle(page);
  if(release){await page.mouse.up();await settle(page);}
}

test('sidebar drag/keyboard limits and reset retain world center, content, canvases and session width',async t=>{
  const page=await setup(t),card=root(page),divider=card.getByRole('separator',{name:'Resize sidebar'});
  await page.evaluate(()=>window.refreshEditor.setViewState({zoom:1.7,pan:[23,47]}));await settle(page);const before=await center(page);
  assert.equal(await sidebarWidth(page),240);await dragDivider(page,-80);assert.equal(await sidebarWidth(page),320);
  const after=await center(page);assert.equal(after.zoom,before.zoom);after.world.forEach((n,i)=>assert.ok(Math.abs(n-before.world[i])<1e-8));
  await divider.press('End');assert.equal(await sidebarWidth(page),400);await divider.press('Home');assert.equal(await sidebarWidth(page),200);
  await divider.press('ArrowLeft');assert.equal(await sidebarWidth(page),210);await divider.press('Shift+ArrowLeft');assert.equal(await sidebarWidth(page),260);
  await divider.press('Enter');assert.equal(await sidebarWidth(page),240);await dragDivider(page,300);assert.equal(await sidebarWidth(page),200);
  await dragDivider(page,-500);assert.equal(await sidebarWidth(page),400);await divider.dblclick();assert.equal(await sidebarWidth(page),240);
  await divider.press('ArrowLeft');await card.getByRole('button',{name:'Toggle sidebar'}).click();await card.getByRole('button',{name:'Toggle sidebar'}).click();assert.equal(await sidebarWidth(page),250);
  await unchanged(page);
});

test('cancelled divider drags roll back; responsive clamping preserves the requested width',async t=>{
  const page=await setup(t),card=root(page),divider=card.getByRole('separator',{name:'Resize sidebar'});
  await dragDivider(page,-60,{release:false});assert.equal(await sidebarWidth(page),300);await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await sidebarWidth(page),240);
  await dragDivider(page,-50,{release:false});await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();assert.equal(await sidebarWidth(page),240);
  await divider.evaluate(el=>el.addEventListener('pointerdown',event=>el.dataset.pointerId=String(event.pointerId)));
  await dragDivider(page,-40,{release:false});await divider.evaluate(el=>el.dispatchEvent(new PointerEvent('pointercancel',{pointerId:Number(el.dataset.pointerId)})));await page.mouse.up();assert.equal(await sidebarWidth(page),240);
  await dragDivider(page,-40,{release:false});await divider.evaluate(el=>el.releasePointerCapture(Number(el.dataset.pointerId)));await settle(page);await page.mouse.up();assert.equal(await sidebarWidth(page),240);
  await divider.press('End');await card.evaluate(el=>el.style.width='320px');assert.equal(await sidebarWidth(page),278);assert.equal(await divider.getAttribute('aria-valuemax'),'278');assert.equal(await divider.getAttribute('aria-valuenow'),'278');
  await card.evaluate(el=>el.style.width='960px');assert.equal(await sidebarWidth(page),400);
  await card.evaluate(el=>el.style.setProperty('--etch-sidebar-width','300px'));await divider.press('Enter');assert.equal(await sidebarWidth(page),240);
  await unchanged(page);
});

test('divider adjustment cancels wet artwork; destroy releases a live drag',async t=>{
  const page=await setup(t),card=root(page),viewport=card.locator('.etch-viewport'),box=await viewport.boundingBox();
  await page.mouse.move(box.x+30,box.y+30);await page.mouse.down();await page.mouse.move(box.x+120,box.y+60,{steps:4});
  await card.getByRole('separator',{name:'Resize sidebar'}).evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true})));await page.mouse.up();await settle(page);await unchanged(page);
  await card.getByRole('separator',{name:'Resize sidebar'}).evaluate(el=>window.deadRefreshDivider=el);
  await dragDivider(page,-30,{release:false});await page.evaluate(()=>window.refreshEditor.destroy());await page.mouse.up();assert.equal(await card.locator('.etch').count(),0);
  await page.evaluate(()=>{window.deadRefreshDivider.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));window.deadRefreshDivider.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:1,bubbles:true}));});
});

test('status shows committed default export surface bounds, current layer/tool and zoom, never invented save state',async t=>{
  const page=await setup(t),card=root(page),size=card.locator('.etch-export-size');assert.equal(await size.textContent(),'Export 288 × 288');assert.match(await card.locator('.etch-status-context').textContent(),/Pen · Layer 1/);
  await page.evaluate(async()=>{const e=window.refreshEditor,d=e.save();d.layers[0].elements.push({id:'box',type:'rect',transform:[1,0,0,1,0,0],x:-10.25,y:-20.5,width:100.5,height:50.25,fill:'#112233',stroke:null,strokeWidth:0,lineJoin:'round',miterLimit:4});await e.load(d);});
  assert.equal(await size.textContent(),'Export 132.5 × 82.25');assert.match(await size.getAttribute('title'),/origin \(-26.25, -36.5\)/);
  await page.evaluate(()=>{const e=window.refreshEditor;e.setTool('ellipse');e.renameLayer(e.getActiveLayer(),'Sketch');e.setViewState({zoom:2,pan:[10,20]});});await settle(page);
  assert.equal(await size.textContent(),'Export 132.5 × 82.25');assert.equal(await card.locator('.etch-status-context').textContent(),'Ellipse · Sketch');assert.equal(await card.locator('.etch-status-zoom').textContent(),'200%');
  await page.evaluate(()=>{const e=window.refreshEditor;e.setBackground({type:'graph',spacing:24});e.setLayerVisibility(e.getActiveLayer(),false);});assert.equal(await size.textContent(),'Export 288 × 288');assert.match(await card.locator('.etch-empty').textContent(),/No visible artwork/);
  await page.evaluate(()=>window.refreshEditor.undo());assert.equal(await size.textContent(),'Export 132.5 × 82.25');assert.equal(await card.locator('.etch-empty').isVisible(),false);
  assert.doesNotMatch(await card.locator('.etch-status').textContent(),/saved|unsaved/i);
});

test('empty-state quick actions do not draw, wet strokes do not change export bounds, and errors remain visible on small cards',async t=>{
  const page=await setup(t),card=root(page);await card.getByRole('button',{name:'Toggle sidebar'}).click();
  const picker=page.waitForEvent('filechooser');await card.getByRole('button',{name:'Import image to start',exact:true}).click();await picker;await unchanged(page);
  const box=await card.locator('.etch-viewport').boundingBox();await page.mouse.move(box.x+25,box.y+25);await page.mouse.down();await page.mouse.move(box.x+90,box.y+60,{steps:4});await settle(page);
  assert.equal(await card.locator('.etch-export-size').textContent(),'Export 288 × 288');await page.mouse.up();await settle(page);assert.notEqual(await card.locator('.etch-export-size').textContent(),'Export 288 × 288');assert.equal(await card.locator('.etch-empty').isVisible(),false);
  await page.evaluate(()=>window.refreshEditor.undo());assert.equal(await card.locator('.etch-empty').isVisible(),true);
  await card.evaluate(el=>el.style.width='320px');await card.getByRole('button',{name:'Toggle sidebar'}).click();
  const width=card.getByRole('spinbutton',{name:'Pen width',exact:true});await width.fill('0');await width.press('Tab');assert.equal(await card.locator('.etch-status').getAttribute('data-error'),'true');
  assert.equal(await card.locator('.etch-status-message').isVisible(),true);assert.equal(await card.locator('.etch-status-metrics').isVisible(),false);
});

async function drop(page,kind='png') {
  return page.evaluate(async kind=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=2;const ctx=canvas.getContext('2d');ctx.fillStyle='#ff0044';ctx.fillRect(0,0,2,2);
    const blob=kind==='png'?await new Promise(resolve=>canvas.toBlob(resolve,'image/png')):new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'],{type:'image/svg+xml'});
    const transfer=new DataTransfer();transfer.items.add(new File([blob],`drop.${kind}`,{type:blob.type}));const viewport=document.querySelector('#refresh-card .etch-viewport');
    const over=new DragEvent('dragover',{dataTransfer:transfer,bubbles:true,cancelable:true});viewport.dispatchEvent(over);
    const event=new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true});viewport.dispatchEvent(event);return {prevented:event.defaultPrevented,over:over.defaultPrevented};
  },kind);
}
test('image drop uses the existing preview/confirmation transaction with Cancel and one-step Undo',async t=>{
  const page=await setup(t),card=root(page),dialog=card.locator('.etch-image-dialog');assert.deepEqual(await drop(page),{prevented:true,over:true});
  const commit=dialog.getByRole('button',{name:'Import as layer',exact:true});await commit.waitFor();await page.waitForFunction(()=>!document.querySelector('#refresh-card .etch-image-dialog button:last-child').disabled);await unchanged(page);
  await card.getByRole('separator',{name:'Resize sidebar'}).evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true})));assert.equal(await dialog.isVisible(),true);assert.equal(await commit.isEnabled(),true);
  await dialog.getByRole('button',{name:'Cancel import',exact:true}).click();await unchanged(page);
  await drop(page);await commit.waitFor();await page.waitForFunction(()=>!document.querySelector('#refresh-card .etch-image-dialog button:last-child').disabled);await commit.click();
  assert.equal(await page.evaluate(()=>window.refreshEditor.save().assets.length),1);assert.equal(await card.locator('.etch-empty').isVisible(),false);
  await page.evaluate(()=>window.refreshEditor.undo());assert.equal(await card.locator('.etch-empty').isVisible(),true);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.refreshEditor.save())===JSON.stringify(window.refreshBaseline.data)),true);
});

test('unsupported/read-only drops cannot decode or install content; empty read-only editors have no edit actions',async t=>{
  const page=await setup(t),card=root(page);await page.evaluate(()=>{window.refreshDecodes=0;window.createImageBitmap=()=>{window.refreshDecodes++;throw new Error('Unexpected decode');};});
  assert.deepEqual(await drop(page,'svg'),{prevented:true,over:true});assert.equal(await card.locator('.etch-image-dialog').isVisible(),false);assert.match(await card.locator('.etch-status-message').textContent(),/Drop a PNG, JPEG or WebP/);assert.equal(await page.evaluate(()=>window.refreshDecodes),0);await unchanged(page);
  const ro=await setup(t,{readOnly:true});assert.equal(await root(ro).locator('.etch-empty-actions').isVisible(),false);await drop(ro);assert.equal(await root(ro).locator('.etch-image-dialog').isVisible(),false);await unchanged(ro);
});
