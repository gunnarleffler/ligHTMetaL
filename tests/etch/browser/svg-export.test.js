import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
import {fixture,png} from '../test/helpers.js';

const name = process.env.ETCH_EXPORT_BROWSER ?? 'chromium';
if (!['chromium','firefox'].includes(name)) throw new Error('ETCH_EXPORT_BROWSER must be chromium or firefox');
const runtime = useBrowser(name);
const crop = {padding:0,bounds:{x:0,y:0,width:500,height:350}};
function native() {
  const d = fixture(),l = d.layers[0];l.offset = [50,60];d.assets[0] = {...d.assets[0],width:2,height:1,data:png(2,1)};
  l.elements[0] = {...l.elements[0],points:[[10,140,0.3],[80,160,1],[150,140,0.4]],width:30,transform:[1,0.1,0.2,1,0,0]};
  Object.assign(l.elements.find(e => e.type === 'image'),{width:64,height:48,alt:'<script onload="evil()">https://evil.invalid'});
  l.name = '<script onload="evil()">https://evil.invalid';
  l.elements.push({...l.elements[0],id:'uniform',pressure:false,points:[[180,30,0.1],[240,45,0.7]],width:8},
    {id:'ink',type:'ink',transform:[1,0,0,1,250,140],color:'#FF8800',parts:[[['M',0,0],['L',40,0],['L',40,15],['L',0,15],['Z']],[['M',0,25],['L',40,25],['L',40,40],['L',0,40],['Z']]]},
    {id:'hole',type:'path',transform:[1,0.1,-0.2,1,190,25],commands:[['M',0,0],['L',90,0],['L',90,60],['L',0,60],['Z'],['M',20,20],['L',70,20],['L',70,40],['L',20,40],['Z']],fill:'#AA55DD',fillRule:'evenodd',stroke:'#442277',strokeWidth:3,lineCap:'square',lineJoin:'bevel',miterLimit:4},
    {id:'reflected',type:'path',transform:[-1,0.1,0.3,1,420,80],commands:[['M',0,0],['Q',20,40,40,0],['C',60,-20,70,30,85,10]],fill:null,fillRule:'nonzero',stroke:'#EE2266',strokeWidth:6,lineCap:'square',lineJoin:'miter',miterLimit:8});
  const rect = {...l.elements[2],id:'upper',x:70,y:80,width:40,height:40,fill:'#00AA00',stroke:null,strokeWidth:0};
  d.layers.push({id:'locked',name:'Locked',offset:[0,0],visible:true,locked:true,elements:[rect]},
    {id:'hidden',name:'Hidden',offset:[0,0],visible:false,locked:false,elements:[{...rect,id:'hidden-rect',width:10000,height:10000,fill:'#FF0000'}]});return d;
}
async function pageFor(t,{data=native(),options={},dpr=1}={}) {
  const {browser,server} = runtime;
  const context = await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:dpr,acceptDownloads:true}),page = await context.newPage(),errors = [],external = [];
  page.on('pageerror',e => errors.push(e.message));page.on('console',m => {if (m.type() === 'error') errors.push(m.text());});page.on('request',r => {if (!r.url().startsWith(server.origin+'/') && !/^(blob:|data:)/.test(r.url())) external.push(r.url());});
  t.after(async () => {await context.close();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});await page.goto(`${server.origin}/demo/`);await collapseDemoSidebar(page);
  await page.evaluate(async ({data,options}) => {
    const {createEtch} = await import('/etch.js'),card = document.createElement('div');card.id = 'svg-card';card.style.cssText = 'width:700px;height:540px';document.body.prepend(card);
    const e = window.svgEditor = createEtch(card,options);if (data) {await e.load(data);e.setActiveLayer(data.layers[0].id);}e.setViewState({zoom:1,pan:[0,0]});window.svgChanges = [];e.on('change',v => window.svgChanges.push(v));
    window.raster = async blob => {
      const url = URL.createObjectURL(blob),image = new Image(),c = document.createElement('canvas');
      try {image.src = url;await image.decode();c.width = image.naturalWidth;c.height = image.naturalHeight;const ctx = c.getContext('2d');ctx.drawImage(image,0,0);return {width:c.width,height:c.height,pixels:ctx.getImageData(0,0,c.width,c.height).data};}
      finally {URL.revokeObjectURL(url);image.src = '';c.width = c.height = 0;}
    };
    window.compare = async options => {
      const e = window.svgEditor,svg = e.exportSVG(options),png = await e.exportPNG(options);
      const a = await window.raster(new Blob([svg.svg],{type:'image/svg+xml'})),b = await window.raster(png.blob);
      let bad = 0,total = 0,painted = 0;
      for (let i = 0;i < a.pixels.length;i += 4) {
        const aa = a.pixels[i+3],ba = b.pixels[i+3];if (ba) painted++;
        let delta = Math.abs(aa-ba);total += delta;
        for (let j = 0;j < 3;j++) {const d = Math.abs(a.pixels[i+j]*aa/255-b.pixels[i+j]*ba/255);total += d;delta = Math.max(delta,d);}
        if (delta > 24) bad++;
      }
      return {width:a.width,height:a.height,expected:[b.width,b.height],bad,mean:total/a.pixels.length,painted,revision:svg.revision,pngRevision:png.revision,
        top:[...a.pixels.slice((90*a.width+90)*4,(90*a.width+90)*4+4)],gap:a.pixels[(220*a.width+320)*4+3]};
    };
  },{data,options});return page;
}
async function snapshot(page) {return page.evaluate(() => {const e = window.svgEditor;return {document:e.save(),revision:e.getRevision(),view:e.getViewState(),selection:e.getSelection(),active:e.getActiveLayer(),tool:e.getTool(),undo:e.canUndo(),redo:e.canRedo(),changes:window.svgChanges};});}
function closePixels(result) {
  assert.deepEqual([result.width,result.height],result.expected);assert.ok(result.painted > 5000);
  assert.ok(result.bad < result.width*result.height*0.01+8,JSON.stringify(result));assert.ok(result.mean < 1,JSON.stringify(result));assert.equal(result.revision,result.pngRevision);
}

test('SVG raster matches canvas/PNG: pressure, uniform ink, cut gaps, holes, miter/caps, reflection, images and locked painter order',async t => {
  const page = await pageFor(t);await page.evaluate(() => {window.svgEditor.setTool('select');window.svgEditor.setSelection(['path','image']);});
  const before = await snapshot(page),result = await page.evaluate(options => window.compare(options),crop);
  closePixels(result);assert.deepEqual(result.top,[0,170,0,255]);assert.equal(result.gap,0);assert.deepEqual(await snapshot(page),before);
});
test('SVG preserves solid/transparent backgrounds and explicit world crop clipping independently of view/theme/DPR',async t => {
  const page = await pageFor(t,{dpr:2});await page.evaluate(() => window.svgEditor.setBackground('#F7EFE7'));closePixels(await page.evaluate(options => window.compare(options),crop));
  closePixels(await page.evaluate(options => window.compare(options),{padding:0,bounds:{x:-20,y:-30,width:540,height:400}}));
  const first = await page.evaluate(options => window.svgEditor.exportSVG(options),crop);
  await page.evaluate(() => {window.svgEditor.setViewState({zoom:8,pan:[-1234,5678]});document.querySelector('#svg-card').dataset.lightmetalTheme = 'dark';});assert.deepEqual(await page.evaluate(options => window.svgEditor.exportSVG(options),crop),first);
  const clipped = await page.evaluate(async () => {const o = {padding:0,bounds:{x:65,y:70,width:30,height:40}},s = window.svgEditor.exportSVG(o),a = await window.raster(new Blob([s.svg],{type:'image/svg+xml'})),b = await window.raster((await window.svgEditor.exportPNG(o)).blob);let bad = 0;for (let i = 0;i < a.pixels.length;i++) if (Math.abs(a.pixels[i]-b.pixels[i]) > 24) bad++;return {width:a.width,height:a.height,bad};});
  assert.deepEqual([clipped.width,clipped.height],[30,40]);assert.ok(clipped.bad < 100);
});
test('SVG is inert allowlisted XML with no names/IDs/alt, hidden geometry, CSS or external references',async t => {
  const page = await pageFor(t),result = await page.evaluate(() => {
    const create = document.createElement.bind(document),decode = window.createImageBitmap;let canvases = 0,decoders = 0,svg;
    document.createElement = (...args) => {if (args[0] === 'canvas') canvases++;return create(...args);};window.createImageBitmap = () => {decoders++;throw new Error('SVG must not decode images');};
    try {svg = window.svgEditor.exportSVG().svg;}finally {document.createElement = create;window.createImageBitmap = decode;}
    const doc = new DOMParser().parseFromString(svg,'image/svg+xml');
    const allowed = ['svg','g','path','line','rect','ellipse','image'];return {canvases,decoders,error:!!doc.querySelector('parsererror'),namespace:doc.documentElement.namespaceURI,
      bad:[...doc.querySelectorAll('*')].flatMap(el => [...(!allowed.includes(el.localName) ? [el.localName] : []),...[...el.attributes].filter(a => /^(on|style$|class$|id$|alt$)/i.test(a.name)).map(a => a.name)]),
      hrefs:[...doc.querySelectorAll('image')].map(el => el.getAttribute('href')),hidden:svg.includes('#FF0000'),hostile:svg.includes('evil.invalid'),images:window.svgEditor.save().assets.map(a => `data:${a.mime};base64,${a.data}`)};
  });assert.equal(result.canvases,0);assert.equal(result.decoders,0);assert.equal(result.error,false);assert.equal(result.namespace,'http://www.w3.org/2000/svg');assert.deepEqual(result.bad,[]);assert.equal(result.hidden,false);assert.equal(result.hostile,false);assert.deepEqual(result.hrefs,result.images);
});
test('SVG emits real static WebP bytes and alpha images without recompression or aspect-ratio letterboxing',async t => {
  const page = await pageFor(t,{data:null});const source = await page.evaluate(async () => {
    const c = document.createElement('canvas');c.width = 20;c.height = 10;const ctx = c.getContext('2d');ctx.fillStyle = '#123456';ctx.fillRect(0,0,10,10);ctx.fillStyle = 'rgba(220,60,80,.5)';ctx.fillRect(10,0,10,10);
    const blob = await new Promise(r => c.toBlob(r,'image/png'));await window.svgEditor.importImage(blob);
    const d = window.svgEditor.save(),a = d.assets[0];d.layers.at(-1).elements[0].width = 80;d.layers.at(-1).elements[0].height = 80;await window.svgEditor.load(d);
    const svg = window.svgEditor.exportSVG().svg;return {mime:a.mime,exact:svg.includes(`href="data:${a.mime};base64,${a.data}"`),data:a.data};
  });assert.equal(source.mime,'image/webp');assert.equal(source.exact,true);
  // Fit the imported image into the explicit crop without altering its native dimensions.
  await page.evaluate(() => {const e = window.svgEditor;e.translateLayer(e.getActiveLayer(),[-100,-100]);});
  const comparison = await page.evaluate(options => window.compare(options),{padding:0,bounds:{x:200,y:100,width:200,height:200}});
  assert.ok(comparison.painted > 5000);assert.ok(comparison.bad < 300);assert.ok(comparison.mean < 1);assert.equal((await snapshot(page)).document.assets[0].data,source.data);
});
test('SVG is synchronous, committed-only during live Pen input and leaves pointer ownership intact',async t => {
  const page = await pageFor(t,{data:null}),vp = page.locator('#svg-card .etch-viewport'),box = await vp.boundingBox();await page.evaluate(() => window.svgEditor.setTool('pen'));
  await vp.evaluate(el => el.addEventListener('pointerdown',e => {window.svgPointerId = e.pointerId;},{once:true}));
  await page.mouse.move(box.x+30,box.y+40);await page.mouse.down();await page.mouse.move(box.x+130,box.y+80,{steps:4});
  const result = await page.evaluate(() => {const e = window.svgEditor,r = e.exportSVG(),live = document.querySelector('#svg-card .etch-live');return {sync:typeof r.svg === 'string' && !(r instanceof Promise),paths:(r.svg.match(/<path /g) ?? []).length,live:!live.hidden,revision:r.revision};});
  assert.equal(result.sync,true);assert.equal(result.paths,0);assert.equal(result.live,true);assert.equal(await vp.evaluate(el => el.hasPointerCapture(window.svgPointerId)),true);
  await page.mouse.move(box.x+160,box.y+90);await page.mouse.up();assert.equal((await snapshot(page)).document.layers[0].elements.length,1);assert.notEqual((await snapshot(page)).revision,result.revision);
});
test('SVG snapshots survive load/destroy; read-only works and post-destroy calls throw DESTROYED',async t => {
  const page = await pageFor(t,{options:{readOnly:true}}),before = await snapshot(page);await page.evaluate(options => {window.savedSVG = window.svgEditor.exportSVG(options);},crop);assert.deepEqual(await snapshot(page),before);
  const result = await page.evaluate(async () => {await window.svgEditor.load({format:'lightmetal-etch',version:1,background:null,layers:[{id:'empty',name:'Empty',visible:true,locked:false,offset:[0,0],elements:[]}],assets:[]});window.svgEditor.destroy();const image = await window.raster(new Blob([window.savedSVG.svg],{type:'image/svg+xml'}));let code;try {window.svgEditor.exportSVG();}catch(e) {code = e.code;}return {code,width:image.width,painted:[...image.pixels].some(n => n !== 0)};});
  assert.deepEqual(result,{code:'DESTROYED',width:500,painted:true});
});
test('SVG allocates no canvases/decoders and remains available while import is BUSY and raster allowance exhausted',async t => {
  const page = await pageFor(t,{data:null,options:{limits:{totalPixels:2,assetPixels:2,rasterDimension:2}}});
  const result = await page.evaluate(async () => {
    const e = window.svgEditor,old = HTMLCanvasElement.prototype.toBlob;let release;
    HTMLCanvasElement.prototype.toBlob = function(cb,...args) {return old.call(this,blob => {release = () => cb(blob);},...args);};
    const pending = e.exportPNG({padding:0,bounds:{x:0,y:0,width:1,height:1}});while (!release) await new Promise(r => setTimeout(r,0));
    const create = document.createElement.bind(document),decode = window.createImageBitmap;let canvases = 0,decoders = 0;
    document.createElement = (...args) => {if (args[0] === 'canvas') canvases++;return create(...args);};window.createImageBitmap = (...args) => {decoders++;return decode(...args);};
    try {const a = e.exportSVG(),load = e.load({format:'lightmetal-etch',version:1,background:null,layers:[{id:'empty',name:'Empty',visible:true,locked:false,offset:[0,0],elements:[]}],assets:[]}),b = e.exportSVG();let code;try {e.createLayer();}catch(error) {code = error.code;}await load;return {canvases,decoders,first:typeof a.svg,second:typeof b.svg,code};}
    finally {document.createElement = create;window.createImageBitmap = decode;HTMLCanvasElement.prototype.toBlob = old;release();await pending;}
  });assert.deepEqual(result,{canvases:0,decoders:0,first:'string',second:'string',code:'BUSY'});
});
test('SVG invalid options and output-byte failure preserve state/redo and permit later exports',async t => {
  const d = fixture();d.layers[0].elements = [d.layers[0].elements[0]];d.assets = [];
  const page = await pageFor(t,{data:d,options:{limits:{jsonBytes:1000}}});await page.evaluate(() => {window.svgEditor.setBackground('#FFFFFF');window.svgEditor.undo();});const before = await snapshot(page);
  const codes = await page.evaluate(() => {const e = window.svgEditor,codes = [];for (const o of [{scale:1},{padding:-1},{bounds:{x:0,y:0,width:0,height:1}},{}]) try {e.exportSVG(o);}catch(e) {codes.push(e.code);}return codes;});
  assert.deepEqual(codes,['INVALID_ARGUMENT','INVALID_ARGUMENT','INVALID_ARGUMENT','EXPORT_TOO_LARGE']);assert.deepEqual(await snapshot(page),before);
  assert.equal(await page.evaluate(() => {const e = window.svgEditor;e.setLayerVisibility(e.getActiveLayer(),false);return typeof e.exportSVG().svg;}),'string');
});
test('actual desktop/mobile demo downloads valid SVG with native ink/original image bytes without marking attachment saved',async t => {
  for (const mobile of [false,true]) {
    const {browser,server} = runtime;
    const context = await browser.newContext({viewport:mobile ? {width:390,height:844} : {width:1440,height:1000},isMobile:name === 'chromium' && mobile,hasTouch:mobile,acceptDownloads:true}),page = await context.newPage();t.after(() => context.close());await page.goto(`${server.origin}/demo/`);
    await page.getByRole('button',{name:'Load coloring image',exact:true}).click();await page.waitForFunction(() => !document.querySelector('#sample-coloring').disabled);
    await page.locator('#editor').getByRole('button',{name:'New layer',exact:true}).click();await collapseDemoSidebar(page);
    // Closing the desktop sidebar resizes the viewport; let that cancellation
    // boundary settle before starting the live gesture, especially under suite load.
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const vp = await page.locator('#editor .etch-viewport').boundingBox();await page.mouse.move(vp.x+30,vp.y+40);await page.mouse.down();await page.mouse.move(vp.x+130,vp.y+65,{steps:5});await page.mouse.up();
    await page.getByRole('button',{name:'Save snapshot',exact:true}).click();await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('Saved current revision'));
    const before = await page.locator('#save-status').textContent(),json = JSON.parse(await page.locator('#native').inputValue());
    assert.equal(json.layers.at(-1).elements[0]?.type,'stroke','Demo Pen gesture must commit after layout settles');
    const [download] = await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download SVG',exact:true}).click()]);assert.equal(download.suggestedFilename(),'drawing.svg');
    const svg = await readFile(await download.path(),'utf8');assert.match(svg,/<svg /);assert.ok(svg.includes('<path '),'Downloaded SVG must contain the committed Pen outline');for (const a of json.assets) assert.ok(svg.includes(`data:${a.mime};base64,${a.data}`));
    assert.equal(await page.locator('#save-status').textContent(),before);assert.equal(await page.locator('#error').textContent(),'');
    const dimensions = await page.evaluate(async svg => {const image = new Image(),url = URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));try {image.src = url;await image.decode();return [image.naturalWidth,image.naturalHeight];}finally {URL.revokeObjectURL(url);}},svg);assert.ok(dimensions.every(n => n > 100));
    await page.screenshot({path:`/tmp/etch-svg-demo-${name}-${mobile ? 'mobile' : 'desktop'}.png`,fullPage:true});
  }
});
