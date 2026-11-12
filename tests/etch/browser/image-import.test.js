import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
import {png} from '../test/helpers.js';
const name = process.env.ETCH_IMAGE_BROWSER ?? 'chromium';
if (!['chromium','firefox','webkit'].includes(name)) throw new Error('ETCH_IMAGE_BROWSER must be chromium, firefox or webkit');
const runtime = useBrowser(name);
const root = page => page.locator('#image-card'),vp = page => root(page).locator('.etch-viewport');
async function settle(page) {await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));}
async function pageFor(t,options={},contextOptions={}) {
  const {browser,server} = runtime;
  const context = await browser.newContext({viewport:{width:1280,height:1000},...contextOptions}),page = await context.newPage(),errors = [],external = [];
  page.on('pageerror',e => errors.push(e.message));page.on('console',m => {if (m.type() === 'error') errors.push(m.text());});page.on('request',r => {if (!r.url().startsWith(server.origin+'/') && !/^(data:|blob:)/.test(r.url())) external.push(r.url());});
  t.after(async () => {await context.close();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});await page.goto(`${server.origin}/demo/`);await collapseDemoSidebar(page);
  await page.evaluate(async options => {const {createEtch} = await import('/etch.js'),card = document.createElement('div');card.id = 'image-card';card.style.cssText = 'width:900px;height:460px';document.body.prepend(card);window.imageEditor = createEtch(card,options);window.imageEditor.setViewState({zoom:1,pan:[0,0]});window.imageChanges = [];window.imageErrors = [];window.imageEditor.on('change',e => window.imageChanges.push(e));window.imageEditor.on('error',e => window.imageErrors.push(e));},options);await settle(page);return page;
}
const save = page => page.evaluate(() => window.imageEditor.save());
async function importPNG(page,{format,width=20,height=16,...options}={}) {return page.evaluate(async ({data,options,format}) => {const bytes = Uint8Array.from(atob(data),c => c.charCodeAt(0));return window.imageEditor.importImage(new File([bytes],'local.png',{type:'image/png'}),{...options,...(format ? {format} : {})});},{data:png(width,height),options,format});}
async function openPicker(page,bytes=Buffer.from(png(40,30),'base64')) {await root(page).getByRole('button',{name:'Toggle sidebar'}).click();await root(page).getByLabel('Choose local image',{exact:true}).setInputFiles({name:'alpha.png',mimeType:'image/png',buffer:bytes});}
async function ready(page) {await root(page).getByRole('button',{name:'Import as layer',exact:true}).waitFor();await page.waitForFunction(() => !document.querySelector('#image-card .etch-image-actions button:last-child').disabled);}
async function pixel(page,x,y) {return root(page).locator('.etch-committed').evaluate((c,[x,y]) => {const b = c.getBoundingClientRect();return [...c.getContext('2d').getImageData(Math.floor(x*c.width/b.width),Math.floor(y*c.height/b.height),1,1).data];},[x,y]);}

test('public import defaults to actual WebP quality 80, one command, natural scale/center, stable bytes/pixels and active layer Undo/redo',async t => {
  const page = await pageFor(t,{}, {deviceScaleFactor:2}),before = await save(page),active = await page.evaluate(() => window.imageEditor.getActiveLayer());
  await page.evaluate(() => {window.encodings = [];const old = HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob = function(callback,type,quality) {window.encodings.push({type,quality});return old.call(this,callback,type,quality);};});
  const expectedCenter = await vp(page).evaluate(el => {const b = el.getBoundingClientRect(),v = window.imageEditor.getViewState();return [b.width/2,b.height/2].map((n,i) => (n-v.pan[i])/v.zoom);});
  const {layerId:id,revision:importRevision,warnings} = await importPNG(page);assert.deepEqual(warnings,[]);assert.equal(importRevision,await page.evaluate(() => window.imageEditor.getRevision()));await settle(page);const after = await save(page);assert.equal(after.assets[0].mime,'image/webp');assert.deepEqual(await page.evaluate(() => window.encodings),[{type:'image/webp',quality:0.8}]);assert.equal(after.layers[1].id,id);assert.deepEqual(after.layers[1].offset,expectedCenter);
  assert.deepEqual([after.layers[1].elements[0].width,after.layers[1].elements[0].height],[20,16]);assert.equal(await page.evaluate(() => window.imageChanges.length),1);assert.equal(await page.evaluate(() => window.imageChanges[0].label),'Import image');
  const pixels = await root(page).locator('.etch-committed').evaluate(c => c.toDataURL());await page.evaluate(() => window.imageEditor.undo());assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => window.imageEditor.getActiveLayer()),active);
  await page.evaluate(() => window.imageEditor.redo());assert.deepEqual(await save(page),after);assert.equal(await page.evaluate(() => window.imageEditor.getActiveLayer()),id);await page.evaluate(async () => window.imageEditor.load(window.imageEditor.save()));await settle(page);assert.deepEqual(await save(page),after);assert.equal(await root(page).locator('.etch-committed').evaluate(c => c.toDataURL()),pixels);
});

test('PNG preserves alpha/pixels; lock image and draw on a new layer without changing embedded image bytes',async t => {
  const page = await pageFor(t);const {layerId:id} = await importPNG(page,{format:'png',width:160,height:100});await page.evaluate(id => {const e = window.imageEditor;e.setLayerLocked(id,true);e.createLayer({name:'Drawing'});e.setTool('pen');e.setViewState({zoom:1,pan:[200,200]});},id);await settle(page);const before = await save(page),asset = before.assets[0];assert.equal(asset.mime,'image/png');assert.equal(asset.data,png(160,100)); // safe static PNG is retained byte-for-byte
  const b = await vp(page).boundingBox();await page.mouse.move(b.x+200,b.y+180);await page.mouse.down();await page.mouse.move(b.x+270,b.y+220,{steps:5});await page.mouse.up();await settle(page);const after = await save(page);assert.deepEqual(after.assets,[asset]);assert.deepEqual(after.layers[1],before.layers[1]);assert.equal(after.layers[2].elements[0].type,'stroke');
  const alpha = await page.evaluate(async () => {const a = window.imageEditor.save().assets[0],image = await createImageBitmap(new Blob([Uint8Array.from(atob(a.data),c => c.charCodeAt(0))],{type:a.mime})),c = document.createElement('canvas');c.width = c.height = 1;c.getContext('2d').drawImage(image,0,0);const p = [...c.getContext('2d').getImageData(0,0,1,1).data];image.close();return p;});assert.equal(alpha[3],128);assert.ok(Math.abs(alpha[0]-40) <= 1,JSON.stringify(alpha));
});

test('chooser defaults to WebP 80, previews lossless PNG/quality size without dirtying, and confirms one native layer',async t => {
  const page = await pageFor(t),before = await save(page),revision = await page.evaluate(() => window.imageEditor.getRevision());await openPicker(page);await ready(page);
  const card = root(page);assert.equal(await card.getByRole('combobox',{name:'Image format'}).inputValue(),'webp');assert.equal(await card.getByRole('spinbutton',{name:'WebP quality'}).inputValue(),'80');assert.match(await card.locator('.etch-image-details').textContent(),/WebP quality 80.*KiB encoded.*base64/);assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => window.imageEditor.getRevision()),revision);
  assert.equal(await card.getByRole('button',{name:'New layer',exact:true}).isDisabled(),true);await card.getByRole('combobox',{name:'Image format'}).selectOption('png');await ready(page);assert.equal(await card.getByRole('spinbutton',{name:'WebP quality'}).isDisabled(),true);assert.match(await card.locator('.etch-image-details').textContent(),/PNG lossless/);
  await card.getByRole('button',{name:'Import as layer',exact:true}).click();assert.equal(await card.locator('.etch-image-dialog').evaluate(el => el.open),false);assert.equal((await save(page)).assets[0].mime,'image/png');assert.equal(await page.evaluate(() => window.imageChanges.length),1);
});

test('cancel/Escape/invalid files preserve native content, selection, revision and redo; the same file can be picked again',async t => {
  const page = await pageFor(t);await page.evaluate(() => {const e = window.imageEditor;e.createLayer({name:'Temp'});e.undo();});const before = await save(page),revision = await page.evaluate(() => window.imageEditor.getRevision());await openPicker(page);await ready(page);await page.keyboard.press('Escape');await settle(page);assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => window.imageEditor.getRevision()),revision);assert.equal(await page.evaluate(() => window.imageEditor.canRedo()),true);
  await root(page).getByLabel('Choose local image',{exact:true}).setInputFiles({name:'alpha.png',mimeType:'image/png',buffer:Buffer.from(png(40,30),'base64')});await ready(page);await root(page).getByRole('button',{name:'Cancel import'}).click();assert.deepEqual(await save(page),before);
  await root(page).getByLabel('Choose local image',{exact:true}).setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/x"/></svg>')});await page.waitForFunction(() => window.imageErrors.length === 1);assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => window.imageEditor.canRedo()),true);assert.equal(await root(page).locator('.etch-layer-actions button:last-child').isEnabled(),true);
});

test('preflight rejects huge headers/bytes before decode and checks retained/temporary pixels; corrupt bytes cannot partially import',async t => {
  const page = await pageFor(t,{limits:{assetPixels:100,totalPixels:299}});await page.evaluate(() => {window.decodeCalls = 0;const old = window.createImageBitmap;window.createImageBitmap = (...args) => {window.decodeCalls++;return old(...args);};});
  await assert.rejects(importPNG(page,{width:11,height:10}),/raster safety/);assert.equal(await page.evaluate(() => window.decodeCalls),0);const before = await save(page);
  await page.evaluate(async () => {try {await window.imageEditor.importImage(new Blob([new Uint8Array(20*1024*1024+1)]));} catch(e) {window.tooLargeCode = e.code;}});assert.equal(await page.evaluate(() => window.tooLargeCode),'LIMIT_EXCEEDED');assert.equal(await page.evaluate(() => window.decodeCalls),0);assert.deepEqual(await save(page),before);
  await importPNG(page,{width:10,height:10});await assert.rejects(importPNG(page,{width:10,height:10}),/raster safety/); // current + source + output exceed the 299-pixel allowance
});

test('pending decode blocks mutations, allows view changes, and cancel/load/destroy clean up late resources',async t => {
  const page = await pageFor(t);await page.evaluate(() => {window.oldBitmap = window.createImageBitmap;window.created = 0;window.imageClosed = 0;window.createImageBitmap = async (...args) => {const image = await window.oldBitmap(...args),close = image.close.bind(image);window.created++;image.close = () => {window.imageClosed++;close();};if (!window.releaseDecode) await new Promise(r => window.releaseDecode = r);return image;};});
  await page.evaluate(async data => {const bytes = Uint8Array.from(atob(data),c => c.charCodeAt(0));window.pendingImport = window.imageEditor.importImage(new Blob([bytes])).catch(e => {window.importCode = e.code;});},png(20,16));await page.waitForFunction(() => window.created === 1);
  await page.evaluate(() => {const e = window.imageEditor;try {e.createLayer();}catch(error) {window.blockedCode = error.code;}e.setViewState({zoom:2,pan:[12,34]});e.cancel();window.releaseDecode();});await page.evaluate(() => window.pendingImport);assert.equal(await page.evaluate(() => window.blockedCode),'BUSY');assert.equal(await page.evaluate(() => window.importCode),'CANCELLED');assert.equal(await page.evaluate(() => window.imageClosed),1);assert.equal((await save(page)).assets.length,0);
  await importPNG(page);assert.equal((await save(page)).assets.length,1);
  for (const action of ['load','destroy']) {
    const p = await pageFor(t);await p.evaluate(data => {const old = window.createImageBitmap;window.created = 0;window.imageClosed = 0;window.createImageBitmap = async (...args) => {const image = await old(...args),close = image.close.bind(image);window.created++;image.close = () => {window.imageClosed++;close();};await new Promise(r => window.releaseDecode = r);return image;};window.pendingImport = window.imageEditor.importImage(new Blob([Uint8Array.from(atob(data),c => c.charCodeAt(0))])).catch(e => {window.importCode = e.code;});},png(20,16));await p.waitForFunction(() => window.created === 1);
    await p.evaluate(async action => {if (action === 'load') await window.imageEditor.load(window.imageEditor.save());else window.imageEditor.destroy();window.releaseDecode();await window.pendingImport;},action);
    assert.equal(await p.evaluate(() => window.importCode),'CANCELLED');assert.equal(await p.evaluate(() => window.imageClosed),1);assert.deepEqual(await p.evaluate(() => window.imageChanges),[]);if (action === 'load') assert.equal((await save(p)).assets.length,0);else assert.equal(await p.locator('#image-card .etch').count(),0);
  }
});

test('unsupported WebP stays strict in the API; chooser automatically previews PNG and remembers it',async t => {
  const page = await pageFor(t);await page.evaluate(() => {
    window.encoderRequests=[];const old = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(cb,type) {encoderRequests.push(type);return old.call(this,cb,'image/png');};
  });
  await assert.rejects(importPNG(page),/cannot encode WebP/);const before=await save(page);
  await openPicker(page);await ready(page);
  const format=root(page).getByRole('combobox',{name:'Image format'}),quality=root(page).getByRole('spinbutton',{name:'WebP quality'});
  assert.equal(await format.inputValue(),'png');assert.equal(await format.locator('option[value="webp"]').evaluate(el=>el.disabled),true);
  assert.equal(await quality.isDisabled(),true);assert.equal(await root(page).locator('.etch-image-dialog .etch-image-error').textContent(),'');
  assert.match(await root(page).locator('.etch-image-details').textContent(),/PNG lossless.*WebP encoding unavailable/);
  assert.deepEqual(await save(page),before);await page.keyboard.press('Escape');assert.deepEqual(await save(page),before);
  const count=await page.evaluate(()=>encoderRequests.length);
  await root(page).getByLabel('Choose local image',{exact:true}).setInputFiles({name:'alpha.png',mimeType:'image/png',buffer:Buffer.from(png(40,30),'base64')});
  await ready(page);assert.equal(await format.inputValue(),'png');assert.equal(await page.evaluate(()=>encoderRequests.length),count);
  await root(page).getByRole('button',{name:'Import as layer'}).click();
  const after=await save(page);assert.equal(after.assets[0].mime,'image/png');assert.equal(after.assets[0].data,png(40,30));
  assert.equal(await page.evaluate(()=>imageChanges.length),1);
  await page.evaluate(()=>imageEditor.undo());assert.deepEqual(await save(page),before);
});

test('canceled WebP encoding cannot trigger a stale PNG retry or install content',async t => {
  const page=await pageFor(t);const before=await save(page);
  await page.evaluate(()=>{
    const old=HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob=function(cb,type) {
      if(type==='image/webp') return old.call(this,blob=>{window.releaseWebP=()=>cb(blob);},'image/png');
      return old.call(this,cb,type);
    };
  });
  await openPicker(page);await page.waitForFunction(()=>Boolean(window.releaseWebP));
  await root(page).getByRole('button',{name:'Cancel import'}).click();
  await page.evaluate(()=>releaseWebP());await settle(page);
  assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(()=>imageChanges.length),0);
  assert.equal(await root(page).locator('.etch-image-dialog').evaluate(el=>el.open),false);
});

test('image-element fallback decoder and browser JPEG orientation are normalized to frozen native output',async t => {
  const page = await pageFor(t);await page.evaluate(() => {window.createImageBitmap = undefined;});await importPNG(page,{format:'png'});assert.equal((await save(page)).assets[0].mime,'image/png');
  const result = await page.evaluate(async () => {const c = document.createElement('canvas');c.width = 12;c.height = 6;const ctx = c.getContext('2d');ctx.fillStyle = '#ff0000';ctx.fillRect(0,0,12,6);const jpeg = new Uint8Array(await (await new Promise(r => c.toBlob(r,'image/jpeg'))).arrayBuffer());const exif = new Uint8Array([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0]);await window.imageEditor.importImage(new Blob([jpeg.slice(0,2),exif,jpeg.slice(2)]),{format:'png'});return window.imageEditor.save().assets.at(-1);});assert.deepEqual([result.width,result.height],[6,12]);
});

test('image layer can move independently, remain locked/read-only, and save/reopen preserves exact selected format bytes',async t => {
  const page = await pageFor(t),{layerId:id} = await importPNG(page),before = await save(page);await page.evaluate(id => window.imageEditor.translateLayer(id,[12,23]),id);const after = await save(page);assert.deepEqual(after.assets,before.assets);assert.deepEqual(after.layers[1].elements,before.layers[1].elements);await page.evaluate(() => window.imageEditor.undo());assert.deepEqual(await save(page),before);
  const ro = await pageFor(t,{readOnly:true});await assert.rejects(importPNG(ro),/read-only/);await root(ro).getByRole('button',{name:'Toggle sidebar'}).click();assert.equal(await root(ro).getByRole('button',{name:'Import image',exact:true}).isDisabled(),true);
});

test('demo image buttons live outside the pad, import both user-provided local files without replacing art, and fit the view',async t => {
  const page = await pageFor(t);for (const [button,filename] of [['Load coloring image','coloring'],['Load note image','note']]) {
    const action = page.getByRole('button',{name:button,exact:true});assert.equal(await action.evaluate(el => Boolean(el.closest('#editor'))),false);await action.click();await page.waitForFunction(name => JSON.parse(document.querySelector('#native').value).layers.some(l => l.name === name),filename);
  }
  const doc = JSON.parse(await page.locator('#native').inputValue());assert.deepEqual(doc.layers.map(l => l.name),['Layer 1','coloring','note']);assert.ok(doc.assets.every(a => a.mime === 'image/webp'));assert.equal(await page.locator('#error').textContent(),'');
});

test('320×240 coarse-pointer sidebar keeps both layer actions and a complete row, and import dialog is scrollable on phones',async t => {
  const page = await pageFor(t,{}, {viewport:{width:390,height:844},hasTouch:true,isMobile:name === 'chromium'});await root(page).evaluate(el => el.style.cssText = 'width:320px;height:240px');await settle(page);await root(page).getByRole('button',{name:'Toggle sidebar'}).click();
  const card = await root(page).boundingBox();for (const label of ['New layer','Import image']) {const b = await root(page).getByRole('button',{name:label,exact:true}).boundingBox();assert.ok(b.x >= card.x && b.x+b.width <= card.x+card.width);assert.ok(b.height >= 24);}
  const row = await root(page).locator('.etch-layer').boundingBox(),list = await root(page).locator('.etch-layers').boundingBox();assert.ok(row.y+row.height <= list.y+list.height+1);
  await root(page).getByLabel('Choose local image',{exact:true}).setInputFiles({name:'alpha.png',mimeType:'image/png',buffer:Buffer.from(png(40,30),'base64')});await ready(page);const dialog = await root(page).locator('.etch-image-dialog').boundingBox();assert.ok(dialog.width <= 390 && dialog.height <= 844);await root(page).getByRole('button',{name:'Cancel import'}).click();
});
