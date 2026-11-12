import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
import {fixture,png} from '../test/helpers.js';
import {inspectRaster} from '../../../src/etch/raster.js';

const name = process.env.ETCH_EXPORT_BROWSER ?? 'chromium';
if (!['chromium','firefox'].includes(name)) throw new Error('ETCH_EXPORT_BROWSER must be chromium or firefox');
const runtime = useBrowser(name);
const crop = (width=500,height=350) => ({bounds:{x:0,y:0,width,height},padding:0});
function native() {
  const d = fixture(),l = d.layers[0];l.offset = [50,60];l.elements[0] = {...l.elements[0],points:[[10,140,0.3],[80,160,1],[150,140,0.4]],width:30,transform:[1,0.1,0.2,1,0,0]};
  l.elements.push({id:'ink',type:'ink',transform:[1,0,0,1,250,140],color:'#FF8800',parts:[[['M',0,0],['L',40,0],['L',40,15],['L',0,15],['Z']],[['M',0,25],['L',40,25],['L',40,40],['L',0,40],['Z']]]});
  const rect = {...l.elements[2],id:'upper',x:70,y:80,width:40,height:40,fill:'#00AA00',stroke:null,strokeWidth:0};
  d.layers.push({id:'locked',name:'Locked',offset:[0,0],visible:true,locked:true,elements:[rect]},{id:'hidden',name:'Hidden',offset:[0,0],visible:false,locked:false,elements:[{...rect,id:'hidden-rect',width:10000,height:10000,fill:'#FF0000'}]});return d;
}
async function pageFor(t,{data=native(),options={},dpr=1}={}) {
  const {browser,server} = runtime;
  const context = await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:dpr,acceptDownloads:true}),page = await context.newPage(),errors = [],external = [];
  page.on('pageerror',e => errors.push(e.message));page.on('console',m => {if (m.type() === 'error') errors.push(m.text());});page.on('request',r => {if (!r.url().startsWith(server.origin+'/') && !/^(blob:|data:)/.test(r.url())) external.push(r.url());});
  t.after(async () => {await context.close();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});await page.goto(`${server.origin}/demo/`);await collapseDemoSidebar(page);
  await page.evaluate(async ({data,options}) => {
    const {createEtch} = await import('/etch.js'),card = document.createElement('div');card.id = 'png-card';card.style.cssText = 'width:700px;height:540px';document.body.prepend(card);
    const e = window.pngEditor = createEtch(card,options);if (data) {await e.load(data);e.setActiveLayer(data.layers[0].id);}e.setViewState({zoom:1,pan:[0,0]});window.pngChanges = [];e.on('change',e => window.pngChanges.push(e));window.rawBitmap = window.createImageBitmap;
    window.readPNG = async result => {const image = await window.rawBitmap(result.blob),c = document.createElement('canvas');c.width = image.width;c.height = image.height;c.getContext('2d').drawImage(image,0,0);const pixels = [...c.getContext('2d').getImageData(0,0,c.width,c.height).data],value = {width:c.width,height:c.height,pixels,revision:result.revision,type:result.blob.type};image.close();c.width = c.height = 0;return value;};
  },{data,options});await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));return page;
}
async function exported(page,options) {return page.evaluate(async options => window.readPNG(await window.pngEditor.exportPNG(options)),options);}
async function snapshot(page) {return page.evaluate(() => {const e = window.pngEditor;return {document:e.save(),revision:e.getRevision(),view:e.getViewState(),selection:e.getSelection(),active:e.getActiveLayer(),tool:e.getTool(),undo:e.canUndo(),redo:e.canRedo()};});}
async function gateEncoding(page) {
  await page.evaluate(() => {const old = HTMLCanvasElement.prototype.toBlob;window.outputCanvases = [];HTMLCanvasElement.prototype.toBlob = function(callback,...args) {window.outputCanvases.push(this);return old.call(this,blob => {window.releaseExport = () => callback(blob);},...args);};});
}

test('PNG shares every native painter including pressure/ink/affine alpha images, locked layers and hidden omissions',async t => {
  const page = await pageFor(t),result = await exported(page,crop());assert.equal(result.type,'image/png');assert.deepEqual([result.width,result.height],[500,350]);
  const comparison = await page.evaluate(pixels => {const expected = document.querySelector('#png-card .etch-committed').getContext('2d').getImageData(0,0,500,350).data;let bad = 0,painted = 0;for (let i = 0;i < expected.length;i += 4) {if (expected[i+3]) painted++;if (pixels[i+3] !== expected[i+3]) bad++;for (let j = 0;j < 3;j++) if (Math.abs(pixels[i+j]*pixels[i+3]/255-expected[i+j]*expected[i+3]/255) > 3) bad++;}return {bad,painted};},result.pixels);assert.equal(comparison.bad,0);assert.ok(comparison.painted > 5000);
  assert.equal(result.pixels[(90*500+90)*4+1],170); // Locked upper layer wins painter order.
  assert.equal(result.pixels[(207*500+320)*4+3],255);assert.equal(result.pixels[(220*500+320)*4+3],0); // Ink's erased gap stays transparent.
});

test('auto/explicit padded bounds and scale are independent of view/DPR/theme; transparent/background/empty behavior is native',async t => {
  const page = await pageFor(t,{data:null,dpr:2}),before = await snapshot(page),first = await exported(page);assert.deepEqual([first.width,first.height],[288,288]);assert.ok(first.pixels.every(n => n === 0));
  await page.evaluate(() => {window.pngEditor.setViewState({zoom:8,pan:[-10000,3000]});document.querySelector('#png-card').dataset.lightmetalTheme = 'dark';});const second = await exported(page);assert.deepEqual(second.pixels,first.pixels);assert.equal(second.revision,before.revision);
  await page.evaluate(() => window.pngEditor.setBackground('#123456'));const p = await exported(page,{bounds:{x:-10,y:5,width:4,height:6},padding:1,scale:2});assert.deepEqual([p.width,p.height],[12,16]);assert.deepEqual(p.pixels.slice(0,4),[18,52,86,255]);const stable = await snapshot(page);await exported(page,crop(10,10));assert.deepEqual(await snapshot(page),stable);
});

test('export during a live Pen gesture saves only committed paint and does not end pointer ownership',async t => {
  const page = await pageFor(t,{data:null}),vp = page.locator('#png-card .etch-viewport');await vp.scrollIntoViewIfNeeded();await page.evaluate(() => document.querySelector('#png-card .etch-viewport').addEventListener('pointerdown',e => {window.pointerId = e.pointerId;}));const b = await vp.boundingBox();await page.mouse.move(b.x+100,b.y+100);await page.mouse.down();await page.mouse.move(b.x+180,b.y+120,{steps:4});
  const p = await exported(page,crop(300,200));assert.ok(p.pixels.every(n => n === 0));assert.equal(await vp.evaluate(el => el.hasPointerCapture(window.pointerId)),true);assert.equal((await snapshot(page)).document.layers[0].elements.length,0);
  await page.mouse.up();assert.equal((await snapshot(page)).document.layers[0].elements.length,1);assert.equal(await page.evaluate(() => window.pngChanges.length),1);
});

test('pending PNG encodes a captured revision after later load/edits dispose source assets, then clears its canvas',async t => {
  const page = await pageFor(t),before = await snapshot(page);await gateEncoding(page);await page.evaluate(options => {window.pendingPNG = window.pngEditor.exportPNG(options);},crop());await page.waitForFunction(() => Boolean(window.releaseExport));
  await page.evaluate(async () => {const d = window.pngEditor.save();d.layers = [{...d.layers[0],elements:[]}];d.assets = [];await window.pngEditor.load(d);window.pngEditor.setBackground('#FF0000');window.releaseExport();window.pngResult = await window.pendingPNG;});const result = await page.evaluate(() => window.readPNG(window.pngResult));assert.equal(result.revision,before.revision);assert.notEqual(result.revision,(await snapshot(page)).revision);assert.ok(result.pixels.some(n => n > 0));assert.deepEqual(result.pixels.slice(0,4),[0,0,0,0]);assert.equal(await page.evaluate(() => window.outputCanvases.every(c => c.width === 0 && c.height === 0)),true);
});

test('destroy cancels PNG promptly and clears output canvas even if the native encoder callback is late',async t => {
  const page = await pageFor(t);await gateEncoding(page);await page.evaluate(options => {window.pendingPNG = window.pngEditor.exportPNG(options).catch(e => e.code);},crop(100,100));await page.waitForFunction(() => Boolean(window.releaseExport));
  assert.equal(await page.evaluate(async () => {window.pngEditor.destroy();return window.pendingPNG;}),'CANCELLED');assert.equal(await page.evaluate(() => window.outputCanvases.every(c => c.width === 0)),true);await page.evaluate(() => window.releaseExport());assert.equal(await page.evaluate(async () => {try {await window.pngEditor.exportPNG();}catch(e) {return e.code;}}),'DESTROYED');
  const race = await pageFor(t);assert.equal(await race.evaluate(async options => {const old = HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob = function(cb,...args) {return old.call(this,blob => {cb(blob);window.pngEditor.destroy();},...args);};try {await window.pngEditor.exportPNG(options);}catch(e) {return e.code;}},crop(10,10)),'CANCELLED');
});

test('canvas/encoder failures are typed, atomic and release reservations for a subsequent valid export',async t => {
  const page = await pageFor(t,{options:{limits:{totalPixels:100,assetPixels:100,rasterDimension:100}}}),before = await snapshot(page);
  const codes = await page.evaluate(async options => {const oldContext = HTMLCanvasElement.prototype.getContext,oldBlob = HTMLCanvasElement.prototype.toBlob,codes = [];for (const mode of ['context','null','throw','mime']) {HTMLCanvasElement.prototype.getContext = mode === 'context' ? () => null : oldContext;HTMLCanvasElement.prototype.toBlob = function(cb) {if (mode === 'null') cb(null);else if (mode === 'throw') throw new DOMException('blocked','SecurityError');else cb(new Blob(['x'],{type:'image/jpeg'}));};try {await window.pngEditor.exportPNG(options);}catch(e) {codes.push(e.code);}}HTMLCanvasElement.prototype.getContext = oldContext;HTMLCanvasElement.prototype.toBlob = oldBlob;return codes;},crop(6,6));assert.deepEqual(codes,['EXPORT_TOO_LARGE','DECODE_FAILED','DECODE_FAILED','DECODE_FAILED']);assert.deepEqual(await snapshot(page),before);assert.equal((await exported(page,crop(6,6))).width,6);
});

test('oversized/invalid PNG options reject before output allocation, with actionable lower-scale details',async t => {
  const page = await pageFor(t),result = await page.evaluate(async () => {const old = document.createElement.bind(document);let canvases = 0;document.createElement = (...args) => {if (args[0] === 'canvas') canvases++;return old(...args);};const errors = [];for (const options of [{bounds:{x:0,y:0,width:8193,height:1},padding:0},{bounds:{x:0,y:0,width:5000,height:5000},padding:0},{scale:0},{padding:-1},{bounds:{x:NaN,y:0,width:1,height:1}},{other:1}]) try {await window.pngEditor.exportPNG(options);}catch(e) {errors.push({code:e.code,details:e.details});}document.createElement = old;return {canvases,errors};});assert.equal(result.canvases,0);assert.deepEqual(result.errors.map(e => e.code),['EXPORT_TOO_LARGE','EXPORT_TOO_LARGE','INVALID_ARGUMENT','INVALID_ARGUMENT','INVALID_ARGUMENT','INVALID_ARGUMENT']);assert.ok(result.errors[0].details.suggestedScale > 0);
});

test('concurrent exports are bounded, reserve pixels against imports, and free them after encoding',async t => {
  const page = await pageFor(t,{options:{limits:{totalPixels:12,assetPixels:12,rasterDimension:20}}});await page.evaluate(() => {const old = HTMLCanvasElement.prototype.toBlob;window.callbacks = [];HTMLCanvasElement.prototype.toBlob = function(cb,mime,...args) {return old.call(this,blob => mime === 'image/png' ? window.callbacks.push(() => cb(blob)) : cb(blob),mime,...args);};window.pendingPNGs = Array.from({length:4},() => window.pngEditor.exportPNG({bounds:{x:0,y:0,width:1,height:1},padding:0}));});await page.waitForFunction(() => window.callbacks.length === 4);
  assert.equal(await page.evaluate(async () => {try {await window.pngEditor.exportPNG({bounds:{x:0,y:0,width:1,height:1},padding:0});}catch(e) {return e.code;}}),'BUSY');
  assert.equal(await page.evaluate(async data => {try {await window.pngEditor.importImage(new Blob([Uint8Array.from(atob(data),c => c.charCodeAt(0))]));}catch(e) {return e.code;}},png(2,2)),'LIMIT_EXCEEDED');
  await page.evaluate(async () => {window.callbacks.forEach(cb => cb());await Promise.all(window.pendingPNGs);});await page.evaluate(async data => window.pngEditor.importImage(new Blob([Uint8Array.from(atob(data),c => c.charCodeAt(0))])),png(2,2));assert.equal((await snapshot(page)).document.assets.length,2);
});

test('pending import reservations constrain PNG without making export a content mutation or BUSY operation',async t => {
  const page = await pageFor(t,{options:{limits:{totalPixels:12,assetPixels:12,rasterDimension:20}}});await page.evaluate(data => {const old = window.createImageBitmap;window.createImageBitmap = async (...args) => {const image = await old(...args);await new Promise(r => window.releaseDecode = r);return image;};window.pendingImage = window.pngEditor.importImage(new Blob([Uint8Array.from(atob(data),c => c.charCodeAt(0))])).catch(e => e.code);},png(2,2));await page.waitForFunction(() => Boolean(window.releaseDecode));
  await assert.rejects(exported(page,crop(2,2)),/PNG exceeds/);assert.equal((await exported(page,crop(1,1))).width,1);await page.evaluate(async () => {window.pngEditor.cancel();window.releaseDecode();await window.pendingImage;});assert.equal((await exported(page,crop(2,2))).width,2);
});

test('demo offers explicit smaller-scale confirmation for an oversized drawing; cancel preserves content and accepts download safely',async t => {
  const page = await pageFor(t),d = fixture();d.assets = [];d.layers[0].elements = [{...d.layers[0].elements[2],x:0,y:0,width:20000,height:10,fill:'#FF0000',stroke:null,strokeWidth:0}];await page.locator('#native').fill(JSON.stringify(d));await page.getByRole('button',{name:'Load JSON below',exact:true}).click();await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('Loaded baseline'));const status = await page.locator('#save-status').textContent();
  page.once('dialog',dialog => {assert.match(dialog.message(),/Download PNG at/);return dialog.dismiss();});await page.getByRole('button',{name:'Download PNG',exact:true}).click();await page.waitForFunction(() => !document.querySelector('#export-png').disabled);assert.equal(await page.locator('#error').textContent(),'');
  page.once('dialog',dialog => dialog.accept());const pending = page.waitForEvent('download');await page.getByRole('button',{name:'Download PNG',exact:true}).click();const download = await pending,info = inspectRaster(new Uint8Array(await readFile(await download.path())));assert.equal(info.width,8192);assert.equal(await page.locator('#save-status').textContent(),status);assert.equal(await page.locator('#error').textContent(),'');
});

test('read-only permits PNG and the public demo downloads drawing.png without changing native save status',async t => {
  const page = await pageFor(t,{options:{readOnly:true}}),before = await snapshot(page);assert.equal((await exported(page,crop(20,20))).width,20);assert.deepEqual(await snapshot(page),before);
  await page.getByRole('button',{name:'Load coloring image',exact:true}).click();await page.locator('#editor').getByRole('button',{name:'Delete layer coloring',exact:true,includeHidden:true}).waitFor({state:'attached'});const status = await page.locator('#save-status').textContent(),downloaded = page.waitForEvent('download');await page.getByRole('button',{name:'Download PNG',exact:true}).click();const download = await downloaded;assert.equal(download.suggestedFilename(),'drawing.png');const bytes = new Uint8Array(await readFile(await download.path())),info = inspectRaster(bytes);assert.deepEqual([info.mime,info.width,info.height],['image/png',457,582]);assert.equal(await page.locator('#save-status').textContent(),status);assert.equal(await page.locator('#error').textContent(),'');
});
