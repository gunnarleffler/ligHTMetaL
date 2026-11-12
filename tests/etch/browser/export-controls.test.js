import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
const fixture=useBrowser(process.env.ETCH_EXPORT_BROWSER ?? 'chromium');
const root=page=>page.locator('#export-card');
const menu=page=>root(page).locator('.etch-export-menu');
const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function setup(t,{mobile=false,readOnly=false,limits,fallback=false,blank=false}={}) {
  const context=await fixture.browser.newContext({viewport:{width:mobile?390:1200,height:mobile?700:850},hasTouch:mobile,acceptDownloads:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));t.after(async()=>{await context.close();assert.deepEqual(errors,[]);});
  await page.goto(fixture.server.origin+'/demo/');await collapseDemoSidebar(page);
  await page.evaluate(async({mobile,readOnly,limits,fallback,blank})=>{
    const {createEtch}=await import('/etch.js'),card=document.createElement('div');card.id='export-card';card.style=mobile?'width:320px;height:240px':'width:900px;height:500px';document.body.prepend(card);
    window.exportEditor=createEtch(card,{readOnly,limits});
    if(!blank) {const d=exportEditor.save();d.layers[0].elements=[{id:'mark',type:'highlight',transform:[1,0,0,1,0,0],points:[[20,40,1],[80,40,1]],pressure:false,color:'#FDE047',width:20,opacity:0.35}];await exportEditor.load(d);}
    if(fallback)card.querySelector('.etch').requestFullscreen=undefined;
    window.exportChanges=[];window.exportErrors=[];exportEditor.on('change',e=>exportChanges.push(e));exportEditor.on('error',e=>exportErrors.push(e));
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);window.exportURLs=[];window.exportRevoked=[];
    URL.createObjectURL=blob=>{const url=create(blob);exportURLs.push(url);return url;};URL.revokeObjectURL=url=>{exportRevoked.push(url);revoke(url);};
  },{mobile,readOnly,limits,fallback,blank});await settle(page);return page;
}
const snapshot=page=>page.evaluate(()=>({data:exportEditor.save(),revision:exportEditor.getRevision(),selection:exportEditor.getSelection(),active:exportEditor.getActiveLayer(),tool:exportEditor.getTool(),view:exportEditor.getViewState(),undo:exportEditor.canUndo(),redo:exportEditor.canRedo(),changes:exportChanges.length}));
async function open(page) {await root(page).getByRole('button',{name:'Export',exact:true}).click();}
async function download(page,format) {await open(page);const pending=page.waitForEvent('download');await menu(page).getByRole('button',{name:`Export ${format}`,exact:true}).click();const result=await pending;assert.equal(result.suggestedFilename(),`drawing.${format.toLowerCase()}`);assert.equal(await result.failure(),null);return readFile(await result.path());}
async function revoked(page) {await page.waitForFunction(()=>exportURLs.length===exportRevoked.length);assert.deepEqual(await page.evaluate(()=>exportRevoked),await page.evaluate(()=>exportURLs));}

for(const mobile of [false,true]) test(`embedded toolbar downloads PNG/SVG without sidebar or content edits (${mobile?'mobile':'desktop'})`,async t=>{
  const page=await setup(t,{mobile}),before=await snapshot(page);
  const png=await download(page,'PNG');assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(png.readUInt32BE(16),112);assert.equal(png.readUInt32BE(20),52);
  const svg=(await download(page,'SVG')).toString();assert.match(svg,/<svg /);assert.match(svg,/opacity="0.35"/);assert.match(svg,/<path /);
  assert.deepEqual(await snapshot(page),before);assert.equal(await root(page).locator('.etch-sidebar').isVisible(),false);assert.equal(await root(page).getByRole('button',{name:'Export',exact:true}).evaluate(el=>el===document.activeElement),true);await revoked(page);
});

test('Export keyboard navigation and Escape are scoped without changing tool, sidebar or quick controls',async t=>{
  const page=await setup(t),card=root(page);await card.getByRole('button',{name:'Pen',exact:true}).click();await card.getByRole('button',{name:'Toggle sidebar',exact:true}).click();await settle(page);const before=await snapshot(page);
  await open(page);await open(page);assert.equal(await menu(page).isVisible(),false);
  await open(page);assert.equal(await menu(page).getByRole('button',{name:'Export PNG',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('End');assert.equal(await menu(page).getByRole('button',{name:'Export SVG',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Home');await page.keyboard.press('ArrowUp');assert.equal(await menu(page).getByRole('button',{name:'Export SVG',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('h');await page.keyboard.press('0');await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await snapshot(page),before);
  await page.keyboard.press('Escape');
  // Popover visibility changes before its queued toggle event updates ARIA.
  await page.waitForFunction(()=>document.querySelector('#export-card [aria-controls^="etch-export-"]').getAttribute('aria-expanded')==='false');
  assert.equal(await menu(page).isVisible(),false);assert.equal(await card.locator('.etch-sidebar').isVisible(),true);assert.equal(await card.locator('.etch-quick-toolbar').isVisible(),true);assert.equal(await card.getByRole('button',{name:'Export',exact:true}).getAttribute('aria-expanded'),'false');
});

for(const fallback of [false,true]) test(`Export works inside ${fallback?'fallback':'native'} fullscreen with scoped dismissal and browser-owned Escape`,async t=>{
  const page=await setup(t,{fallback});await root(page).getByRole('button',{name:'Fullscreen',exact:true}).click();await settle(page);assert.equal(await page.evaluate(()=>exportEditor.getViewState().expanded),true);
  if(!fallback)assert.equal(await page.evaluate(()=>document.fullscreenElement===document.querySelector('#export-card .etch')),true);
  const png=await download(page,'PNG');assert.ok(png.length>0);const svg=await download(page,'SVG');assert.match(svg.toString(),/<svg /);assert.equal(await page.evaluate(()=>exportEditor.getViewState().expanded),true);
  await open(page);await page.keyboard.press('Escape');await settle(page);
  // Firefox reserves native-fullscreen Escape; page scripts cannot prevent that exit.
  if(fallback || process.env.ETCH_EXPORT_BROWSER!=='firefox')assert.equal(await page.evaluate(()=>exportEditor.getViewState().expanded),true);
  else assert.equal(await page.evaluate(()=>exportEditor.getViewState().expanded),false);
  assert.equal(await menu(page).isVisible(),false);await page.evaluate(()=>exportEditor.setExpanded(false));await revoked(page);
});

test('read-only toolbar exports committed content and encoding gates prevent duplicate UI jobs',async t=>{
  const page=await setup(t,{readOnly:true}),before=await snapshot(page);await download(page,'SVG');
  await page.evaluate(()=>{const original=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(callback,...args){return original.call(this,blob=>{window.releaseToolbarPNG=()=>callback(blob);},...args);};});
  await open(page);const pending=page.waitForEvent('download');await menu(page).getByRole('button',{name:'Export PNG',exact:true}).click();await page.waitForFunction(()=>typeof releaseToolbarPNG==='function');await open(page);
  assert.equal(await menu(page).getByRole('button',{name:'Export PNG',exact:true}).isDisabled(),true);assert.equal(await menu(page).getByRole('button',{name:'Export SVG',exact:true}).isDisabled(),true);
  await page.keyboard.press('Escape');await page.evaluate(()=>releaseToolbarPNG());await pending;await page.waitForFunction(()=>document.querySelector('#export-card button[aria-label="Export"]').getAttribute('aria-busy')==='false');assert.deepEqual(await snapshot(page),before);await revoked(page);
});

test('PNG scale retry requires confirmation; decline leaves state intact and accept downloads a bounded image',async t=>{
  for(const accept of [false,true]) {
    const page=await setup(t,{blank:true,limits:{rasterDimension:16,assetPixels:256}}),before=await snapshot(page);let message;
    page.on('dialog',async dialog=>{message=dialog.message();await (accept?dialog.accept():dialog.dismiss());});
    if(accept) {const bytes=await download(page,'PNG');assert.ok(bytes.readUInt32BE(16)<=16);assert.ok(bytes.readUInt32BE(20)<=16);}
    else {await open(page);await menu(page).getByRole('button',{name:'Export PNG',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#export-card button[aria-label="Export"]').getAttribute('aria-busy')==='false');assert.equal(await page.evaluate(()=>exportURLs.length),0);}
    assert.match(message,/too large.*instead\?/);assert.deepEqual(await snapshot(page),before);assert.deepEqual(await page.evaluate(()=>exportErrors),[]);await revoked(page);
  }
});

test('download URL is revoked if the host tears down the editor during anchor activation',async t=>{
  const page=await setup(t);await page.evaluate(()=>document.querySelector('#export-card').addEventListener('click',event=>{if(event.target instanceof HTMLAnchorElement){event.preventDefault();exportEditor.destroy();}}));
  await open(page);await menu(page).getByRole('button',{name:'Export SVG',exact:true}).click();assert.equal(await root(page).locator('.etch').count(),0);assert.equal(await page.evaluate(()=>exportURLs.length),1);await revoked(page);
});

test('export errors restore usable controls; destroy during PNG encoding suppresses late downloads',async t=>{
  const page=await setup(t),before=await snapshot(page);await page.evaluate(()=>{window.originalToolbarToBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(callback){callback(null);};});
  await open(page);await menu(page).getByRole('button',{name:'Export PNG',exact:true}).click();await page.waitForFunction(()=>exportErrors.length>0);assert.equal(await page.evaluate(()=>exportErrors[0].code),'DECODE_FAILED');assert.deepEqual(await snapshot(page),before);
  await download(page,'SVG');await revoked(page);
  await page.evaluate(()=>{const original=originalToolbarToBlob;HTMLCanvasElement.prototype.toBlob=function(callback,...args){return original.call(this,blob=>{window.releaseDestroyedPNG=()=>callback(blob);},...args);};});
  await open(page);let downloads=0;page.on('download',()=>downloads++);await menu(page).getByRole('button',{name:'Export PNG',exact:true}).click();await page.waitForFunction(()=>typeof releaseDestroyedPNG==='function');
  await page.evaluate(()=>{exportEditor.destroy();releaseDestroyedPNG();});await settle(page);assert.equal(downloads,0);assert.equal(await root(page).locator('.etch').count(),0);assert.equal(await page.evaluate(()=>exportURLs.length),1);
});
