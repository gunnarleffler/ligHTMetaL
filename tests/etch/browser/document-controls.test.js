import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
import {fixture} from '../test/helpers.js';
import {multiply,translate} from '../../../src/etch/geometry/matrix.js';

const engine=process.env.ETCH_LAYER_BROWSER ?? 'chromium';
const runtime = useBrowser(engine);
function native(){const d=fixture();d.layers[0].name='Below';d.layers[0].offset=[20,30];d.layers.push({id:'upper',name:'Above',visible:true,locked:false,offset:[140,70],elements:d.layers[0].elements.map(e=>({...e,id:`upper-${e.id}`}))});return d;}
const root=page=>page.locator('#document-card');
const layerDialog=page=>root(page).locator('.etch-layer-dialog');
const bgDialog=page=>root(page).locator('.etch-background-dialog');
const bgButton=page=>root(page).getByRole('button',{name:'Document background',exact:true});
async function settle(page){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function setup(t,{data=native(),options={},mobile=false,active='upper'}={}){
  const {browser,server} = runtime;
  const context=await browser.newContext({viewport:mobile?{width:390,height:320}:{width:1280,height:900},deviceScaleFactor:2,hasTouch:mobile}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});t.after(async()=>{await context.close();assert.deepEqual(errors,[]);});
  await page.goto(server.origin+'/demo/');await collapseDemoSidebar(page);
  await page.evaluate(async({data,options,mobile,active})=>{
    const {createEtch}=await import('/etch.js'),card=document.createElement('div');card.id='document-card';card.style=mobile?'width:320px;height:240px':'width:900px;height:460px';document.body.prepend(card);
    const e=window.documentEditor=createEtch(card,{...options,sidebarOpen:true});await e.load(data);e.setActiveLayer(active);e.setViewState({zoom:1,pan:[10,20]});window.documentChanges=[];window.documentErrors=[];
    e.on('change',e=>window.documentChanges.push(e));e.on('error',e=>window.documentErrors.push(e));
  },{data,options,mobile,active});await settle(page);return page;
}
async function snapshot(page){return page.evaluate(()=>{const e=window.documentEditor;return {data:e.save(),revision:e.getRevision(),active:e.getActiveLayer(),selection:e.getSelection(),view:e.getViewState(),tool:e.getTool(),undo:e.canUndo(),redo:e.canRedo()};});}
async function openLayer(page){await root(page).getByRole('button',{name:'Layer options',exact:true}).click();}
async function openBackground(page){await bgButton(page).click();}
async function solid(page,hex){await bgDialog(page).getByRole('combobox',{name:'Background mode'}).selectOption('solid');await bgDialog(page).getByRole('textbox',{name:'Background hex color'}).fill(hex);}
async function pngPixel(page){return page.evaluate(async()=>{const {blob}=await window.documentEditor.exportPNG({bounds:{x:500,y:500,width:10,height:10},padding:0}),image=await createImageBitmap(blob),c=document.createElement('canvas');c.width=c.height=10;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);image.close();return [...ctx.getImageData(0,0,1,1).data];});}
async function canvas(page){return root(page).locator('.etch-committed').evaluate(c=>c.toDataURL());}
async function exportBytes(page){return page.evaluate(async()=>{const {blob}=await window.documentEditor.exportPNG({bounds:{x:0,y:0,width:350,height:220},padding:0});return Array.from(new Uint8Array(await blob.arrayBuffer()));});}

test('Merge Down UI preserves painter pixels, affine world placement, exact assets/order and one-step Undo/reopen',async t=>{
  const page=await setup(t);await page.evaluate(()=>{const e=window.documentEditor;e.setTool('select');e.setSelection(['upper-image']);});await settle(page);
  const before=await snapshot(page),pixels=await canvas(page),png=await exportBytes(page);await openLayer(page);assert.equal(await layerDialog(page).getByRole('button',{name:'Merge Down',exact:true}).isEnabled(),true);assert.match(await layerDialog(page).textContent(),/Above.*Below/s);
  await layerDialog(page).getByRole('button',{name:'Merge Down',exact:true}).click();await settle(page);const after=await snapshot(page),lower=after.data.layers[0];
  assert.equal(await layerDialog(page).isVisible(),false);assert.equal(after.data.layers.length,1);assert.equal(after.active,'layer');assert.deepEqual(after.selection,[]);assert.equal(lower.name,'Below');assert.deepEqual(lower.offset,before.data.layers[0].offset);assert.deepEqual(after.data.assets,before.data.assets);
  assert.deepEqual(lower.elements.map(e=>e.id),before.data.layers.flatMap(l=>l.elements.map(e=>e.id)));
  for(const old of before.data.layers[1].elements){const next=lower.elements.find(e=>e.id===old.id);assert.deepEqual({...next,transform:old.transform},old);assert.deepEqual(multiply(translate(...lower.offset),next.transform),multiply(translate(...before.data.layers[1].offset),old.transform));}
  assert.deepEqual(after.view,before.view);assert.equal(after.tool,before.tool);assert.equal(await canvas(page),pixels);assert.deepEqual(await exportBytes(page),png);assert.deepEqual(await page.evaluate(()=>window.documentChanges.map(e=>e.label)),['Merge down']);assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Layer options');
  await root(page).getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual((await snapshot(page)).data,before.data);assert.equal((await snapshot(page)).active,'upper');
  await root(page).getByRole('button',{name:'Redo',exact:true}).click();assert.deepEqual((await snapshot(page)).data,after.data);
  await page.evaluate(async()=>{const e=window.documentEditor;await e.load(e.save());});await settle(page);assert.equal(await canvas(page),pixels);assert.deepEqual((await snapshot(page)).data,after.data);
});
test('Merge Down guard reasons cover bottom/hidden/locked neighbors and update while options are open',async t=>{
  const page=await setup(t);await openLayer(page);const merge=layerDialog(page).getByRole('button',{name:'Merge Down',exact:true});
  await page.evaluate(()=>window.documentEditor.setLayerLocked('layer',true));assert.equal(await merge.isDisabled(),true);assert.match(await layerDialog(page).textContent(),/Unlock “Below”/);
  await page.evaluate(()=>{const e=window.documentEditor;e.setLayerLocked('layer',false);e.setLayerVisibility('layer',false);});assert.equal(await merge.isDisabled(),true);assert.match(await layerDialog(page).textContent(),/Show “Below”/);
  await page.evaluate(()=>{const e=window.documentEditor;e.setLayerVisibility('layer',true);e.setLayerVisibility('upper',false);});assert.equal(await merge.isDisabled(),true);assert.match(await layerDialog(page).textContent(),/Show “Above”/);
  await page.evaluate(()=>window.documentEditor.setLayerVisibility('upper',true));assert.equal(await merge.isEnabled(),true);
  await layerDialog(page).getByRole('button',{name:'Done',exact:true}).click();await page.evaluate(()=>window.documentEditor.setActiveLayer('layer'));await openLayer(page);assert.equal(await merge.isDisabled(),true);assert.match(await layerDialog(page).textContent(),/No lower layer/);
});
test('F2 targets its own row for merging without silently merging a different active layer',async t=>{
  const d=native();d.layers.push({id:'top',name:'Top',visible:true,locked:false,offset:[0,0],elements:[]});const page=await setup(t,{data:d,active:'top'}),before=await snapshot(page);
  await root(page).getByRole('button',{name:'Above (6)',exact:true}).focus();await page.keyboard.press('F2');assert.equal((await snapshot(page)).active,'top');await layerDialog(page).getByRole('button',{name:'Merge Down',exact:true}).click();const after=await snapshot(page);
  assert.deepEqual(after.data.layers.map(l=>l.id),['layer','top']);assert.equal(after.active,'layer');assert.deepEqual(after.data.layers[1],before.data.layers[2]);
  await root(page).getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual((await snapshot(page)).data,before.data);assert.equal((await snapshot(page)).active,'top');
});
test('failed Merge Down destination limits leave both layers intact and report the error inside the dialog',async t=>{
  const data={format:'lightmetal-etch',version:1,background:null,assets:[],layers:[{id:'layer',name:'Below',visible:true,locked:false,offset:[0,0],elements:[]},{id:'upper',name:'Above',visible:true,locked:false,offset:[100000,100000],elements:Array.from({length:100},(_,i)=>({id:`r${i}`,type:'rect',transform:[1,0,0,1,0,0],x:0,y:0,width:10,height:10,fill:'#112233',stroke:null,strokeWidth:0,lineJoin:'round',miterLimit:4}))}]};
  const page=await setup(t,{data,options:{limits:{jsonBytes:Buffer.byteLength(JSON.stringify(data))+16}}}),before=await snapshot(page);await openLayer(page);await layerDialog(page).getByRole('button',{name:'Merge Down',exact:true}).click();
  assert.deepEqual(await snapshot(page),before);assert.equal(await layerDialog(page).isVisible(),true);assert.ok((await layerDialog(page).getByRole('alert').textContent()).length>0);assert.equal(await page.evaluate(()=>window.documentErrors[0].code),'LIMIT_EXCEEDED');assert.equal(await page.evaluate(()=>window.documentChanges.length),0);
});
test('Background Apply is one normalized edit, preserves geometry/assets/selection/view and reaches native/PNG pixels',async t=>{
  const page=await setup(t);await page.evaluate(()=>window.documentEditor.setSelection(['upper-image']));const before=await snapshot(page);await openBackground(page);assert.equal(await bgDialog(page).getByRole('combobox',{name:'Background mode'}).inputValue(),'transparent');assert.equal(await bgDialog(page).getByRole('textbox',{name:'Background hex color'}).isDisabled(),true);
  await solid(page,'#aabbcc');assert.deepEqual(await snapshot(page),before);assert.deepEqual(await pngPixel(page),[0,0,0,0]);await bgDialog(page).getByRole('button',{name:'Apply background',exact:true}).click();await settle(page);
  const after=await snapshot(page);assert.equal(after.data.background,'#AABBCC');assert.deepEqual(after.data.layers,before.data.layers);assert.deepEqual(after.data.assets,before.data.assets);assert.deepEqual(after.selection,before.selection);assert.equal(after.active,before.active);assert.deepEqual(after.view,before.view);assert.equal(after.tool,before.tool);assert.deepEqual(await pngPixel(page),[170,187,204,255]);assert.deepEqual(await page.evaluate(()=>window.documentChanges.map(e=>e.label)),['Background']);assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Document background');
  await root(page).getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual((await snapshot(page)).data,before.data);await root(page).getByRole('button',{name:'Redo',exact:true}).click();assert.deepEqual((await snapshot(page)).data,after.data);
  await page.evaluate(async()=>{const e=window.documentEditor;await e.load(e.save());});assert.equal((await snapshot(page)).data.background,'#AABBCC');
});
test('top-bar background works with the sidebar closed and restores focus after Cancel, Escape and Apply',async t=>{
  for (const mobile of [false,true]) {
    const page=await setup(t,{mobile}),card=root(page);
    await card.getByRole('button',{name:'Toggle sidebar',exact:true}).click();await settle(page);
    const before=await snapshot(page),button=card.locator('.etch-toolbar').getByRole('button',{name:'Document background',exact:true});
    assert.equal(await button.count(),1);assert.equal(await card.locator('.etch-sidebar button[aria-label="Document background"]').count(),0);
    for (const close of ['cancel','escape']) {
      await button.click();assert.equal(await bgDialog(page).isVisible(),true);
      await solid(page,'#ABCDEF');
      if (close==='cancel') await bgDialog(page).getByRole('button',{name:'Cancel background',exact:true}).click();
      else await page.keyboard.press('Escape');
      assert.equal(await bgDialog(page).isVisible(),false);assert.equal(await button.evaluate(el=>el===document.activeElement),true);
      assert.equal(await card.locator('.etch-sidebar').isVisible(),false);assert.deepEqual(await snapshot(page),before);
    }
    await button.click();await bgDialog(page).getByRole('combobox',{name:'Background mode'}).selectOption('offwhite');
    await bgDialog(page).getByRole('button',{name:'Apply background',exact:true}).click();
    assert.equal((await snapshot(page)).data.background,'#FAF8F2');assert.equal(await button.evaluate(el=>el===document.activeElement),true);
    assert.equal(await card.locator('.etch-sidebar').isVisible(),false);
    assert.deepEqual(await page.evaluate(()=>documentChanges.map(e=>e.label)),['Background']);
  }
});
test('Background destination-limit failure keeps the draft open and original content/history intact',async t=>{
  const data=native(),page=await setup(t,{data,options:{limits:{jsonBytes:Buffer.byteLength(JSON.stringify(data))+1}}}),before=await snapshot(page);
  await openBackground(page);await solid(page,'#ABCDEF');await bgDialog(page).getByRole('button',{name:'Apply background',exact:true}).click();assert.deepEqual(await snapshot(page),before);assert.equal(await bgDialog(page).isVisible(),true);assert.ok((await bgDialog(page).getByRole('alert').textContent()).length>0);assert.equal(await page.evaluate(()=>window.documentErrors[0].code),'LIMIT_EXCEEDED');
  await bgDialog(page).getByRole('combobox',{name:'Background mode'}).selectOption('transparent');await bgDialog(page).getByRole('button',{name:'Apply background',exact:true}).click();assert.deepEqual(await snapshot(page),before);
});
test('Transparent background preserves PNG alpha, CSS paper/theme remain independent and color preference stays session-only',async t=>{
  const page=await setup(t);await openBackground(page);await solid(page,'#123456');await bgDialog(page).getByRole('button',{name:'Apply background',exact:true}).click();
  const before=await snapshot(page);await page.evaluate(()=>{document.documentElement.dataset.lightmetalTheme='dark';document.querySelector('#document-card').style.setProperty('--etch-canvas','#fafafa');});await settle(page);assert.deepEqual(await snapshot(page),before);assert.deepEqual(await pngPixel(page),[18,52,86,255]);
  await openBackground(page);await bgDialog(page).getByRole('combobox',{name:'Background mode'}).selectOption('transparent');assert.deepEqual(await pngPixel(page),[18,52,86,255]);await bgDialog(page).getByRole('button',{name:'Apply background',exact:true}).click();await settle(page);assert.equal((await snapshot(page)).data.background,null);assert.deepEqual(await pngPixel(page),[0,0,0,0]);
  assert.equal(await root(page).locator('.etch-viewport').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(250, 250, 250)');
  await openBackground(page);await bgDialog(page).getByRole('combobox',{name:'Background mode'}).selectOption('solid');assert.equal(await bgDialog(page).getByRole('textbox',{name:'Background hex color'}).inputValue(),'#123456');await page.keyboard.press('Escape');
});
test('background drafts, invalid/unchanged Apply, Cancel and Escape preserve redo/revision and modal shortcuts stay scoped',async t=>{
  const page=await setup(t);await page.evaluate(()=>{const e=window.documentEditor;e.setBackground('#112233');e.undo();window.documentChanges=[];});const before=await snapshot(page);
  await openBackground(page);await solid(page,'#fff');assert.equal(await bgDialog(page).getByRole('button',{name:'Apply background',exact:true}).isDisabled(),true);await page.keyboard.press('Enter');assert.deepEqual(await snapshot(page),before);assert.match(await bgDialog(page).getByRole('alert').textContent(),/#RRGGBB/);
  await bgDialog(page).getByRole('textbox',{name:'Background hex color'}).fill('#a1b2c3');await bgDialog(page).getByRole('button',{name:'Cancel background',exact:true}).click();assert.deepEqual(await snapshot(page),before);
  await openBackground(page);await bgDialog(page).getByRole('button',{name:'Cancel background',exact:true}).focus();await page.keyboard.press('h');await page.keyboard.press('0');await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await snapshot(page),before);await page.keyboard.press('Escape');assert.equal(await bgDialog(page).isVisible(),false);assert.equal(await root(page).getByRole('button',{name:'Toggle sidebar'}).getAttribute('aria-expanded'),'true');
  await openBackground(page);await bgDialog(page).getByRole('button',{name:'Apply background',exact:true}).click();assert.deepEqual(await snapshot(page),before);assert.deepEqual(await page.evaluate(()=>window.documentChanges),[]);
});
test('native color picker updates the hex draft without live edits and background remains usable with hidden locked active layers',async t=>{
  const data=native();data.layers[1].locked=true;data.layers[1].visible=false;const page=await setup(t,{data}),before=await snapshot(page);assert.equal(await bgButton(page).isEnabled(),true);await openBackground(page);await bgDialog(page).getByRole('combobox',{name:'Background mode'}).selectOption('solid');
  await bgDialog(page).getByLabel('Background color',{exact:true}).evaluate(el=>{el.value='#fedcba';el.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await bgDialog(page).getByRole('textbox',{name:'Background hex color'}).inputValue(),'#FEDCBA');assert.deepEqual(await snapshot(page),before);await bgDialog(page).getByRole('button',{name:'Apply background',exact:true}).click();assert.equal((await snapshot(page)).data.background,'#FEDCBA');assert.deepEqual((await snapshot(page)).data.layers,before.data.layers);
});
test('readonly/busy controls are disabled and a pending load closes stale drafts without overwriting the new document',async t=>{
  const ro=await setup(t,{options:{readOnly:true}});assert.equal(await bgButton(ro).isDisabled(),true);assert.equal(await root(ro).getByRole('button',{name:'Layer options',exact:true}).isDisabled(),true);
  const page=await setup(t);await openBackground(page);await solid(page,'#ABCDEF');const before=await snapshot(page);
  await page.evaluate(data=>{let release;const gate=new Promise(r=>release=r),original=createImageBitmap;window.createImageBitmap=async(...args)=>{await gate;return original(...args);};window.releaseDocumentLoad=()=>{window.createImageBitmap=original;release();};window.pendingDocumentLoad=window.documentEditor.load(data);},native());await settle(page);
  assert.equal(await bgDialog(page).isVisible(),false);assert.equal(await bgButton(page).isDisabled(),true);assert.equal(await root(page).getByRole('button',{name:'Layer options',exact:true}).isDisabled(),true);assert.deepEqual((await snapshot(page)).data,before.data);
  await page.evaluate(async()=>{window.releaseDocumentLoad();await window.pendingDocumentLoad;});assert.equal((await snapshot(page)).data.background,null);assert.equal(await bgButton(page).isEnabled(),true);
  await openBackground(page);await solid(page,'#FFFFFF');await page.evaluate(()=>window.documentEditor.setBackground('#010203'));assert.equal(await bgDialog(page).isVisible(),false);assert.equal((await snapshot(page)).data.background,'#010203');
});
test('opening document controls cancels wet input, destroy removes drafts and pending pointer-up cannot commit',async t=>{
  const page=await setup(t);await root(page).getByRole('button',{name:'Toggle sidebar',exact:true}).click();await settle(page);const before=await snapshot(page),vp=root(page).locator('.etch-viewport'),b=await vp.boundingBox();await page.mouse.move(b.x+40,b.y+40);await page.mouse.down();await page.mouse.move(b.x+100,b.y+80);await settle(page);
  const toolbarBackground=root(page).locator('.etch-toolbar button[aria-label="Document background"]');
  await toolbarBackground.evaluate(el=>el.click());assert.equal(await bgDialog(page).isVisible(),true);await page.mouse.up();await page.keyboard.press('Escape');assert.deepEqual(await snapshot(page),before);
  await toolbarBackground.click();await page.evaluate(()=>window.documentEditor.destroy());await page.mouse.up();assert.equal(await root(page).locator('.etch').count(),0);
});
test('actual desktop/mobile demo merges drawing into its image, applies background, saves exact assets and undoes via UI',async t=>{
  for(const [name,size] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
    const {browser,server} = runtime;
    const context=await browser.newContext({viewport:size}),page=await context.newPage();t.after(()=>context.close());await page.goto(server.origin+'/demo/');
    await page.locator('#sample-coloring').click();await page.waitForFunction(()=>JSON.parse(document.querySelector('#native').value).assets.length===1);await settle(page);
    const editor=page.locator('#editor'),toggle=editor.getByRole('button',{name:'Toggle sidebar',exact:true}),view=editor.locator('.etch-viewport');
    await editor.getByRole('button',{name:'New layer',exact:true}).click();if(await toggle.getAttribute('aria-expanded')==='true')await toggle.click();await view.scrollIntoViewIfNeeded();await settle(page);
    const box=await view.boundingBox();await page.mouse.move(box.x+40,box.y+60);await page.mouse.down();await page.mouse.move(box.x+100,box.y+90,{steps:4});await page.mouse.up();await page.locator('#save').click();
    const before=JSON.parse(await page.locator('#native').inputValue());assert.equal(before.layers.length,3);assert.equal(before.layers.at(-1).elements.length,1);
    await toggle.click();await editor.getByRole('button',{name:'Layer options',exact:true}).click();await page.screenshot({path:`/tmp/etch-document-merge-${engine}-${name}.png`});await editor.locator('.etch-layer-dialog').getByRole('button',{name:'Merge Down',exact:true}).click();
    await page.locator('#save').click();const merged=JSON.parse(await page.locator('#native').inputValue());assert.equal(merged.layers.length,2);assert.equal(merged.layers.at(-1).elements.length,2);assert.deepEqual(merged.assets,before.assets);
    await editor.getByRole('button',{name:'Document background',exact:true}).click();const dialog=editor.locator('.etch-background-dialog');await dialog.getByRole('combobox',{name:'Background mode'}).selectOption('solid');await dialog.getByRole('textbox',{name:'Background hex color'}).fill('#F1E2D3');await page.screenshot({path:`/tmp/etch-document-background-${engine}-${name}.png`});await dialog.getByRole('button',{name:'Apply background',exact:true}).click();assert.match(await page.locator('#save-status').textContent(),/Unsaved/);
    await page.locator('#save').click();const after=JSON.parse(await page.locator('#native').inputValue());assert.equal(after.background,'#F1E2D3');assert.deepEqual(after.assets,before.assets);assert.deepEqual(after.layers,merged.layers);
    await editor.getByRole('button',{name:'Undo',exact:true}).click();await page.locator('#save').click();assert.deepEqual(JSON.parse(await page.locator('#native').inputValue()),merged);
    await editor.getByRole('button',{name:'Undo',exact:true}).click();await page.locator('#save').click();assert.deepEqual(JSON.parse(await page.locator('#native').inputValue()),before);assert.equal(await page.locator('#error').textContent(),'');
  }
});
test('320×240 sidebar keeps rows/properties while both document dialogs scroll and preserve toolbar/viewport identity',async t=>{
  const page=await setup(t,{mobile:true}),card=root(page),before=await snapshot(page);await card.locator('.etch-viewport').evaluate(el=>el.dataset.identity='preserved');
  const sizes=await card.evaluate(el=>({layers:el.querySelector('.etch-layers').clientHeight,props:el.querySelector('.etch-tool-properties').clientHeight,overflow:el.querySelector('.etch-body').scrollHeight-el.querySelector('.etch-body').clientHeight}));assert.ok(sizes.layers>=40 && sizes.props>=28 && sizes.overflow<=1,JSON.stringify(sizes));
  await openBackground(page);let box=await bgDialog(page).boundingBox();assert.ok(box.width<=366 && box.height<=296);await solid(page,'#334455');await bgDialog(page).getByRole('button',{name:'Apply background',exact:true}).click();assert.equal((await snapshot(page)).data.background,'#334455');
  await openLayer(page);box=await layerDialog(page).boundingBox();assert.ok(box.width<=366 && box.height<=296);await layerDialog(page).getByRole('button',{name:'Merge Down',exact:true}).click();assert.equal((await snapshot(page)).data.layers.length,1);assert.equal(await card.locator('.etch-toolbar button').count(),17);assert.equal(await card.locator('.etch-viewport').getAttribute('data-identity'),'preserved');assert.equal(await card.locator('canvas').count(),3);
  assert.deepEqual((await snapshot(page)).view,before.view);
});
